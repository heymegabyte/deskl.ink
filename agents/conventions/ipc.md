# IPC Conventions

## RPC Pattern

The primary IPC mechanism is a typed RPC system:

- **Controllers**: `src/main/core/*/controller.ts` — define handler functions using `createRPCController`.
- **Router**: `src/main/rpc.ts` — assembles all controllers into a typed router using `createRPCRouter`.
- **Registration**: `registerRPCRouter(router, ipcMain)` in `src/main/index.ts` — auto-registers `namespace.method` channels.
- **Client**: `src/renderer/lib/ipc.ts` — creates a proxy-based typed client using `createRPCClient<RpcRouter>`.

```ts
// Main — src/main/core/example/controller.ts
import { createRPCController } from '@shared/ipc/rpc';
export const exampleController = createRPCController({
  async doSomething(id: string) {
    return await service.doSomething(id);
  },
});

// Renderer — call via typed client
import { rpc } from '@renderer/lib/ipc';
const result = await rpc.example.doSomething('123');
```

## Preload Bridge And Manual IPC

`src/preload/index.ts` exposes `window.electronAPI` through `contextBridge`;
`src/renderer/globals.d.ts` declares its renderer-facing shape:

- `invoke` transports calls for the typed RPC client.
- `eventSend` and `eventOn` transport typed events; `eventOn` returns an unsubscribe function.
- `getPathForFile` resolves a dropped file's native path through Electron's `webUtils`.

Use `rpc` and `events` from `src/renderer/lib/ipc.ts` for application operations.
The RPC registration wrapper discards the Electron event, so handlers requiring
`event.sender` need manual IPC registration. Keep any bridge changes consistent
between the preload implementation and its declaration; do not add individually
named bridge methods for ordinary RPC procedures.

## Event System

Typed events use `createEventEmitter` from `src/shared/ipc/events.ts`. Event type definitions live in `src/shared/events/`.

## Rules

- Prefer the RPC pattern for new IPC methods — add a handler to the appropriate controller.
- Only use manual IPC when `event.sender` is required.
- Keep the RPC router type (`RpcRouter`) importable by the renderer for type inference.
- Prefer existing service boundaries over adding logic directly inside controllers.
- Update tests when controller shape or IPC wiring changes.
