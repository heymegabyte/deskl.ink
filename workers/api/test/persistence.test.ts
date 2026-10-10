/**
 * Unit tests for DURABLE PERSISTENCE (P0 "never destroy user work") — the PURE core in
 * `persistence/homeBackup.ts`, proven WITHOUT the Workers runtime (node pool, like
 * session-coordinator.test.ts). The Durable Object is a thin adapter over these functions
 * (guard on BACKUPS being bound → delegate with `this.env.BACKUPS` + `this.containerFetch`), so
 * proving the helper + the adapter's ordering/guard here proves the behavior the DO exposes.
 *
 * Collaborators are faked at their injected seams:
 *   - a Map-backed R2 bucket (put/get, with a stored object exposing `body` + `json()`), and
 *   - a `containerFetch(request, port)` standing in for the DO's loopback call to the in-container
 *     backup service on port 7070.
 *
 * Coverage: snapshotHome puts a tar + writes latest.json; restoreHome reads latest + POSTs /restore;
 * stopWithCheckpoint snapshots BEFORE stop (ordering); graceful capability_gap when the backup
 * service is unreachable; graceful no-op when BACKUPS is unbound.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BACKUP_CONTAINER_PORT,
  SNAPSHOT_RETENTION,
  manifestKey,
  restoreHome,
  snapshotHome,
  snapshotKey,
  type ContainerBackupFetch,
  type HomeBackupBucket,
  type HomeBackupDeps,
  type HomeBackupObject,
} from '../src/persistence/homeBackup.js';
import { persistenceAvailable } from '../src/persistence/backend.js';
import type { RestoreResult, SnapshotManifest, SnapshotResult } from '@deskl/shared';

const DESKTOP_ID = 'desk-123';
const FIXED_NOW = () => new Date('2026-10-09T12:00:00.000Z');
/** Deterministic key suffix so a test asserting the exact key isn't fighting `randomUUID()`. */
const FIXED_SUFFIX = () => 'aabbccdd';
const EXPECTED_TAR_KEY = snapshotKey(DESKTOP_ID, '2026-10-09T12:00:00.000Z', 'aabbccdd');

/**
 * One stored object in the fake bucket. R2 is DURABLE + re-readable, so the fake buffers every value
 * to bytes on `put` (draining a streamed body just like R2 would) — then `get` can re-stream it any
 * number of times. `text` keeps a string value verbatim so `json()` round-trips exactly.
 */
interface StoredEntry {
  bytes: Uint8Array;
  text?: string;
  contentType?: string;
}

/**
 * A Map-backed fake `R2Bucket` (the `put`/`get`/`list`/`delete` slice the helper uses). `put` reports
 * the stored size (so the manifest's `bytes` is assertable) and buffers the value durably; `get`
 * returns an object whose `size` + re-streamable `body` + `json()` mirror R2ObjectBody's durable,
 * independently-readable nature, honoring an optional 2-byte `range` (the integrity sniff); `list`
 * enumerates keys by prefix; `delete` removes a key — each behind a spy so ordering + retention are
 * assertable.
 */
