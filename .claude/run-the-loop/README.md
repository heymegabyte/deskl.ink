# Loop orientation

Read this file and BACKLOG.md before choosing one bounded iteration. GitHub Actions is the
run ledger; git/files record retained work. Inspect actual main ancestry, failed receipts,
and retained worktrees before repeating a reported fix. The outer fleet runner publishes
commits; do not push from an isolated run.

Use agents/workflows/testing.md for the real validation commands. Record fresh results and
external/runtime blockers in the run's non-secret agent-report.json. A passing unit suite
is not proof of a real Electron journey or a published build. Keep fixtures opt-in.

For task selection changes, cover both Active → Archived and Archived → Active, same-tab
selection preservation, and range-anchor reset. For typed WorktreeHost mocks, supply the
host path API as well as filesystem methods.

For external-navigation changes, exercise both setWindowOpenHandler and will-navigate.
Use the actual development renderer origin and production APP_ORIGIN. Cover paths/query/hash,
credentials, deceptive hosts, wrong ports, malformed URLs, unsupported schemes, and browser
launch failure. Custom app:// URLs have a null WHATWG origin: compare protocol and host.
Assert popup decisions, navigation prevention, and browser-open calls independently.
Production localhost HTTP links are external; the renderer uses app://. Unit handlers do
not prove a real Electron journey. Isolate appData/config as well as EMDASH_DB_FILE before
launching Electron tests; --user-data-dir alone does not override the app's userData setup.

For terminal search changes, use xterm getCell/getChars/getWidth to map text to cells.
Cover CJK, surrogate pairs, combining marks, lowercase expansion, contextual Greek sigma,
wrapped and hard lines, retained line capacity after resize, and duplicate matches inside
one cell. Pass actual terminal.cols when selecting across wraps. Text-only ASCII mocks
cannot prove Unicode cell behavior; real Electron selection remains a separate gate.
The verified renderer source map is agents/architecture/renderer.md; older conventions
may still name retired core paths. Verify referenced files before copying their patterns.

For terminal search announcements, run the browser component regression in
src/renderer/tests/browser/terminal-search-overlay.test.tsx. Keep the live region mounted
while the overlay is open; cover result changes, stepping, no results, clearing and closing.
DOM semantics in Chromium do not prove screen-reader speech or real Electron selection.

For task search changes, align query comparisons with TaskList's trim/lowercase filter.
Test active and archived selections, clearing search, equivalent queries, and fresh range
anchors. Changing the effective filter clears selection; raw text still updates for case
and whitespace edits. Inspect confirmation callbacks separately: a modal must operate on
its confirmed IDs, not a mutable selection reread. Zero matches is distinct from no tasks.

For destructive confirmation changes, derive operation IDs from the exact modal task payload,
after resolving selected records. Snapshotting raw selection alone can include IDs never shown
in the confirmation. Cover replacement/clearing of selection while open, missing task records,
and cancellation; assert the destructive options as well as IDs sent to the manager.

For task registration changes, use the existing isRegistered guard rather than a truthy-store
cast. Cover mixed and exclusively unregistered selections, creating/create-error phases,
and state transitions between rendering and requesting confirmation. Keep both provisioned
and unprovisioned registered tasks eligible; assert the exact modal payload and deletion IDs.

For search empty states, cover both tabs, empty projects, whitespace-only queries and
clear-search recovery. A no-match search must not render creation onboarding; keep
onboarding for an empty active tab without an effective query. Component element tests
prove branch/callback behavior only; retain separate real-renderer visual acceptance.

For bulk archive/restore changes, consume every rejected operation and report action-specific
failure counts. Test both actions with all success, all failure, mixed results and deferred
requests; preserve failed IDs for retry without replacing newer selection after a tab/search
or manual selection change. Filter missing/unregistered records at click time. Callback-unit
tests do not establish toast rendering/announcement or real Electron persistence. A private
display/compositor plus isolated XDG_CONFIG_HOME and EMDASH_DB_FILE are required for Electron
journeys; missing runtime prerequisites remain incomplete gates.

For asynchronous selection recovery, preserve selection identity on every user mutation,
including select-then-deselect back to empty. Exercise the real TaskViewStore in deferred
archive and restore callback regressions; a final size check alone cannot track user intent.
Row toggles replace the Set while retaining the range anchor. Test that captured Sets stay
unchanged, so future changes cannot silently restore the stale retry race.

