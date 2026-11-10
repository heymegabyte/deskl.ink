# TypeScript And React Conventions

## TypeScript

- strict mode is enabled in `tsconfig.json`
- always use explicit types, do not use `any`
- prefer module imports at the top of the file, never use require()
- import from the defining module; do not add re-exports
- root `tsconfig.json` covers main, preload, renderer, shared and tooling;
  release scripts use `scripts/release/tsconfig.json`. `pnpm run typecheck` checks both.

## Renderer

- functional React components and hooks
- app composition, workspace and view/modal registries under `src/renderer/app/`
- feature views, components, hooks and stores under `src/renderer/features/`
- shared providers under `src/renderer/lib/providers/` and shared hooks under
  `src/renderer/lib/hooks/`; keep feature-specific state with its feature
- shared infrastructure under `src/renderer/lib/` (IPC client, modals, layout,
  navigation stores and PTY); shared UI primitives under `src/renderer/lib/ui/`
- follow `agents/architecture/renderer.md` for source ownership and
  `agents/conventions/renderer-patterns.md` for modal, view and PTY contracts

## Naming

- component symbols: PascalCase; follow neighboring file names (both kebab-case
  and PascalCase exist in feature directories)
- hooks: `useX` camelCase or existing patterns like `use-toast.ts`
- Node tests: `*.test.ts`; renderer browser tests: `*.test.ts` or `*.test.tsx`
  under `src/renderer/tests/browser/`. The Node project does not discover TSX tests
  (see `vitest.config.ts` and `agents/workflows/testing.md`).