function fakeBucket(): HomeBackupBucket & {
  store: Map<string, StoredEntry>;
  putSpy: ReturnType<typeof vi.fn>;
  deleteSpy: ReturnType<typeof vi.fn>;
  listSpy: ReturnType<typeof vi.fn>;
  /** The underlying buffering put, callable WITHOUT going through the spy (so a test can wrap the
   *  spy to observe ordering while still persisting durably — no recursion). */
  bufferingPut: HomeBackupBucket['put'];
} {
  const store = new Map<string, StoredEntry>();
  const bufferingPut: HomeBackupBucket['put'] = async (key, value, options) => {
    const { bytes, text } = await drain(value);
    store.set(key, { bytes, text, contentType: options?.httpMetadata?.contentType });
    return { size: bytes.byteLength };
  };
  const putSpy = vi.fn(bufferingPut);
  const get: HomeBackupBucket['get'] = async (key, options) => {
    const entry = store.get(key);
    if (!entry) return null;
    // Honor a 2-byte range read exactly as R2 would (the integrity check sniffs the gzip magic).
    const sliced = options?.range
      ? entry.bytes.subarray(options.range.offset, options.range.offset + options.range.length)
      : entry.bytes;
    return {
      size: entry.bytes.byteLength,
      body: bytesToStream(sliced),
      json: async <T,>() => JSON.parse(entry.text ?? new TextDecoder().decode(entry.bytes)) as T,
    } satisfies HomeBackupObject;
  };
  const listSpy = vi.fn<HomeBackupBucket['list']>(async (options) => {
    const prefix = options?.prefix ?? '';
    const objects = [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key }));
    return { objects };
  });
  const deleteSpy = vi.fn<HomeBackupBucket['delete']>(async (key) => {
    store.delete(key);
  });
  // Multipart upload — mirrors R2: parts buffered by number, `complete` concatenates them IN ORDER
  // into ONE durable object under `key` (so the integrity `get` + restore read it back exactly); an
  // `abort` drops the buffered parts. This is the path the length-unknown tar stream MUST take (a bare
  // ReadableStream can't go through `put` — R2 throws "must have a known length").
  const createMultipartUpload: HomeBackupBucket['createMultipartUpload'] = async (key, options) => {
    const byNum = new Map<number, Uint8Array>();
    return {
      uploadPart: async (partNumber, value) => {
        const { bytes } = await drain(value);
        byNum.set(partNumber, bytes);
        return { partNumber, etag: `etag-${partNumber}` };
      },
      complete: async (uploaded) => {
        const ordered = [...uploaded]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => byNum.get(p.partNumber) ?? new Uint8Array());
        const total = ordered.reduce((n, b) => n + b.byteLength, 0);
        const buf = new Uint8Array(total);
        let off = 0;
        for (const b of ordered) {
          buf.set(b, off);
          off += b.byteLength;
        }
        store.set(key, { bytes: buf, contentType: options?.httpMetadata?.contentType });
        return { size: buf.byteLength };
      },
      abort: async () => {
        byNum.clear();
      },
    };
  };
  return {
    put: putSpy,
    get,
    list: listSpy,
    delete: deleteSpy,
    createMultipartUpload,
    store,
    putSpy,
    deleteSpy,
    listSpy,
    bufferingPut,
  };
}

/** Buffer any R2 put value to bytes (draining a ReadableStream), keeping a string verbatim as `text`. */
async function drain(
  value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null
): Promise<{ bytes: Uint8Array; text?: string }> {
  if (value === null) return { bytes: new Uint8Array() };
  if (typeof value === 'string') return { bytes: new TextEncoder().encode(value), text: value };
  if (value instanceof ArrayBuffer) return { bytes: new Uint8Array(value) };
  if (ArrayBuffer.isView(value)) {
    return { bytes: new Uint8Array(value.buffer, value.byteOffset, value.byteLength) };
  }
  // ReadableStream — read to completion, concatenating chunks.
  const reader = value.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    chunks.push(chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk)));
  }
  const total = chunks.reduce((n, ch) => n + ch.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return { bytes: out };
}

