import { useEffect, useState } from 'react';
import {
  DISTROS,
  DISTRO_IDS,
  DESKTOP_SIZES,
  DESKTOP_SIZE_IDS,
  COMPUTER_FORMS,
  COMPUTER_FORM_SPECS,
  desktopTestIds,
  type DistroId,
  type DesktopSizeId,
  type ComputerForm,
} from '@deskl/shared';
import { DistroMark } from './DistroMark.js';

interface OsPickerProps {
  /** Create a computer with the chosen form + distro + size. */
  onCreate: (distro: DistroId, size: DesktopSizeId, form: ComputerForm) => void;
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
  const [form, setForm] = useState<ComputerForm>('desktop');
  const [distro, setDistro] = useState<DistroId>('ubuntu');
  const [size, setSize] = useState<DesktopSizeId>('everyday');

  // Server form is Ubuntu · Everyday (headless) for v1 — pin those when it's chosen so the stored
  // distro/size match what actually boots (more server distros/sizes are coming).
  const chooseForm = (f: ComputerForm) => {
    setForm(f);
    if (f === 'server') {
      // Servers are everyday-size for v1; the distro stays the user's choice (all distros supported).
      setSize('everyday');
    }
  };

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

        {/* Form: Desktop vs Server (spec §9) */}
        <GroupLabel>Type</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          {COMPUTER_FORMS.map((id) => {
            const f = COMPUTER_FORM_SPECS[id];
            const active = form === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={desktopTestIds.formOption}
                data-form={id}
                aria-pressed={active}
                onClick={() => chooseForm(id)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-200 ease-[var(--ease-expressive)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] ${
                  active
                    ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5 shadow-[0_0_24px_rgba(0,229,255,0.18)]'
                    : 'border-[var(--color-border)] hover:-translate-y-px hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2 font-display text-base font-700 text-white">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke={active ? 'var(--color-cyan)' : 'currentColor'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {id === 'desktop' ? (
                      <>
                        <rect x="2" y="4" width="20" height="13" rx="2" />
                        <path d="M8 21h8M12 17v4" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="4" width="18" height="6" rx="1.5" />
                        <rect x="3" y="14" width="18" height="6" rx="1.5" />
                        <path d="M7 7h.01M7 17h.01" />
                      </>
                    )}
                  </svg>
                  {f.name}
                </span>
                <span className="text-xs leading-snug text-[var(--color-muted)]/80">{f.tagline}</span>
              </button>
            );
          })}
        </div>

        {/* Distro — both desktop and server pick a distro */}
        <div className="mt-6">
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
                      <span className="text-xs leading-snug text-[var(--color-muted)]/80">
                        {d.tagline}
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Size (desktop) or a headless-server note (server) */}
        {form === 'desktop' ? (
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
            </div>
        ) : (
          <div className="mt-6 rounded-xl border border-[var(--color-border)]/60 bg-white/5 p-4 text-sm leading-relaxed text-[var(--color-muted)]">
            <span className="font-700 text-white">{DISTROS[distro].name} · 4 GiB · headless</span> — a
            dev box with git, Node, Python, ripgrep, tmux + a browser terminal, OpenCode-ready. No
            desktop; your workspace is the terminal. More server sizes are coming.
          </div>
        )}

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
            onClick={() => onCreate(distro, size, form)}
            disabled={creating}
            aria-busy={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating
              ? 'Creating…'
              : `Create ${DISTROS[distro].name}${form === 'server' ? ' server' : ''} · ${DESKTOP_SIZES[size].ramGiB} GiB`}
          </button>
        </div>
      </div>
    </div>
  );
}
