/**
 * Auth routes — Google OAuth, GitHub OAuth, email magic link, session + logout, and a secret-gated
 * dev-login for E2E. Stateless (signed cookies/tokens; no DB). Mounted at /api/v1/auth in index.ts.
 *
 * Security:
 *  - OAuth uses a signed `state` cookie (CSRF): the authorize `state` nonce must match the cookie,
 *    the cookie must be unexpired + provider-matched. Code is exchanged server-side with the client
 *    secret; only a VERIFIED email is accepted (Google email_verified / GitHub primary-verified).
 *  - Magic-link tokens are signed (email + short expiry) — the email proves ownership.
 *  - Sessions are signed, HttpOnly, Secure, SameSite=Lax. userId = HMAC(email), so all three methods
 *    unify by email.
 */
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppContext } from '../observability.js';
import { resolvePrincipal } from '../auth/principal.js';
import { getRegistryStub } from '../containers/registry-stub.js';
import { sendEmail } from '../email/ses.js';
import {
  randomToken,
  signPayload,
  userIdForEmail,
  verifyPayload,
} from '../auth/crypto.js';
import {
  type AuthProvider,
  type AuthSession,
  clearSessionCookie,
  resolveSession,
  sessionCookie,
} from '../auth/session.js';

const STATE_COOKIE = 'deskl_oauth_state';
const OAUTH_SCOPES: Record<'google' | 'github', string> = {
  google: 'openid email profile',
  github: 'read:user user:email',
};

/** Timing-safe string compare for the dev-login secret. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function appUrl(c: { env: { APP_URL?: string } }): string {
  return (c.env.APP_URL ?? 'https://deskl.ink').replace(/\/$/, '');
}
function callbackUrl(c: { env: { APP_URL?: string } }, provider: string): string {
  return `${appUrl(c)}/api/v1/auth/${provider}/callback`;
}

/** Log a user in: set the session cookie, claim any pre-login anonymous computers, redirect home. */
async function completeLogin(
  c: AppCtx,
  identity: { email: string; name?: string; provider: AuthProvider }
): Promise<Response> {
  const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
  const userId = await userIdForEmail(identity.email, secret);
  const session: Omit<AuthSession, 'exp'> = {
    userId,
    email: identity.email,
    provider: identity.provider,
    ...(identity.name ? { name: identity.name } : {}),
  };
  c.header('Set-Cookie', await sessionCookie(session, secret), { append: true });
  // Clear the one-time OAuth state cookie if present.
  c.header('Set-Cookie', `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, {
    append: true,
  });
  // Claim pre-login anonymous computers so work created before this login isn't orphaned.
  try {
    const anon = await resolvePrincipal(c, c.env.VNC_TICKET_SECRET);
    if (anon.id && anon.id !== userId) {
      await getRegistryStub(c.env).reassignOwner(anon.id, userId);
    }
  } catch {
    /* claim is best-effort — never block login */
  }
  return c.redirect(`${appUrl(c)}/`, 302);
}

type AppCtx = Context<AppContext>;

const app = new Hono<AppContext>();

/** Current auth state — the frontend polls this to decide whether to show the login gate. */
app.get('/session', async (c) => {
  const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
  const s = await resolveSession(c, secret);
  if (!s) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    user: { email: s.email, name: s.name ?? null, provider: s.provider },
  });
});

/** Log out — clear the session. */
app.post('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie());
  return c.body(null, 204);
});

// --- OAuth: redirect to the provider -------------------------------------------------------------
for (const provider of ['google', 'github'] as const) {
  app.get(`/${provider}`, async (c) => {
    const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
    const clientId = provider === 'google' ? c.env.GOOGLE_CLIENT_ID : c.env.GITHUB_CLIENT_ID;
    if (!clientId) return c.json({ ok: false, error: 'oauth_not_configured', provider }, 501);

    const nonce = randomToken();
    const state = await signPayload('oauthstate', { n: nonce, p: provider, exp: Math.floor(Date.now() / 1000) + 600 }, secret);
    c.header(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );

    const base =
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://github.com/login/oauth/authorize';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(c, provider),
      response_type: 'code',
      scope: OAUTH_SCOPES[provider],
      state: nonce,
      ...(provider === 'google' ? { access_type: 'online', prompt: 'select_account' } : {}),
    });
    return c.redirect(`${base}?${params.toString()}`, 302);
  });

  // --- OAuth callback: verify state, exchange code, fetch the verified email, log in -------------
  app.get(`/${provider}/callback`, async (c) => {
    const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
    const code = c.req.query('code');
    const stateParam = c.req.query('state');
    const stateCookie = getCookie(c, STATE_COOKIE);
    const verified = await verifyPayload<{ n: string; p: string; exp: number }>(
      'oauthstate',
      stateCookie,
      secret
    );
    if (!code || !verified || verified.p !== provider || verified.n !== stateParam) {
      return c.redirect(`${appUrl(c)}/?auth_error=state`, 302);
    }

    try {
      const identity =
        provider === 'google' ? await googleIdentity(c, code) : await githubIdentity(c, code);
      if (!identity) return c.redirect(`${appUrl(c)}/?auth_error=unverified`, 302);
      return await completeLogin(c, { ...identity, provider });
    } catch (err) {
      console.error('[auth] oauth callback failed', provider, err);
      return c.redirect(`${appUrl(c)}/?auth_error=exchange`, 302);
    }
  });
}

/** Exchange a Google auth code → the verified email + name. */
async function googleIdentity(
  c: AppCtx,
  code: string
): Promise<{ email: string; name?: string } | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: c.env.GOOGLE_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(c, 'google'),
    }),
  });
  if (!tokenRes.ok) return null;
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!info.email || info.email_verified === false) return null;
  return { email: info.email, ...(info.name ? { name: info.name } : {}) };
}

/** Exchange a GitHub auth code → the primary VERIFIED email + name. */
async function githubIdentity(
  c: AppCtx,
  code: string
): Promise<{ email: string; name?: string } | null> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: c.env.GITHUB_CLIENT_ID ?? '',
      client_secret: c.env.GITHUB_CLIENT_SECRET ?? '',
      code,
      redirect_uri: callbackUrl(c, 'github'),
    }),
  });
  if (!tokenRes.ok) return null;
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    'User-Agent': 'deskl.ink',
    Accept: 'application/vnd.github+json',
  };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!emailsRes.ok) return null;
  const emails = (await emailsRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary) return null;
  const user = userRes.ok ? ((await userRes.json()) as { name?: string; login?: string }) : {};
  const name = user.name ?? user.login;
  return { email: primary.email, ...(name ? { name } : {}) };
}

// --- Email magic link ----------------------------------------------------------------------------
app.post('/magic-link', async (c) => {
  const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Minimal shape check — don't reveal anything about the address either way.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ ok: true }); // always 200 — never disclose validity
  }
  const token = await signPayload(
    'magiclink',
    { email, exp: Math.floor(Date.now() / 1000) + 900 }, // 15 min
    secret
  );
  const link = `${appUrl(c)}/api/v1/auth/magic-link/verify?token=${encodeURIComponent(token)}`;
  const from = c.env.EMAIL_FROM ?? 'deskl.ink <login@deskl.ink>';

  // Send via Amazon SES (the sole email rail). Structured result is logged (delivery observable);
  // the caller always gets {ok:true} and never learns whether the address exists.
  const result = await sendEmail(c.env, {
    from,
    to: email,
    subject: 'Your deskl.ink sign-in link',
    text: `Sign in to deskl.ink:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
    html: `<p>Sign in to <strong>deskl.ink</strong>:</p><p><a href="${link}">Open my workspace →</a></p><p style="color:#888;font-size:13px">This link expires in 15 minutes. If you didn't request it, you can ignore this email.</p>`,
  });
  console.log(
    JSON.stringify({
      level: result.ok ? 'info' : 'error',
      msg: 'magic_link_send',
      status: result.status,
      id: result.messageId,
      error: result.error,
    })
  );
  return c.json({ ok: true });
});

