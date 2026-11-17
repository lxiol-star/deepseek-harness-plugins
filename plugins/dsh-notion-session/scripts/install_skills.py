#!/usr/bin/env python3
"""Install the three packaged skills and a private CLI copy for other agents."""
import argparse
import datetime
import pathlib
import shutil
import sys
import tempfile

SKILLS = ("notion-current-session", "notion-session-archive", "notion-session-resume")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=pathlib.Path, default=pathlib.Path.home() / ".agents" / "skills")
    parser.add_argument("--only", action="append", choices=SKILLS, help="Install only this skill; repeat for multiple skills.")
    args = parser.parse_args()
    package = pathlib.Path(__file__).resolve().parent.parent
    target = args.target.expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    installed = []
    for name in args.only or SKILLS:
        source = package / "skills" / name
        destination = target / name
        backup = None
        if destination.exists():
            backup = target / f"{name}.backup-{stamp}"
            if backup.exists():
                raise RuntimeError(f"backup already exists: {backup}")
            destination.rename(backup)
        try:
            with tempfile.TemporaryDirectory(prefix=f".{name}-", dir=target) as temporary:
                staged = pathlib.Path(temporary) / name
                shutil.copytree(source, staged)
                (staged / "scripts").mkdir()
                shutil.copy2(package / "scripts" / "notion_session.py", staged / "scripts" / "notion_session.py")
                skill_file = staged / "SKILL.md"
                text = skill_file.read_text(encoding="utf-8")
                text = text.replace("{{PLUGIN_DIR}}", "__SKILL_DIR__").replace("{{PYTHON}}", sys.executable)
                skill_file.write_text(text, encoding="utf-8")
                staged.rename(destination)
            skill_file = destination / "SKILL.md"
            skill_file.write_text(skill_file.read_text(encoding="utf-8").replace("__SKILL_DIR__", str(destination)), encoding="utf-8")
        except Exception:
            if backup is not None and not destination.exists():
                backup.rename(destination)
            raise
        installed.append({"skill": name, "path": str(destination)})
    import json
    print(json.dumps({"installed": installed, "note": "Existing skills were backed up with a timestamp."}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