/** Re-stream buffered bytes as a one-chunk ReadableStream (what R2ObjectBody.body would be). */
function bytesToStream(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Byte length of the fake `/backup` tar. > 20 so it clears the snapshot integrity floor
 * (MIN_GZIP_BYTES) — a realistic gzip is never 4 bytes; a 4-byte body is exactly the truncated case
 * the integrity gate must REJECT (asserted separately below).
 */
const TAR_BYTES = 32;

/** A fresh, plausibly-sized gzip-tar stream standing in for the in-container `/backup` response body. */
function tarStream(): ReadableStream {
  const buf = new Uint8Array(TAR_BYTES);
  buf[0] = 0x1f; // gzip magic ID1
  buf[1] = 0x8b; // gzip magic ID2
  buf[2] = 0x08; // deflate
  return bytesToStream(buf);
}

/** A stream whose body is too short / not gzip — the corrupt-archive case the integrity gate rejects. */
function notGzipStream(bytes: Uint8Array): ReadableStream {
  return bytesToStream(bytes);
}

describe('homeBackup.snapshotHome — capture /home to R2', () => {
  it('puts a gzip tar under a timestamped key AND writes a latest.json manifest pointer', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(async (req, port) => {
      expect(req.url).toBe('http://c/backup');
      expect(port).toBe(BACKUP_CONTAINER_PORT);
      return new Response(tarStream(), { status: 200 });
    });

    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Manifest points at the timestamped+suffixed tar, carries the desktop id, and the R2-reported
    // size (the drained tar body is TAR_BYTES — the plausibly-sized gzip the fake /backup emits).
    expect(result.manifest).toEqual<SnapshotManifest>({
      desktopId: DESKTOP_ID,
      key: EXPECTED_TAR_KEY,
      createdAt: '2026-10-09T12:00:00.000Z',
      bytes: TAR_BYTES,
    });

    // The tar object was stored as application/gzip.
    const tar = bucket.store.get(EXPECTED_TAR_KEY);
    expect(tar?.contentType).toBe('application/gzip');

    // latest.json was written as the manifest JSON (restore reads this pointer).
    const pointer = bucket.store.get(manifestKey(DESKTOP_ID));
    expect(pointer?.contentType).toBe('application/json');
    expect(JSON.parse(pointer?.text ?? '')).toEqual(result.manifest);

    // The tar goes up via MULTIPART (a length-unknown `tar -czf -` stream can't use `put` — R2 throws
    // "must have a known length"), so `put` is called EXACTLY ONCE: the small, known-length pointer.
    expect(bucket.putSpy).toHaveBeenCalledTimes(1);
    expect(bucket.putSpy.mock.calls[0]?.[0]).toBe(manifestKey(DESKTOP_ID));
  });

  it('returns an HONEST capability_gap (no throw, no put) when the backup service is unreachable', async () => {
    const bucket = fakeBucket();
    // The container is down → containerFetch rejects. Must NOT crash; must NOT write anything.
    const containerFetch = vi.fn<ContainerBackupFetch>(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW);

    expect(result).toEqual({
      ok: false,
      kind: 'capability_gap',
      reason: 'backup service unreachable',
    });
    expect(bucket.putSpy).not.toHaveBeenCalled();
  });

  it('returns capability_gap when the backup service answers non-2xx (or no body)', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response('boom', { status: 503 })
    );

    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW);
    expect(result).toEqual({
      ok: false,
      kind: 'capability_gap',
      reason: 'backup service unreachable',
    });
    expect(bucket.putSpy).not.toHaveBeenCalled();
  });
});

describe('homeBackup.restoreHome — restore the latest /home snapshot', () => {
  it('reads latest.json then POSTs the pointed-at tar to /restore', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    // Seed a prior snapshot (tar + pointer) exactly as snapshotHome would have left it.
    await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);
    containerFetch.mockClear();

    const result = await restoreHome({ bucket, containerFetch }, DESKTOP_ID);

    expect(result).toEqual({ ok: true, restoredKey: EXPECTED_TAR_KEY });
    // The restore call targets POST /restore on the backup port.
    expect(containerFetch).toHaveBeenCalledTimes(1);
    const [req, port] = containerFetch.mock.calls[0]!;
    expect(req.url).toBe('http://c/restore');
    expect(req.method).toBe('POST');
    expect(port).toBe(BACKUP_CONTAINER_PORT);
  });

  it('returns error/no_backup when nothing has been snapshotted (no POST attempted)', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(async () => new Response(null));

    const result = await restoreHome({ bucket, containerFetch }, DESKTOP_ID);

    expect(result).toEqual({ ok: false, kind: 'error', reason: 'no_backup' });
    expect(containerFetch).not.toHaveBeenCalled();
  });

  it('returns capability_gap when the restore service is unreachable', async () => {
    const bucket = fakeBucket();
    const okFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    await snapshotHome({ bucket, containerFetch: okFetch }, DESKTOP_ID, FIXED_NOW);

    const downFetch = vi.fn<ContainerBackupFetch>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await restoreHome({ bucket, containerFetch: downFetch }, DESKTOP_ID);
    expect(result).toEqual({
      ok: false,
      kind: 'capability_gap',
      reason: 'restore service unreachable',
    });
  });
});