For individual archive/restore changes, run src/renderer/tests/individual-task-archive.test.ts.
Exercise both task-row actions and sidebar archive, success and rejection, without test-side
rejection suppressors. Preserve existing sidebar navigation unless deliberately changing it.
Native toast announcement and manager rollback remain separate Electron acceptance.
For project directory names, cover Windows device basenames with extensions, trailing dots/spaces,
and legitimate near-matches in src/shared/path-name.test.ts.

For delete preflight changes, run the Chromium delete-task-preflight regression. Failure must
show an alert and disable confirmation; retry stays disabled while pending, then recovers
only on successful inspection. Keep cancellation available and discard stale effect responses.
This component test mocks RPC and dialog layout; native worktree inspection remains a separate gate.

For backend delete preflight changes, run operations/getDeletePreflight.test.ts alongside
the Chromium modal regression. Worktree lookup/status failures and unavailable projects
must reject inspection rather than report clean status. Preserve valid missing/shared
worktree behavior. Passing mocked status tests does not prove local or SSH inspection.

For bulk delete rejection, run task-list.test.ts with a real ProjectViewStore as well as
mocked setters. Capture the stored selection after setSelectedIds: MobX wraps raw Sets,
so comparing against the input Set silently defeats recovery. Cover modal-time and pending
selection changes, select-then-deselect, and missing/unregistered rollback records.
Feedback/selection tests do not establish native rollback integrity or partial deletion safety.

For individual deletion feedback, run src/renderer/tests/individual-task-delete.test.ts.
Cover task-row and sidebar confirmation callbacks, success and rejection, and exact
confirmed IDs/worktree/branch options. Await the manager inside a consumed callback;
voiding a rejecting promise leaves an unhandled rejection. Keep cancellation quiet.
Callback tests do not prove native toast announcement or disposed-store rollback safety.

For pending bulk archive/restore, run task-list.test.ts with a real ProjectViewStore.
Reselect tasks and invoke both actions through a freshly rendered list while requests
are deferred; settle one request first and ensure the guard remains active until all
settle. Cover rejection followed by retry and disabled button props. Keep the guard in
shared view state so rerender/remount cannot bypass it. Pending deletion and individual
row operations remain separate concurrency work; component props do not prove native
keyboard behavior or backend rollback ordering.

For deletion-led bulk concurrency, acquire the shared guard inside the confirmed callback,
not when opening the modal (cancellation must leave actions available). Test deferred
fulfillment/rejection, duplicate confirmation, newer selection, retry and a modal whose
confirmation races another pending mutation. Assert a blocked callback neither clears
selection nor releases the other operation's guard. Native row overlap remains separate.

For shared rate-limiter changes, test concurrent callers after exhausting the bucket,
not just sequential waits. Use fake timers to assert one completion per refill and
verify idle accumulation remains capped at burst capacity. The production GitHub
PR sync engine shares this limiter across concurrent requests.

For rate-limiter elapsed-time changes, explicitly fake performance with timers and Date.
Exhaust the bucket, jump system time both backward and forward, and verify acquisition
still waits exactly one monotonic refill interval. Wall-clock timestamps are unsuitable
for token budgets; retain concurrent-waiter and idle-capacity regressions.

For retry backoff changes, run src/main/lib/retry.test.ts with fake timers. Reuse
one AbortSignal across repeated retries and assert completed waits remove only their
own listeners. Verify abort clears the pending timer, preserves the original error,
and prevents another attempt. A once listener still leaks when its event never fires.

For retry cancellation boundaries, test pre-aborted default/custom/null reasons and abort
between a resolved timer and its promise continuation. Advance fake timers synchronously
before aborting to expose that boundary. Preserve the last operation failure even when
it is undefined; a truthy fallback changes rejection semantics. Cancellation must not
start another attempt, but does not undo a successful in-flight operation. Unit results
do not prove PR-sync cancellation in a running Electron app.

For retry delay caps, set initialDelayMs above maxDelayMs and assert the first
retry honors the cap, then verify subsequent retry timestamps. Advancing only
through later exponential delays misses an uncapped initial wait.

