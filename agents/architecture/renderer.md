# Renderer

## Main Entry Points

- `src/renderer/App.tsx`: top-level provider composition
- `src/renderer/app/workspace.tsx`: main post-onboarding shell and active view slots
- `src/renderer/app/view-registry.ts`: project, task, settings, library, skills, MCP, and home view definitions
- `src/renderer/lib/ipc.ts`: typed RPC client (`rpc`) and event emitter (`events`)

## Feature Areas (`src/renderer/features/`)

- `projects/` — project management, project settings, task lists, and PR lists
- `tasks/` — task experience:
  - `conversations/` — conversation panel and provider/context controls
  - `diff-view/` — changes panel, diff views, PR review, and git state
  - `editor/` — Monaco editor, file tree, file state, and conflict dialog
  - `terminals/` — terminal panel, tabs, and terminal management
  - `stores/` — task lifecycle, workspace state, and task selectors
  - `hooks/` — task-scoped settings and activity hooks
- `settings/`, `skills/`, `mcp/`, `integrations/` — configuration and integration management
- `sidebar/`, `command-palette/` — navigation and commands
- `library/` — prompt library
- `onboarding/` — sign-in and project import

## Supporting Structure

- App composition and registries: `src/renderer/app/`
- Shared providers and hooks: `src/renderer/lib/providers/`, `src/renderer/lib/hooks/`
- Shared UI primitives and components: `src/renderer/lib/ui/`, `src/renderer/lib/components/`
- Infrastructure: `src/renderer/lib/` (IPC, modals, layout, commands, stores, PTY, and Monaco helpers)
- Utilities: `src/renderer/utils/`
- Tests: `src/renderer/tests/` and colocated feature tests

## When Editing Here

- Check `agents/conventions/renderer-patterns.md` for modal, view, PTY frontend, and context patterns; resolve source locations against this map.
- Call RPC methods via `rpc` from `src/renderer/lib/ipc.ts` (e.g., `rpc.tasks.create(...)`).
- Register new modals in `src/renderer/app/modal-registry.ts` and new views in `src/renderer/app/view-registry.ts`.
- Use the state selectors in `src/renderer/features/tasks/stores/task-selectors.ts` and `src/renderer/features/projects/stores/project-selectors.ts`; task view components can use `src/renderer/features/tasks/task-view-context.tsx`.
- The direct preload bridge is declared in `src/renderer/globals.d.ts`; prefer typed RPC and events for application operations.
- If you change user-visible workflows, update the relevant repository documentation when appropriate.
