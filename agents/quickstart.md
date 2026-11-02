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

## Important Notes

- After native dependency changes (`better-sqlite3`, `node-pty`), run `pnpm run rebuild`.
- Husky and lint-staged run formatting and linting on staged files during commit.
