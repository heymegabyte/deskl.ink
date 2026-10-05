import { useEffect, useState } from 'react';
import { DISTROS, DISTRO_IDS, desktopTestIds, type DistroId } from '@deskl/shared';
import { DistroMark } from './DistroMark.js';

interface OsPickerProps {
  /** Create a computer with the chosen distro. */
  onCreate: (distro: DistroId) => void;
  onClose: () => void;
  creating?: boolean;
}

/**
 * The OS picker — a gorgeous glass popup to choose which Linux to spin up. Ubuntu is
 * pre-selected (the default/golden path); Fedora + Debian are the alternatives. Each is a
 * selectable card with an original brand-colour orb (never a trademarked logo).
 */
export function OsPicker({ onCreate, onClose, creating = false }: OsPickerProps) {
  const [selected, setSelected] = useState<DistroId>('ubuntu');

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
          Pick your Linux — Everyday · 4&nbsp;GiB, ready in seconds. You can resize later.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {DISTRO_IDS.map((id) => {
            const d = DISTROS[id];
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={desktopTestIds.distroOption}
                data-distro={id}
                aria-pressed={active}
                onClick={() => setSelected(id)}
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
            onClick={() => onCreate(selected)}
            disabled={creating}
            aria-busy={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating…' : `Create ${DISTROS[selected].name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
