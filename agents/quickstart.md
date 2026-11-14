# Quickstart

## Toolchain

- Node: `24.14.0` from `.nvmrc`
- Package manager: `pnpm@10.28.2`
- Electron app root: this repo

## Core Commands

```bash
pnpm run d
pnpm run dev
pnpm run dev:main
pnpm run dev:renderer
pnpm run build
pnpm run rebuild
pnpm run reset
```

## Validation Commands

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
```

## Documentation

Agent guidance lives in `agents/`; this checkout has no separate docs app or docs
package commands. For edits to `agents/` or root Markdown, follow the documentation
validation instructions in `agents/workflows/testing.md`.

## Native Dependency Setup

Run `pnpm install --frozen-lockfile` before validation in a fresh checkout. The
`scripts/postinstall.ts` lifecycle installs a separate system-Node `better-sqlite3`
under `tooling/node-deps/`, then rebuilds the root `better-sqlite3` and `node-pty`
for Electron. The `main-db`, `fixtures`, and `migrations` Vitest projects use the
system-Node copy through `vitest.config.ts`; the app uses the root Electron copy.

- `CI` (when nonempty) or `EMDASH_SKIP_ELECTRON_REBUILD=1` skips the Electron
  rebuild after installing the tooling copy. Neither skips the tooling install.
- `pnpm install --ignore-scripts` skips the entire lifecycle. This is sufficient
  for the format/typecheck/lint CI job, but does not establish native readiness.
- `pnpm run db:setup` installs the system-Node database copy; it does not rebuild
  the application's native modules.
- After native dependency changes (`better-sqlite3`, `node-pty`), run
  `pnpm run rebuild` for the Electron copy. It does not install the tooling copy.
- With the Electron binary installed and native modules rebuilt, run
  `pnpm run test:native` for display-free Electron SQLite and PTY verification.
  `pnpm run rebuild` does not download the Electron binary. This does not prove an
  application UI journey; see
  [testing and validation](workflows/testing.md) for isolated native acceptance.

Husky and lint-staged run formatting and linting on staged files during commit.
