# Shared Modules

## Main Shared Areas

- Provider registry:
  - `src/shared/agent-provider-registry.ts`
- IPC primitives:
  - `src/shared/ipc/rpc.ts` — typed RPC router, controller, and client
  - `src/shared/ipc/events.ts` — typed event emitter
- Typed event definitions:
  - `src/shared/events/` — `agentEvents.ts`, `appEvents.ts`, `conversationEvents.ts`, `fsEvents.ts`, `gitEvents.ts`, `githubEvents.ts`, `hostPreviewEvents.ts`, `prEvents.ts`, `projectEvents.ts`, `ptyEvents.ts`, `resourceEvents.ts`, `sshEvents.ts`, `taskEvents.ts`, `updateEvents.ts`
- MCP types:
  - `src/shared/mcp/`
- Skills types and validation:
  - `src/shared/skills/`
- Domain type modules (flat files):
  - `conversations.ts`, `fs.ts`, `git.ts`, `github.ts`, `hostPreview.ts`, `projects.ts`, `pull-requests.ts`, `ssh.ts`, `tasks.ts`, `terminals.ts`, `urls.ts`, `utils.ts`
- Task-specific shared modules:
  - `src/shared/task/` — task environment-variable helpers
- PTY helpers:
  - `ptyId.ts`, `ptySessionId.ts`
- App settings types:
  - `app-settings.ts`

## Path Aliases

The application `tsconfig.json` defines these typechecking aliases:

| Alias | Resolves to |
| --- | --- |
| `@/*` | `src/*` |
| `@renderer/*` | `src/renderer/*` |
| `@main/*` | `src/main/*` |
| `@shared/*` | `src/shared/*` |
| `@root/*` | `./*` |
| `@tooling/*` | `tooling/*` |

`electron.vite.config.ts` configures build aliases separately for each target:

- main: `@`, `@main`, `@shared`, `@root`
- preload: `@shared`, `@root`
- renderer: `@`, `@renderer`, `@shared`, `@root`

`@tooling` is available to application typechecking and Vitest, but is not an
electron-vite build alias. Do not assume that an alias accepted by TypeScript is
available in every process build. Keep new imports within the target's configured
aliases, or update that target's build configuration deliberately.

`vitest.config.ts` defines test aliases independently. Database test projects also
redirect `better-sqlite3` to the system-Node copy under `tooling/node-deps/`; the
application retains its Electron-compiled copy. Release scripts use a separate
`scripts/release/tsconfig.json`, checked by the second command in `pnpm run typecheck`.
Aliases are resolved by the build/test tooling; no runtime monkey-patching is needed.

## Provider Registry Rules

When adding a provider:

1. update `src/shared/agent-provider-registry.ts`
2. add any required env passthrough in `src/main/core/pty/pty-env.ts`
3. add an agent event classifier in `src/main/core/agent-hooks/classifiers/`
4. update renderer surfaces that assume provider metadata
5. add tests for non-standard spawn or detection behavior
