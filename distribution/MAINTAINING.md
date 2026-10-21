# Maintainer guide

## Repository responsibilities

| Private `bYiyLi/kg-os` | Public `bYiyLi/kg-releases` |
| --- | --- |
| Source, tests, design, CI templates, Plugin, seven Skills and unique installer | Only the generated runtime entrypoint, installer, Plugin, seven Skills and release CI/CD |
| Private `main` and authorized source `v*` tags | Generated manifest on `main`, mirrored public `v*` release tags |
| A minimal automatic synchronization workflow | Full CI, Linux amd64 Docker smoke, GHCR and GitHub Releases |

**Never edit `kg-releases` directly.** Edit `kg-os/distribution/`, `kg-os/plugins/kgos/` or `kg-os/scripts/render-kg-releases.mjs` in the private repository and push to private `main`. **`kg-os/plugins/kgos/INSTALL.md` is the only maintained installation guide**; the generator maps it to public `kg-releases/INSTALL.md` without creating a second maintained installer. The private sync workflow exports only allowlisted public files and the seven named Skill directories, with all their Markdown references/assets, excluding the legacy generic Skill and any runtime `.app.json`. It also exports the product licensing documents. All application source, tests and Git history remain private. Public workflows never push back to private KG OS.

## One-time setup

1. Create `bYiyLi/kg-releases` as a **Public** repository with an initialized `main` branch (GitHub's initial README placeholder is sufficient and is replaced at first sync). Change the existing `bYiyLi/kg-os` to **Private**; public forks and previously granted source licenses are not automatically revoked.
2. Create **two separate Ed25519 SSH key pairs**, stored outside either repository:
   - **Public write key:** add the public half in `kg-releases → Settings → Deploy keys`, with **Allow write access enabled**. In the **private `kg-os` repository Actions secrets**, save its private half as `KG_RELEASES_WRITE_KEY`. This key can write only to the public repository.
   - **Private read key:** add the public half in `kg-os → Settings → Deploy keys`, with **Allow write access disabled**. In the **public `kg-releases` repository Actions secrets**, save its private half as `KGOS_SOURCE_DEPLOY_KEY`. This key can read only the private source.
3. Only maintainers may push to `kg-releases/main` or modify its Actions and secrets. Do not grant source access to public contributors, forks or PRs. The public CI listens only to generated `main` pushes (and trusted reusable-workflow calls); Release listens only to generated `v*` tags.
4. Commit and push the private `kg-os` generator, templates and `.github/workflows/sync-kg-releases.yml`. Private `main` pushes generate `source.json` with the exact SHA and automatically synchronize the **allowlisted public files**; `kg-releases` then executes full CI. A private `v*` tag creates a corresponding immutable public tag with the exact source manifest, triggering the public Release workflow.
5. The private `kg-os` repository has **only one GitHub Actions workflow**, `.github/workflows/sync-kg-releases.yml`, to generate and synchronize public content. Its former `ci.yml` and `release.yml` have been disabled and deleted. All source validation, Linux amd64 Docker integration, and formal Release execution belong exclusively to `kg-releases`. Verify both public CI jobs on actual runs; an incomplete/failed public CI is not a completed migration acceptance.
6. Before enabling public binary publishing, resolve KG OS's **AGPL-3.0-only / commercial dual-license obligations**. Simply making the source private does not authorize closed-source distribution of previously AGPL-licensed code. When legally permitted, set the public repository Actions **variable** `KGOS_BINARY_DISTRIBUTION_APPROVED=true`. Until then, Release performs full verification but **skips publishing**.
7. Ensure the `ghcr.io/byiyli/kgos` package grants write access to the public workflow repository and can be anonymously pulled. GHCR may initially create a new package as Private; set package visibility to **Public** in package settings when authorized.

## CI

On every private `main` push, the sync workflow updates public `source.json`, the sole generated `INSTALL.md`, the Plugin/Skill tree and CI/CD templates in `kg-releases/main`. That public push automatically runs CI against the **pinned private revision**, verifies private main ancestry, installs dependencies, runs `pnpm validate`, builds the Linux amd64 image and runs the real unified Docker smoke test. A release tag calls the same CI jobs before publishing.

To protect source confidentiality, verbose build/test output is kept only inside the ephemeral runner; the public workflow intentionally does not upload logs, caches, coverage or test artifacts. Reproduce failures in the private development or Linux Docker test environment.

## Release

Release occurs **only when an authorized version tag is pushed in private `kg-os`**; normal `main` pushes never publish a Docker image.

1. Set `package.json` to the planned version and confirm permission to distribute that version.
2. Create and push `vX.Y.Z` in the private source repository, pointing at a commit on private `main`.
3. The private sync workflow exports the exact tag manifest and creates the **same tag name in the public distribution repository**. Public CI runs the source checks, official Plugin/export validation and isolated Linux amd64 Docker Smoke. The Release job verifies private main ancestry, tag, version, image revision, platform and digest.
4. If `KGOS_BINARY_DISTRIBUTION_APPROVED=true`, Release pushes `ghcr.io/byiyli/kgos:vX.Y.Z`, verifies anonymous pull, generates `kgos-plugin-vX.Y.Z.zip` with **root-level `plugin.json`, one `INSTALL.md`, licenses and exactly seven `skills/` directories** (plus the connection template), then creates the GitHub Release with this Plugin archive. Otherwise it skips formal publishing; no binary, Plugin Release asset or GitHub Release should be claimed.
5. If the GHCR package is inaccessible or private, fix the package settings and rerun the failed public Release workflow. A registry push alone does not prove successful public distribution.

The resulting GitHub Release public tag points to a commit in this distribution repository; private source identity is recorded by full SHA in the release notes and image label.

## Security

- Public-write and private-read credentials use **distinct repository-scoped deploy keys**. Never reuse either key for another repository.
- Never include source files in this repository, a public artifact, test reports, Actions cache, logs or Release assets.
- Run only source commits in private `main`; public PRs and arbitrary workflow dispatches must never receive a private deploy key.
- Workflows, read-only checkout rules and public content are developed exclusively under private `kg-os/distribution/`.
- Treat publishing, production deployment and tagging as separate operations.
