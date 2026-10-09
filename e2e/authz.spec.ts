/**
 * deskl.ink AUTHORIZATION — live API regression suite (no UI).
 *
 * Locks the control-plane's access model so a refactor can't silently open it up. Pure
 * `APIRequestContext` (no page / no `page.goto`): each principal gets its OWN request context →
 * its OWN cookie jar, so "user A" and "user B" are genuinely distinct sessions.
 *
 * What it guards (mirrors workers/api/src/routes/{desktops,mcp}.ts):
 *   1. Default-deny — every control-plane route 401s WITHOUT a session cookie.
 *   2. VNC/terminal need a signed ticket — 401 (not 426, not a 200 proxy) with no ticket/session.
 *   3. IDOR / cross-user — B can't GET A's desktop (404, not 403) and B's list excludes it.
 *   4. Agent control plane gate — POST /:id/mcp with no session is 401 (auth) OR 404 (flag off),
 *      never 200/500 — both acceptable so this passes whether or not AGENT_CONTROL_PLANE is set.
 *
 * Hermetic + parallel-safe: unique emails/names from a per-worker counter + `parallelIndex`
 * (NOT Date.now — a wall-clock could collide across parallel workers and isn't reproducible).
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test authz
 */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { devLogin } from './auth.js';

/** Per-worker monotonic counter → with parallelIndex yields globally-unique, reproducible ids. */
let seq = 0;
function uniq(): string {
  seq += 1;
  return `${test.info().parallelIndex}-${seq}`;
}

/** A syntactically-valid but definitely-nonexistent desktop id (UUIDv4-shaped) for unauthed probes. */
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Create an authenticated request context for a distinct test user. Each call is a fresh cookie jar
 * (own `baseURL` from the Playwright config), so principals never share a session.
 */
async function loginAs(email: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext();
  await devLogin(ctx, email);
  return ctx;
}

test.describe('Authorization — control plane', () => {
  test('1 · default-deny: every control-plane route 401s without a session', async () => {
    // A cookie-less context → no `deskl_session` → `resolveAuth` returns null → 401 everywhere.
    const anon = await pwRequest.newContext();
    try {
      const probes: Array<{ label: string; status: number }> = [
        { label: 'POST /desktops', status: (await anon.post('/api/v1/desktops', { data: {} })).status() },
        { label: 'GET /desktops', status: (await anon.get('/api/v1/desktops')).status() },
        { label: 'GET /desktops/:id', status: (await anon.get(`/api/v1/desktops/${FAKE_ID}`)).status() },
        {
          label: 'PATCH /desktops/:id',
          status: (await anon.patch(`/api/v1/desktops/${FAKE_ID}`, { data: { name: 'x' } })).status(),
        },
        { label: 'DELETE /desktops/:id', status: (await anon.delete(`/api/v1/desktops/${FAKE_ID}`)).status() },
        { label: 'POST /:id/start', status: (await anon.post(`/api/v1/desktops/${FAKE_ID}/start`)).status() },
        { label: 'POST /:id/stop', status: (await anon.post(`/api/v1/desktops/${FAKE_ID}/stop`)).status() },
        { label: 'POST /:id/ticket', status: (await anon.post(`/api/v1/desktops/${FAKE_ID}/ticket`)).status() },
      ];
      for (const p of probes) {
        expect(p.status, `${p.label} must 401 without a session`).toBe(401);
      }
    } finally {
      await anon.dispose();
    }
  });

  test('2 · VNC + terminal require a signed ticket (401, not 426/200)', async () => {
    // No `?ticket=`, no ticket cookie, no session → the HMAC-ticket gate rejects with 401. It must
    // NOT 426 (never an upgrade negotiation) and must NOT 200 (never proxy an unauthenticated byte).
    const anon = await pwRequest.newContext();
    try {
      const vnc = await anon.get(`/api/v1/desktops/${FAKE_ID}/vnc/`);
      expect(vnc.status(), 'VNC without a ticket → 401').toBe(401);

      const term = await anon.get(`/api/v1/desktops/${FAKE_ID}/term/`);
      expect(term.status(), 'terminal without a ticket → 401').toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test('3 · IDOR: user B cannot see user A’s desktop', async () => {
    const n = uniq();
    const a = await loginAs(`a-${n}@deskl.ink`);
    const b = await loginAs(`b-${n}@deskl.ink`);
    let aDesktopId = '';
    try {
      // A creates a desktop (disposable → no persistence to reap; name is unique for traceability).
      const created = await a.post('/api/v1/desktops', {
        data: { name: `authz-${n}`, disposable: true },
      });
      expect(created.status(), 'A can create a desktop').toBe(201);
      aDesktopId = (await created.json()).desktop.id as string;
      expect(aDesktopId, 'create returned a desktop id').toBeTruthy();

      // A owns it (sanity: the IDOR assertions below mean nothing if A itself can't read it).
      expect((await a.get(`/api/v1/desktops/${aDesktopId}`)).status()).toBe(200);

      // B is a DIFFERENT principal → A's id is "unknown OR not-owned" → 404 (NOT 403: we never
      // confirm the resource exists to a non-owner).
      const bGet = await b.get(`/api/v1/desktops/${aDesktopId}`);
      expect(bGet.status(), 'B GET A’s desktop → 404').toBe(404);

      // And B's own list must not leak A's id.
      const bList = await b.get('/api/v1/desktops');
      expect(bList.status()).toBe(200);
      const bIds = ((await bList.json()).desktops as Array<{ id: string }>).map((d) => d.id);
      expect(bIds, 'B’s list excludes A’s desktop').not.toContain(aDesktopId);
    } finally {
      // Cleanup: A (the owner) deletes its desktop so the fleet returns to zero. Best-effort.
      if (aDesktopId) await a.delete(`/api/v1/desktops/${aDesktopId}`).catch(() => undefined);
      await a.dispose();
      await b.dispose();
    }
  });

  test('4 · agent control plane: POST /:id/mcp without a session is 401 or 404 (never 200/500)', async () => {
    // Flag-gated: AGENT_CONTROL_PLANE !== '1' → 404 (dark); flag on + no session → 401 (auth). Both
    // are correct closed states, so accept either — but never a success (200) or a crash (500).
    const anon = await pwRequest.newContext();
    try {
      const res = await anon.post(`/api/v1/desktops/${FAKE_ID}/mcp`, {
        data: { method: 'tools/list' },
      });
      expect([401, 404], `mcp gate returned ${res.status()}`).toContain(res.status());
    } finally {
      await anon.dispose();
    }
  });
});
