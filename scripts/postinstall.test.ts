import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
