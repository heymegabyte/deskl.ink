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
  and verify unchecked selectors remain visible on keyboard focus in a real renderer.

- [ ] Delete preflight failure: require visible retry/error handling rather than proceeding
  with hidden worktree options and default destructive choices after a failed preflight.
- [x] Task registration transitions: exclude unregistered records from bulk deletion
  confirmation with a real state guard; cover selected tasks changing registration state.

- [x] Individual archive/restore failures: task-row and sidebar handlers must consume rejected
  manager operations and provide visible action-specific feedback.
- [ ] Pending bulk mutations: prevent duplicate archive/restore requests while pending and
  verify rollback ordering under overlapping actions in a real Electron journey.

- [x] Bulk retry selection history: preserve a user's select-then-deselect intent while
  archive/restore requests are pending; cover both actions with the real task-view store.
- [ ] Task-row interaction semantics: separate the nested checkbox/navigation buttons and
  add headless browser keyboard coverage alongside the real-renderer accessibility gate.

- [x] Project directory sanitization: reject Windows device names with extensions and
  remove trailing dots/spaces; preserve ordinary names in shared-helper regressions.
- [ ] Individual archive/restore runtime: verify error toast visibility/announcement and
  manager rollback in an isolated Electron journey; callback tests cover rejection handling only.
