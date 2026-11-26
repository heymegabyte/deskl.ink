import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const postinstall = fileURLToPath(new URL('./postinstall.ts', import.meta.url));

test.skipIf(process.platform === 'win32').each([
  { name: 'successful npm', command: 'exit 0', status: 0 },
  { name: 'failing npm', command: 'exit 42', status: 42 },
  {
    name: 'terminated npm',
    command: 'kill -TERM $$',
    status: 1,
    diagnostic: 'terminated by SIGTERM',
  },
  {
    name: 'missing npm',
    status: 1,
    diagnostic: 'failed to run npm install for tooling/node-deps',
  },
])('propagates the tooling install result in CI ($name)', ({ command, status, diagnostic }) => {
  const directory = mkdtempSync(join(tmpdir(), 'emdash-postinstall-'));
  try {
    if (command !== undefined) {
      writeFileSync(join(directory, 'npm'), `#!/bin/sh\n${command}\n`, { mode: 0o700 });
    }

    const result = spawnSync(process.execPath, ['--experimental-strip-types', postinstall], {
      encoding: 'utf8',
      env: { ...process.env, CI: '1', PATH: directory },
      timeout: 10_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(status);
    if (diagnostic) expect(result.stderr).toContain(diagnostic);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.skipIf(process.platform === 'win32').each([
  { name: 'local install', modules: 'better-sqlite3,node-pty' },
  { name: 'failed tooling install', toolingExit: 42, status: 42 },
  {
    name: 'failed Electron rebuild',
    rebuildExit: 43,
    modules: 'better-sqlite3,node-pty',
    status: 43,
  },
  { name: 'CI install', ci: '1' },
  { name: 'explicit skip', skipRebuild: '1' },
  { name: 'native database disabled', disableNativeDb: '1', modules: 'node-pty' },
  { name: 'PTY disabled', disablePty: '1', modules: 'better-sqlite3' },
  { name: 'both native modules disabled', disableNativeDb: '1', disablePty: '1' },
])(
  'checks command order and exit status when installing locally or in CI ($name)',
  ({
    ci = '',
    skipRebuild = '',
    disableNativeDb = '',
    disablePty = '',
    toolingExit = 0,
    rebuildExit = 0,
    modules,
    status = 0,
  }) => {
    const directory = mkdtempSync(join(tmpdir(), 'emdash-postinstall-'));
    try {
      const scriptDirectory = join(directory, 'scripts');
      const binDirectory = join(directory, 'node_modules', '.bin');
      mkdirSync(scriptDirectory);
      mkdirSync(binDirectory, { recursive: true });
      const script = join(scriptDirectory, 'postinstall.ts');
      copyFileSync(postinstall, script);
      writeFileSync(
        join(directory, 'npm'),
        `#!/bin/sh\nprintf "npm %s\\n" "$*"\nexit ${toolingExit}\n`,
        { mode: 0o700 }
      );
      writeFileSync(
        join(binDirectory, 'electron-rebuild'),
        `#!/bin/sh\nprintf "electron-rebuild %s\\n" "$*"\nexit ${rebuildExit}\n`,
        { mode: 0o700 }
      );

      const result = spawnSync(process.execPath, ['--experimental-strip-types', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: ci,
          EMDASH_SKIP_ELECTRON_REBUILD: skipRebuild,
          EMDASH_DISABLE_NATIVE_DB: disableNativeDb,
          EMDASH_DISABLE_PTY: disablePty,
          PATH: directory,
        },
        timeout: 10_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(status);
      const expectedOutput = ['npm install --prefix tooling/node-deps'];
      if (modules) expectedOutput.push(`electron-rebuild -f --only ${modules}`);
      expect(result.stdout.trim().split('\n')).toEqual(expectedOutput);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);
