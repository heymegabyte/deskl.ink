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


## 2026-10-08 — heymegabyte--deskl.ink-37869335622-1

One bounded fallback iteration with grouped product/security, testing/UX, and hygiene/docs
reviews followed by independent adversarial review. Verified all prior fixes are ancestors
of current main despite failed Actions structured-record finalizers; no retained recovery
needed. Three deletion regressions failed before implementation. Bulk deletion now snapshots
IDs from the exact confirmed task payload instead of rereading mutable selection. Five
callback tests cover replacement/clearing, missing records, missing-only selection, and no
deletion before confirmation; options are preserved. Test fixtures use real registration states.

Loop improvement: document confirmed-payload identity and missing-record acceptance; tick
the deletion frontier and record separate preflight-error and registration-transition defects.
Fresh corepack pnpm format, lint, typecheck, full suite (159 files / 1118 tests), production
build, and diff check passed. Commit is the containing fix(tasks) commit. Publication is
delegated to the outer runner; no deployment performed. No real Electron golden/long
journey, breakpoint visual or accessibility runtime proof. Build bundle/outDir warnings
remain. DeepSeek credentials unavailable from environment/broker; no paid API fallback used.
Next frontier: search-specific empty state, bulk operation feedback, preflight-error handling,
registration guard, task-list accessibility, and isolated Electron runtime journeys.


## 2026-10-09 — heymegabyte--deskl.ink-37900308892-1

One bounded fallback iteration with grouped product/security, testing/UX/accessibility,
and architecture/docs/hygiene reviews and an independent adversarial review. Remote main
contains the preceding fixes despite earlier Actions summary-finalizer failures; the worktree
list contains no retained failed workspace requiring recovery. Three registration regressions
failed before the fix. Bulk deletion and task-list filtering now use the existing isRegistered
guard; unregistered creation/error stores never enter the confirmed payload. Twelve focused
tests cover mixed/all-ineligible selections, both registration transition directions before
requesting confirmation, provisioned eligibility, and confirmed-ID/option preservation.

Loop improvement: durable state-guard and transition acceptance guidance in README; tick
the registration frontier without duplicating existing backlog items. Next bounded slice:
visible retry/error handling for failed deletion preflight. Real Electron golden/long journeys,
visual and accessibility runtime gates remain unexecuted; mocked callbacks do not prove them.
Publication is delegated to the outer runner; no deployment performed. DeepSeek credentials
unavailable from environment/broker; no paid API fallback used.

Fresh corepack pnpm format, lint, typecheck, full test suite (159 files / 1125 tests),
production build, and diff check passed. The commit is the containing fix(tasks) commit.
Existing production bundle-size/outDir warnings remain; no deployment or publication claim.

## 2026-10-09 — heymegabyte--deskl.ink-37945879634-1

One bounded fallback iteration: grouped feature/testing/architecture/hygiene/performance,
journey/UX/accessibility/security, and docs/discovery/loop-improvement reviews, followed by
independent adversarial review. Remote main contains the prior failed-run fixes; only this
run and the canonical checkout remain as worktrees, so no retained recovery was duplicated.

Three search-empty regressions failed before implementation. Both active and archived
no-match searches now show “No matching tasks” with Clear search; empty active lists without
an effective query retain creation onboarding. Seventeen focused tests cover both tabs,
empty projects, whitespace-only queries, recovery callbacks, filtering and deletion invariants.
Adversarial review strengthened recovery coverage with a second active task.
Loop improvement: durable search-empty acceptance guidance in README; tick existing backlog.

Fresh format, lint, typecheck, full suite (159 files / 1130 tests), production build and diff
check passed; final verification is recorded in this run's agent-report.json. The commit is
this entry's containing fix(tasks) commit. Publication belongs to the outer runner; no deploy
or push performed. Real Electron golden/long journeys, visual breakpoint and accessibility
runtime gates remain unverified: no private display compositor was found, and owner display
was left untouched. Existing build bundle-size/outDir warnings remain. DeepSeek credential
unavailable through broker; no paid API fallback used. Router usage observations are stale.
Next frontier: deletion preflight error/retry handling, bulk archive/restore feedback,
keyboard-visible task selectors and named checkboxes, isolated real Electron journeys.


## 2026-10-09 — bulk archive/restore failure feedback

Run: heymegabyte--deskl.ink-37982431167-1. Remote main at 46441bd4 contains the prior
verified fixes; failed Actions runs 37811159866/37847372525 failed in summary finalization,
and their product commits are ancestors of origin/main. No retained recovery required.
One bounded fallback iteration: grouped product/UX/a11y/docs, technical/security/hygiene,
and validation/runtime/loop reviews; primary implementation/convergence, then independent
adversarial review. No project run-the-loop command exists. Role reviews are code reviews,
not evidence of completed runtime, visual, accessibility, or dependency-currency audits.

