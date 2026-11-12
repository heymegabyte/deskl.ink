# Next verified frontier

- [x] Shared-module guide drift: remove the absent lifecycle domain file, document
  task-module ownership and the tooling alias, and distinguish per-target build,
  test and release-script configurations. Verify paths and alias sets against source.

- [x] Main-process IPC architecture drift: replace the absent electron-api.d.ts and
  retired manual-handler examples with the generic preload bridge, renderer client,
  and actual RPC event boundary. Recovered the uncommitted failed-run diff and
  verified it against current source and independent review.

- [x] Display-free native dependency gate: add `pnpm run test:native` to exercise
  Electron-ABI SQLite transactions and real PTY input/output with bounded execution.
  This establishes dependency readiness only; the real Electron journey remains open.

- [x] TypeScript/React conventions drift: replace retired renderer directories with
  app/features/lib ownership, distinguish release-script typechecking, and document
  TSX browser tests. Verify paths and configuration claims against the current checkout.

- [x] External navigation: replace renderer URL prefix trust in
  src/main/utils/externalLinks.ts with parsed origin checks. Reproduce credentials-in-URL
  and wrong-port bypasses in tests; reconcile app:// handling with main/app/window.ts.
- [x] Terminal search: map normalized search offsets to actual terminal cells in
  src/renderer/lib/pty/terminal-search.ts. Cover wide characters,
  Unicode lowercase expansion, combining characters, and wrapped lines.
- [x] Task filtering: clear selection and range anchor when the effective search changes;
  preserve them for equivalent trimmed/case-insensitive queries. Cover both tabs and clearing search.
- [x] Renderer agent docs: reconcile absent views/components/contexts/core registries with
  actual features/app/lib paths. Verify each documented source path exists.
- [ ] Real Electron golden/long journey: establish isolated app data and real backend state,
  then record a durable multi-surface case. Current browser tests exercise terminal DOM
  dimensions, not a full Electron journey. No visual/a11y/runtime pass inferred from units.
- [ ] Navigation redirects: verify will-redirect behavior against a real local renderer
  server that redirects off-origin. Extend the navigation policy if the destination can
  escape the renderer; retain same-origin redirects and record actual Electron evidence.

- [x] Renderer conventions: reconcile stale modal, view and PTY paths and ownership
  in agents/conventions/renderer-patterns.md; verify all explicit source paths exist.
- [x] Terminal search result semantics: expose a persistent polite, atomic status region;
  cover matches, stepping, no matches, clearing and closing in real Chromium component tests.
- [ ] Terminal search accessibility runtime: verify screen-reader announcements and actual
  terminal selection in an isolated real Electron Unicode journey.

- [x] Delete confirmation: capture confirmed task IDs rather than reading mutable selection
  in the success callback. Cover selection changes while the modal is open.
- [x] Search empty state: distinguish zero matching tasks from an empty active task list;
  avoid presenting creation onboarding for a search with no matches.
- [x] Bulk archive/restore failures: handle rejected task-manager operations with visible feedback.
- [ ] Task-list accessibility: label search explicitly, identify row checkboxes by task name,
  and verify unchecked selectors remain visible on keyboard focus in a real Electron renderer.
  Labels and compiled-production-CSS Chromium focus/hit-testing checks now pass; native acceptance remains open.

- [x] Delete preflight failure: require visible retry/error handling rather than proceeding
  with hidden worktree options and default destructive choices after a failed preflight.
- [x] Task registration transitions: exclude unregistered records from bulk deletion
  confirmation with a real state guard; cover selected tasks changing registration state.

- [x] Individual archive/restore failures: task-row and sidebar handlers must consume rejected
  manager operations and provide visible action-specific feedback.
- [x] Pending bulk archive/restore guard: block additional bulk archive/restore and delete
  requests while archive/restore is pending, retain the guard across renders and release
  after all requests settle. Cover rejection and retry with the real project view store.
- [ ] Bulk mutation runtime: verify disabled controls, keyboard behavior and rollback ordering
  in a real Electron journey; individual row overlap remains open.

