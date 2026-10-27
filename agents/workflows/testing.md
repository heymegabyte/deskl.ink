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
- Browser tests require the Chromium version installed for the current Playwright
  dependency. If launch reports a missing executable, run `pnpm exec playwright install chromium`.
  For a worktree-local download, use
  `PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/playwright" pnpm exec playwright install chromium`
  and set the same variable when running `pnpm test`. An executable-launch failure
  leaves browser tests unverified even if every non-browser test passed.
- Tests use per-file `vi.mock()` setup.
- Integration-style tests create temporary repos and worktrees in `os.tmpdir()`.
- On a memory-constrained shared runner, run the core gates sequentially. If the
  default test concurrency times out under resource pressure, rerun the complete
  suite with `pnpm test --maxWorkers=1` and retain both outcomes. Do not infer a
  product regression or a passing gate from an interrupted attempt. A typecheck
  heap exhaustion can be retried with
  `NODE_OPTIONS=--max-old-space-size=6144 pnpm run typecheck` when memory permits;
  record the actual result rather than treating the larger heap as proof of success.

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
- after agent-guide or root Markdown changes: run `pnpm run format:check`, inspect
  the diff, and verify referenced source paths and commands against this checkout.
  `.oxfmtrc.json` excludes Markdown, so a green formatting gate does not validate
  Markdown layout, links or command accuracy; review those explicitly.
- after docs-app changes: run `pnpm run docs:build` only when `docs/package.json`
  exists. This checkout has no `docs/` app; the retained package script fails at
  `cd docs`. Report that prerequisite as unavailable rather than treating a
  Markdown-only change as an application build failure or claiming a docs build passed.

## Retained Run Recovery

A failed receipt can leave useful uncommitted files even when its result SHA equals
its base. Inspect `git -C <retained-worktree> status --short` and the actual diff;
compare changed files and untracked tests with the current checkout, then check
commit ancestry on main. A matching filename or a successful receipt alone does
not establish that the implementation landed. Later fixes may supersede only part
of a retained diff. Preserve retained files and screenshots; recover only work
that is still missing and verify it afresh. Never run `git status <other-worktree>`:
that argument is a pathspec in the current repository, not a repository switch.