Task list now filters registered operation IDs, settles every archive/restore request,
reports failed/total counts through the existing toast system, and restores failed IDs for
retry only while the immediately cleared selection remains unchanged and empty. New row,
search and tab selections take precedence. Initial ten regressions reproduced; independent
review exposed two more failures from same-Set row selection, then verified the corrected
31-test focused suite. Immediate clearing retains the prior ordinary duplicate-click behavior.
No new capability or flag required: this repairs existing mutation error handling.

Loop improvement: durable bulk-rejection/mixed-result and deferred-selection acceptance
checks, plus explicit callback/browser/Electron evidence separation. Backlog reconciled;
individual archive handlers and pending-operation/rollback concurrency remain next slices.
Current empty-state heuristic can restore failures if a user selects then deselects back to
empty during the request; no full selection-history guarantee is claimed.

Fresh core format/lint/typecheck and full suite passed (159 files, 1144 tests); build result
and final commit recorded in the non-secret run report. This entry's containing commit is
the verified result. Publication belongs to the outer runner; no push or deploy performed.
Real Electron long journeys, toast rendering/announcements, six-breakpoint visual and runtime
accessibility gates remain unverified: private Xvfb/xvfb-run/weston unavailable. DeepSeek
credential check failed; no paid fallback used. Router usage is stale, not live headroom.

## 2026-10-09 — pending bulk retry respects selection history

Reproduced archive and restore failures that reselected tasks after the user selected and
then deselected another row while pending. Three new regressions failed before the fix.
Row toggles now replace the selection Set, preserving the range anchor and captured Sets.
Real-store callback regressions cover both active archive and archived restore.

Fresh core format/lint/typecheck passed; full suite passed (159 files, 1147 tests), final
focused tests passed (46 tests), and Electron build passed with outDir/large-bundle warnings.
Grouped source/adversarial reviews found no blocking regression; real Electron golden/long
journeys and visual/accessibility runtime proof remain unverified (xvfb-run unavailable).
Loop improvement: document identity/history invariants and real-store deferred regression
acceptance. Added nested task-row controls/keyboard coverage to the next frontier.
This entry's containing commit is the result; outer runner owns publication, no push/deploy.

## 2026-10-10 — terminal search result announcements

Chromium regressions reproduced the missing live region (two failed assertions before
the fix). The open search overlay now keeps a polite, atomic status region mounted,
announcing match position/count and no matches. Clearing the query clears its text; closing
removes the overlay. The visual numeric counter is hidden from assistive technology to
avoid duplicate output. Three browser component regressions passed after the fix.

Fresh format, lint and typecheck passed; the full suite passed (160 files, 1150 tests).
Electron main/preload/renderer build passed with outDir and large-bundle warnings.
No real Electron, Unicode selection or screen-reader speech claim: xvfb-run is unavailable.
Loop improvement: add the focused browser regression path and announcement acceptance
to orientation; split verified DOM semantics from pending runtime accessibility in backlog.
This entry's containing commit is the result; outer runner owns publication.

## 2026-10-10 — individual task failures and portable project names

Task-row archive/restore and sidebar archive now consume rejected manager promises and
show action-specific retry feedback. Existing rollback and sidebar navigation behavior
are preserved. Callback regressions reproduced three failures before the fix, then passed
all six cases without rejection suppressors. Windows reserved device basenames with
extensions now fall back; trailing dots/spaces are removed while ordinary names remain.
Shared-helper regressions reproduced six failures, then passed all 18 cases.

Fresh format, lint and typecheck passed; the full suite passed (161 files, 1167 tests).
Adversarial review passed both focused files (24 tests) and found no introduced regression.
The build result is recorded in the run report. One overlapping build was stopped during
observed cgroup memory throttling, then retried alone. No OOM kill was observed.
No native Electron or screen-reader journey ran: xvfb-run and Weston are unavailable.
The backlog retains native toast/rollback acceptance separately from callback evidence.
Loop improvement: document isolated native journey setup and focused failure/path tests.
This entry's containing commit is the result; outer runner owns publication.

## 2026-10-10 — deletion preflight failure

- Reproduced missing error feedback in a failing Chromium component regression.
- Fail closed after preflight rejection; expose retry, retain Cancel, and guard confirmation.
- Ignore responses from disposed effects; document preflight-specific future-loop checks.
- Native journey remains unverified: no private display/compositor available.
- Publication belongs to the outer runner; commit and final check evidence are in its receipt.
