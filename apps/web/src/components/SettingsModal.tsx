import { useEffect, useRef, useState } from 'react';
import {
  DISTROS,
  DISTRO_IDS,
  DESKTOP_SIZES,
  DESKTOP_SIZE_IDS,
  desktopTestIds,
} from '@deskl/shared';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { readDefaults, writeDefaults, type ComputerDefaults } from '../lib/defaults.js';
import { DistroLogo } from './DistroLogo.js';
import type { SessionState } from '../lib/api.js';

/**
 * Settings — a focused, HONEST modal with exactly two sections:
 *   1. Account (read-only) — WHO is signed in (email · provider · name), echoed from the session the
 *      app already holds. Nothing to edit here (identity is managed by the auth provider).
 *   2. Default new computer (FUNCTIONAL) — the distro + size a fresh "New computer" starts on,
 *      persisted to `localStorage['desklink:defaults']` and read back by {@link OsPicker} to pre-seed
 *      its selection. Set "Power" here → every new picker opens on Power, across reloads.
 *
 * There are deliberately NO placeholder toggles (notifications / billing / theme): billing is M3, and
 * a dead switch would violate the "no stubs / dead controls" bar. Sections are added here when they
 * become real.
 *
 * Modal conventions mirror {@link OsPicker} / the manager's DeleteDialog: `role="dialog"`
 * `aria-modal`, a dimmed click-away backdrop, Esc-to-close, {@link useFocusTrap} (focus in on open,
 * Tab contained, focus restored to the opener — the account-menu "Settings" item — on close), on-brand
 * near-black glass, centered + mobile-safe (scrolls within a capped max-height), and ZERO layout shift
 * (the overlay is `fixed inset-0`, out of document flow).
 */

/** Human label for each auth provider (session `provider` ∈ google|github|email|dev). */
const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'Email',
  dev: 'Dev',
};

interface SettingsModalProps {
  /** The signed-in identity (same object the header account menu shows). */
  user?: SessionState['user'];
  /** Close the modal (Done button / Esc / click-away). */
  onClose: () => void;
}

export function SettingsModal({ user, onClose }: SettingsModalProps) {
  // Live local mirror of the saved defaults — seeded from localStorage, written back on every change
  // so the preference persists immediately (the Done button only closes; there is no separate "Save").
  const [defaults, setDefaults] = useState<ComputerDefaults>(() => readDefaults());
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  // Esc closes (matches OsPicker).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Apply + persist a changed default (distro or size) atomically. */
  const choose = (patch: Partial<ComputerDefaults>) => {
    setDefaults((prev) => {
      const next = { ...prev, ...patch };
      writeDefaults(next); // validated + persisted in the helper
      return next;
    });
  };

  const email = user?.email ?? '';
  const name = user?.name?.trim() || null;
  const providerLabel = user?.provider ? (PROVIDER_LABELS[user.provider] ?? user.provider) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* dim + blur the app behind (click-away closes) */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[var(--color-black)]/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        data-testid={desktopTestIds.settingsDialog}
        className="ds-glass relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-[0_0_70px_rgba(0,229,255,0.12)] [animation:ds-pop_180ms_var(--ease-expressive)]"
        style={{ animationName: 'ds-pop' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-7 pb-5 pt-6">
          <div>
            <h2
              id="settings-title"
              className="font-display text-xl font-800 tracking-tight text-white"
            >
              Settings
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Your account and what a new computer starts with.
            </p>
          </div>
          {/* A corner close affordance in addition to the footer Done — common modal courtesy. */}
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="-mr-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scroll body (mobile-safe: the dialog is height-capped; this region scrolls) */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {/* ───────────── Account (read-only) ───────────── */}
          <section aria-labelledby="settings-account-label">
            <h3
              id="settings-account-label"
              className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-muted)]"
            >
              Account
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-xl border border-[var(--color-border)] bg-white/[0.02] px-4 py-3.5 text-sm">
              {name && (
                <>
                  <dt className="text-[var(--color-muted)]">Name</dt>
                  <dd className="truncate text-right font-600 text-white" title={name}>
                    {name}
                  </dd>
                </>
              )}
              <dt className="text-[var(--color-muted)]">Email</dt>
              <dd
                className="truncate text-right font-600 text-white"
                title={email || undefined}
              >
                {email || 'Signed in'}
              </dd>
              {providerLabel && (
                <>
                  <dt className="text-[var(--color-muted)]">Signed in with</dt>
                  <dd className="text-right font-600 text-white">{providerLabel}</dd>
                </>
              )}
            </dl>
          </section>

          {/* ───────────── Default new computer (functional) ───────────── */}
          <section aria-labelledby="settings-defaults-label" className="mt-7">
            <h3
              id="settings-defaults-label"
              className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-muted)]"
            >
              Default new computer
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-[var(--color-muted)]">
              What “New computer” starts on. Change it any time in the picker — this just sets the
              default.
            </p>

            {/* Default distro */}
            <p className="mb-2 text-xs font-600 text-[var(--color-white)]/80">Linux</p>
            <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Default Linux distribution">
              {DISTRO_IDS.map((id) => {
                const d = DISTROS[id];
                const active = defaults.distro === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`${desktopTestIds.settingsDefaultDistro}-${id}`}
                    data-distro={id}
                    aria-pressed={active}
                    onClick={() => choose({ distro: id })}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-200 ease-[var(--ease-expressive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] ${
                      active
                        ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5 shadow-[0_0_20px_rgba(0,229,255,0.16)]'
                        : 'border-[var(--color-border)] hover:-translate-y-px hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <DistroLogo distro={id} size={32} />
                    <span className="font-display text-sm font-700 text-white">{d.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Default size */}
            <p className="mb-2 mt-5 text-xs font-600 text-[var(--color-white)]/80">Size</p>
            <div
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
              role="group"
              aria-label="Default computer size"
            >
              {DESKTOP_SIZE_IDS.map((id) => {
                const s = DESKTOP_SIZES[id];
                const active = defaults.size === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`${desktopTestIds.settingsDefaultSize}-${id}`}
                    data-size={id}
                    aria-pressed={active}
                    onClick={() => choose({ size: id })}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ease-[var(--ease-expressive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] ${
                      active
                        ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5 shadow-[0_0_20px_rgba(0,229,255,0.16)]'
                        : 'border-[var(--color-border)] hover:-translate-y-px hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-display text-sm font-700 text-white">
                      {s.friendlyName}
                    </span>
                    <span
                      className={`font-mono text-xs ${active ? 'text-[var(--color-cyan)]' : 'text-[var(--color-muted)]'}`}
                    >
                      {s.ramGiB} GiB
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-7 py-4">
          <button
            type="button"
            data-testid={desktopTestIds.settingsClose}
            onClick={onClose}
            className="inline-flex items-center rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
