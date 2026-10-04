# deskl.ink E2E — Golden Path

Playwright spec covering the core user flow: spin up a computer, connect via VNC,
visually confirm the Linux desktop loaded, then delete the resource.

## TDD Status

**This spec is intentionally RED until the container backend is deployed.**

Expected failures on a fresh checkout:

- `new-computer-button` not found — dashboard UI not yet built
- `desktop-status` never reaches "ready" — container worker not deployed
- `vnc-viewport` not visible — VNC proxy route not wired

That is correct and expected. Write failing tests first, then implement.

## Running

```bash
# Against production
DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test

# Against local Vite dev server (default)
pnpm -C e2e test

# Headed (watch the browser)
pnpm -C e2e test:headed

# With Playwright UI mode
pnpm -C e2e test:ui
```

## Prerequisites

Playwright browsers must be installed once:

```bash
cd e2e && npx playwright install chromium
```

## Screenshot Artifacts

The spec writes three screenshots to `e2e/screenshots/golden-path/`:

| File             | When captured                      |
| ---------------- | ---------------------------------- |
| `01-ready.png`   | Container reached "ready" status   |
| `02-desktop.png` | VNC viewport visible in fullscreen |
| `03-deleted.png` | Desktop tile removed from the list |

Screenshots are uploaded to R2 as CI artifacts after each prod run.

## Test Structure

The suite is a single serial stateful flow across five subtests:

1. Homepage loads and overlay can be dismissed
2. Create a new computer
3. Container reaches "ready" status (up to 90 s — container cold-start)
4. VNC viewport renders the Linux desktop (best-effort pixel check + screenshot)
5. Exit fullscreen and delete the computer

A console-error gate at the end fails the suite if any JS errors fired.

## Testids Contract

Testid values are defined in `packages/shared/src/desktop-api.ts` (`desktopTestIds`)
and hardcoded in the spec for zero-dependency bootstrap. If the shared constant changes,
update the `TESTIDS` object in `golden-path.spec.ts` to match.

## AI Vision Pass (Future)

Step 4 includes a `TODO(ai-vision-pass)` comment. Once Stagehand is wired into the
project, swap the pixel-size heuristic for a semantic rubric: prompt the AI to describe
what is visible in the VNC viewport and assert the response references a Linux desktop.