/**
 * stopWithCheckpoint is a DO method, but its CORE invariant (snapshot BEFORE stop; the stop always
 * proceeds; carry the checkpoint result) is pure composition over `snapshotHome`. This fake adapter
 * mirrors the DO's exact logic so the ordering + the unbound-R2 guard are provable without the
 * Workers runtime. `deps === null` models `this.env.BACKUPS` being undefined.
 */
async function stopWithCheckpointAdapter(
  deps: HomeBackupDeps | null,
  stop: () => Promise<void>,
  desktopId: string,
  now = FIXED_NOW
): Promise<{ stopped: true; checkpoint: SnapshotResult }> {
  const checkpoint: SnapshotResult = deps
    ? await snapshotHome(deps, desktopId, now)
    : { ok: false, kind: 'capability_gap', reason: 'persistence not configured' };
  await stop();
  return { stopped: true, checkpoint };
}

describe('stopWithCheckpoint — checkpoint-before-stop ordering (P0)', () => {
  it('snapshots BEFORE stopping, and reports the checkpoint', async () => {
    const order: string[] = [];
    const bucket = fakeBucket();
    // Record WHEN the tar lands durably in R2 — the point the stop must come strictly after. The tar
    // is a multipart upload, so wrap `createMultipartUpload` to push the marker on `complete`,
    // delegating to the real fake (which stores the object). `complete` = the tar is durable.
    const realMpu = bucket.createMultipartUpload;
    bucket.createMultipartUpload = async (key, options) => {
      const up = await realMpu(key, options);
      return {
        uploadPart: up.uploadPart,
        abort: up.abort,
        complete: async (parts) => {
          const r = await up.complete(parts);
          order.push('snapshot:put-tar');
          return r;
        },
      };
    };
    const containerFetch = vi.fn<ContainerBackupFetch>(async () => {
      order.push('snapshot:fetch-backup');
      return new Response(tarStream(), { status: 200 });
    });
    const stop = vi.fn(async () => {
      order.push('stop');
    });

    const result = await stopWithCheckpointAdapter({ bucket, containerFetch }, stop, DESKTOP_ID);

    expect(result.stopped).toBe(true);
    expect(result.checkpoint.ok).toBe(true);
    // The stop MUST come strictly after the backup was fetched AND stored to R2.
    expect(order).toEqual(['snapshot:fetch-backup', 'snapshot:put-tar', 'stop']);
    expect(order.indexOf('stop')).toBeGreaterThan(order.indexOf('snapshot:put-tar'));
  });

  it('still stops (reporting a capability_gap) when the backup service is unreachable', async () => {
    const order: string[] = [];
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const stop = vi.fn(async () => {
      order.push('stop');
    });

    const result = await stopWithCheckpointAdapter({ bucket, containerFetch }, stop, DESKTOP_ID);

    // The stop proceeded even though nothing durable was captured — a stop must never wedge.
    expect(stop).toHaveBeenCalledOnce();
    expect(order).toEqual(['stop']);
    expect(result).toEqual({
      stopped: true,
      checkpoint: { ok: false, kind: 'capability_gap', reason: 'backup service unreachable' },
    });
  });

  it('is a plain stop (no crash, capability_gap) when BACKUPS is unbound', async () => {
    const stop = vi.fn(async () => {});
    const result = await stopWithCheckpointAdapter(null, stop, DESKTOP_ID);

    expect(stop).toHaveBeenCalledOnce();
    expect(result).toEqual({
      stopped: true,
      checkpoint: { ok: false, kind: 'capability_gap', reason: 'persistence not configured' },
    });
  });
});

