"""Copy the built UI into the Python package before building a wheel."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
source = root / 'web' / 'dist'
if not (source / 'index.html').exists():
    raise SystemExit('Build web/dist first with npm run build')
target = root / 'akshauhini' / 'static'
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
print(f'Packaged UI: {target}')

shutil.copyfile(root / 'docs' / 'CONNECTING_APPS.md', root / 'akshauhini' / 'connection-guide.md')

# Licenses of everything bundled into the UI, regenerated from web/node_modules so it matches this build.
import runpy
runpy.run_path(str(root / 'scripts' / 'third_party_notices.py'), run_name='__main__')
