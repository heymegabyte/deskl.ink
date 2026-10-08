import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME_LOWER } from '@shared/app-identity';
import { registerExternalLinkHandlers } from './externalLinks';

const { openExternal, logError } = vi.hoisted(() => ({ openExternal: vi.fn(), logError: vi.fn() }));
vi.mock('electron', () => ({ shell: { openExternal } }));
vi.mock('@main/lib/logger', () => ({ log: { error: logError } }));

function handlers(isDev: boolean) {
  const setWindowOpenHandler = vi.fn();
  const on = vi.fn();
  const win = { webContents: { setWindowOpenHandler, on } } as unknown as BrowserWindow;
  registerExternalLinkHandlers(win, isDev);
  const popup = setWindowOpenHandler.mock.calls[0][0] as (details: { url: string }) => {
    action: string;
  };
  const navigate = on.mock.calls[0][1] as (
    event: { preventDefault: () => void },
    url: string
  ) => void;
  return { popup, navigate };
}

describe('external link handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openExternal.mockResolvedValue(undefined);
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:3000');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    'http://localhost:3000@evil.example/path',
    'http://localhost:30001/path',
    'http://localhost.evil.example:3000/path',
    'https://localhost:3000/path',
    'http://127.0.0.1:3000/path',
    'https://example.com/path',
  ])('routes a different origin to the browser: %s', (url) => {
    const { popup, navigate } = handlers(true);
    expect(popup({ url })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith(url);
    openExternal.mockClear();
    const preventDefault = vi.fn();
    navigate({ preventDefault }, url);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each(['http://localhost:3000/tasks?q=one#details', 'HTTP://LOCALHOST:3000/'])(
    'preserves same-origin renderer navigation: %s',
    (url) => {
      vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:3000/index.html');
      const { popup, navigate } = handlers(true);
      expect(popup({ url })).toEqual({ action: 'allow' });
      const preventDefault = vi.fn();
      navigate({ preventDefault }, url);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, 'invalid', 'app://renderer'])(
    'fails closed for HTTP navigation with unusable renderer config: %s',
    (rendererUrl) => {
      vi.stubEnv('ELECTRON_RENDERER_URL', rendererUrl);
      expect(handlers(true).popup({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    }
  );

  it.each(['http://localhost:3000/', 'http://127.0.0.1:8080/', 'https://example.com/'])(
    'opens HTTP links externally in production: %s',
    (url) => {
      const { popup, navigate } = handlers(false);
      expect(popup({ url })).toEqual({ action: 'deny' });
      const preventDefault = vi.fn();
      navigate({ preventDefault }, url);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(openExternal).toHaveBeenCalledWith(url);
    }
  );

  it('preserves the production app protocol without sending it to the OS browser', () => {
    const url = `app://${APP_NAME_LOWER}/index.html#tasks`;
    const { popup, navigate } = handlers(false);
    expect(popup({ url })).toEqual({ action: 'allow' });
    const preventDefault = vi.fn();
    navigate({ preventDefault }, url);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it.each([
    'invalid',
    'http://localhost:3000.evil.example/path',
    'file:///tmp/index.html',
    'javascript:alert(1)',
    'data:text/html,hello',
    'mailto:person@example.com',
    'app://evil.example/index.html',
    `app://${APP_NAME_LOWER}:123/index.html`,
    `app://user@${APP_NAME_LOWER}/index.html`,
  ])('blocks unsupported production destinations without opening them: %s', (url) => {
    const { popup, navigate } = handlers(false);
    expect(popup({ url })).toEqual({ action: 'deny' });
    const preventDefault = vi.fn();
    navigate({ preventDefault }, url);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('does not trust credentials even on the development renderer origin', () => {
    expect(handlers(true).popup({ url: 'http://user:password@localhost:3000/' })).toEqual({
      action: 'deny',
    });
  });

  it('prevents navigation before dispatching the external URL', () => {
    const preventDefault = vi.fn();
    openExternal.mockImplementationOnce(() => {
      expect(preventDefault).toHaveBeenCalledOnce();
      return Promise.resolve();
    });
    handlers(true).navigate({ preventDefault }, 'https://example.com/');
  });

  it('reports browser launch failures without an unhandled rejection', async () => {
    const error = new Error('Browser unavailable');
    openExternal.mockRejectedValueOnce(error);
    expect(handlers(true).popup({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    await vi.waitFor(() =>
      expect(logError).toHaveBeenCalledWith('Failed to open external link', error)
    );
  });
});
