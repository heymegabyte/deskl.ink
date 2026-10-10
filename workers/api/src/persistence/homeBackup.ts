/**
 * homeBackup — the PURE core of deskl.ink durable home-volume persistence.
 *
 * Deliberately free of any Durable Object / Container base-class dependency: it takes its two
 * collaborators as injected deps ({@link HomeBackupDeps}) so it is trivially unit-testable with a
 * Map-backed fake R2 bucket and a fake `containerFetch`, WITHOUT the Workers runtime. The DO
 * (`DesktopContainer`) is a thin adapter that binds `this.env.BACKUPS` + `this.containerFetch` to
 * these functions (see `snapshotHome` / `restoreHome` / `stopWithCheckpoint` there).
 *
 * The flow (never any R2 credential inside the tenant container — the DO is the only R2 toucher):
 *   - snapshot: GET the container's loopback `/backup` (gzip tar of /home) → stream the body to R2
 *     → read the stored object's size → write a `latest.json` manifest pointer.
 *   - restore:  read `latest.json` → GET the pointed-at tar object → POST its body to `/restore`.
 *
 * Every outcome is a FIRST-CLASS typed result from `@deskl/shared` (never a thrown error / faked
 * success): an unreachable backup service → `capability_gap` (HONEST — not wired here); a missing
 * backup → `error`/`no_backup`. The DO layers the "R2 unbound → capability_gap" guard on top.
 */
import {
  type RestoreResult,
  type SnapshotManifest,
  type SnapshotResult,
} from '@deskl/shared';

/** Loopback port the in-container backup/restore service listens on (`/backup`, `/restore`, `/health`). */
export const BACKUP_CONTAINER_PORT = 7070;

/**
 * The MINIMAL slice of `R2Bucket` this helper uses. Narrowing to exactly `put` + `get` + `list` +
 * `delete` (a) keeps the unit test's fake tiny and (b) documents that persistence touches nothing
 * else on the bucket. Every method is a structural subtype of the real `R2Bucket` (so the DO's
 * `this.env.BACKUPS as HomeBackupBucket` cast stays sound):
 *   - `put` returns the stored object (carrying its authoritative `size`) or `null`.
 *   - `get(key)` returns the stored object (streamable `body` + typed `json()`) or `null`; an
 *     optional `{ range }` reads back just a prefix of the bytes (used by the integrity check so we
 *     never buffer a whole /home tar just to sniff its 2-byte gzip magic).
 *   - `list({ prefix })` enumerates stored keys (retention walks `home/<id>/` to prune old tars).
 *   - `delete(key)` removes one object (retention deletes superseded tars — best-effort).
 */
export interface HomeBackupBucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<{ size: number } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<HomeBackupObject | null>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
  delete(key: string): Promise<void>;
  /**
   * Begin a multipart upload — the ONLY way to stream a length-UNKNOWN body into R2. `put(key,
   * stream)` throws `Provided readable stream must have a known length` for a bare `ReadableStream`
   * (which the container's `tar -czf -` is), so the tar MUST go up as multipart. Structural subtype
   * of the real `R2Bucket.createMultipartUpload`.
   */
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<HomeBackupMultipartUpload>;
}

/** The slice of `R2MultipartUpload` the streaming tar upload uses (uploadPart / complete / abort). */
export interface HomeBackupMultipartUpload {
  uploadPart(
    partNumber: number,
    value: ArrayBuffer | ArrayBufferView | string
  ): Promise<HomeBackupUploadedPart>;
  complete(uploadedParts: HomeBackupUploadedPart[]): Promise<{ size: number }>;
  abort(): Promise<void>;
}
/** One completed part (`R2UploadedPart`) — carried back into `complete()`. */
export interface HomeBackupUploadedPart {
  partNumber: number;
  etag: string;
}

/** The slice of an `R2ObjectBody` the helper reads: size + a streamable `body` + a typed `json()` +
 *  `arrayBuffer()` (restore buffers the tar to POST it with a KNOWN length — see restoreHome). */
