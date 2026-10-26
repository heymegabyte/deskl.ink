# Quickstart

## Toolchain

- Node: `24.14.0` from `.nvmrc`
- Package manager: `pnpm@10.28.2`
- Electron app root: this repo
- Docs app: optional `docs/` checkout; absent from the current repository tree

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

## Optional Docs App

The retained script requires `docs/package.json`; check that it exists before running:

```bash
pnpm run docs:build
```

For edits to `agents/` or root Markdown, follow the documentation validation
instructions in `agents/workflows/testing.md`.

## Important Notes

- If a docs app is present, check its port before running alongside the Electron renderer on port `3000`.
- After native dependency changes (`better-sqlite3`, `node-pty`), run `pnpm run rebuild`.
- Husky and lint-staged run formatting and linting on staged files during commit.
