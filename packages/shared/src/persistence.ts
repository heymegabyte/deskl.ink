/**
 * deskl.ink DURABLE PERSISTENCE contract — the SINGLE SOURCE OF TRUTH for the home-volume
 * snapshot/restore surface shared by the API worker (server), any client, and the unit tests.
 *
 * The product promise is P0 "never destroy user work": a desktop's `/home` must survive an actual
 * container REPLACEMENT, not just a graceful stop. The home volume itself is ephemeral, so the
 * Durable Object streams a gzip tar of `/home` (produced by the in-container backup service on its
 * loopback port) into R2 (`BACKUPS`) as DURABLE TRUTH, and streams it back on restore. NO R2
 * credentials ever enter the tenant container — the DO is the only thing that touches R2.
 *
 * Zod schemas + inferred types only — NO Workers / DOM / Node deps, so this file is importable by
 * the worker, the pure backup helper (`workers/api/src/persistence/homeBackup.ts`), a client, and
 * unit tests alike. Never duplicate these shapes; infer types with `z.infer`.
 *
 * Every failure is modeled as a FIRST-CLASS typed result, never a thrown error or a faked success:
 *   - `capability_gap` — the backup service is unreachable OR persistence isn't configured (R2
 *     unbound). HONEST: the capability simply isn't wired here, so the caller can branch on it.
 *   - `error` — a real failure of a configured capability (e.g. no backup exists to restore).
 */
import { z } from 'zod';

/** Why a snapshot/restore did not succeed. See the file header for the capability_gap vs error split. */
export const PERSISTENCE_FAILURE_KINDS = ['capability_gap', 'error'] as const;
export const PersistenceFailureKindSchema = z.enum(PERSISTENCE_FAILURE_KINDS);
export type PersistenceFailureKind = z.infer<typeof PersistenceFailureKindSchema>;

/**
 * Pointer to one durable home-volume snapshot stored in R2. `key` is the opaque R2 object key
 * (`home/<desktopId>/<ISO-8601>.tar.gz`); `bytes` is the stored object's size as R2 reports it
 * (authoritative, read back from the put result — never a guess).
 */
export const SnapshotManifestSchema = z
  .object({
    desktopId: z.string().min(1),
    /** Opaque R2 object key for the gzip tar of `/home`. */
    key: z.string().min(1),
    /** ISO-8601 timestamp the snapshot was taken. */
    createdAt: z.string(),
    /** Size of the stored object in bytes (as R2 reports it). */
    bytes: z.number().nonnegative(),
  })
  .strict();
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;

/**
 * Result of a snapshot attempt — a discriminated union on `ok`:
 *   - `{ ok: true, manifest }`                 — the tar was streamed to R2; `manifest` points at it.
 *   - `{ ok: false, kind, reason }`            — see {@link PersistenceFailureKindSchema}. HONEST,
 *                                                never a fake success / never a thrown error.
 */
export const SnapshotResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), manifest: SnapshotManifestSchema }).strict(),
  z
    .object({ ok: z.literal(false), kind: PersistenceFailureKindSchema, reason: z.string() })
    .strict(),
]);
export type SnapshotResult = z.infer<typeof SnapshotResultSchema>;

/**
 * Result of a restore attempt — a discriminated union on `ok`:
 *   - `{ ok: true, restoredKey }`   — the latest snapshot's tar was POSTed back into `/home`.
 *   - `{ ok: false, kind, reason }` — e.g. `error`/`no_backup` (nothing to restore) or a
 *                                     `capability_gap` (service unreachable / R2 unbound).
 */
export const RestoreResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), restoredKey: z.string().min(1) }).strict(),
  z
    .object({ ok: z.literal(false), kind: PersistenceFailureKindSchema, reason: z.string() })
    .strict(),
]);
export type RestoreResult = z.infer<typeof RestoreResultSchema>;

/**
 * Result of a checkpoint-before-stop. A persistent computer may stop only after its snapshot is
 * durably committed. If the checkpoint fails, the container remains running and `stopped:false`
 * tells the caller not to publish a false stopped state.
 */
export const StopWithCheckpointResultSchema = z.discriminatedUnion('stopped', [
  z
    .object({
      stopped: z.literal(true),
      checkpoint: z.object({ ok: z.literal(true), manifest: SnapshotManifestSchema }).strict(),
    })
    .strict(),
  z
    .object({
      stopped: z.literal(false),
      checkpoint: z
        .object({ ok: z.literal(false), kind: PersistenceFailureKindSchema, reason: z.string() })
        .strict(),
    })
    .strict(),
]);
export type StopWithCheckpointResult = z.infer<typeof StopWithCheckpointResultSchema>;
