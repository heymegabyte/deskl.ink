# Next verified frontier

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

- [ ] Preflight lookup completeness: distinguish missing worktrees from swallowed fallback
  lookup errors in WorktreeService; inspect dirty shared branches when every sibling is selected.

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
- [ ] PR sync cancellation beyond single refresh: verify bulk/check-run requests and
  cancellation during database upserts. Bulk token waits still omit the signal; check-run
  controllers are not registered for repository cancellation. Cover these independently.

- [x] Retry maximum backoff: cap the initial delay as well as subsequent delays;
  reproduce oversized initialDelayMs and verify exact attempt times.

- [ ] Task-row renderer acceptance: verify full-row pointer target, independent PR
  popover, computed selector visibility on keyboard focus and native task navigation
  in an isolated Electron journey. Chromium keyboard regressions do not complete this gate.

- [x] Documentation validation scope: distinguish root/agent Markdown validation from
  the optional docs app; reproduce absent-docs failure and document retained-worktree
  comparison before recovery. Renderer changes retained by failed runs are superseded
  by 96adb338; leave their files intact.
- [ ] Optional docs scripts: decide whether to restore the separate docs app or retire
  its retained package scripts; do not infer app availability from package.json alone.
