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

## 2026-10-10 — backend deletion inspection failure

- Reproduced three fail-open cases: Git status failure, rejected worktree lookup and unavailable
  project; all returned successful preflight before the fix.
- Propagate inspection failure to the modal's existing retry/error path. Preserve inspected
  clean/dirty status and absent/shared-worktree behavior; ten focused regressions pass.
- Fresh format, format:check, lint, typecheck, full tests (163 files, 1180 tests), build and
  diff whitespace checks passed. Read-only adversarial review found no introduced blocker.
- Review exposed existing swallowed fallback lookup errors and shared-branch bulk inspection
  gaps; recorded those and disposed-store rollback integrity in the backlog.
- Loop improvement: document backend preflight regression requirements; correct native package
  name in quickstart. Native Electron golden/long journey remains incomplete because neither
  Xvfb nor Weston is available. Chromium component tests do not establish native behavior.
- This entry's containing commit is the result; outer runner owns publication. No deployment
  or publication claimed. Fresh logs and the non-secret report are in the run directory.

## 2026-10-10 — bulk deletion rejection feedback

One bounded native-app iteration: bulk confirmation consumes deletion rejection, shows
retry feedback, and restores only registered confirmed IDs while preserving newer user
selection. Real ProjectViewStore coverage catches MobX Set wrapping; modal-time selection,
pending selection, select/deselect intent, success and missing rollback records are covered.
Loop improvement: README documents stored-Set identity and separate native rollback gates.
Read-only adversarial review found the initial raw-Set comparison and verified its correction.

Validation: focused 41 tests passed; full suite 163 files / 1188 tests passed after installing
Chromium with Playwright's Ubuntu 24.04 fallback. Production bundle built. Native journey
was not run: no private compositor (Xvfb/weston/cage), and Electron version probe aborts
on SUID sandbox helper configuration. No screen-reader, visual or native rollback acceptance
is claimed. Outer runner owns publication; no deployment URL exists for this iteration.
Next: individual deletion feedback, disposed-store rollback integrity and shared-branch
bulk-preflight safety remain open. Commit containing this entry is the slice reference.

## 2026-10-11 — individual deletion rejection feedback

One bounded native-app iteration: task-row and sidebar confirmation callbacks consume
deletion failures and show action-specific retry feedback. Confirmed task IDs and cleanup
options remain covered; deferred regressions protect immediate sidebar navigation and
feedback timing. Regression failed before fixes; focused 3-file suite passed 65 tests.
Independent discovery and adversarial review found no blocking introduced regression.
Loop improvement: README records individual deletion callback gates; architecture overview
now points to the actual renderer IPC client. No failed receipts or retained worktrees
needed recovery; base commit is present in origin/main.

Native golden/long journey remains incomplete: no private Xvfb/Weston/Cage compositor
is available. Callback and Chromium tests do not establish toast announcement, native
disposed-store rollback or partial backend deletion safety. Those remain backlog items.
Final full suite passed 164 files / 1206 tests. Other final gate evidence and resulting
commit belong to the non-secret run report and outer
runner receipt. Outer runner owns publication; no native release deployment is claimed.

## 2026-10-11 — pending bulk archive/restore guard

One bounded native-app iteration: shared TaskViewStore pending state prevents additional
bulk archive/restore and delete requests during archive/restore. Disabled controls and the
delete shortcut reflect pending state; finally releases the guard after every request
settles. Two new regressions failed before the fix; final focused suite passed 45 tests,
including rejected operations followed by retry. Independent adversarial review found no
blocking regression and identified deletion-led overlap as separate unfinished work.
Loop improvement: README records shared-state, deferred-request and rejection/retry gates;
backlog separates completed guard coverage from native concurrency acceptance.

Origin main was observed at the base commit; no retained worktrees or failed receipts
needed recovery. Native journey remains blocked by missing private compositor and an
Electron sandbox-helper startup failure. No native keyboard, toast, visual or rollback
acceptance is claimed. Full suite passed 164 files / 1210 tests; format, lint, typecheck and production build
passed. Lint reported two preexisting promise-handler warnings in unchanged files.
Final validation and commit evidence belong to agent-report.json;
outer runner owns publication. Commit containing this entry is the slice reference.

## 2026-10-11 — deletion-led bulk concurrency

