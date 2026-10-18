"""Scoped bridge for the session-board Wiki workflow. Never runs a full archive."""
import argparse
import importlib.util
import json
import os
import signal
import re
import subprocess
from pathlib import Path


def load_script(path, name):
    spec = importlib.util.spec_from_file_location(name, str(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
            import io
            return json.loads(io.TextIOWrapper(reader, encoding='utf-8').readline(1024 * 1024))


def scope(args, archive):
    requested = json.loads(args.value)
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
    selected = set(requested)
    while True:
        children = {sid for sid, row in records.items() if row['parent'] in selected}
        if children <= selected:
            break
        selected |= children
        if len(selected) > 50:
            raise ValueError('INVALID_SELECTION')
    # Parent-before-child order, including when the user selected a child directly.
    pending = list(dict.fromkeys(requested + sorted(selected - set(requested))))
    ordered = []
    while pending:
        ready = [sid for sid in pending if records[sid]['parent'] not in pending]
        if not ready:
            raise ValueError('SELECTION_MISMATCH')
        for sid in ready:
            pending.remove(sid)
            row = dict(records[sid])
            row['evidence'] = 'parentSession' if row['parent'] else 'selected session header'
            events = archive.load_dsh_jsonl(row['source']) if row['source'].endswith(('.zstd', '.zst')) else archive.parse_jsonl_lines(Path(row['source']).read_text().splitlines())
            last_start = max((event.get('seq', 0) for event in events if event.get('type') == 'turn/start'), default=-1)
            last_end = max((event.get('seq', 0) for event in events if event.get('type') == 'turn/end'), default=-1)
            row['snapshot'] = last_start > last_end
            ordered.append(row)
    missing = []
    for row in ordered:
        events = archive.load_dsh_jsonl(row['source']) if row['source'].endswith(('.zstd', '.zst')) else archive.parse_jsonl_lines(Path(row['source']).read_text().splitlines())
        for event in events:
            if event.get('type') != 'subagent/catalog':
                continue
            child = event.get('data', {}).get('childId')
            if isinstance(child, str) and child not in selected:
                missing.append({'session': child, 'parent': row['session']})
    return {'entries': ordered, 'missing': missing}


def synthesize(args, archive):
    root = Path(args.wiki_root).resolve()
    page = args.value
    target = (root / page).resolve()
    if not page.startswith('raw/sessions/') or not page.endswith('.md') or not target.is_relative_to(root / 'raw' / 'sessions'):
        raise ValueError('INVALID_RESULT')
    synth = load_script(root / 'scripts' / 'wiki-synthesize.py', 'board_synth')
    matches = [item for item in synth.collect_sessions(str(root)) if page in item]
    if matches != [page]:
        raise ValueError('SELECTION_MISMATCH')
    text = target.read_text(encoding='utf-8')
    # Read the schema before this session is considered for external synthesis.
    if not (root / 'SCHEMA.md').read_text(encoding='utf-8').strip():
        raise ValueError('SCHEMA_UNAVAILABLE')
    # A second pass checks the freshly rendered raw before any provider sees it.
    if archive.redact_credentials(text) != text:
        return {'status': 'sensitive', 'pages': [], 'error': 'SENSITIVE_CONTENT'}
    output = ''
    def relevant_pages():
        pages = []
        for directory in ('projects', 'concepts', 'experience', 'patterns', 'issues', 'tools', 'entities', 'digests', 'comparisons', 'decisions'):
            for file in (root / directory).glob('*.md'):
                content = file.read_text(encoding='utf-8')
                if page in content.split('\n---', 1)[0]:
                    pages.append(str(file.relative_to(root)))
        return sorted(pages)
    for attempt in range(2):
        try:
            run = run_child(['/usr/bin/python3', str(root / 'scripts' / 'wiki-synthesize.py'),
                                  '--wiki-root', str(root), '--provider', args.provider,
                                  '--session', page, '--limit', '1'], capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            return {'status': 'failed', 'pages': [], 'error': 'SYNTHESIS_TIMEOUT'}
        output += run.stdout
        pages = list(dict.fromkeys(re.findall(r'已写入 ([a-z0-9/-]+\.md)', output)))
        try:
            state = json.loads((root / 'scripts' / '.synthesize-state.json').read_text()).get(page, {})
        except (OSError, ValueError):
            state = {}
        import hashlib
        valid = state.get('sha256') == hashlib.sha256(text.encode('utf-8')).hexdigest()
        reason = state.get('reason', '')
        if run.returncode == 0 and valid and reason not in ('api-error', 'parse-error'):
            return {'status': 'synthesized' if state.get('status') == 'synthesized' else 'skipped', 'pages': sorted(set(pages + relevant_pages()))}
        if reason not in ('api-error', 'parse-error') or attempt == 1:
            return {'status': 'failed', 'pages': pages, 'error': reason if reason in ('api-error', 'parse-error') else 'SYNTHESIS_FAILED'}
    raise RuntimeError('SYNTHESIS_FAILED')


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['scope', 'synthesize', 'index'])
    parser.add_argument('--wiki-root', required=True)
    parser.add_argument('--dsh-home', required=True)
    parser.add_argument('--value', default='')
    parser.add_argument('--provider', default='stepx-terra')
    args = parser.parse_args()
    root = Path(args.wiki_root)
    if not (root / 'SCHEMA.md').is_file() or not (root / 'SCHEMA.md').read_text(encoding='utf-8').strip():
        raise ValueError('SCHEMA_UNAVAILABLE')
    archive = load_script(root / 'scripts' / 'wiki-archive.py', 'board_archive')
    if args.operation == 'scope':
        result = scope(args, archive)
    elif args.operation == 'synthesize':
        result = synthesize(args, archive)
    else:
        run = run_child(['/usr/bin/python3', str(root / 'scripts' / 'wiki-index.py'), '--wiki-root', str(root)], capture_output=True, timeout=120)
        result = {'status': 'updated' if run.returncode == 0 else 'failed'}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not forward provider stderr, transcript text or credentials into the UI.
        print(json.dumps({'error': str(error) if str(error) in ('SELECTION_MISMATCH', 'INVALID_RESULT', 'INVALID_SELECTION', 'SCHEMA_UNAVAILABLE') else 'WORKFLOW_UNAVAILABLE'}))
        raise SystemExit(1)
