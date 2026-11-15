import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import {
  DISTROS,
  DISTRO_IDS,
  DESKTOP_SIZES,
  DESKTOP_SIZE_IDS,
  COMPUTER_FORMS,
  desktopTestIds,
  estimateDesktopCost,
  type DistroId,
  type DesktopResource,
  type DesktopSizeId,
  type ComputerForm,
} from '@deskl/shared';
import { DistroLogo } from './DistroLogo.js';
import { readDefaults } from '../lib/defaults.js';

interface OsPickerProps {
  onCreate: (distro: DistroId, size: DesktopSizeId, form: ComputerForm) => void;
  onBackup: (desktopId: string) => Promise<void> | void;
  desktops: DesktopResource[];
  backingUp: ReadonlySet<string>;
  onClose: () => void;
  creating?: boolean;
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-700 focus-visible:outline-2 focus-visible:outline-[var(--color-cyan)] ${active ? 'bg-[var(--color-cyan)] text-[var(--color-black)]' : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

/** Compact launcher for creating a supported computer or saving its user-data layer to R2. */
export function OsPicker({
  onCreate,
  onBackup,
  desktops,
  backingUp,
  onClose,
  creating = false,
}: OsPickerProps) {
  const [mode, setMode] = useState<'new' | 'backup'>('new');
  const [form, setForm] = useState<ComputerForm>('desktop');
  const [distro, setDistro] = useState<DistroId>(() => readDefaults().distro);
  const [size, setSize] = useState<DesktopSizeId>(() => readDefaults().size);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const snapshotTargets = useMemo(
    () => desktops.filter((d) => d.status === 'ready' || d.status === 'active'),
    [desktops]
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);

  const chooseForm = (next: ComputerForm) => {
    setForm(next);
    if (next === 'server') setSize('everyday');
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Computer actions"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[var(--color-black)]/70 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        className="ds-glass relative w-full max-w-lg rounded-xl border border-[var(--color-border)] p-4 shadow-[0_18px_70px_rgba(0,0,0,.55)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-black/20 p-0.5">
            <ModeButton active={mode === 'new'} onClick={() => setMode('new')}>
              New computer
            </ModeButton>
            <ModeButton active={mode === 'backup'} onClick={() => setMode('backup')}>
              Backup / snapshot
            </ModeButton>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>

        {mode === 'backup' ? (
          <div className="mt-4">
            <p className="mb-3 text-xs leading-relaxed text-[var(--color-muted)]">
              Save a restorable user-data layer to R2 without stopping the computer.
            </p>
            {snapshotTargets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-5 text-center text-sm text-[var(--color-muted)]">
                Start a computer before creating a snapshot.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {snapshotTargets.map((desktop) => {
                  const busy = backingUp.has(desktop.id);
                  return (
                    <li key={desktop.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onBackup(desktop.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left hover:border-[var(--color-cyan)]/50 hover:bg-white/5 disabled:opacity-60"
                      >
                        <DistroLogo distro={desktop.distro} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-700 text-white">
                            {desktop.name}
                          </span>
                          <span className="block text-[0.7rem] text-[var(--color-muted)]">
                            {desktop.os} · {desktop.form}
                          </span>
                        </span>
                        <span className="text-xs font-700 text-[var(--color-cyan)]">
                          {busy ? 'Saving…' : 'Snapshot'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-border)] bg-black/20 p-1">
              {COMPUTER_FORMS.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={desktopTestIds.formOption}
                  data-form={id}
                  aria-pressed={form === id}
                  onClick={() => chooseForm(id)}
                  className={`rounded-md px-3 py-2 text-xs font-700 ${form === id ? 'bg-white/10 text-white' : 'text-[var(--color-muted)] hover:text-white'}`}
                >
                  {id === 'desktop' ? 'Desktop · GUI' : 'Server · terminal'}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {DISTRO_IDS.map((id) => {
                const item = DISTROS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={desktopTestIds.distroOption}
                    data-distro={id}
                    aria-pressed={distro === id}
                    onClick={() => setDistro(id)}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${distro === id ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5' : 'border-[var(--color-border)] hover:bg-white/5'}`}
                  >
                    <DistroLogo distro={id} size={25} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-700 text-white">
                        {item.name}
                      </span>
                      <span className="block text-[0.65rem] text-[var(--color-muted)]">
                        {item.version}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {form === 'desktop' && (
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {DESKTOP_SIZE_IDS.map((id) => {
                  const item = DESKTOP_SIZES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={desktopTestIds.sizeOption}
                      data-size={id}
                      aria-pressed={size === id}
                      onClick={() => setSize(id)}
                      className={`rounded-lg border px-2 py-2 text-left ${size === id ? 'border-[var(--color-cyan)] bg-[var(--color-cyan)]/5' : 'border-[var(--color-border)] hover:bg-white/5'}`}
                    >
                      <span className="block truncate text-[0.7rem] font-700 text-white">
                        {item.friendlyName}
                      </span>
                      <span className="block font-mono text-[0.62rem] text-[var(--color-muted)]">
                        {item.ramGiB} GiB
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
              <span className="font-mono text-[0.68rem] text-[var(--color-muted)]">
                ~${estimateDesktopCost(size).baselineUsdPerHour.toFixed(2)}/hr
              </span>
              <button
                type="button"
                data-testid={desktopTestIds.createConfirm}
                onClick={() => onCreate(distro, size, form)}
                disabled={creating}
                className="rounded-md bg-[var(--color-cyan)] px-4 py-2 text-xs font-800 text-[var(--color-black)] disabled:opacity-60"
              >
                {creating ? 'Creating…' : `Create ${DISTROS[distro].name} ${form}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
