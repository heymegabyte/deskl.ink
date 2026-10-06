import { useEffect, useState } from 'react';
import {
  DISTROS,
  DISTRO_IDS,
  DESKTOP_SIZES,
  DESKTOP_SIZE_IDS,
  desktopTestIds,
  type DistroId,
  type DesktopSizeId,
} from '@deskl/shared';
import { DistroMark } from './DistroMark.js';

interface OsPickerProps {
  /** Create a computer with the chosen distro + size. */
  onCreate: (distro: DistroId, size: DesktopSizeId) => void;
  onClose: () => void;
  creating?: boolean;
}

/** Tiny label above a group of choices. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[var(--color-muted)]">
      {children}
    </p>
  );
}

/**
 * The OS picker — a gorgeous glass popup to choose which Linux to spin up AND how much
 * machine to give it. Ubuntu + Everyday (4 GiB) are pre-selected (the default/golden path);
 * every distro and size is selectable. Each distro has an original brand-colour orb (never a
 * trademarked logo); each size maps to a real Cloudflare instance_type (RAM), so the choice
 * actually provisions that much VM — it is not a cosmetic label.
 */
export function OsPicker({ onCreate, onClose, creating = false }: OsPickerProps) {
  const [distro, setDistro] = useState<DistroId>('ubuntu');
  const [size, setSize] = useState<DesktopSizeId>('everyday');

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose your computer"
    >
      {/* dim + blur the manager behind */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[var(--color-black)]/70 backdrop-blur-sm"
      />

      <div
        className="ds-glass relative w-full max-w-2xl rounded-2xl border border-[var(--color-border)] p-7 shadow-[0_0_70px_rgba(0,229,255,0.12)] [animation:ds-pop_180ms_var(--ease-expressive)]"
        style={{ animationName: 'ds-pop' }}
      >
        <h2 className="font-display text-xl font-800 tracking-tight text-white">New computer</h2>
        <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
          Pick your Linux and how much machine it gets. Ready in seconds — you can resize later.
        </p>

        {/* Distro */}
        <GroupLabel>Linux</GroupLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          {DISTRO_IDS.map((id) => {
            const d = DISTROS[id];
            const active = distro === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={desktopTestIds.distroOption}
                data-distro={id}
                aria-pressed={active}
                onClick={() => setDistro(id)}
                className={`group flex flex-col items-center gap-2.5 rounded-xl border p-5 text-center transition-all duration-200 ease-[var(--ease-expressive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] ${
                  active
                    ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5 shadow-[0_0_28px_rgba(0,229,255,0.2)]'
                    : 'border-[var(--color-border)] hover:-translate-y-px hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <DistroMark distro={id} size={52} />
                <span className="font-display text-base font-700 text-white">{d.name}</span>
                <span className="font-mono text-xs text-[var(--color-muted)]">{d.version}</span>
                <span className="text-xs leading-snug text-[var(--color-muted)]/80">{d.tagline}</span>
              </button>
            );
          })}
        </div>

        {/* Size */}
        <div className="mt-6">
          <GroupLabel>Size</GroupLabel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {DESKTOP_SIZE_IDS.map((id) => {
              const s = DESKTOP_SIZES[id];
              const active = size === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={desktopTestIds.sizeOption}
                  data-size={id}
                  aria-pressed={active}
                  onClick={() => setSize(id)}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ease-[var(--ease-expressive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] ${
                    active
                      ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5 shadow-[0_0_24px_rgba(0,229,255,0.18)]'
                      : 'border-[var(--color-border)] hover:-translate-y-px hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <span className="font-display text-sm font-700 text-white">{s.friendlyName}</span>
                  <span
                    className={`font-mono text-xs ${active ? 'text-[var(--color-cyan)]' : 'text-[var(--color-muted)]'}`}
                  >
                    {s.ramGiB} GiB
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm text-[var(--color-muted)] transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={desktopTestIds.createConfirm}
            onClick={() => onCreate(distro, size)}
            disabled={creating}
            aria-busy={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating
              ? 'Creating…'
              : `Create ${DISTROS[distro].name} · ${DESKTOP_SIZES[size].ramGiB} GiB`}
          </button>
        </div>
      </div>
    </div>
  );
}