export interface HomeBackupObject {
  size: number;
  body: ReadableStream | null;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Send a request to the in-container backup service on {@link BACKUP_CONTAINER_PORT}. Mirrors the
 * DO's `containerFetch(request, port)` signature exactly, so the DO can pass its bound method and a
 * test can pass a fake. May throw (container down / port not ready) — callers MUST try/catch and
 * translate a throw into a `capability_gap`, never let it crash the lifecycle.
 */
export type ContainerBackupFetch = (request: Request, port: number) => Promise<Response>;

/** The two collaborators the pure helper needs, injected by the DO (or a test). */
export interface HomeBackupDeps {
  bucket: HomeBackupBucket;
  containerFetch: ContainerBackupFetch;
}

/**
 * R2 key of the gzip tar for a snapshot taken at `isoTimestamp`.
 *
 * The `suffix` (a short random hex) makes the key UNIQUE even when two snapshots fire in the same
 * millisecond (same ISO timestamp): without it, both would write `home/<id>/<ISO>.tar.gz` and the
 * later put would overwrite the earlier tar while BOTH advanced `latest.json` — a lost-work race on
 * the one artifact that must never be lost. The caller passes `crypto.randomUUID().slice(0, 8)`.
 */
export function snapshotKey(desktopId: string, isoTimestamp: string, suffix: string): string {
  return `home/${desktopId}/${isoTimestamp}-${suffix}.tar.gz`;
}

/** R2 key of the `latest.json` pointer (the manifest of the most recent snapshot) for a desktop. */
export function manifestKey(desktopId: string): string {
  return `home/${desktopId}/latest.json`;
}

/** R2 key prefix holding every object (tars + `latest.json`) for a desktop. */
export function homePrefix(desktopId: string): string {
  return `home/${desktopId}/`;
}

/** Keep at most this many of the newest `.tar.gz` snapshots per desktop; older ones are pruned. */
export const SNAPSHOT_RETENTION = 5;

/** Smallest byte length a real gzip stream can plausibly be (10-byte header + content) — reject below. */
const MIN_GZIP_BYTES = 20;
/** gzip magic: every gzip stream starts with these two bytes (RFC 1952 ID1=0x1f, ID2=0x8b). */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Capture `/home` to R2 as durable truth.
 *
 * Fetches the container's `GET /backup` (a gzip tar stream). If that throws, returns a non-2xx, or
 * yields no body, the backup service is treated as unreachable → `capability_gap` (HONEST; the
 * lifecycle never crashes on a missing capability). Otherwise:
 *   1. streams the tar straight into R2 under a UNIQUE key (ISO + random suffix — no same-ms
 *      collision), reading the STORED object's authoritative size from the put result;
 *   2. VERIFIES the stored object is a plausible gzip (size > {@link MIN_GZIP_BYTES} AND its first
 *      two bytes are the gzip magic, read back as a 2-byte range — never buffer the whole tar). A
 *      truncated/empty/corrupt archive fails HERE → `error`/`snapshot_integrity`, and `latest.json`
 *      is left untouched (never point restore at a corrupt archive);
 *   3. only on a valid object, writes the `latest.json` manifest pointer;
 *   4. best-effort prunes old tars to {@link SNAPSHOT_RETENTION} (a prune failure never fails the
 *      snapshot — the new artifact + pointer are already durable).
 *
 * @param now - injected clock (defaults to `Date`) so a test gets a deterministic key/timestamp.
 * @param suffix - injected key suffix (defaults to a random 8-hex) so a test gets a deterministic key.
 */
export async function snapshotHome(
  deps: HomeBackupDeps,
  desktopId: string,
  now: () => Date = () => new Date(),
  suffix: () => string = () => crypto.randomUUID().slice(0, 8)
): Promise<SnapshotResult> {
  let res: Response;
  try {
    res = await deps.containerFetch(new Request('http://c/backup'), BACKUP_CONTAINER_PORT);
  } catch {
    return { ok: false, kind: 'capability_gap', reason: 'backup service unreachable' };
  }
  if (!res.ok || !res.body) {
    return { ok: false, kind: 'capability_gap', reason: 'backup service unreachable' };
  }

  const createdAt = now().toISOString();
  const key = snapshotKey(desktopId, createdAt, suffix());

  let bytes: number;
  try {
    // R2 cannot ingest a length-UNKNOWN stream via put() — it throws "Provided readable stream must
    // have a known length" — and the container's `tar -czf -` is exactly that. So the tar goes up as a
    // MULTIPART upload: bounded chunks flushed as parts, never the whole /home buffered in memory. The
    // completed object's authoritative size comes back from `complete()`.
    bytes = await streamTarToR2(deps.bucket, key, res.body);
  } catch {
    // A real failure of a configured capability (R2 put/stream/network) — typed, NEVER a thrown 500.
    // No `latest.json` was advanced, so restore still points at the previous good snapshot (if any).
    return { ok: false, kind: 'error', reason: 'snapshot_upload_failed' };
  }

  // INTEGRITY GATE: never advance `latest.json` to a corrupt archive. A completed upload can still be
  // a truncated/empty object (the tar aborted mid-stream); point restore at that and a later restore
  // silently destroys /home. Reject unless the stored object is a plausible gzip.
  if (!(await isStoredGzip(deps.bucket, key, bytes))) {
    return { ok: false, kind: 'error', reason: 'snapshot_integrity' };
  }

  const manifest: SnapshotManifest = { desktopId, key, createdAt, bytes };
  try {
    // The pointer the restore path reads. JSON.stringify (not the object) so the fake bucket in tests
    // — and R2 itself — store a plain string body that `.json()` round-trips. A small known-length
    // string, so a plain `put` is correct here (no multipart needed).
    await deps.bucket.put(manifestKey(desktopId), JSON.stringify(manifest), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch {
    // The tar is durable but the pointer write failed — honest error (restore wouldn't find it), not
    // a fake success. The orphaned tar is reclaimed by a later snapshot's retention walk.
    return { ok: false, kind: 'error', reason: 'manifest_write_failed' };
  }

  // Prune superseded tars AFTER the pointer is durable — best-effort, never fails the snapshot.
  await pruneOldSnapshots(deps.bucket, desktopId, key);

  return { ok: true, manifest };
}

/** R2 multipart part size — 8 MiB. R2 requires every NON-final part be ≥5 MiB; the final part may be
 *  smaller. Bounded memory: at most ~one part (8 MiB) is held at a time regardless of /home size. */
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;

/**
 * Stream a length-UNKNOWN body into R2 as a multipart upload; return the stored object's size.
 * Accumulates read chunks until ≥ {@link MULTIPART_PART_SIZE}, flushes a part, and uploads the
 * remainder as the final part (which may be small; always ≥1 part so even a tiny archive completes a
 * real object). ANY failure aborts the upload (no partial object lingers) and rethrows — the caller
 * turns a throw into a typed `error`, never a 500.
 */
async function streamTarToR2(
  bucket: HomeBackupBucket,
  key: string,
  body: ReadableStream
): Promise<number> {
  const mpu = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: 'application/gzip' },
  });
  const parts: HomeBackupUploadedPart[] = [];
  const reader = body.getReader();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let partNumber = 1;
  const flush = async (): Promise<void> => {
    const part = concatChunks(pending, pendingBytes);
    pending = [];
    pendingBytes = 0;
    parts.push(await mpu.uploadPart(partNumber++, part));
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
      pending.push(chunk);
      pendingBytes += chunk.byteLength;
      if (pendingBytes >= MULTIPART_PART_SIZE) await flush();
    }
    // Final part: upload the remainder. Skip a 0-byte trailing part (exact-multiple case) UNLESS
    // nothing was uploaded yet — an empty body still needs ≥1 part to complete (tiny → integrity gate).
    if (pendingBytes > 0 || parts.length === 0) await flush();
    const obj = await mpu.complete(parts);
    return obj.size;
  } catch (err) {
    await mpu.abort().catch(() => {});
    throw err;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Concatenate buffered chunks into one contiguous Uint8Array (a multipart part body). */
function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/**
 * Is the object at `key` a plausibly-valid gzip? Guards the one invariant that matters most — never
 * let `latest.json` point at a corrupt archive. Requires `size > {@link MIN_GZIP_BYTES}` AND the
 * first two stored bytes to be the gzip magic `0x1f 0x8b`, read back as a 2-byte RANGE (so a huge
 * /home tar is never buffered just to sniff its header). Any read defect (null object/body, a short
 * read, or a throw) is treated as "not valid" — fail closed. Bytes `<= MIN_GZIP_BYTES` short-circuit
 * before any read.
 */
async function isStoredGzip(
  bucket: HomeBackupBucket,
  key: string,
  bytes: number
): Promise<boolean> {
  if (bytes <= MIN_GZIP_BYTES) return false;
  try {
    const head = await bucket.get(key, { range: { offset: 0, length: 2 } });
    if (!head || !head.body) return false;
    const prefix = await readSome(head.body, 2);
    return prefix.length >= 2 && prefix[0] === GZIP_MAGIC_0 && prefix[1] === GZIP_MAGIC_1;
  } catch {
    return false;
  }
}

/** Read up to `max` bytes from the front of a stream, then stop (we only need the 2-byte magic). */
async function readSome(stream: ReadableStream, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    // Release the lock; cancel the rest so a ranged body we didn't fully drain doesn't leak.
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(total, max));
  let off = 0;
  for (const ch of chunks) {
    if (off >= out.length) break;
    out.set(ch.subarray(0, out.length - off), off);
    off += ch.byteLength;
  }
  return out;
}