Confirmed deletion now acquires the shared project task-view mutation guard at confirmation
and releases it in finally. Deferred regression tests reproduced both success/failure paths
with the guard absent before implementation. They cover blocked archive/restore/delete,
duplicate callback, newer selection and retry; an additional regression checks that a stale
modal cannot clear selection or release a guard held by another operation.

Independent read-only adversarial review found no blocking regression. Loop improvement:
README records confirmation-time guard ownership and cancellation/race coverage requirements.
Native Electron journey remains incomplete: no private compositor executable found.
Publication belongs to the outer runner; this entry is not evidence of publication.

Fresh gates: format, lint (two existing warnings), typecheck, full pnpm test with
--maxWorkers=2 (164 files / 1213 tests), and Electron bundle build passed. The initial
parallel validation was terminated under host swap pressure; the bounded rerun passed.

## 2026-10-24 — heymegabyte--deskl.ink-40145707114-1

- Recovery: origin/main remains 4100a2c7. Four recent retained failed worktrees are
  clean at that commit; their receipts report no completed changes to salvage.
- Fixed shared GitHub rate limiter: concurrent waiters recheck availability after
  waking instead of all consuming one refill. Regression first reproduced three
  completions at 100ms, then passed with completions at 100/200/300ms. Idle burst
  capacity remains covered. Commit: this entry's containing commit.
- Fresh checks: format, lint (two existing async callback warnings), typecheck,
  full tests (165 files / 1,215 tests), build and whitespace check passed.
  Vitest emitted a dependency-optimization reload warning; no test failures.
- Loop improvement: corrected AGENTS modal/view registry paths and documented
  concurrent refill assertions in loop orientation. Backlog updated.
- Grouped read-only reviews covered fallback roles; independent adversarial review
  found no blocking regression. No additional compute provider was invoked.
- No native Electron golden/long journey, screen-reader or visual verification ran;
  those backlog gates remain open. No deployment or push; publication belongs to
  the outer runner. Next frontier: isolated real Electron journey and task-list
  accessibility/interaction checks. Rate-limiter FIFO/clock behavior is unchanged.

## 2026-10-25 — heymegabyte--deskl.ink-40163256463-1

- Recovery: remote main verified with git ls-remote at f3c13945, matching origin/main
  and this run's base. The four recent retained failed worktrees are clean at
  4100a2c7; inspected failed receipt reports no completed changes to salvage.
- Fixed GitHub limiter elapsed-time accounting with performance.now(). Regression
  first reproduced a backward-clock stall and forward-clock premature refill;
  both pass after the fix, along with concurrent-waiter and idle-capacity coverage.
  Commit: this entry's containing commit.
- Fresh checks: corepack pnpm install --frozen-lockfile, format, lint, typecheck,
  full tests (165 files / 1,217 tests), Electron bundle build and diff check passed.
  pnpm's Volta shim is unavailable; documented corepack fallback used. Lint emitted
  two existing async-callback warnings; Vitest emitted a dependency reload warning.
- Loop improvement: documented deterministic monotonic-clock regression setup and
  updated the backlog. Independent read-only review accepted timing math and tests.
  This bounded slice grouped architecture/performance/security/testing review;
  the full generic role roster and native golden/long journey were not executed.
- No deployment, native GUI, screen-reader or visual verification. Publication is
  owned by the outer runner. Native Electron journey, task-row interaction and
  task-list accessibility frontiers remain open; FIFO fairness remains unchanged.


## 2026-10-25 — heymegabyte--deskl.ink-40181801561-1

- Recovery: remote main verified at 2656295f, containing both prior rate-limiter
  commits. GitHub marks recent workflow runs failed while local receipts report
  success; publication was checked independently. The four recent retained failed
  worktrees are clean at 4100a2c7 with no changes to recover.
- Fixed retry backoff abort-listener retention in src/main/lib/retry.ts. Regression
  first failed because a completed wait retained its listener, then passed after
  cleanup. Repeated retries share a signal and preserve unrelated listeners;
  cancellation clears the timer, rejects with the original error and never retries.
  Commit: this entry's containing commit.
- Fresh checks: corepack pnpm install --frozen-lockfile, format, lint, typecheck,
  full tests (166 files / 1,219 tests), Electron bundle build and diff check passed.
  Lint reports two existing async-callback warnings; Vitest reports a dependency
  optimization/reload warning. Used the documented pinned Corepack invocation.
