/**
 * VNC connection tickets — short-lived, HMAC-signed, desktop-scoped.
 *
 * A ticket is a stateless capability the client appends to the VNC proxy URL
 * (`?ticket=...`). It is NEVER a shared/static VNC password and NEVER a public
 * unauthenticated port: the `/vnc/*` route verifies the signature + expiry +
 * desktopId match before proxying a single packet to the container.
 *
 * Format: `base64url(JSON claims)` + "." + `base64url(HMAC-SHA256(claims))`.
 * Claims validate against `VncTicketClaimsSchema` from the shared contract.
 *
 * @remarks Signed with `env.VNC_TICKET_SECRET`. A dev fallback constant is used
 * when the secret is unset so local dev works out of the box — TODO: require a
 * real `wrangler secret put VNC_TICKET_SECRET` before production (M2).
 */

import { VncTicketClaimsSchema, type VncTicketClaims } from '@deskl/shared';

/** Minutes a freshly minted ticket stays valid. */
const TICKET_TTL_MINUTES = 15;

/**
 * Dev-only fallback signing secret. Deterministic so tickets verify across
 * isolate restarts in local dev. TODO(M2): make `VNC_TICKET_SECRET` required
 * and delete this fallback — a production deploy MUST set a real secret.
 */
const DEV_FALLBACK_SECRET = 'deskl-ink-dev-vnc-ticket-secret-change-me';

function resolveSecret(secret: string | undefined): string {
  return secret && secret.length > 0 ? secret : DEV_FALLBACK_SECRET;
}

/** URL-safe base64 (RFC 4648 §5) without padding. */
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

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(payload: string, secret: string): Promise<Uint8Array> {
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return new Uint8Array(mac);
}

/** Constant-time comparison to avoid timing side-channels on the MAC. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Mint a signed VNC ticket for a desktop, valid for {@link TICKET_TTL_MINUTES}.
 *
 * @param desktopId - the desktop the ticket authorizes.
 * @param secret - `env.VNC_TICKET_SECRET` (dev fallback used when unset).
 * @returns an opaque `claims.signature` string for the client's VNC URL.
 */
export async function mintVncTicket(
  desktopId: string,
  secret: string | undefined
): Promise<string> {
  const claims: VncTicketClaims = {
    desktopId,
    exp: Math.floor(Date.now() / 1000) + TICKET_TTL_MINUTES * 60,
  };
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const mac = await sign(payload, resolveSecret(secret));
  return `${payload}.${base64UrlEncode(mac)}`;
}

/** Why a ticket was rejected (useful for logs; never leaked to the client). */
export type VncTicketError = 'malformed' | 'bad_signature' | 'expired' | 'desktop_mismatch';

export type VncTicketResult =
  { ok: true; claims: VncTicketClaims } | { ok: false; error: VncTicketError };

/**
 * Verify a VNC ticket: signature (HMAC), expiry, and that it was minted for
 * `expectedDesktopId`. Fail-closed — any defect returns `{ ok: false }`.
 *
 * @param ticket - the `ticket` query-param value.
 * @param expectedDesktopId - the `:id` path param of the VNC route.
 * @param secret - `env.VNC_TICKET_SECRET` (dev fallback used when unset).
 */
export async function verifyVncTicket(
  ticket: string | undefined | null,
  expectedDesktopId: string,
  secret: string | undefined
): Promise<VncTicketResult> {
  if (!ticket) return { ok: false, error: 'malformed' };
  const dot = ticket.indexOf('.');
  if (dot <= 0 || dot === ticket.length - 1) return { ok: false, error: 'malformed' };

  const payload = ticket.slice(0, dot);
  const providedMac = ticket.slice(dot + 1);

  let expectedMac: Uint8Array;
  let providedBytes: Uint8Array;
  try {
    expectedMac = await sign(payload, resolveSecret(secret));
    providedBytes = base64UrlDecode(providedMac);
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!timingSafeEqual(expectedMac, providedBytes)) return { ok: false, error: 'bad_signature' };

  // Signature is valid → claims are authentic; now parse + check them.
  let parsedClaims: unknown;
  try {
    parsedClaims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const result = VncTicketClaimsSchema.safeParse(parsedClaims);
  if (!result.success) return { ok: false, error: 'malformed' };

  const claims = result.data;
  if (claims.exp <= Math.floor(Date.now() / 1000)) return { ok: false, error: 'expired' };
  if (claims.desktopId !== expectedDesktopId) return { ok: false, error: 'desktop_mismatch' };

  return { ok: true, claims };
}
