import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.js';
import { Input, Button } from './theme.tools/index.js';

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.48.11-3.08 0 0 .98-.31 3.2 1.18a11.1 11.1 0 0 1 5.82 0c2.22-1.5 3.2-1.18 3.2-1.18.63 1.6.23 2.78.11 3.08.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2.1H12Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 13.8a6 6 0 0 1 0-3.8V7.4H3.1a10 10 0 0 0 0 9z" />
      <path
        fill="#4285F4"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4l3.3 2.6C7.2 7.7 9.4 6.1 12 6.1Z"
      />
    </svg>
  );
}

/** OAuth button className: the `@theme.tools/ui` outline button extended with the
 *  full-width + taller padding + no-underline the OAuth links need. */
const oauthBtn = 'w-full gap-2.5 rounded-lg px-4 py-3 text-sm font-600 text-white no-underline';

/**
 * AuthPanel — the real sign-in surface (M2). deskl.ink requires an account; this is the only way in.
 * Google + GitHub are full-page OAuth redirects (plain links — work without JS); the email path POSTs
 * a magic-link request and then shows a "check your email" confirmation. All three verify an email,
 * so they resolve to the same account.
 */
export function AuthPanel() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || !email.trim()) return;
    setSubmitting(true);
    await api.requestMagicLink(email.trim());
    setSubmitting(false);
    setSent(true);
  };

  if (sent) {
    return (
      <aside
        className="ds-glass flex w-full flex-col justify-center gap-5 rounded-2xl p-7 sm:p-9"
        aria-label="Check your email"
      >
        <div className="space-y-1.5">
          <h2 className="font-display text-2xl font-700 text-white">Check your email</h2>
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            We sent a sign-in link to <strong className="text-white">{email}</strong>. Open it on
            this device to continue — it expires in 15 minutes.
          </p>
        </div>
        <button
          type="button"
          data-testid="auth-reset"
          onClick={() => setSent(false)}
          className="self-start text-sm font-600 text-[var(--color-cyan)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
        >
          ← Use a different method
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="ds-glass flex w-full flex-col justify-center gap-6 rounded-2xl p-7 sm:p-9"
      aria-label="Sign in to deskl.ink"
    >
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-700 text-white">Sign in to deskl.ink</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Continue with Google, GitHub, or an email link. Free to start.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button asChild variant="outline" size="lg" className={oauthBtn}>
          <a data-testid="auth-github" href="/api/v1/auth/github">
            <GithubGlyph />
            Continue with GitHub
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className={oauthBtn}>
          <a data-testid="auth-google" href="/api/v1/auth/google">
            <GoogleGlyph />
            Continue with Google
          </a>
        </Button>
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs font-500 uppercase tracking-wider text-[var(--color-muted)]">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form onSubmit={onEmailSubmit} className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="sr-only">
          Email address
        </label>
        <Input
          id="auth-email"
          data-testid="auth-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg px-4 py-3 text-sm"
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          data-testid="auth-email-submit"
          loading={submitting}
          loadingText="Sending…"
          disabled={submitting}
          className="w-full rounded-lg font-700 shadow-[0_0_24px_rgba(0,229,255,0.25)]"
        >
          Email me a sign-in link
        </Button>
      </form>

      <p className="text-xs leading-relaxed text-[var(--color-muted)]">
        By continuing you agree to the Terms and Privacy Policy.
      </p>
    </aside>
  );
}

export default AuthPanel;
