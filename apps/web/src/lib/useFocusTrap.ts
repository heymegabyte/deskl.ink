import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus within `ref` while it's mounted — the ARIA dialog pattern:
 *  - moves focus into the dialog on mount (unless something inside is already focused, e.g. an
 *    autoFocus input),
 *  - keeps Tab / Shift+Tab cycling inside it (the background can't be tabbed into),
 *  - restores focus to whatever was focused before (the opener) on unmount.
 *
 * Put the ref on the dialog's CONTENT element (not a full-screen root that also holds a click-away
 * backdrop button), so the backdrop stays out of the tab cycle.
 *
 * `active` lets an always-mounted dialog (one that toggles `null` internally rather than being
 * conditionally mounted) arm the trap only while it's open — pass the open flag. A conditionally
 * mounted dialog can omit it (defaults to true).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );

    // Move focus in — unless an autoFocus element inside already has it.
    if (!container.contains(document.activeElement)) {
      const first = focusable()[0];
      if (first) {
        first.focus();
      } else {
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [ref, active]);
}