- Loop improvement: documented shared-signal listener lifecycle checks in loop
  orientation and recorded cancellation-boundary follow-up in the backlog.
  Independent read-only discovery and adversarial review found no changed-code
  defect. The full generic role roster and native long journey were not executed.
- No deployment, native GUI, screen-reader or visual verification; outer runner
  owns publication. Next unmet frontiers include native Electron journeys,
  task-list accessibility/interaction and retry cancellation between attempts.

## 2026-10-25 — Retry cancellation boundaries

- Fixed pre-aborted invocation and the resolved-backoff/continuation race in
  src/main/lib/retry.ts. Pre-attempt cancellation uses signal.reason; cancellation
  after a failed attempt preserves that error, including undefined. In-flight
  successful operations still return their result. Commit: this entry's containing commit.
- TDD: five new cases failed before implementation; focused suite then passed all
  nine cases. Full tests passed 166 files / 1,226 tests. Formatting, lint and typecheck
  passed, as did the Electron bundle build; lint retains two existing async-callback
  warnings. Vitest emitted its
  dependency optimization/reload warning without failures.
- Loop improvement: added deterministic timer/continuation cancellation guidance,
  marked the verified frontier complete and recorded PR refresh cancellation follow-up.
  Grouped read-only review covered cancellation contracts and evidence limitations;
  adversarial review found no blocker. The full generic roster was not executed.
- Verified remote main contains d321c734; inspected four recent retained worktrees
  (all clean at 4100a2c7). Recent Actions failures include canonical-record upload
  failure despite product commit publication; no workflow edits made in this slice.
- No native golden/long journey, visual, screen-reader or GUI accessibility check;
  those backlog gates remain open. No push/release; outer runner owns publication.


## 2026-10-25 — Retry initial delay cap

- Reproduced the documented maximum delay being ignored on the first retry when
  initialDelayMs exceeds maxDelayMs; regression failed with one attempt at 100 ms.
- Clamp initial backoff to the maximum; verified exact attempt times at 0, 100,
  200 and 300 ms, successful completion and no pending timer. Independent read-only
  discovery and adversarial review found no remaining issue in this change.
- Format, lint, typecheck and full suite passed (166 files / 1227 tests); lint retains
  two existing async-callback warnings. Build result recorded in run report.
- Loop improvement: added first-delay boundary guidance and completed backlog entry.
  Used grouped review rather than executing the full generic role roster.
- Remote main contains 388abf36. Four recent retained failed worktrees are clean;
  latest Actions failure is canonical run-record upload, separate from product publication.
- No native Electron journey, visual or screen-reader verification; no release or push.
  Outer runner owns publication. PR refresh cancellation remains open.

## 2026-10-26 — documentation validation and retained-work recovery

Bounded documentation iteration: corrected agent-guide validation for this checkout's
absent docs app and documented `git -C` retained-work comparison. Reproduced
`corepack pnpm run docs:build` failing at `cd docs` (exit 2); no docs-app or native
journey success claimed. Read-only adversarial review independently confirmed the
missing prerequisite and that retained renderer files were superseded by 96adb338.
GitHub receipts and actual ancestry were inspected; publication belongs to the outer
runner. Full standing-role fan-out and golden/long journeys were not performed in this
bounded documentation pass. Fresh gate results belong to the correlated agent-report.json.

Fresh verification: format, format:check, lint and typecheck passed (typecheck retry;
initial process exited 1 without diagnostics). Full tests: 167 files / 1,234 tests
passed using worktree-local Chromium with PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64;
the default install rejects Ubuntu 26.04. Initial tests passed 1,209 non-browser tests
but could not launch missing Chromium. Vite reported dependency re-optimization on the
successful run; lint retained two existing no-misused-promises warnings. Added browser
prerequisites and the Markdown formatter exclusion to the validation guide. No product
code changed and no Electron journey or deployment was performed.

## 2026-10-26 — Single PR refresh cancellation