/**
 * Keep only the newest {@link SNAPSHOT_RETENTION} `.tar.gz` objects under `home/<id>/`; delete the
 * rest. BEST-EFFORT: any list/delete failure is swallowed (logged by the caller's structured path if
 * desired) so retention never fails an otherwise-durable snapshot. Never deletes `latest.json` (it
 * isn't a `.tar.gz`) and never deletes `keepKey` (the tar the manifest just started pointing at),
 * even in the degenerate case where it would otherwise sort out of the newest N.
 *
 * Ordering: keys embed an ISO-8601 timestamp, so a lexicographic sort is chronological; we keep the
 * largest (newest) N and delete the older tail.
 */
async function pruneOldSnapshots(
  bucket: HomeBackupBucket,
  desktopId: string,
  keepKey: string
): Promise<void> {
  try {
    const listed = await bucket.list({ prefix: homePrefix(desktopId) });
    const tars = listed.objects
      .map((o) => o.key)
      .filter((k) => k.endsWith('.tar.gz'))
      .sort(); // ISO timestamps sort chronologically; newest last.
    const deletable = tars.slice(0, Math.max(0, tars.length - SNAPSHOT_RETENTION));
    await Promise.all(
      deletable
        .filter((k) => k !== keepKey)
        .map((k) => bucket.delete(k).catch(() => {}))
    );
  } catch {
    // Retention is best-effort; a failure here must never fail the snapshot.
  }
}

