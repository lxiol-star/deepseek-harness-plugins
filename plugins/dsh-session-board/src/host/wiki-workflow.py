"""Scoped bridge for the session board Wiki workflow.

The board ships its own copy of the Wiki engine (`lib/wiki/wiki-archive.py`,
`wiki-synthesize.py`, `wiki-index.py`) so archiving no longer depends on the
user's `~/wiki/scripts` checkout staying compatible. The Wiki *data* (raw
pages, knowledge layers, SCHEMA rules) stays user-owned and is addressed
through `--wiki-root` / `--schema`; a local scripts directory can still be
selected explicitly (`--scripts-dir <wiki>/scripts`).

Every invocation prints exactly one JSON document on stdout. Diagnostics
(traceback, captured helper output) go to `--log` and are summarised in the
`detail` field so the host can show the real reason instead of a generic
"check the local Wiki scripts" message.
"""

import argparse
import contextlib
import fcntl
import importlib.util
import io
import json
import os
import re
import signal
import subprocess
import sys
import traceback
from datetime import datetime
from pathlib import Path

REAL_STDOUT = sys.stdout
LOG_PATH = ''


def log_line(event, detail=''):
    """Append one diagnostic line to the bridge log, never failing the run."""
    if not LOG_PATH:
        return
    try:
        os.makedirs(os.path.dirname(LOG_PATH) or '.', exist_ok=True)
        with open(LOG_PATH, 'a', encoding='utf-8') as stream:
            stamp = datetime.now().isoformat(timespec='seconds')
            stream.write('%s\t%s\t%s\n' % (stamp, event, detail.replace('\n', ' ⏎ ')[:6000]))
    except Exception:
        pass


def load_script(path, name):
    """Load one engine script by path, reporting a clear error when missing."""
    target = Path(path)
    if not target.is_file():
        raise FileNotFoundError('engine script not found: %s' % target)
    spec = importlib.util.spec_from_file_location(name, str(target))
    if spec is None or spec.loader is None:
        raise ImportError('cannot load engine script: %s' % target)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def engine_file(args, name):
    return Path(args.scripts_dir).resolve() / name


def schema_path(args):
    return Path(args.schema).expanduser().resolve()


def require_schema(args):
    """The Wiki SCHEMA rules must exist and carry content before any write."""
    target = schema_path(args)
    try:
        text = target.read_text(encoding='utf-8')
    except OSError as error:
        raise ValueError('SCHEMA_UNAVAILABLE') from error
    if not text.strip():
        raise ValueError('SCHEMA_UNAVAILABLE')
    return text


def state_path(root):
    return Path(root) / 'scripts' / '.synthesize-state.json'


def validate_raw_page(root, page):
    root = Path(root).resolve()
    target = (root / page).resolve()
    if not page.startswith('raw/sessions/') or not page.endswith('.md') or not target.is_relative_to(root / 'raw' / 'sessions'):
        raise ValueError('INVALID_RESULT')
    if not target.is_file():
        raise ValueError('INVALID_RESULT')
    return target


def require_exact_page(root, synth, page):
    matches = [item for item in synth.collect_sessions(str(root)) if page in item]
    if matches != [page]:
        raise ValueError('SELECTION_MISMATCH')


def relevant_pages(root, page):
    pages = []
    for directory in ('projects', 'concepts', 'experience', 'patterns', 'issues', 'tools', 'entities', 'digests', 'comparisons', 'decisions'):
        folder = Path(root) / directory
        if not folder.is_dir():
            continue
        for file in folder.glob('*.md'):
            content = file.read_text(encoding='utf-8')
            if page in content.split('\n---', 1)[0]:
                pages.append(str(file.relative_to(root)))
    return sorted(pages)


def build_prompt(synth, page, text, candidates):
    """Build the same user prompt `wiki-synthesize.py`'s call_chat sends."""
    whitelist = ''
    if candidates:
        whitelist = (
            '可链接页面白名单（库中真实存在的 slug，wikilink 只能从这里选，'
            '或链接你本轮同时新建的页面）：\n'
            + '、'.join(candidates) + '\n\n'
        )
    return (
        f'会话相对路径：{page}\n\n'
        f'{whitelist}'
        f'以下是会话归档原文全文：\n\n{text}\n\n'
        f'——会话归档原文到此结束——\n'
        f'现在严格按 system 指令作答：无沉淀价值则只输出一行 SKIP；'
        f'否则输出 1-3 个知识页（每页以 --- frontmatter 开头）。'
        f'禁止续写、复述或摘录上面的会话原文。'
    )


def acquire_write_lock(root):
    path = Path(root) / '.locks' / 'wiki-synthesize.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(path, 'w')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def release_write_lock(handle):
    try:
        fcntl.flock(handle, fcntl.LOCK_UN)
    finally:
        handle.close()


