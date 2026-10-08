/**
 * Auth crypto — generic HMAC-signed, self-describing tokens (no store needed).
 *
 * A token is `base64url(json).base64url(hmac-sha256(json))`. `verifyPayload` recomputes the MAC in
 * constant time and rejects anything whose embedded `exp` (epoch seconds) has passed. Used for the
 * session cookie, the OAuth `state`, and magic-link tokens — all stateless, all domain-separated by a
 * `purpose` prefix on the signing key so one kind of token can never be replayed as another.
 */
const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(message: string, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(message)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Domain-separate each token kind so a session token can't be replayed as a magic-link, etc. */
function keyFor(purpose: string, secret: string): string {
  return `${purpose}:${secret}`;
}

/** Sign a payload (which should include an `exp` epoch-seconds field) into a self-contained token. */
export async function signPayload(
  purpose: string,
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const json = JSON.stringify(payload);
  const body = b64urlEncode(encoder.encode(json));
  const mac = b64urlEncode(await hmac(body, keyFor(purpose, secret)));
  return `${body}.${mac}`;
}

/** Verify a token's signature + expiry; returns the typed payload or null. */
export async function verifyPayload<T extends { exp?: number }>(
  purpose: string,
  token: string | undefined,
  secret: string
): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) return null;
  const body = token.slice(0, dot);
  try {
    const expected = await hmac(body, keyFor(purpose, secret));
    if (!timingSafeEqual(expected, b64urlDecode(token.slice(dot + 1)))) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as T;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** A stable, opaque user id derived from a verified email — unifies a person's logins by email. */
export async function userIdForEmail(email: string, secret: string): Promise<string> {
  const mac = await hmac(email.trim().toLowerCase(), keyFor('userid', secret));
  return b64urlEncode(mac).slice(0, 24);
}

/** A URL-safe random token (OAuth state nonce, etc.). */
export function randomToken(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
}