Run `heymegabyte--deskl.ink-40315267343-1` advanced the PR refresh frontier. Repository
cancellation now reaches single-refresh controllers, remains scoped to the exact repository,
and is checked after authentication, token acquisition and the network response. Retry and
GraphQL receive the same signal; cancelled setup/request failures resolve quietly with no PR.
Controllers retain the deduplication lifetime and are released on settlement. Nine deferred
regressions cover cancellation boundaries, late success/rejection, backoff, duplicates,
controller cleanup and independent repositories. The initial five regressions failed before
the implementation; independent read-only review found no scoped correctness defect.

Validation: format, format:check, lint, typecheck and production build passed. Full tests passed
168 files / 1,243 tests with worktree-local Chromium after its installation completed. The
first full attempt passed 1,218 tests but could not launch the not-yet-downloaded browser;
the rerun passed all projects. Two existing renderer lint warnings and a Vite dependency
re-optimization warning remain. Fresh command evidence is in the correlated agent report.

Loop improvement: document the public-cancellation deferred test matrix and separate queued
rate-limit cancellation and in-progress database writes into explicit follow-up slices.
Origin/main contains the previous reported success commits; retained failed renderer files
were compared and left intact because 96adb338 supersedes them. One bounded native slice
and focused review were performed; the full generic standing-role fan-out and live
Electron/GitHub journeys were not performed. No deployment or push: publication belongs
to the outer runner.

## 2026-10-26 — Recover cancellable rate-limit acquisition

Recovered the uncommitted cancellation slice from failed run 40408381089 after
checking main ancestry and retained diffs; older renderer work remains untouched.
The recovered regression tests failed on main (4 failures), then all 17 focused
tests passed with optional AbortSignal acquisition and single-refresh forwarding.
Read-only adversarial review found no token/listener defect. Full-suite attempt
passed 1,222 non-browser tests but could not launch missing Chromium 1208.
Formatting passed; lint reported two warnings in unchanged renderer files.
Final typecheck/browser outcomes are recorded in the run report. No native
Electron journey, live GitHub acceptance, deployment or publication is claimed.
Loop improvement: acquisition cancellation checklist now covers abort reasons,
timer/listener cleanup, survivor tokens and post-timer cancellation. One bounded
slice and focused review ran; the full generic role roster did not run.
Next frontier: bulk/check-run cancellation and database-upsert boundaries.

## 2026-10-27 — Finish retained cancellation verification

Recovered d0ef8b41 as fc0d20dc after inspecting retained worktrees, failed GitHub
Actions receipts and origin/main ancestry. Preserved every retained worktree.
Independent read-only review found no blocking defect in optional AbortSignal
acquisition or single-refresh forwarding; bulk/incremental sync waits remain the
next product frontier.

Fresh verification: format and lint passed (two existing renderer warnings),
typecheck passed with NODE_OPTIONS=--max-old-space-size=6144, and all 27 focused
rate-limiter/retry/cancellation tests passed. The initial concurrent full-suite
attempt hit two SSH timeouts and was interrupted. The complete one-worker rerun
passed all 168 files / 1,247 tests, including browser and database projects.
Chromium 1208 launched; Vite emitted a dependency-optimization reload warning.

Loop improvement: agents/workflows/testing.md now documents sequential shared-runner
gates, bounded-worker retries and honest reporting of interrupted/heap-limited runs.
No live Electron/GitHub journey, deployment or publication is claimed. The outer
runner owns publication; the full generic role roster was not performed.

## 2026-10-27 — bulk sync replacement ownership

Run: `heymegabyte--deskl.ink-40506359551-1`, base `cea79acb`.
Cancelled bulk sync finally cleanup used repository keys without checking ownership,
so a late completion removed a replacement sync's controller and deduplication entry.
Cleanup now requires controller identity. Two public sync/cancel regressions failed
before implementation and pass afterward; 32 focused tests pass. Independent read-only
adversarial review found no blocking defects. Retained failed work is already recovered.

Fresh gates: `corepack pnpm run format`, `corepack pnpm run format:check`,
`corepack pnpm run lint`, `NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm run typecheck`,
and `corepack pnpm test --maxWorkers=1` pass (168 files, 1249 tests). Lint retains two
existing renderer warnings; Vite reported a dependency optimization reload during browser
tests. Loop improvement: README now describes replacement-ownership regression boundaries;
backlog separates completed ownership from outstanding bulk/check-run request and DB cancellation.

