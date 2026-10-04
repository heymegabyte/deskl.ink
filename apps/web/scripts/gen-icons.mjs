/**
 * Generate PNG brand assets from the one source SVG (favicon.svg) — favicon-32,
 * apple-touch-icon (180, filled for iOS), and the OG card (1200×630). Headless render
 * via Playwright's Chromium so the vector mark stays crisp. One source → all derivatives.
 *
 * Run from a dir where @playwright/test resolves (e.g. `cd e2e && node ../apps/web/scripts/gen-icons.mjs`).
 */
/* global console */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PUB = '/Users/Apple/emdash/repositories/deskl.ink/apps/web/public';
const svg = readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');
const sized = (px) => svg.replace('<svg', `<svg width="${px}" height="${px}"`);

const browser = await chromium.launch();
const page = await browser.newPage();

async function shot(html, width, height, out, { transparent = true } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.screenshot({
    omitBackground: transparent,
    clip: { x: 0, y: 0, width, height },
  });
  writeFileSync(out, buf);
  console.log('wrote', path.basename(out), buf.length, 'bytes');
}

// favicon-32 — transparent corners around the self-contained dark rounded mark
await shot(
  `<!doctype html><html><body style="margin:0;background:transparent">${sized(32)}</body></html>`,
  32,
  32,
  path.join(PUB, 'favicon-32.png')
);

// apple-touch — iOS wants a FILLED 180 icon; dark tile + centered mark
await shot(
  `<!doctype html><html><body style="margin:0;background:#05060A">
    <div style="width:180px;height:180px;background:#0A0C12;display:grid;place-items:center">${sized(126)}</div>
  </body></html>`,
  180,
  180,
  path.join(PUB, 'apple-touch-icon.png'),
  { transparent: false }
);

// OG card 1200×630
await shot(
  `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;background:radial-gradient(circle at 28% 26%,#0c1526,#05060A 68%);display:flex;flex-direction:column;justify-content:center;padding:0 92px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff">
      <div style="display:flex;align-items:center;gap:22px;margin-bottom:34px">
        ${sized(84)}
        <span style="font-size:52px;font-weight:800;letter-spacing:-1px">deskl<span style="color:#00E5FF">.ink</span></span>
      </div>
      <div style="font-size:72px;font-weight:800;line-height:1.05;letter-spacing:-2px">A desktop for you.<br><span style="background:linear-gradient(90deg,#00E5FF,#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent">A computer for your AI.</span></div>
      <div style="font-size:29px;color:#9fb0c3;margin-top:32px;max-width:920px">Instantly available, browser-accessible Linux workstations — operable by you and your AI agents.</div>
    </div>
  </body></html>`,
  1200,
  630,
  path.join(PUB, 'og.png'),
  { transparent: false }
);

await browser.close();