- [x] Bulk retry selection history: preserve a user's select-then-deselect intent while
  archive/restore requests are pending; cover both actions with the real task-view store.
- [x] Task-row interaction semantics: separate the nested checkbox/navigation buttons and
  add headless browser keyboard coverage alongside the real-renderer accessibility gate.

- [x] Project directory sanitization: reject Windows device names with extensions and
  remove trailing dots/spaces; preserve ordinary names in shared-helper regressions.
- [ ] Individual archive/restore runtime: verify error toast visibility/announcement and
  manager rollback in an isolated Electron journey; callback tests cover rejection handling only.

- [x] Bulk delete rejection: consume manager rejection, show feedback and preserve retry
  selection without replacing newer user selection. Verify manager rollback separately.
- [x] Delete preflight Git-status failure: reject failed status/lookup inspection and
  unavailable projects so the modal requires successful retry before deletion.

- [ ] Delete rollback integrity: verify failed deletion does not restore disposed task stores;
  reconcile partial backend deletion with renderer state using a real Electron journey.

- [x] Preflight lookup completeness: strict deletion lookup now propagates fallback
  inspection errors; see the verified strict deletion lookup recovery below.
- [x] Bulk shared-worktree preflight: inspect dirty shared branches when every sibling is
  selected; retain the worktree when an unselected sibling remains. Real SQLite regressions
  cover both selection orders, status rejection, project isolation and source-branch safety.

- [x] Individual delete rejection: consume task-row and sidebar manager rejection and show action-specific
  feedback. Keep native rollback/partial backend deletion verification separate.

- [x] Deletion-led bulk concurrency: confirmed deletion acquires the shared pending guard;
  block duplicate confirmations and bulk archive/restore/delete until settlement, release
  on fulfillment/rejection and preserve newer selection. Native behavior remains unverified.

- [x] GitHub rate limiter concurrency: recheck token availability after waking so
  concurrent PR-sync requests cannot consume the same refill; cover burst and idle capacity.

- [x] GitHub rate limiter clock changes: use monotonic elapsed time so system-clock
  corrections cannot stall requests or prematurely replenish the burst; test both directions.

- [x] GitHub retry listener lifecycle: remove abort listeners after successful backoff;
  cover repeated retries sharing a signal, unrelated listeners and pending cancellation.
- [x] Retry cancellation boundaries: prevent starting an attempt with a pre-aborted signal
  or when cancellation arrives after backoff settles; define rejection semantics first.

- [x] PR refresh cancellation: connect repository cancellation to single refreshes;
  guard asynchronous setup, rate-limit acquisition and late responses, and forward the
  signal to retries and GraphQL. Deferred unit tests cover cancellation boundaries;
  live GitHub/Electron acceptance remains separate.
- [x] Cancellable rate-limit waits: abort queued acquisition without consuming a token;
  cover timer/listener cleanup, concurrent waiters and cancellation after timer resolution.
- [x] Bulk sync controller ownership: prevent cancelled sync cleanup from removing a
  replacement sync; cover retained deduplication and cancellation through the public API.
- [x] Bulk sync queued token cancellation: forward the signal in full/incremental syncs
  and guard the token continuation; verify waiting/resolved boundaries and prompt release.
- [x] PR check-run cancellation: register repository ownership, abort queued tokens/retries/requests,
  suppress late persistence/notifications, and finish any already-started check replacement.
  Deferred unit regressions cover ownership lookup, deduplication, repository isolation and cleanup.
- [ ] PR sync persistence cancellation: verify database upserts/late bulk responses and
  real Electron/GitHub cancellation. Unit mocks do not prove native behavior; SQLite
  rollback and concurrent valid-SHA ordering are covered separately below.
- [x] Check fetch preservation: retain stored checks until all replacement pages are fetched;
  reject missing or mismatched commit identities on every page. Cover cancellation/failure
  with previous-head checks, paginated head changes, valid empty rollups and completed pages.

