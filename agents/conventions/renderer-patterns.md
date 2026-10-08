# Renderer Patterns

## Modal System

Modals use a registry and a shared MobX store. Only one modal can be active at a time.

- `src/renderer/app/modal-registry.ts` — modal IDs, components, sizes, and positions
- `src/renderer/lib/modal/modal-store.ts` — active modal, close guard, and previous focus
- `src/renderer/lib/modal/modal-provider.tsx` — typed hooks and standalone `showModal`
- `src/renderer/lib/modal/modal-renderer.tsx` — dialog rendering and focus restoration

**Adding a modal:**
1. Create a component accepting `BaseModalProps<TResult>` (provides `onSuccess` and `onClose` callbacks).
2. Register it in `src/renderer/app/modal-registry.ts`.
3. Open it with `useShowModal('myModal')` or `useModalContext().showModal` from `src/renderer/lib/modal/modal-provider.tsx`.

**Rules:**
- All modals must be registered; TypeScript infers required arguments from the registry.
- `hasActiveCloseGuard` blocks outside-click and Escape dismissal, not explicit close calls or navigation.
- Use `src/renderer/lib/modal/use-close-guard.ts` during critical operations.

## View System

Views use a registry and parameterized navigation backed by a MobX store.

- `src/renderer/app/view-registry.ts` — view definitions, types, and activation guards
- `src/renderer/lib/layout/navigation-provider.tsx` — typed navigation, params, and slot hooks
- `src/renderer/lib/stores/navigation-store.ts` — active view, per-view params, and snapshots
- `src/renderer/lib/layout/layout-provider.tsx` — workspace left-panel collapse and drag state
- `src/renderer/app/workspace.tsx` — renders the active view slots

**Key behaviors:**
- `useNavigate().navigate(viewId, params?)` is type-safe; params are optional when all fields are optional and omitted for views with no params.
- Params remain stored per view when navigating away and back; snapshots support persistence.
- Committed navigation closes the active modal.
- `useParams(viewId).setParams(partial)` updates params without navigating; the underlying store also accepts an updater function.
- Activation guards can redirect navigation and validate restored params.

**Rules:**
- Register new views in `src/renderer/app/view-registry.ts`; definitions are keyed by `ViewId`.
- `MainPanel` is required; `WrapView`, `TitlebarSlot`, `commandProvider`, and `canActivate` are optional. There is no registry `RightPanel` slot.

## PTY Frontend (`src/renderer/lib/pty/`)

Each session owns its xterm instance; React mounting moves its container between the visible pane and an off-screen host.

- `pty.ts` — `FrontendPty`, live-instance set, subscription, mounting, and disposal
- `pty-session.ts` — MobX `PtySession`, lazily connecting when status becomes observed
- `use-pty.ts` — terminal input, sizing, and React mount/unmount integration
- `pty-pane.tsx` — terminal pane component
- `xterm-host.ts` — shared off-screen DOM host
- `pty-pool-provider.tsx` — ensures the host exists and disposes all PTYs on app teardown

**Lifecycle:** create session → connect → mount → unmount → dispose.

**Rules:**
- `connect()` obtains historical output via `rpc.pty.subscribe` and subscribes to live events; historical output is written directly to xterm, with no renderer-side output buffer.
- Unmount parks the same terminal off-screen, preserving scrollback. Entity deletion or app teardown disposes it; there is no capped reusable terminal pool.
- Use `makePtySessionId(projectId, scopeId, leafId)` from `src/shared/ptySessionId.ts` for deterministic IDs.
- Disconnect visible-pane resize observers before unmounting the terminal container.
- Panel dragging suppresses resizing via `src/renderer/lib/layout/panel-drag-store.ts`.

## React Query and Local State

Use React Query for fetched server data and mutation cache updates. For example, `src/renderer/features/settings/use-app-settings-key.tsx` snapshots the settings cache, updates optimistically, restores it on error, and invalidates on settlement.

**Rules:**
- Use `useAppSettingsKey(key)` for per-setting access.
- Optimistic updates must include rollback on error.
- Choose state ownership to match its lifecycle: fetched data can use React Query, shared mutable renderer state uses MobX stores, and component-local state can use React state.

## State Outside React

For state shared across components or surviving React unmounts:

- **MobX stores** — navigation and app state in `src/renderer/lib/stores/`; project and task stores under their feature directories
- **External stores** — `panelDragStore` in `src/renderer/lib/layout/panel-drag-store.ts`
- **Session owners** — `PtySession` in `src/renderer/lib/pty/pty-session.ts`, managed by `src/renderer/features/tasks/terminals/terminal-manager.ts` and `src/renderer/features/tasks/conversations/conversation-manager.ts`