For single-PR refresh cancellation, run pr-sync-cancellation.test.ts alongside the
engine and retry tests. Cancel through the public repository API during deferred
authentication, token acquisition, request and retry backoff; also cancel after the
token promise resolves but before its continuation. Verify deduplicated callers,
repository isolation, late response suppression and fresh controller cleanup. Mocked
requests do not establish live GitHub cancellation or cancellation during DB writes.
For cancellable acquisition, test pre-aborted signals and exact abort reasons, timer/listener
cleanup, concurrent waiters without token loss, and abort after timer resolution before
continuation. Forward the refresh signal to acquire; keep the post-acquire guard because
cancellation can still arrive before the API continuation. A mocked abort-aware waiter
must settle without manually granting a token and allow a fresh same-PR refresh.

For task-row semantics, run the Chromium task-row-keyboard regression before and after
changes. Keep checkbox and PR triggers outside the task navigation button; retain a
full-row navigation target for active tasks and no dead target for archived tasks.
Cover Space, Shift+Space, subsequent plain activation, Enter and independent PR controls.
Keep provider/status hover targets pointer-enabled and preserve their navigation behavior.
Class assertions alone do not verify computed focus visibility or pointer hit testing;
retain the real-renderer accessibility gate until those interactions are observed.
When recovering a failed run, copy only reviewed source/tests, rerun every gate and
write agent-report.json before ending; old logs are recovery hints, not fresh proof.

For a styled Chromium spot check after build, import the generated out/renderer/assets/index-*.css
into a temporary copy of the task-row browser test. Assert computed checkbox-wrapper opacity
while focused, elementFromPoint at row padding hitting the navigation button, and metadata
pointer events. Preserve the temporary case with run evidence, not a hash-specific import in git.
Passing this check still does not prove native Electron navigation or a real PR popover.

For bulk sync lifecycle changes, defer authentication in two consecutive public sync calls.
Cancel the first, start its replacement, then settle the first before the replacement.
Assert both replacement deduplication and cancellation survive old finally cleanup.
Cleanup must compare controller identity before deleting shared entries; clearing by key
alone can release another operation's ownership. Keep queued bulk/check-run cancellation
and cancellation during persistence as separate acceptance gates.

For bulk token cancellation, parameterize public sync() regressions for both full and
incremental cursors. Cover pending acquisition, resolved-token-before-continuation,
and an abort-aware waiter that settles without a token grant. Assert no GraphQL starts
and cancelled progress is emitted for prompt release. Passing a signal alone does not
close the continuation race; check it again after acquisition. Keep late response,
persistence and check-run lifecycle acceptance separate.

For bulk sync retry cancellation, assert progress as well as request counts. The retry
helper deliberately preserves the last API failure after abort; callers must inspect the
signal when classifying the outcome. Cover full and incremental modes and retain an
uncancelled failure control so cancellation handling cannot mask genuine API errors.

Before finishing a recovery run, refresh agent-report.json after the final gate settles.
Replace pending/failed entries with the observed retry result while retaining the initial
failure in evidence; a stale report can block publication despite later successful checks.
A recovered commit and prior logs do not substitute for this run's completed checks.

For check-run cancellation recovery, run pr-sync-check-cancellation.test.ts alongside the
engine, cancellation, limiter and retry suites. Defer initial ownership lookup, token waits,
authentication, GraphQL, replacement DELETE and notification lookup independently. Cancel
through the public repository API; retain an uncancelled success/error control. Once check
replacement starts, finish its delete/insert pair before returning cancelled: an abort guard
between those writes silently empties stored checks. Keep notifications suppressed after
cancellation. Deferred mocks prove boundary ordering, not transaction atomicity or native UI.

For retained-commit recovery, read the final gate logs as well as agent-report.json. An
interrupted report may still say running after checks completed. Always rerun gates here;
record GitHub API timeouts separately from local ancestry and retained-file evidence.

For check-run persistence, include real commit.oid values in GraphQL fixtures and verify
identity on every page. A missing PR/commit is not a verified empty rollup. Assert that
cancelled/failed fetches and mid-pagination head changes leave stored checks untouched;
matching empty rollups may clear them and matching pages must replace only after completion.
Keep concurrent valid-SHA ordering, transaction rollback and native acceptance separate.

For check replacement rollback, run pr-sync-check-persistence.db.test.ts under main-db
with the system-Node SQLite build. Reject inserts using a SQLite trigger and compare
the entire previous snapshot after failure, then remove the trigger and retry. Keep
better-sqlite3 transaction callbacks synchronous and execute writes with .run(); an
async callback does not provide atomic replacement. Retain cancellation boundary tests.
