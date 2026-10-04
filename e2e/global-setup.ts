/**
 * Global setup — clear any leftover desktops BEFORE the golden-loop run so a stray from a
 * concurrent/interrupted fire can't break the test's `.first()` tile assertions. Pairs with
 * global-teardown (clears after). Together: every run starts AND ends at zero.
 */
import type { FullConfig } from '@playwright/test';
import { sweepDesktops } from './sweep-desktops.js';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await sweepDesktops('setup');
}
