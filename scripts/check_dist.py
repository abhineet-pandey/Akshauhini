"""Fail a release whose wheel would install without the web UI or with mismatched metadata.

Usage: python scripts/check_dist.py dist/
akshauhini/static is git-ignored, so a wheel built from a clean checkout without `npm run build` and
`scripts/package_ui.py` would install a collector that serves no office. This catches that before upload.
"""
import re
import sys
import zipfile
from pathlib import Path

dist = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
wheels = sorted(dist.glob("akshauhini-*.whl"))
if not wheels:
    raise SystemExit(f"No wheel in {dist}")
problems = []
for wheel in wheels:
    names = set(zipfile.ZipFile(wheel).namelist())
    z = zipfile.ZipFile(wheel)
    if "akshauhini/static/index.html" not in names:
        problems.append(f"{wheel.name}: web UI missing (run: cd web && npm ci && npm run build && cd .. && python scripts/package_ui.py)")
    else:
        index = z.read("akshauhini/static/index.html").decode()
        for asset in re.findall(r'(?:src|href)="/?(assets/[^"]+)"', index):
            if f"akshauhini/static/{asset}" not in names:
                problems.append(f"{wheel.name}: index.html references missing {asset}")
    if "akshauhini/connection-guide.md" not in names:
        problems.append(f"{wheel.name}: connection-guide.md missing")
    if "akshauhini/THIRD_PARTY_NOTICES.md" not in names:
        problems.append(f"{wheel.name}: THIRD_PARTY_NOTICES.md missing (run scripts/package_ui.py)")
    if not any(n.endswith(".dist-info/licenses/LICENSE") for n in names):
        problems.append(f"{wheel.name}: LICENSE not included")
    meta = next(n for n in names if n.endswith(".dist-info/METADATA"))
    text = z.read(meta).decode()
    version = re.search(r"^Version: (.+)$", text, re.M).group(1).strip()
    if f"akshauhini-{version}-" not in wheel.name:
        problems.append(f"{wheel.name}: metadata version {version} does not match file name")
    if "Description-Content-Type: text/markdown" not in text:
        problems.append(f"{wheel.name}: README is not attached as the long description")
    print(f"{wheel.name}: {len(names)} files, {sum(1 for n in names if '/static/' in n)} UI files, version {version}")
if problems:
    raise SystemExit("\n".join(problems))
print("Distribution OK")