/** Largest tar restoreHome will BUFFER-and-POST (128 MiB DO memory, leave headroom). A bigger /home
 *  needs the streaming restore-on-boot path (tracked follow-up) — here it's an honest capability_gap. */
const MAX_BUFFERED_RESTORE_BYTES = 100 * 1024 * 1024;

/**
 * Restore the most recent `/home` snapshot into the RUNNING container.
 *
 * Reads `latest.json`; if absent → `error`/`no_backup` (nothing to restore). Otherwise reads the
 * pointed-at tar object, BUFFERS it, and POSTs it (known length) to the container's `POST /restore`
 * (which untars into /home). Buffering (not streaming) is deliberate: a STREAMING request body
 * (`duplex:'half'`) is not reliably carried by `containerFetch` — the live E2E showed GET /backup
 * (response streaming) reaches the agent but a streamed POST /restore is "unreachable". Bounded by
 * {@link MAX_BUFFERED_RESTORE_BYTES}; a larger /home → honest `capability_gap` pending restore-on-boot.
 * A missing object / unreachable agent → `capability_gap`; a non-2xx untar → `error`. Success →
 * `{ ok: true, restoredKey }`.
 */
export async function restoreHome(
  deps: HomeBackupDeps,
  desktopId: string
): Promise<RestoreResult> {
  const pointer = await deps.bucket.get(manifestKey(desktopId));
  if (!pointer) return { ok: false, kind: 'error', reason: 'no_backup' };

  let manifest: SnapshotManifest;
  try {
    manifest = await pointer.json<SnapshotManifest>();
  } catch {
    return { ok: false, kind: 'error', reason: 'corrupt_manifest' };
  }

  const tar = await deps.bucket.get(manifest.key);
  if (!tar) {
    return { ok: false, kind: 'capability_gap', reason: 'snapshot object unreachable' };
  }

  // Buffer the tar, then POST with a KNOWN length (see the doc: a streamed request body to the
  // container isn't reliably carried by containerFetch).
  let body: ArrayBuffer;
  try {
    body = await tar.arrayBuffer();
  } catch {
    return { ok: false, kind: 'capability_gap', reason: 'snapshot object unreachable' };
  }
  if (body.byteLength > MAX_BUFFERED_RESTORE_BYTES) {
    return { ok: false, kind: 'capability_gap', reason: 'restore_too_large_for_buffered_path' };
  }

  let res: Response;
  try {
    res = await deps.containerFetch(
      new Request('http://c/restore', { method: 'POST', body }),
      BACKUP_CONTAINER_PORT
    );
  } catch {
    return { ok: false, kind: 'capability_gap', reason: 'restore service unreachable' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', reason: `restore_untar_failed_${res.status}` };
  }

  return { ok: true, restoredKey: manifest.key };
}
