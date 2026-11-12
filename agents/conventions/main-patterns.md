# Main Process Patterns

## Controllers and Router

Domain controllers use `createRPCController` from `src/shared/ipc/rpc.ts`.
Keep domain behavior in operations or services; controllers may import operations
or use thin service wrappers. For example, `src/main/core/projects/controller.ts`
imports operations from its `operations/` directory, while
`src/main/core/tasks/controller.ts` delegates most handlers to `taskService`.

Controllers are assembled explicitly in `src/main/rpc.ts`. Each router key becomes
the renderer namespace: `tasks: taskController` exposes `rpc.tasks.createTask(...)`.
Add a new domain controller to that router; exporting it alone does not register it.
`registerRPCRouter` registers each procedure as `namespace.method` and discards the
Electron event. See `agents/conventions/ipc.md` for manual IPC requiring `event.sender`.

## Services

Use services for long-lived state such as caches, subscriptions and connections.
`src/main/core/app/service.ts` exports the `appService` singleton; its initialization
is called from `src/main/index.ts`. Follow the owning domain's lifecycle rather than
assuming every service has identical startup or disposal requirements.

## Providers and Transport

`src/main/core/projects/create-project-provider.ts` builds a shared `ProjectProvider`
from `src/main/core/projects/project-provider.ts` for both local and SSH projects.
It composes transport-specific execution contexts, filesystems, project settings
and worktree hosts. SSH project support is implemented; there is no project
`impl/_ssh-project-provider.ts` stub to fill in.

Useful source boundaries:

- Execution contexts: `src/main/core/execution-context/`.
- Filesystems: `src/main/core/fs/impl/local-fs.ts` and `src/main/core/fs/impl/ssh-fs.ts`.
- Project settings providers: `src/main/core/projects/settings/providers/`.
- Worktree hosts: `src/main/core/projects/worktrees/hosts/`.
- Terminal providers: `src/main/core/terminals/impl/local-terminal-provider.ts` and
  `src/main/core/terminals/impl/ssh-terminal-provider.ts`.

Reuse these abstractions before adding transport branches to domain operations.
Read the SSH and PTY risky-area guides before modifying those implementations.

## Result Type (`src/shared/result.ts`)

Import `ok`, `err` and `Result` directly from `@shared/result`.
`Result<T, E>` is discriminated by `success`: success carries `data`, failure
carries `error`. It does not use an `ok` property.

Expected failures may use this union; inspect the operation's caller before
changing its error contract. RPC does not automatically unwrap Results or convert
them to exceptions. For example, `taskController.provisionTask` explicitly checks
`result.success`, formats the error and throws, then returns `result.data` on success.

## Events

`src/main/lib/events.ts` exports the main-process `events` instance using
`createEventEmitter` from `src/shared/ipc/events.ts`. Typed event definitions live
in `src/shared/events/`; PTY definitions are in `src/shared/events/ptyEvents.ts`.

Pass an event definition, payload and optional topic to `events.emit`. Subscribe
with `events.on(eventDefinition, callback, topic)` and call the returned unsubscribe
function when the owning resource is disposed. Channels use `eventName` without a
topic and `eventName.topic` with one.

The main adapter sends emitted events to the current main window through
`webContents.send`; its subscriptions receive renderer messages through `ipcMain`.
This is an IPC bridge, not a local main-process broadcast bus. Renderer adapters
and RPC calls live in `src/renderer/lib/ipc.ts`.
