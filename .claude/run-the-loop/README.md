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
