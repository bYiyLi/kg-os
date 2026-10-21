# KG OS — Releases

This is **kg-releases**, the automatically generated **public distribution repository** for KG OS, an AI-first programmable knowledge graph infrastructure.

The KG OS source repository is maintained privately. **No application source code or source history is mirrored here.** This repository provides release automation, publicly accessible release notes, installation instructions, and a place to report distribution issues. All files are generated from the private source repository; do not edit this repository directly.

## Install

Official new runtime releases target **Linux amd64 Docker** only. The image name is:

```text
ghcr.io/byiyli/kgos:v<version>
```

Only use tags that have actually been published. See [INSTALL.md](INSTALL.md) for installation, persistent storage, configuration, and first-run instructions.

## CI and releases

- **On private `main` push:** KG OS generates this repository's public files and a manifest identifying the exact private source commit. The push to this repository automatically starts full validation and isolated Docker smoke tests.
- **On private `vX.Y.Z` tag:** KG OS generates a matching public distribution tag. That tag runs full CI, then builds and smoke-tests the exact Linux amd64 image. Publishing to GHCR and creating a Release are enabled only after the maintainer explicitly confirms valid binary-distribution rights in repository settings.
- A repository-scoped read-only SSH deploy key allows these workflows to check out the exact private commit. Public pull requests do not trigger these workflows.

Maintainers: see [MAINTAINING.md](MAINTAINING.md) for the one-time key and publishing settings. For documentation or workflow changes, edit `kg-os/distribution/` and push the private source repository; this repository is not an independent development project.

The public release notes identify the private source revision and immutable image digest. A Git tag in this **distribution** repository refers to the distribution workflow revision, not a copy of a private source commit.

Issues about installation or published images can be reported in this repository.