describe('durable-persistence guards — BACKUPS unbound', () => {
  it('snapshot/restore report capability_gap "persistence not configured" when R2 is absent', async () => {
    // Mirror the DO's `backupDeps()` guard: no bucket → deps is null → a typed capability_gap, never
    // a dereference of an undefined binding. (Proven at the adapter layer the DO shares.)
    const bucketless: HomeBackupDeps | null = null;

    const snap: SnapshotResult = bucketless
      ? await snapshotHome(bucketless, DESKTOP_ID)
      : { ok: false, kind: 'capability_gap', reason: 'persistence not configured' };
    expect(snap).toEqual({
      ok: false,
      kind: 'capability_gap',
      reason: 'persistence not configured',
    });
  });
});

// ---------------------------------------------------------------------------
// Adversarial-review hardening (P1 unique keys · P1 retention · P2 integrity · P1 restore ordering).
// ---------------------------------------------------------------------------

describe('snapshotHome — unique keys (P1: no same-ms collision)', () => {
  it('two snapshots at the SAME instant produce DISTINCT tar keys (no overwrite)', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );

    // Same clock for BOTH snapshots (identical ISO timestamp) but distinct random suffixes — the
    // exact race the fix closes: without the suffix both keys would be identical and the second put
    // would overwrite the first tar while latest.json churned.
    const a = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, () => 'aaaaaaaa');
    const b = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, () => 'bbbbbbbb');

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.manifest.key).not.toBe(b.manifest.key);
    // Both tar objects survive independently (neither overwrote the other).
    expect(bucket.store.has(a.manifest.key)).toBe(true);
    expect(bucket.store.has(b.manifest.key)).toBe(true);
    // The pointer now names the SECOND snapshot (last write wins for latest.json only).
    const pointer = bucket.store.get(manifestKey(DESKTOP_ID));
    expect(JSON.parse(pointer?.text ?? '').key).toBe(b.manifest.key);
  });
});

describe('snapshotHome — retention (P1: keep newest N, best-effort)', () => {
  it(`keeps the newest ${SNAPSHOT_RETENTION} tars + latest.json, deleting older ones`, async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );

    // Take N+3 snapshots at strictly-increasing timestamps (keys sort chronologically). After each,
    // retention should cap the stored tars at N.
    const total = SNAPSHOT_RETENTION + 3;
    const keys: string[] = [];
    for (let i = 0; i < total; i++) {
      const iso = `2026-10-09T12:00:${String(i).padStart(2, '0')}.000Z`;
      const res = await snapshotHome(
        { bucket, containerFetch },
        DESKTOP_ID,
        () => new Date(iso),
        () => `s${String(i).padStart(7, '0')}`
      );
      expect(res.ok).toBe(true);
      if (res.ok) keys.push(res.manifest.key);
    }

    const storedTars = [...bucket.store.keys()].filter((k) => k.endsWith('.tar.gz')).sort();
    // Exactly the newest N tars remain.
    expect(storedTars).toHaveLength(SNAPSHOT_RETENTION);
    expect(storedTars).toEqual(keys.slice(-SNAPSHOT_RETENTION).sort());
    // The oldest ones were deleted.
    for (const old of keys.slice(0, total - SNAPSHOT_RETENTION)) {
      expect(bucket.store.has(old)).toBe(false);
    }
    // latest.json is NEVER a deletion target and still points at the final snapshot.
    const pointer = bucket.store.get(manifestKey(DESKTOP_ID));
    expect(pointer).toBeDefined();
    expect(JSON.parse(pointer?.text ?? '').key).toBe(keys.at(-1));
    expect(bucket.deleteSpy.mock.calls.every(([k]) => String(k).endsWith('.tar.gz'))).toBe(true);
  });

  it('a delete failure during retention does NOT fail the snapshot', async () => {
    const bucket = fakeBucket();
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    // Seed N+1 tars so the next snapshot must prune one — then make delete throw.
    for (let i = 0; i <= SNAPSHOT_RETENTION; i++) {
      await snapshotHome(
        { bucket, containerFetch },
        DESKTOP_ID,
        () => new Date(`2026-10-09T12:00:${String(i).padStart(2, '0')}.000Z`),
        () => `s${String(i).padStart(7, '0')}`
      );
    }
    bucket.deleteSpy.mockRejectedValue(new Error('R2 delete 500'));

    const res = await snapshotHome(
      { bucket, containerFetch },
      DESKTOP_ID,
      () => new Date('2026-10-09T12:00:59.000Z'),
      () => 'sfinal00'
    );

    // The snapshot still succeeds + latest.json advanced despite the prune failure (best-effort).
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(JSON.parse(bucket.store.get(manifestKey(DESKTOP_ID))?.text ?? '').key).toBe(
      res.manifest.key
    );
  });
});

