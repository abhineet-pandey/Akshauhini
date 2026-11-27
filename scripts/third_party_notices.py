"""Write akshauhini/THIRD_PARTY_NOTICES.md: the licenses of code bundled into the packaged web UI.

Usage: python scripts/third_party_notices.py   (needs web/node_modules: cd web && npm ci)
Walks the runtime dependencies of web/package.json (type-only packages are not bundled and are skipped) and copies
each package's license file. Lucide icons are vendored in web/src/Icons.tsx, so their license is added from
scripts/licenses/lucide.txt.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
modules = root / "web" / "node_modules"
if not modules.exists():
    raise SystemExit("web/node_modules missing: run npm ci in web/ first")

MIT = """Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE."""


def manifest(name):
    return json.loads((modules / name / "package.json").read_text(encoding="utf-8"))

seen, queue = {}, list(json.loads((root / "web" / "package.json").read_text())["dependencies"])
while queue:
    name = queue.pop()
    if name in seen or name.startswith("@types/") or name == "@webgpu/types":
        continue
    meta = manifest(name)
    seen[name] = meta
    queue.extend(meta.get("dependencies", {}))

parts = ["# Third-party notices\n",
         "Akshauhini's web UI bundles the following third-party software. Each component remains under its own "
         "license, reproduced below. Akshauhini itself is licensed separately (see LICENSE).\n"]
for name in sorted(seen, key=str.lower):
    meta = seen[name]
    files = sorted(p for p in (modules / name).iterdir() if p.name.upper().startswith(("LICENSE", "LICENCE", "COPYING")))
    if files:
        text = files[0].read_text(encoding="utf-8").strip()
    elif meta.get("license") == "MIT" and meta.get("author"):
        # Some packages declare MIT in package.json but ship no license file: use the standard MIT text with the
        # declared author as copyright holder.
        author = meta["author"] if isinstance(meta["author"], str) else meta["author"].get("name", "")
        text = f"Copyright (c) {author}\n\n{MIT}"
    else:
        raise SystemExit(f"{name}: no license file found")
    parts.append(f"\n## {name} {meta['version']} ({meta.get('license', '?')})\n\n```\n{text}\n```\n")
lucide = (root / "scripts" / "licenses" / "lucide.txt").read_text(encoding="utf-8").strip()
parts.append(f"\n## Lucide icons (ISC; Feather-derived icons MIT), vendored in web/src/Icons.tsx\n\n```\n{lucide}\n```\n")
out = root / "akshauhini" / "THIRD_PARTY_NOTICES.md"
out.write_text("".join(parts), encoding="utf-8")
print(f"Wrote {out.relative_to(root)}: {len(seen)} npm packages + Lucide")