No live Electron/GitHub journey, full generic role roster or desktop release performed.
This bounded native iteration used one read-only recovery/review agent. Publication belongs
to the outer runner; local verification is not publication evidence.

## 2026-10-28 — recover bulk queued cancellation

Run: `heymegabyte--deskl.ink-40617141370-1`, base `131d2c00`.
Recovered the reviewed uncommitted patch from failed run `40595651264-1`;
`40559496202-1` retained the same affected paths. Full and incremental bulk syncs
now forward their signal to token acquisition and check cancellation again before
GraphQL starts. Six new regressions failed against the base (12 existing passed);
after recovery all 39 focused tests passed. Two independent read-only reviews
found no blocking defects. Retained worktrees were preserved. The older retained
`d0ef8b41` rate-limiter source patch matches already-landed `fc0d20dc`.

Fresh gates: `corepack pnpm run format`, `corepack pnpm run lint`,
`NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm run typecheck`, and
`corepack pnpm test --maxWorkers=1` passed (168 files, 1255 tests, 314.55 seconds).
Lint retains two existing renderer promise warnings; Vite reported an optimization
reload during browser tests. Loop improvement: README records full/incremental,
waiting/resolved token boundaries; backlog separates queued cancellation from
late responses, persistence, retry-backoff reporting and check-run ownership.

No live Electron/GitHub journey, full generic role roster or desktop release was
performed. This bounded recovery iteration used two read-only reviewers. The outer
runner owns publication; passing local tests and a commit do not establish publication.

## 2026-10-28 — verified recovery of bulk retry cancellation

Run `heymegabyte--deskl.ink-40793122851-1`, base `e9acf6f0`: recovered
unpublished `274fdb91` after inspecting actual retained commits/files, failed
receipts, GitHub history and origin/main ancestry. Retained worktrees unchanged.
Full/incremental sync catches inspect the aborted signal because retry deliberately
preserves the last API failure. Fresh RED: 2 failed, 20 passed before the fix;
fresh focused GREEN: 4 files, 42 tests passed, including genuine API failure controls.

Fresh format and lint passed (two existing renderer promise warnings).
`NODE_OPTIONS=--max-old-space-size=6144 corepack pnpm run typecheck` passed.
`corepack pnpm test --maxWorkers=1` passed: 168 files, 1259 tests, 174.84 seconds.
Vite warned about dependency optimization reloading a browser test; suite exited 0.
One independent read-only adversarial reviewer found no blocker. Loop improvement:
require refreshing final report results after verification retries, preserving initial
failure evidence rather than publishing stale pending/failed status.

No native Electron/live GitHub, visual/a11y or long desktop journey ran; a full generic
role roster was not executed in this bounded recovery. Late-response, persistence and
check-run cancellation remain open. No desktop release/deployment performed. The outer
runner owns publication; local verification and commits do not establish main publication.

## 2026-10-29 — recover unpublished check-run cancellation (40938629797-1)

Recovered the source and regression file from retained commit `302d4d4f` after
verifying it is absent from local main ancestry. Retained worktrees were preserved.
The earlier run's final gate logs completed, but its stale agent report and interrupted
runtime did not establish publication. Two bounded GitHub API retries timed out; the initial Actions list eventually
completed and confirmed the two prior failures. Local receipts, actual source comparisons
and ancestry supplied recovery evidence.

Fresh reproduction: 10 failing / 1 passing check-run tests before source recovery.
After recovery: 53 focused tests passed, and the complete serialized suite passed
169 files / 1,270 tests, including Chromium. Formatting passed; lint completed with
two existing promise-handler warnings in untouched renderer files. The default
TypeScript heap was exhausted; retry with the documented 6-GiB heap passed.
Build passed with the same larger heap after default-heap exhaustion.
Final evidence is recorded in this run's agent-report.json. Read-only adversarial review found no blocking recovery regression.

Loop improvement: added retained-report/final-log reconciliation guidance and explicit
stale-SHA cancellation risk to the persistence backlog. Check replacement is still
nontransactional; distinct head SHAs can race, and preliminary stale-row deletion can
leave checks empty on cancellation. No atomicity or native GitHub/Electron acceptance
is claimed. Xvfb/weston were unavailable on PATH. Publication belongs to the outer
runner; no deployment or push was performed in this worktree.
