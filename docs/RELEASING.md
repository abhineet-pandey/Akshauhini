# Releasing Akshauhini to PyPI

Releases are built and uploaded by GitHub Actions (`.github/workflows/publish.yml`) when a `v*` tag is pushed. You never upload by hand and never need a PyPI password or token on your machine.

What the workflow does on a tag:

1. **test**: `pytest` on Windows, macOS and Linux with Python 3.11 and 3.13.
2. **build**: `npm ci`, `npm test`, `npm run build`, then `scripts/package_ui.py` (copies the UI into the package and regenerates `THIRD_PARTY_NOTICES.md`), then `python -m build`, `scripts/check_dist.py` and `twine check --strict`, then installs the wheel in a clean venv and checks that the office starts and serves the UI.
3. **publish**: uploads `dist/` to PyPI through trusted publishing.

## One-time setup

### 1. PyPI account
1. Register at https://pypi.org/account/register/ and verify your email.
2. Turn on two-factor authentication (required by PyPI).
3. Check the name is free: https://pypi.org/project/akshauhini/ must say "Not Found".

### 2. Trusted publisher (lets GitHub upload without a token)
pypi.org → **Your account → Publishing → Add a new pending publisher → GitHub**:

| Field | Value |
|---|---|
| PyPI Project Name | `akshauhini` |
| Owner | `abhineet-pandey` |
| Repository name | `Akshauhini` |
| Workflow name | `publish.yml` |
| Environment name | `pypi` |

### 3. GitHub environment
github.com/abhineet-pandey/Akshauhini → **Settings → Environments → New environment** → name it `pypi`. Add yourself under "Required reviewers" so every upload waits for your click.

### 4. Optional: a dry run on TestPyPI
Repeat step 2 on https://test.pypi.org with environment `testpypi`, create that environment on GitHub, and add a job to the workflow that uses `pypa/gh-action-pypi-publish@release/v1` with `repository-url: https://test.pypi.org/legacy/`. Then `pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ akshauhini`.

### 5. Local tools (only to build or preview the UI yourself)
- Python 3.11+ with the project venv: `D:\miniconda\python.exe -m venv .venv`, then `.venv\Scripts\python.exe -m pip install -e ".[dev]"`.
- Node.js 22 from https://nodejs.org (CI builds the UI anyway; you only need Node to see UI changes locally).

## Every release

### 1. Check locally
```powershell
cd path\to\Akshauhini
.venv\Scripts\python.exe -m pytest -q

# Only if Node.js is installed: build the UI and the package exactly as CI does
cd web; npm ci; npm test; npm run build; cd ..
.venv\Scripts\python.exe scripts\package_ui.py
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
.venv\Scripts\python.exe -m build
.venv\Scripts\python.exe scripts\check_dist.py dist
.venv\Scripts\python.exe -m twine check --strict dist\*
```

### 2. Set the version
Edit `__version__` in `akshauhini/__init__.py` (semantic versioning: `0.1.1` for fixes, `0.2.0` for features). PyPI never accepts the same version twice, even after you delete it.

### 3. Commit and push
```powershell
git add -A
git status            # read it: no .sqlite, .venv, dist/ or personal files
git commit -m "Release v0.1.1: <what changed>"
git push
```
Wait for the "Test and publish" run on the **Actions** tab to go green.

### 4. Tag
```powershell
git tag v0.1.1
git push origin v0.1.1
```
The tag must match `__version__` (with a leading `v`). Approve the `pypi` environment when GitHub asks.

### 5. Verify
```powershell
python -m venv $env:TEMP\ak-check
& $env:TEMP\ak-check\Scripts\pip install akshauhini==0.1.1
& $env:TEMP\ak-check\Scripts\akshauhini --version
```
Then create a GitHub release from the tag (Releases → Draft a new release) with a short changelog.

## If something goes wrong

| Problem | Fix |
|---|---|
| `publish` fails with "invalid-publisher" | The trusted-publisher fields on PyPI don't match exactly (owner, repo, `publish.yml`, `pypi`). |
| `check_dist.py` says the UI is missing | The wheel was built without `npm run build` + `scripts/package_ui.py`. |
| "File already exists" on upload | That version is on PyPI already: bump `__version__`, commit, tag again. |
| A broken release is live | On pypi.org, **yank** that version (it stays installable only when pinned), then release a fixed version. |
| Tagged the wrong commit (before it published) | `git tag -d v0.1.1; git push origin :refs/tags/v0.1.1`, fix, tag again. |

## License checklist (before each release)

- `LICENSE` is the unmodified Apache License 2.0 text and `NOTICE` carries the copyright line; `pyproject.toml` says `license = "Apache-2.0"` and lists both in `license-files`.
- After adding an npm dependency to `web/package.json`, `scripts/package_ui.py` regenerates `akshauhini/THIRD_PARTY_NOTICES.md`. Check the new package's license allows redistribution (MIT, ISC, BSD, Apache-2.0 are fine; GPL/AGPL code cannot be bundled into an Apache-2.0 release).
- New icons, images, fonts or code copied from elsewhere: record their license in `scripts/licenses/` and in `THIRD_PARTY_NOTICES.md`.
