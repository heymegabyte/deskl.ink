# Next verified frontier

- [ ] External navigation: replace renderer URL prefix trust in
  src/main/utils/externalLinks.ts with parsed origin checks. Reproduce credentials-in-URL
  and wrong-port bypasses in tests; reconcile app:// handling with main/app/window.ts.
- [ ] Terminal search: map normalized search offsets to actual terminal cells in
  src/renderer/lib/pty/terminal-search.ts. Cover wide characters,
  Unicode lowercase expansion, combining characters, and wrapped lines.
- [ ] Task filtering: determine whether selections hidden by search should remain actionable;
  cover the agreed behavior with a regression before changing it.
- [ ] Renderer agent docs: reconcile absent views/components/contexts/core registries with
  actual features/app/lib paths. Verify each documented source path exists.
- [ ] Real Electron golden/long journey: establish isolated app data and real backend state,
  then record a durable multi-surface case. Current browser tests exercise terminal DOM
  dimensions, not a full Electron journey. No visual/a11y/runtime pass inferred from units.