describe('snapshotHome — integrity gate (P2: never point latest at a corrupt archive)', () => {
  it('rejects a NON-GZIP stored object (wrong magic) → error/snapshot_integrity, latest.json untouched', async () => {
    const bucket = fakeBucket();
    // Seed a prior GOOD snapshot so we can prove latest.json is left pointing at IT after a bad one.
    const good = vi.fn<ContainerBackupFetch>(async () => new Response(tarStream(), { status: 200 }));
    const first = await snapshotHome({ bucket, containerFetch: good }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);
    expect(first.ok).toBe(true);
    const pointerBefore = bucket.store.get(manifestKey(DESKTOP_ID))?.text;

    // Now the backup service returns a large-enough but NON-gzip body (first bytes aren't 1f 8b).
    const corrupt = new Uint8Array(TAR_BYTES).fill(0x41); // 'A'*32 — passes size, fails magic.
    const badFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(notGzipStream(corrupt), { status: 200 })
    );
    const result = await snapshotHome(
      { bucket, containerFetch: badFetch },
      DESKTOP_ID,
      () => new Date('2026-10-09T13:00:00.000Z'),
      () => 'deadbeef'
    );

    expect(result).toEqual({ ok: false, kind: 'error', reason: 'snapshot_integrity' });
    // latest.json STILL points at the first (good) snapshot — never advanced to the corrupt tar.
    expect(bucket.store.get(manifestKey(DESKTOP_ID))?.text).toBe(pointerBefore);
  });

  it('rejects a TOO-SHORT stored object (≤ 20 bytes) even with valid magic', async () => {
    const bucket = fakeBucket();
    // 4-byte body: valid gzip magic but implausibly short (the old default). Must be rejected.
    const tiny = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(notGzipStream(tiny), { status: 200 })
    );

    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);

    expect(result).toEqual({ ok: false, kind: 'error', reason: 'snapshot_integrity' });
    // No pointer was ever written (this was the first, failed, snapshot).
    expect(bucket.store.get(manifestKey(DESKTOP_ID))).toBeUndefined();
  });
});

/**
 * The `/restore` ROUTE orchestrates stop → restoreHome → start so the tar never untars into a LIVE
 * /home. Mirror that composition over the pure `restoreHome` here (same pattern as the
 * stopWithCheckpoint adapter) so the ordering invariant is provable without the Workers runtime: the
 * container MUST be stopped BEFORE the `/restore` POST is sent.
 */
async function restoreWithStopAdapter(
  deps: HomeBackupDeps,
  stop: () => Promise<void>,
  start: () => Promise<void>,
  desktopId: string
): Promise<RestoreResult> {
  await stop();
  try {
    return await restoreHome(deps, desktopId);
  } finally {
    await start();
  }
}

