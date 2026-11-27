# Releasing Akshauhini to PyPI

Releases are built and uploaded by GitHub Actions (`.github/workflows/publish.yml`). You never upload by hand and never need a PyPI password or API token: PyPI and TestPyPI trust this repository's workflow directly (trusted publishing).

## What the workflow does

| Trigger | Jobs |
|---|---|
| Push to `main`, pull request | **test** → **build** (nothing is published) |
| Tag `vX.Y.Z` (e.g. `v0.1.0`) | test → build → **TestPyPI** → **install check from TestPyPI** → **PyPI** (waits for your approval) |
| Tag `vX.Y.Zrc1`, `vX.Y.Za1`, `vX.Y.Zb1` | test → build → TestPyPI → install check. Pre-releases never go to PyPI. |
| Actions → Test and publish → **Run workflow** | test → build → TestPyPI → install check |

- **test**: `pytest` on Windows, macOS and Linux with Python 3.11 and 3.13.
- **build**: checks that a `v*` tag matches `__version__`, runs `npm ci`, `npm test`, `npm run build` and `scripts/package_ui.py` (copies the UI into the package and regenerates `THIRD_PARTY_NOTICES.md`), then `python -m build`, `scripts/check_dist.py`, `twine check --strict`, and a smoke test of the wheel in a clean venv.
- **publish-testpypi**: uploads to https://test.pypi.org. A version already on TestPyPI is skipped, not an error.
- **verify-testpypi**: installs that exact version from TestPyPI into a clean venv (dependencies from the real PyPI) and checks that the office starts and serves the UI.
- **publish-pypi**: uploads the same files to https://pypi.org, only for final `X.Y.Z` versions and only after you click **Approve** on the `pypi` environment.

## One-time setup

### 1. Accounts
PyPI and TestPyPI are separate sites with separate accounts.
1. Register at https://pypi.org/account/register/ and at https://test.pypi.org/account/register/, and verify both emails.
2. Turn on two-factor authentication on both (required).

### 2. Trusted publishers
On **each** site: **Your account → Publishing → Add a new pending publisher → GitHub**.

| Field | pypi.org | test.pypi.org |
|---|---|---|
| PyPI Project Name | `akshauhini` | `akshauhini` |
| Owner | `abhineet-pandey` | `abhineet-pandey` |
| Repository name | `Akshauhini` | `Akshauhini` |
| Workflow name | `publish.yml` | `publish.yml` |
| Environment name | `pypi` | `testpypi` |

A pending publisher reserves nothing until the first upload; the project is created by that upload.

### 3. GitHub environments
github.com/abhineet-pandey/Akshauhini → **Settings → Environments → New environment**:
1. `testpypi`: no protection rules needed. Optionally restrict **Deployment branches and tags** to tags matching `v*` plus `main`.
2. `pypi`: tick **Required reviewers** and add yourself, so every real upload waits for your click. Under **Deployment branches and tags**, allow only tags matching `v*`.

### 4. Local tools (only to build or preview the UI yourself)
- Python 3.11+: `python -m venv .venv`, then `.venv\Scripts\python.exe -m pip install -e ".[dev]"`.
- Node.js 22 from https://nodejs.org (CI builds the UI anyway; you only need Node to see UI changes locally).

## Every release

### 1. Check locally
```powershell
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
Edit `__version__` in `akshauhini/__init__.py`: `0.1.1` for fixes, `0.2.0` for features, `0.2.0rc1` for a TestPyPI-only rehearsal. Neither PyPI nor TestPyPI ever accepts the same file twice, even after you delete it.

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
The tag must equal `v` + `__version__`, or the build job stops before anything is uploaded. The run uploads to TestPyPI, installs it from there, then pauses at **publish-pypi**: open the run, click **Review deployments → pypi → Approve and deploy**.

### 5. Verify
```powershell
python -m venv $env:TEMP\ak-check
& $env:TEMP\ak-check\Scripts\pip install akshauhini==0.1.1
& $env:TEMP\ak-check\Scripts\akshauhini --version
```
Then create a GitHub release from the tag (Releases → Draft a new release) with a short changelog.

To try a TestPyPI build yourself:
```powershell
pip install fastapi uvicorn[standard] httpx
pip install --no-deps -i https://test.pypi.org/simple/ akshauhini==0.1.1
```

## If something goes wrong

| Problem | Fix |
|---|---|
| A publish job fails with "invalid-publisher" | The trusted-publisher fields on that site don't match exactly (owner, repo, `publish.yml`, and `pypi` or `testpypi`). |
| Build fails with "Tag … does not match __version__" | Delete the tag (below), fix `__version__` or the tag name, push, tag again. |
| `verify-testpypi` fails | The package installed from TestPyPI doesn't start. Nothing reached PyPI; fix, bump the version, tag again. |
| `check_dist.py` says the UI is missing | The wheel was built without `npm run build` + `scripts/package_ui.py`. |
| "File already exists" on PyPI | That version is on PyPI already: bump `__version__`, commit, tag again. |
| A broken release is live | On pypi.org, **yank** that version (it stays installable only when pinned), then release a fixed version. |
| Tagged the wrong commit (before it published) | `git tag -d v0.1.1; git push origin :refs/tags/v0.1.1`, fix, tag again. |

## License checklist (before each release)

- `LICENSE` is the unmodified Apache License 2.0 text and `NOTICE` carries the copyright line; `pyproject.toml` says `license = "Apache-2.0"` and lists both in `license-files`.
- After adding an npm dependency to `web/package.json`, `scripts/package_ui.py` regenerates `akshauhini/THIRD_PARTY_NOTICES.md`. Check the new package's license allows redistribution (MIT, ISC, BSD, Apache-2.0 are fine; GPL/AGPL code cannot be bundled into an Apache-2.0 release).
- New icons, images, fonts or code copied from elsewhere: record their license in `scripts/licenses/` and in `THIRD_PARTY_NOTICES.md`.
