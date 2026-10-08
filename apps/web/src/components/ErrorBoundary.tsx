import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level error boundary — catches render/lifecycle errors anywhere in the tree and shows a
 * branded fallback instead of React's blank white screen. Recovery is a full reload (safest: the
 * app's state machine + signed session rehydrate cleanly). Emits one structured client log that the
 * @sentry/cloudflare baseline will pick up once its DSN lands (mirrors the Worker's log shape, D14).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'ui_crash',
        error: String(error),
        componentStack: info.componentStack,
      })
    );
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        data-testid="error-boundary"
        role="alert"
        className="ds-nebula-fallback fixed inset-0 z-[100] grid place-items-center p-6 text-center"
      >
        <div className="max-w-md">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-800 text-white">Something went wrong</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
            The deskl.ink interface hit an unexpected error. Your computers are safe — reloading will
            reconnect you right where you left off.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-7 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            Reload deskl.ink
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Obscurely-gated self-test: renders nothing normally, but throws during render when the URL carries
 * `?__selftest=crash`. Harmless (it just trips the boundary, which a reload clears) and lets the E2E
 * prove the boundary actually catches a real render error. Rendered INSIDE the boundary.
 */
export function CrashSelfTest(): null {
  if (new URLSearchParams(window.location.search).get('__selftest') === 'crash') {
    throw new Error('deskl.ink error-boundary self-test');
  }
  return null;
}

export default ErrorBoundary;