describe('restore ordering (P1: stop BEFORE the /restore POST, start after)', () => {
  it('stops the container strictly before POSTing the restore tar, then restarts', async () => {
    const order: string[] = [];
    const bucket = fakeBucket();
    const seedFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    // Seed a snapshot to restore.
    await snapshotHome({ bucket, containerFetch: seedFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);

    const containerFetch = vi.fn<ContainerBackupFetch>(async (req) => {
      if (req.url === 'http://c/restore') order.push('restore:post');
      return new Response(tarStream(), { status: 200 });
    });
    const stop = vi.fn(async () => {
      order.push('stop');
    });
    const start = vi.fn(async () => {
      order.push('start');
    });

    const result = await restoreWithStopAdapter({ bucket, containerFetch }, stop, start, DESKTOP_ID);

    expect(result).toEqual({ ok: true, restoredKey: EXPECTED_TAR_KEY });
    // The POST to /restore MUST come strictly after the stop (never untar a live /home), and the
    // container is restarted afterward.
    expect(order).toEqual(['stop', 'restore:post', 'start']);
    expect(order.indexOf('restore:post')).toBeGreaterThan(order.indexOf('stop'));
  });

  it('still RESTARTS the container even when the restore reports no_backup', async () => {
    const order: string[] = [];
    const bucket = fakeBucket(); // empty — nothing to restore.
    const containerFetch = vi.fn<ContainerBackupFetch>(async () => new Response(null));
    const stop = vi.fn(async () => {
      order.push('stop');
    });
    const start = vi.fn(async () => {
      order.push('start');
    });

    const result = await restoreWithStopAdapter({ bucket, containerFetch }, stop, start, DESKTOP_ID);

    expect(result).toEqual({ ok: false, kind: 'error', reason: 'no_backup' });
    // Even on a failed restore the desktop is never left stopped: stop then start still ran.
    expect(order).toEqual(['stop', 'start']);
    expect(containerFetch).not.toHaveBeenCalled(); // no_backup → no /restore POST attempted
  });
});

describe('persistenceAvailable — compute-backend gate (P1: no snapshot/restore vs a shadow /home)', () => {
  it('is AVAILABLE on the default fleet backend (COMPUTER_DO unset or not "1")', () => {
    expect(persistenceAvailable({})).toBe(true);
    expect(persistenceAvailable({ COMPUTER_DO: '0' })).toBe(true);
    expect(persistenceAvailable({ COMPUTER_DO: 'false' })).toBe(true);
  });

  it('is UNAVAILABLE under COMPUTER_DO=1 (Computer DO has no backup service yet → honest gap)', () => {
    // The guard that turns the adversarial-review finding 2a from a latent data-loss-on-flag-flip
    // into an honest capability_gap: when the live backend is the Computer DO, persistence must NOT
    // target a shadow DesktopContainer.
    expect(persistenceAvailable({ COMPUTER_DO: '1' })).toBe(false);
  });
});

describe('snapshotHome — multipart tar upload (regression: R2 rejects a length-unknown put)', () => {
  it('uploads the tar via createMultipartUpload (uploadPart→complete), NOT put', async () => {
    const bucket = fakeBucket();
    const calls = { mpu: 0, parts: 0, completes: 0 };
    const realMpu = bucket.createMultipartUpload;
    bucket.createMultipartUpload = async (key, options) => {
      calls.mpu++;
      const up = await realMpu(key, options);
      return {
        uploadPart: async (n, v) => {
          calls.parts++;
          return up.uploadPart(n, v);
        },
        complete: async (p) => {
          calls.completes++;
          return up.complete(p);
        },
        abort: up.abort,
      };
    };
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);
    expect(result.ok).toBe(true);
    // One small (< part-size) tar → exactly one part, one complete, one multipart session.
    expect(calls).toEqual({ mpu: 1, parts: 1, completes: 1 });
    // `put` is used ONLY for the pointer — NEVER for the tar key.
    expect(bucket.putSpy.mock.calls.every((c) => !String(c[0]).endsWith('.tar.gz'))).toBe(true);
  });

  it('a multipart failure → typed error (snapshot_upload_failed), NEVER a throw/500', async () => {
    const bucket = fakeBucket();
    // The real-world failure class the live E2E hit (R2 rejecting the upload). `complete` rejects.
    bucket.createMultipartUpload = async () => ({
      uploadPart: async (n: number) => ({ partNumber: n, etag: `e${n}` }),
      complete: async () => {
        throw new Error('Provided readable stream must have a known length');
      },
      abort: async () => {},
    });
    const containerFetch = vi.fn<ContainerBackupFetch>(
      async () => new Response(tarStream(), { status: 200 })
    );
    const result = await snapshotHome({ bucket, containerFetch }, DESKTOP_ID, FIXED_NOW, FIXED_SUFFIX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('error');
    expect(result.reason).toBe('snapshot_upload_failed');
    // latest.json was NOT advanced — a failed upload never repoints restore.
    expect(bucket.store.get(manifestKey(DESKTOP_ID))).toBeUndefined();
  });
});
