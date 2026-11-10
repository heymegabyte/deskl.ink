import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run native modules under Electron's Node ABI, not the system-Node DB test alias.
// No app bootstrap, display, persisted database, or user configuration is involved.
async function checkNativeModules() {
  assert.ok(process.versions.electron, 'Native checks must run inside Electron');
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE smoke (value TEXT NOT NULL)');
    db.transaction(() => db.prepare('INSERT INTO smoke VALUES (?)').run('native-sqlite'))();
    assert.deepEqual(db.prepare('SELECT value FROM smoke').get(), { value: 'native-sqlite' });
    console.log('PASS: Electron SQLite load, transaction and read');
  } finally {
    db.close();
  }

  const { spawn } = await import('node-pty');
  await new Promise((resolve, reject) => {
    const terminal = spawn(
      process.execPath,
      [
        '-e',
        "process.stdin.once('data', data => { process.stdout.write('received:' + data.toString().trim()); process.exit(0); });",
      ],
      { cols: 80, rows: 24, cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    );
    let output = '';
    const timer = setTimeout(() => {
      terminal.kill();
      reject(new Error('PTY input/output timed out after 10 seconds'));
    }, 10_000);
    terminal.onData((data) => {
      output += data;
    });
    terminal.onExit(({ exitCode, signal }) => {
      clearTimeout(timer);
      try {
        assert.equal(exitCode, 0, 'PTY child must exit successfully');
        assert.ok(!signal, 'PTY child must exit without a signal');
        assert.ok(output.includes('received:native-smoke-input'), 'PTY child must receive input');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    terminal.write('native-smoke-input\r');
  });
  console.log('PASS: Electron PTY load, child process, input/output and exit');
  console.log(
    'Native smoke passed; Electron UI, preload and application journeys remain unverified.'
  );
}

try {
  if (process.argv[2] === '--electron-child') {
    await checkNativeModules();
  } else {
    const { default: electron } = await import('electron');
    const result = spawnSync(electron, [fileURLToPath(import.meta.url), '--electron-child'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
      timeout: 20_000,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error('Native smoke failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
