/**
 * E2E auth — deskl.ink now requires a real login, so tests authenticate via the secret-gated
 * dev-login endpoint (no OAuth). Set DESKL_TEST_AUTH to the deployed TEST_LOGIN_SECRET
 * (see .test-auth-secret). The dev-login issues a session for a fixed test user (e2e@deskl.ink).
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

const TEST_AUTH = process.env['DESKL_TEST_AUTH'] ?? '';

/** Authenticate an API request context (shares the page's cookie jar). Throws with guidance if the
 *  secret is missing/wrong so a misconfigured run fails loudly, not silently.
 *
 *  Pass `email` to mint a DISTINCT test user (cross-user / IDOR tests); omit it for the fixed
 *  default user (the golden path). The endpoint derives userId = HMAC(email), so each distinct email
 *  is an isolated owner. */
export async function devLogin(request: APIRequestContext, email?: string): Promise<void> {
  const res = await request.post('/api/v1/auth/dev-login', {
    headers: { 'x-deskl-test-auth': TEST_AUTH },
    ...(email ? { data: { email } } : {}),
  });
  if (!res.ok()) {
    throw new Error(
      `dev-login failed (${res.status()}). Set DESKL_TEST_AUTH to the deployed TEST_LOGIN_SECRET.`
    );
  }
}

/** Log in, then load the app. Replaces the old "dismiss the overlay" — the gate is gone once authed. */
export async function enterApp(page: Page): Promise<void> {
  await devLogin(page.request);
  await page.goto('/');
  await expect(page.getByTestId('new-computer-button').first()).toBeVisible({ timeout: 15_000 });
}
