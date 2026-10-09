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
