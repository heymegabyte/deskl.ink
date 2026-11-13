# Risky Area: Updater And Packaging

## Main Files

- `src/main/core/updates/update-service.ts` — update state, scheduling and installation
- `src/main/core/updates/controller.ts` — update RPC methods
- `src/main/core/updates/utils.ts` — error and log formatting
- `src/shared/app-identity.ts` and `src/shared/app-identity.canary.ts` — app/channel identity
- `electron-builder.config.ts` and `electron-builder.canary.config.ts` — packaging and feed configuration
- `scripts/release/` — native rebuilds, packaging, verification, notarization and R2 upload
- `.github/actions/setup-build/action.yml` and `.github/actions/upload-r2/action.yml`
- `.github/workflows/release-prod.yml` and `.github/workflows/release-canary.yml`
- `.github/workflows/windows-beta-build.yml` and `.github/workflows/nix-build.yml`
- `build/` — signing entitlements and other packaging resources
- `package.json` — local build, packaging and rebuild commands

## Rules

- Avoid changing updater defaults casually; signing, notarization, packaging targets and native rebuilds are release-critical.
- Keep build output directories and packaging configuration stable unless the task explicitly concerns release behavior.
- Trace a release through its workflow, composite actions and scripts before choosing a validation command. `scripts/release/build.ts` passes `--publish always` to electron-builder; `scripts/release/upload-r2.ts` writes artifacts to R2. Neither is a read-only verification command.
- A passing typecheck or native smoke test does not establish signing, notarization, feed publication or successful installation. Record platform release acceptance separately.

## Current Behavior

- `update-service.ts` resolves the current version in development but does not activate the updater there. Production schedules the first check after 30 seconds and schedules the next check one hour after a check settles, including a manual check. Concurrent checks share a promise.
- Downloads are explicit (`autoDownload = false`); downloaded updates can install on app quit. Prereleases and downgrades are disabled. Explicit installation requires downloaded state, guards duplicate requests and restores retryability after a synchronous install error or the two-minute restart guard timeout.
- The builder configurations use a generic feed at `https://releases.emdash.sh`. Shared app identity selects `v1-stable` or `v1-canary`; keep renderer/main build identity, packaging identity, artifact prefixes and uploaded manifests consistent.
- Production and canary release workflows use the shared Node 24/Python 3.11 setup action. Their packaging script rebuilds `better-sqlite3`, `node-pty` and `@parcel/watcher` for each requested architecture using the installed Electron version; electron-builder's own native rebuilding is disabled.
- The separate Windows beta workflow also uses Node 24/Python 3.11. Its explicit rebuild command names `sqlite3,node-pty`, unlike the shared release module list. It packages with `--publish never` and uploads GitHub Actions artifacts; do not assume it follows the R2 release path.
- macOS packaging enables hardened runtime. Builder-integrated notarization is disabled; release workflows invoke separate bundle verification and notarization/stapling scripts. Inspect those scripts and their credential checks before claiming a notarized result.
- Production/canary Windows workflows condition signature verification on Azure signing credentials being present and warn when they are absent. A successful workflow alone does not prove a signed installer.
- Release notes first use update metadata, then fall back to the upstream GitHub release in `fetchReleaseNotes()`. Changelog UI and auto-update behavior remain separate surfaces.