- [x] Retry maximum backoff: cap the initial delay as well as subsequent delays;
  reproduce oversized initialDelayMs and verify exact attempt times.

- [ ] Task-row renderer acceptance: verify full-row pointer target, independent PR
  popover, computed selector visibility on keyboard focus and native task navigation
  in an isolated Electron journey. Chromium keyboard regressions do not complete this gate.

- [x] Documentation validation scope: distinguish root/agent Markdown validation from
  the optional docs app; reproduce absent-docs failure and document retained-worktree
  comparison before recovery. Renderer changes retained by failed runs are superseded
  by 96adb338; leave their files intact.
- [x] Optional docs scripts: retire the commands targeting the absent docs app and
  reconcile setup, architecture and validation guidance; verify no CI/hook consumers.

- [x] Bulk retry cancellation reporting: preserve cancelled progress when retry backoff
  rethrows the last API failure; cover full/incremental modes and uncancelled failures.

- [x] Check replacement rollback: retain previous stored checks if SQLite rejects a
  replacement insert; verify first/later-row failures, retry, empty snapshots and PR
  isolation with real SQLite. Native acceptance remains open.

- [x] Concurrent check snapshot ownership: only the latest started per-PR operation may
  replace stored checks; cover both completion orders, unavailable newer heads, retry,
  stale notification suppression and PR isolation with real SQLite.

- [x] Strict deletion lookup: recover retained commit 79f760e6 after confirming it is
  absent from main; propagate inspection failures through preflight without lookup-time
  directory removal/pruning. Fresh regression recovery reproduces seven failures.
- [x] Worktree fallback pool containment: replace string-prefix membership with a
  path-boundary check; cover a sibling pool whose name begins with the configured pool.
  Strict inspection recovery preserves this preexisting behavior.

- [ ] Native worktree containment acceptance: on an isolated Electron display, verify
  deletion preflight ignores a matching branch in a sibling-prefix pool. Unit tests
  establish lexical host-path boundaries; Windows/SSH behavior remains simulated.

- [x] Rejected deletion resource lifetime: retain live task stores until backend success;
  preserve replacement entries and isolate cleanup failures. Seven manager regressions
  cover resource identity, rollback, replacement ownership and cleanup continuation.
  Partial backend deletion and native Electron acceptance remain open above.

- [x] Replacement deletion ownership units: preserve replacement tab history during old
  deletion cleanup on success/rejection and guard snapshot eviction by registration identity.
  Real WorkspaceViewModel history and SnapshotRegistry cache/reaction regressions cover
  stale disposal, repeated disposal and third-owner takeover; manager tests verify forwarding.
- [ ] Replacement deletion native acceptance: exercise old deletion settlement after a
  newer store registers the same task ID in Electron; verify replacement persistence and
  back/forward navigation. Composed unit regressions do not prove the native lifecycle.

- [x] Project-owned deletion recovery: restore missing single/preflight ownership guards
  and validate the entire batch before dispatching deletions. Real SQLite regressions
  reproduce five failures before recovery and cover both mixed-batch orders, service
  hook suppression, owner cleanup and missing IDs. Native acceptance remains open.
- [ ] Deletion ownership native acceptance: reject a mismatched project/task request
  through the real Electron bridge; verify preserved task/workspace data and no provider
  cleanup. SQLite service tests do not establish native IPC behavior.

- [x] IPC documentation drift: reconcile the renderer client path and preload bridge
  description with lib/ipc.ts, globals.d.ts and preload/index.ts; remove obsolete named
  bridge methods and verify actual worktree guidance before editing injected-context hints.

- [x] MCP documentation recovery: replace retired renderer paths, identify view/query
  ownership and scope the stdio-only constraint to the repository's Codex adapter.
  Recovered retained documentation with fresh source checks; no transport behavior changed.

- [x] Main-process conventions drift: document shared Result semantics, actual thin
  controllers, implemented local/SSH project composition and IPC event direction.
  Verify source paths and example contracts against current implementation.
