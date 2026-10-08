/**
 * Session principal — the server-side identity + ownership boundary for every control-plane request.
 *
 * Until real user auth (OAuth / email magic link, M2) lands, deskl.ink issues an ANONYMOUS but
 * stable, HMAC-SIGNED principal id in an HttpOnly cookie (`deskl_sid`). This is NOT a user account —
 * it is the OWNERSHIP boundary: every computer is owned by the principal that created it, and the
 * control-plane authorizes each request against that owner. OAuth later UPGRADES a principal from
 * anonymous to a real user WITHOUT changing the ownership model.
 *
 * Because the cookie is HMAC-signed, a client cannot forge another principal's id (it can't produce
 * the MAC), so it can never list/open/destroy another principal's computers. Knowing an id is not
 * authorization — the signature is. This closes the pre-auth hole where ANY caller could control
 * ANY computer via the global registry.
 *
 * Self-contained HMAC (mirrors routes/vnc-ticket.ts) so this module has no coupling to the ticket
 * code; the secret is domain-separated (`session:` prefix) so a session cookie and a VNC ticket can
 * never be cross-used even under the same `VNC_TICKET_SECRET`.
 */
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';

const COOKIE = 'deskl_sid';
const DEV_FALLBACK_SECRET = 'deskl-ink-dev-session-secret-change-me';
/** 1 year — anonymous continuity across visits (a real login later replaces this principal). */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const encoder = new TextEncoder();

function resolveSecret(secret: string | undefined): string {
  // Domain-separate from the VNC-ticket HMAC even when both use VNC_TICKET_SECRET.
  return `session:${secret && secret.length > 0 ? secret : DEV_FALLBACK_SECRET}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(mac);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export interface Principal {
  /** Opaque, stable, unforgeable id — the owner key for this caller's computers. */
  id: string;
  /** True when freshly minted this request (the caller sent no / an invalid cookie) → set it. */
  fresh: boolean;
}

/** Resolve the caller's principal from the signed cookie, or mint a fresh one (set it on reply). */
export async function resolvePrincipal(c: Context, secret: string | undefined): Promise<Principal> {
  const raw = getCookie(c, COOKIE);
  if (raw) {
    const dot = raw.indexOf('.');
    if (dot > 0 && dot < raw.length - 1) {
      const id = raw.slice(0, dot);
      try {
        const expected = await hmac(id, resolveSecret(secret));
        if (timingSafeEqual(expected, base64UrlDecode(raw.slice(dot + 1)))) {
          return { id, fresh: false };
        }
      } catch {
        /* malformed cookie → mint a new principal */
      }
    }
  }
  return { id: crypto.randomUUID(), fresh: true };
}

/** Build the `Set-Cookie` value for a (freshly minted) principal. */
export async function principalCookie(id: string, secret: string | undefined): Promise<string> {
  const mac = base64UrlEncode(await hmac(id, resolveSecret(secret)));
  return `${COOKIE}=${id}.${mac}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

/**
 * Admin bypass for ops + the E2E monitor sweep: a constant-time match of the `x-deskl-admin` header
 * against `env.ADMIN_TOKEN`. Lets a trusted operator list/destroy ACROSS owners (e.g. reap orphaned
 * computers left by expired anonymous principals). Disabled unless `ADMIN_TOKEN` is set.
 */
export function isAdmin(c: Context, adminToken: string | undefined): boolean {
  if (!adminToken) return false;
  const provided = c.req.header('x-deskl-admin');
  if (!provided) return false;
  return timingSafeEqual(encoder.encode(provided), encoder.encode(adminToken));
}