app.get('/magic-link/verify', async (c) => {
  const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
  const payload = await verifyPayload<{ email: string; exp: number }>(
    'magiclink',
    c.req.query('token'),
    secret
  );
  if (!payload?.email) return c.redirect(`${appUrl(c)}/?auth_error=link`, 302);
  return await completeLogin(c, { email: payload.email, provider: 'email' });
});

/* AppCtx is the authenticated control-plane context (Env bindings + the observability Variables). */

// --- Dev login (E2E only) ------------------------------------------------------------------------
/**
 * Issues a session WITHOUT OAuth — so the golden-path monitor + authz regression suite can
 * authenticate. Gated by a constant-time match of `x-deskl-test-auth` against TEST_LOGIN_SECRET;
 * returns 404 when the secret is unset or wrong (indistinguishable from "no such route").
 *
 * Body is OPTIONAL: `{ email }` mints a session for THAT address (distinct test users, for
 * cross-user/IDOR tests) via the SAME `userIdForEmail` path the real logins use, so a dev-login user
 * and a Google/GitHub/magic-link user for the same email resolve to the same account + owned
 * computers. With no body (or an invalid email) it keeps minting the fixed default user — back-compat
 * with the golden path, and still fully gated, so behavior is unchanged when the secret is unset.
 */
app.post('/dev-login', async (c) => {
  const secret = c.env.AUTH_SECRET ?? c.env.VNC_TICKET_SECRET ?? '';
  const configured = c.env.TEST_LOGIN_SECRET;
  const provided = c.req.header('x-deskl-test-auth');
  if (!configured || !provided || !safeEqual(provided, configured)) {
    return c.json({ ok: false, error: 'not_found' }, 404);
  }
  // Optional `{ email }` → that test user; absent/invalid → the fixed default (back-compat). Same
  // minimal shape check as magic-link; normalized to lowercase so ids match the real-login path.
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
  const requested = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requested) ? requested : 'e2e@deskl.ink';
  const userId = await userIdForEmail(email, secret);
  c.header('Set-Cookie', await sessionCookie({ userId, email, provider: 'dev' }, secret));
  return c.json({ ok: true, user: { email, provider: 'dev' } });
});

export default app;
