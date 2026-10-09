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
- [ ] Terminal search accessibility: announce result counts to assistive technology;
  verify actual terminal selection in an isolated real Electron Unicode journey.

- [x] Delete confirmation: capture confirmed task IDs rather than reading mutable selection
  in the success callback. Cover selection changes while the modal is open.
- [ ] Search empty state: distinguish zero matching tasks from an empty active task list;
  avoid presenting creation onboarding for a search with no matches.
- [ ] Bulk archive/restore failures: handle rejected task-manager operations with visible feedback.
- [ ] Task-list accessibility: label search explicitly, identify row checkboxes by task name,
  and verify unchecked selectors remain visible on keyboard focus in a real renderer.

- [ ] Delete preflight failure: require visible retry/error handling rather than proceeding
  with hidden worktree options and default destructive choices after a failed preflight.
- [ ] Task registration transitions: exclude unregistered records from bulk deletion
  confirmation with a real state guard; cover selected tasks changing registration state.
