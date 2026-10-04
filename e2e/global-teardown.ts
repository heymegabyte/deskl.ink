/**
 * Global teardown — destroy any leftover desktops after the golden-loop run so the monitor
 * never leaves a stray behind (catches the run's own desktop + any from overlapping fires).
 * Pairs with global-setup (clears before). See sweep-desktops.ts for the shared logic.
 */
import type { FullConfig } from '@playwright/test';
import { sweepDesktops } from './sweep-desktops.js';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  await sweepDesktops('teardown');
}