def header(path, archive):
    if not str(path).endswith(('.zstd', '.zst')):
        with open(path, encoding='utf-8') as stream:
            return json.loads(stream.readline(1024 * 1024))
    binary = archive.resolve_zstd_binary()
    if binary:
        process = subprocess.Popen([binary, '-dc', str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            return json.loads(process.stdout.readline(1024 * 1024))
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.terminate()
            process.wait()
    import zstandard
    with open(path, 'rb') as stream:
        with zstandard.ZstdDecompressor().stream_reader(stream) as reader:
            return json.loads(io.TextIOWrapper(reader, encoding='utf-8').readline(1024 * 1024))


def load_events(archive, source):
    """Decode one transcript once per invocation (scope reads it once, not twice)."""
    if str(source).endswith(('.zstd', '.zst')):
        return archive.load_dsh_jsonl(source)
    return archive.parse_jsonl_lines(Path(source).read_text().splitlines())


def scope(args, archive):
    try:
        requested = json.loads(args.value)
    except ValueError as error:
        raise ValueError('INVALID_RESULT') from error
    if not isinstance(requested, list) or not requested or any(not isinstance(item, str) or not item for item in requested):
        raise ValueError('INVALID_SELECTION')
    sources = {}
    for _, _, session, path in archive.discover_dsh_sources(args.dsh_home):
        sources.setdefault(session, []).append(path)
    records = {}
    for session, paths in sources.items():
        if len(paths) != 1:
            continue
        try:
            first = header(paths[0], archive)
        except (OSError, ValueError, ImportError):
            continue
        if first.get('type') == 'session' and first.get('id') == session:
            records[session] = {'session': session, 'source': str(Path(paths[0]).resolve()),
                                'parent': first.get('parentSession'), 'role': 'child' if first.get('parentSession') else 'main'}
    for session in requested:
        if session not in records:
            raise ValueError('SELECTION_MISMATCH')
    # Archive exactly what the user checked: no implicit child expansion.
    # Children stay discoverable through the board like any other session.
    ordered = []
    missing = []
    for session in dict.fromkeys(requested):
        row = dict(records[session])
        row['evidence'] = 'parentSession' if row['parent'] else 'selected session header'
        events = load_events(archive, row['source'])
        last_start = max((event.get('seq', 0) for event in events if event.get('type') == 'turn/start'), default=-1)
        last_end = max((event.get('seq', 0) for event in events if event.get('type') == 'turn/end'), default=-1)
        row['snapshot'] = last_start > last_end
        ordered.append((row, events))
    # Genuinely missing children (referenced but no transcript source) are
    # still reported; unselected-but-existing children are not warnings.
    for row, events in ordered:
        for event in events:
            if event.get('type') != 'subagent/catalog':
                continue
            child = event.get('data', {}).get('childId')
            if isinstance(child, str) and child not in records:
                missing.append({'session': child, 'parent': row['session']})
    return {'entries': [row for row, _events in ordered], 'missing': missing}


def synthesize(args, archive):
    root = Path(args.wiki_root).resolve()
    page = args.value
    target = validate_raw_page(root, page)
    synth = load_script(engine_file(args, 'wiki-synthesize.py'), 'board_synth')
    matches = [item for item in synth.collect_sessions(str(root)) if page in item]
    if matches != [page]:
        raise ValueError('SELECTION_MISMATCH')
    text = target.read_text(encoding='utf-8')
    require_schema(args)
    if archive.redact_credentials(text) != text:
        return {'status': 'sensitive', 'pages': [], 'error': 'SENSITIVE_CONTENT'}
    config_arguments = ['--config', args.synth_config] if args.synth_config else []
    output = ''
    for attempt in range(2):
        try:
            run = run_child([args.python, str(engine_file(args, 'wiki-synthesize.py')),
                             '--wiki-root', str(root), '--provider', args.provider,
                             '--session', page, '--limit', '1'] + config_arguments,
                            capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            return {'status': 'failed', 'pages': [], 'error': 'SYNTHESIS_TIMEOUT'}
        output += run.stdout
        pages = list(dict.fromkeys(re.findall(r'已写入 ([a-z0-9/-]+\.md)', output)))
        try:
            state = json.loads(state_path(root).read_text()).get(page, {})
        except (OSError, ValueError):
            state = {}
        import hashlib
        valid = state.get('sha256') == hashlib.sha256(text.encode('utf-8')).hexdigest()
        reason = state.get('reason', '')
        if run.returncode == 0 and valid and reason not in ('api-error', 'parse-error'):
            return {'status': 'synthesized' if state.get('status') == 'synthesized' else 'skipped', 'pages': sorted(set(pages + relevant_pages(root, page)))}
        if reason not in ('api-error', 'parse-error') or attempt == 1:
            return {'status': 'failed', 'pages': pages, 'error': reason if reason in ('api-error', 'parse-error') else 'SYNTHESIS_FAILED'}
    raise RuntimeError('SYNTHESIS_FAILED')


def prepare(args, archive):
    root = Path(args.wiki_root).resolve()
    page = args.value
    target = validate_raw_page(root, page)
    require_schema(args)
    synth = load_script(engine_file(args, 'wiki-synthesize.py'), 'board_synth')
    require_exact_page(root, synth, page)
    text = target.read_text(encoding='utf-8')
    if archive.redact_credentials(text) != text:
        return {'status': 'sensitive', 'pages': [], 'error': 'SENSITIVE_CONTENT'}
    with quiet():
        state = synth.load_state(str(state_path(root)))
        candidates = synth.suggest_link_candidates(text, synth.collect_existing_slugs(str(root)))
    entry = state.get(page)
    if isinstance(entry, dict) and entry.get('sha256') == synth.sha256_text(text) and synth.is_final(entry):
        return {'status': 'skipped', 'pages': relevant_pages(root, page)}
    if len(text) > synth.LONG_CONTEXT_THRESHOLD:
        text = synth.truncate_session_text(text)
    return {'page': page, 'prompt': {'system': synth.SYSTEM_PROMPT, 'user': build_prompt(synth, page, text, candidates)}}


def write(args, archive):
    root = Path(args.wiki_root).resolve()
    try:
        payload = json.loads(args.value)
    except ValueError as error:
        raise ValueError('INVALID_RESULT') from error
    if not isinstance(payload, dict):
        raise ValueError('INVALID_RESULT')
    page = payload.get('page')
    output = payload.get('output')
    if not isinstance(page, str) or not isinstance(output, str) or not output.strip() or len(output) > 1_000_000:
        raise ValueError('INVALID_RESULT')
    target = validate_raw_page(root, page)
    require_schema(args)
    synth = load_script(engine_file(args, 'wiki-synthesize.py'), 'board_synth')
    require_exact_page(root, synth, page)
    text = target.read_text(encoding='utf-8')
    sha = synth.sha256_text(text)
    lock = acquire_write_lock(root)
    if lock is None:
        return {'status': 'failed', 'pages': [], 'error': 'STATE_UNAVAILABLE'}
    try:
        with quiet():
            state = synth.load_state(str(state_path(root)))
            entry = state.get(page)
            if isinstance(entry, dict) and entry.get('sha256') == sha and synth.is_final(entry):
                return {'status': 'skipped', 'pages': relevant_pages(root, page)}
            parsed = synth.parse_pages(output)
            if parsed == 'SKIP':
                state[page] = {'sha256': sha, 'status': 'skipped', 'reason': 'ai-no-value', 'date': synth.today_str()}
                synth.save_state(str(state_path(root)), state)
                return {'status': 'skipped', 'pages': []}
            if not parsed:
                state[page] = {'sha256': sha, 'status': 'skipped', 'reason': 'parse-error', 'date': synth.today_str()}
                synth.save_state(str(state_path(root)), state)
                return {'status': 'failed', 'pages': [], 'error': 'PARSE_ERROR'}
            batch_slugs = set()
            for fm, _body in parsed:
                checked = synth.validate_file_field((fm or {}).get('file'))
                if checked:
                    batch_slugs.add(synth.norm_slug(checked[1]))
            valid_slugs = synth.collect_existing_slugs(str(root)) | batch_slugs
            written_count = 0
            written_pages = []
            rejected_count = 0
            for fm, body in parsed:
                ok, message = synth.process_page(str(root), fm, body, page, False, valid_slugs=valid_slugs)
                if ok:
                    written_count += 1
                    written_pages.extend(re.findall(r'已写入 ([a-z0-9/-]+\.md)', message))
                else:
                    rejected_count += 1
            if written_count == 0:
                state[page] = {'sha256': sha, 'status': 'skipped', 'reason': 'parse-error', 'date': synth.today_str()}
                synth.save_state(str(state_path(root)), state)
                return {'status': 'failed', 'pages': [], 'error': 'PARSE_ERROR'}
            reason = f'建页 {written_count} 个' + (f'，拒绝 {rejected_count} 个' if rejected_count else '')
            state[page] = {'sha256': sha, 'status': 'synthesized', 'reason': reason, 'date': synth.today_str()}
            synth.save_state(str(state_path(root)), state)
            return {'status': 'synthesized', 'pages': sorted(set(written_pages + relevant_pages(root, page)))}
    except ValueError:
        raise
    finally:
        release_write_lock(lock)


def run_index(args):
    root = Path(args.wiki_root).resolve()
    require_schema(args)
    (root / 'scripts').mkdir(parents=True, exist_ok=True)
    run = run_child([args.python, str(engine_file(args, 'wiki-index.py')), '--wiki-root', str(root)],
                    capture_output=True, timeout=300)
    if run.returncode != 0:
        stderr = run.stderr.decode('utf-8', 'replace') if isinstance(run.stderr, bytes) else str(run.stderr)
        raise RuntimeError('wiki-index.py exited %s: %s' % (run.returncode, stderr[-400:]))
    return {'status': 'updated'}


def status(args):
    """Report the resolved engine/schema/data paths without touching the Wiki."""
    engine = Path(args.scripts_dir).resolve()
    schema = schema_path(args)
    root = Path(args.wiki_root).expanduser().resolve()
    issues = []
    scripts = []
    for name in ('wiki-archive.py', 'wiki-synthesize.py', 'wiki-index.py'):
        target = engine / name
        entry = {'name': name, 'path': str(target), 'exists': target.is_file(), 'bytes': target.stat().st_size if target.is_file() else 0}
        if not entry['exists']:
            issues.append('missing engine script: %s' % name)
        scripts.append(entry)
    try:
        schema_text = schema.read_text(encoding='utf-8')
    except OSError:
        schema_text = ''
    if not schema_text.strip():
        issues.append('SCHEMA.md is missing or empty: %s' % schema)
    if not root.is_dir():
        issues.append('wiki root does not exist: %s' % root)
    return {
        'ok': not issues,
        'issues': issues,
        'python': sys.version.split()[0],
        'pythonExecutable': args.python,
        'engine': {'dir': str(engine), 'scripts': scripts},
        'schema': {'path': str(schema), 'bytes': len(schema_text.encode('utf-8'))},
        'wikiRoot': {'path': str(root), 'exists': root.is_dir()},
        'state': {'path': str(state_path(root))},
        'operations': ['scope', 'synthesize', 'prompt', 'write', 'index'],
    }


def run_child(command, **kwargs):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **{key: value for key, value in kwargs.items() if key != 'capture_output' and key != 'timeout'})

    def terminate(_signum, _frame):
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise SystemExit(1)

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        stdout, stderr = process.communicate(timeout=kwargs.get('timeout'))
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise
    finally:
        signal.signal(signal.SIGTERM, previous)


@contextlib.contextmanager
def quiet():
    """Swallow helper logging so stdout stays one JSON document."""
    with contextlib.redirect_stdout(io.StringIO()):
        yield


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['scope', 'synthesize', 'prompt', 'write', 'index', 'status'])
    parser.add_argument('--wiki-root', required=True)
    parser.add_argument('--dsh-home', required=True)
    parser.add_argument('--scripts-dir', required=True)
    parser.add_argument('--schema', required=True)
    parser.add_argument('--value', default='')
    parser.add_argument('--provider', default='stepx-terra')
    parser.add_argument('--synth-config', default='')
    parser.add_argument('--python', default='/usr/bin/python3')
    parser.add_argument('--log', default='')
    args = parser.parse_args()
    global LOG_PATH
    LOG_PATH = args.log
    log_line('start', ' '.join(sys.argv[1:3]))
    captured = io.StringIO()
    with contextlib.redirect_stdout(captured):
        if args.operation == 'status':
            result = status(args)
            log_line('done', 'status')
            REAL_STDOUT.write(json.dumps(result, ensure_ascii=False) + '\n')
            return 0
        # Every write/preview workflow is gated on the rules file, as before.
        require_schema(args)
        archive = load_script(engine_file(args, 'wiki-archive.py'), 'board_archive')
        if args.operation == 'scope':
            result = scope(args, archive)
        elif args.operation == 'synthesize':
            result = synthesize(args, archive)
        elif args.operation == 'prompt':
            result = prepare(args, archive)
        elif args.operation == 'write':
            result = write(args, archive)
        else:
            require_schema(args)
            result = run_index(args)
    stray = captured.getvalue()
    if stray.strip():
        log_line('stdout-captured', stray)
    log_line('done', args.operation)
    REAL_STDOUT.write(json.dumps(result, ensure_ascii=False) + '\n')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except BaseException as error:  # a helper's SystemExit is a failure too
        detail = '%s: %s' % (type(error).__name__, str(error))
        log_line('fatal', traceback.format_exc())
        code = str(error) if str(error) in (
            'SELECTION_MISMATCH', 'INVALID_RESULT', 'INVALID_SELECTION', 'SCHEMA_UNAVAILABLE',
            'ENGINE_UNAVAILABLE', 'STATE_UNAVAILABLE',
        ) else ('ENGINE_UNAVAILABLE' if isinstance(error, (ImportError, FileNotFoundError)) else 'WORKFLOW_UNAVAILABLE')
        REAL_STDOUT.write(json.dumps({'error': code, 'detail': detail[:400]}, ensure_ascii=False) + '\n')
        raise SystemExit(1)
