/**
 * Authenticated session — the real user identity (replaces anonymous access).
 *
 * Stateless: a signed `deskl_session` cookie carries the user's id/email/provider + an expiry. No DB
 * — `userId` is derived from the verified email (see crypto.userIdForEmail), so Google, GitHub, and
 * magic-link logins for the same address resolve to the same account + the same owned computers.
 */
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { signPayload, verifyPayload } from './crypto.js';

const SESSION_COOKIE = 'deskl_session';
/** 30 days — a logged-in session. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthProvider = 'google' | 'github' | 'email' | 'dev';

export interface AuthSession {
  /** Stable opaque owner key (HMAC of the verified email). */
  userId: string;
  email: string;
  name?: string;
  provider: AuthProvider;
  /** Expiry, epoch seconds. */
  exp: number;
}

/** Build the `Set-Cookie` that logs a user in. */
export async function sessionCookie(
  session: Omit<AuthSession, 'exp'>,
  secret: string
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const token = await signPayload('session', { ...session, exp }, secret);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

/** The `Set-Cookie` that logs a user out (clears the session cookie). */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Resolve the caller's authenticated session from the signed cookie, or null if not logged in. */
export async function resolveSession(
  c: Context,
  secret: string
): Promise<AuthSession | null> {
  return verifyPayload<AuthSession>('session', getCookie(c, SESSION_COOKIE), secret);
}
