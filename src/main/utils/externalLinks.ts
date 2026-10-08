import { shell, type BrowserWindow } from 'electron';
import { APP_ORIGIN } from '@main/app/protocol';
import { log } from '@main/lib/logger';

function parseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isHttp(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Ensure any external HTTP(S) links open in the user's default browser
 * rather than inside the Electron window. Keeps app navigation scoped
 * to our renderer while preserving expected link behavior.
 */
export function registerExternalLinkHandlers(win: BrowserWindow, isDev: boolean) {
  const wc = win.webContents;
  const renderer = parseUrl(isDev ? process.env.ELECTRON_RENDERER_URL : APP_ORIGIN);

  const isInternalAppUrl = (url: URL) => {
    if (!renderer || url.username || url.password) return false;
    if (isDev) return isHttp(renderer) && isHttp(url) && url.origin === renderer.origin;
    // Custom schemes have a null WHATWG origin, so compare their protocol and host.
    return url.protocol === renderer.protocol && url.host === renderer.host;
  };

  const openInBrowser = (url: string, parsed: URL | undefined) => {
    if (parsed && isHttp(parsed)) {
      void shell.openExternal(url).catch((error: unknown) => {
        log.error('Failed to open external link', error);
      });
    }
  };

  // Handle window.open and target="_blank"
  wc.setWindowOpenHandler(({ url }) => {
    const parsed = parseUrl(url);
    if (parsed && isInternalAppUrl(parsed)) return { action: 'allow' };
    openInBrowser(url, parsed);
    return { action: 'deny' };
  });

  // Intercept navigations that would leave the app
  wc.on('will-navigate', (event, url) => {
    const parsed = parseUrl(url);
    if (parsed && isInternalAppUrl(parsed)) return;
    event.preventDefault();
    openInBrowser(url, parsed);
  });
}
