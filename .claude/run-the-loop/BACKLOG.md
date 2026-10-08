# Next verified frontier

- [x] External navigation: replace renderer URL prefix trust in
  src/main/utils/externalLinks.ts with parsed origin checks. Reproduce credentials-in-URL
  and wrong-port bypasses in tests; reconcile app:// handling with main/app/window.ts.
- [x] Terminal search: map normalized search offsets to actual terminal cells in
  src/renderer/lib/pty/terminal-search.ts. Cover wide characters,
  Unicode lowercase expansion, combining characters, and wrapped lines.
- [ ] Task filtering: determine whether selections hidden by search should remain actionable;
  cover the agreed behavior with a regression before changing it.
- [x] Renderer agent docs: reconcile absent views/components/contexts/core registries with
  actual features/app/lib paths. Verify each documented source path exists.
- [ ] Real Electron golden/long journey: establish isolated app data and real backend state,
  then record a durable multi-surface case. Current browser tests exercise terminal DOM
  dimensions, not a full Electron journey. No visual/a11y/runtime pass inferred from units.
- [ ] Navigation redirects: verify will-redirect behavior against a real local renderer
  server that redirects off-origin. Extend the navigation policy if the destination can
  escape the renderer; retain same-origin redirects and record actual Electron evidence.

- [ ] Renderer conventions: reconcile stale core/modal, core/view and core/pty paths in
  agents/conventions/renderer-patterns.md with the verified renderer map.
- [ ] Terminal search accessibility: announce result counts to assistive technology;
  verify actual terminal selection in an isolated real Electron Unicode journey.
