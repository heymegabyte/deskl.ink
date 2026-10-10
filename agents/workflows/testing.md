# Testing And Validation

## Core Local Gate

Run these before merging:

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
```

## Test Layout

- main-process tests: colocated in `src/main/core/**/*.test.ts`
- renderer unit tests: `src/renderer/tests/`
- renderer browser tests: `src/renderer/tests/browser/` (run via Playwright)

## Current Setup

- Vitest config is in `vitest.config.ts` (separate from the build config in `electron.vite.config.ts`).
- Five test projects:
  - `node` — all `src/**/*.test.ts` files excluding `_*` dirs and browser tests
    (also excluding database integration, legacy-port and migration tests)
  - `main-db` — main-process database integration and legacy-port tests
  - `fixtures` — fixture generator, run explicitly with `pnpm run db:fixtures`
  - `migrations` — database migration tests
  - `browser` — `src/renderer/tests/browser/**/*.test.{ts,tsx}` via `@vitest/browser-playwright`
- `pnpm test` runs `node`, `main-db`, `migrations`, and `browser`; it does not generate fixtures.
- Database projects use the system-Node `better-sqlite3` copy under `tooling/node-deps/`,
  installed by postinstall. Run `pnpm run db:setup` if that copy is missing.
- If the machine's pnpm shim is unavailable, use `corepack pnpm` with the version pinned in
  `package.json`, including for installation and validation commands.
- Tests use per-file `vi.mock()` setup.
- Integration-style tests create temporary repos and worktrees in `os.tmpdir()`.

## Native Journey Evidence

The `browser` project checks renderer components in headless Chromium; it does not
launch Electron or exercise the preload bridge, native PTY, or project/task workflow.
Passing `pnpm test` alone is therefore not evidence of a complete desktop journey.

For changes affecting that workflow, use a private display/compositor and isolate
app data before launching `pnpm run dev`. On Linux, set `XDG_CONFIG_HOME` and
`EMDASH_DB_FILE` to disposable paths. `--user-data-dir` alone is insufficient:
`src/main/index.ts` sets userData from appData. Verify the affected path using
a disposable Git repository: open the project,
create a task, confirm terminal input/output, and check the changed interaction.
Record which steps actually ran and any native dependency or display blocker.
Keep component-test results and native journey results separate in the run report.

## CI Notes

- `.github/workflows/code-consistency-check.yml` currently enforces:
  - `pnpm run format:check`
  - `pnpm run typecheck`
  - `pnpm run lint`
- Tests are still expected locally before merging even though they are not enabled in that workflow yet.

## Focused Validation

- after IPC/RPC changes: rerun the affected Vitest file and confirm the controller is wired in `src/main/rpc.ts`
- after worktree or PTY changes: rerun the closest `src/main/core/` test files
- after docs changes: run `pnpm run docs:build`
