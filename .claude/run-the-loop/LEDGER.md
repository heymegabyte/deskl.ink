# Iteration ledger

## 2026-10-08 — heymegabyte--deskl.ink-37719100903-1

- Verified commit: `40590393aab619ff1a4f6795f6def77bf5cd1f0a`. Active/Archived tab transitions now clear selected
  task IDs and the range anchor; setting the same tab preserves selection. Regression
  observed RED (two failures), then GREEN (four passing selection tests).
- Repaired the existing WorktreeHost test mock's missing pathApi; metadata assertions retained.
- Loop improvement: added orientation/backlog and corrected five-project testing guidance.
- Fresh checks: format, lint, typecheck, build, diff whitespace check passed. Full suite:
  157 files and 1,067 tests passed; touched suites: 15 tests passed.
- Runtime: Playwright Chromium 1208 installed using Ubuntu 24.04 download target after the
  installer rejected Ubuntu 26.04. Browser tests passed; no real Electron long journey,
  six-breakpoint visual review, assistive-technology review or production deployment performed.
- Publication: pending outer runner; no push/deploy performed. Main inspected at b3039e0a.
- Review: all fallback roles covered by three grouped read-only reviewers; independent
  adversarial review found no blocking issue. Next frontier is in BACKLOG.md.

## 2026-10-08 — heymegabyte--deskl.ink-37756798431-1

- Recovery: origin/main contains 40590393 and 93546364. The previous GitHub run failed
  its summary/structured-record step despite publication; inspected actual ancestry rather
  than repeating the task selection fix. Only this isolated worktree remains for the project.
- External navigation: replaced development prefix trust with parsed HTTP(S) origin checks;
  production trusts APP_ORIGIN protocol/host rather than arbitrary localhost/file URLs.
  Unsupported/malformed destinations are denied; browser launch rejections are logged.
- Regression: seven initial failures confirmed prefix bypass, valid-path rejection and
  production localhost trust. Final coverage: 27 navigation tests; full suite 158 files,
  1,094 tests passing. Fresh format, lint, typecheck, build and diff checks passed.
- Loop improvement: documented dual-handler checks, custom-scheme null origins and real
  Electron appData/config isolation. Added redirect runtime verification to the frontier.
- Three grouped read-only reviewers covered the fallback roles. Independent adversarial
  review found no blocking regression; its test attempt hit missing Volta pnpm, while root
  ran the pinned corepack pnpm suite successfully. Same inherited model used; no model override.
- No real Electron long journey, six-breakpoint visual/accessibility review or deployment
  performed. Browser project passes only its existing terminal DOM tests. Production bundle
  size/outDir warnings remain. DeepSeek environment key absent; no API fallback used.
- Publication of this iteration is delegated to the outer runner; this record is not proof
  that the new commit reached main. Commit identity is recorded in the run agent-report.json.

## 2026-10-08 — Unicode terminal search cells

Run: heymegabyte--deskl.ink-37811159866-1. Base f9c33b50 already on origin/main;
prior failed Actions receipts retained published fixes, with no worktree to recover.
Grouped reviews covered product, testing, UX/a11y, architecture, compression/hygiene,
performance/security, documentation and loop improvement. No current stack claims made.

Fixed UTF-16/cell coordinate confusion using public xterm cell widths, mapped normalized
match endpoints, viewport columns across wraps and deduplication within combining cells.
Six Unicode regressions failed before implementation; adversarial review reproduced one
duplicate-result regression before repair. All 14 focused tests pass, including Greek
contextual lowercase, hard breaks and resize clipping. Corrected renderer map paths and
added durable Unicode acceptance guidance for subsequent loops.

Fresh format, lint, typecheck, 158 files / 1105 tests, production build and diff check passed.
Commit is the containing fix(terminal) commit; publication delegated to outer runner.
No deployment or real Electron golden/long journey, six-breakpoint visual or axe proof.
Next: real Electron Unicode selection, navigation redirects, hidden task filtering and
remaining renderer convention paths. Build bundle/outDir warnings remain.


## 2026-10-08 — heymegabyte--deskl.ink-37847372525-1

One bounded fallback iteration: remote main contains all prior task-tab, navigation and
Unicode search fixes despite failed Actions summary finalizers; no retained worktree recovery
needed. Grouped role source reviews identified search-hidden bulk-action targets. Four new
regressions failed before the fix; changed effective search now clears selection and anchor
on both tabs, preserving equivalent queries and raw input. Adversarial review passed 12/12
focused tests. Renderer conventions now describe actual modal/navigation/PTY ownership;
all 18 explicit source paths exist. Loop improvement: durable search-selection acceptance,
confirmation snapshot guidance, and deduplicated actionable backlog findings.

Fresh corepack pnpm format, lint, typecheck, test (158 files / 1113 tests), production build
and diff check passed. Commit is the containing fix(tasks) commit; publication is delegated
to the outer runner. Deployment was not performed. Real Electron golden/long journeys,
visual breakpoints and accessibility runtime gates remain unexecuted; source audits do not
satisfy them. Existing bundle/outDir warnings remain. Next frontier: confirmed deletion ID
snapshot, search-specific empty state, bulk-operation feedback, task-list accessibility,
and isolated Electron journey including navigation redirects and Unicode selection.
