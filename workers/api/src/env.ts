/**
 * Typed binding surface for the deskl.ink Worker.
 *
 * Every binding is OPTIONAL in Milestone 1 because none are provisioned yet
 * (see the commented block in wrangler.toml). As each lands in Milestone 2,
 * uncomment its binding there and tighten the corresponding field here to be
 * required.
 *
 * NOTE (Milestone 2): runtime validation of `Env` + request/response payloads
 * will move to Zod per the house `zod-everywhere` doctrine — the Zod schema
 * becomes the source of truth and this interface is inferred from it.
 */

import type { D1Database, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';

export interface Env {
  /** Primary relational store. */
  DB?: D1Database;

  /** Persisted desktop home-volume snapshots. */
  BACKUPS?: R2Bucket;
  /** Session screen recordings. */
  RECORDINGS?: R2Bucket;
  /** Desktop thumbnails / previews. */
  SCREENSHOTS?: R2Bucket;
  /** Files agents/users produce inside a desktop. */
  ARTIFACTS?: R2Bucket;

  /** One DesktopDO per live desktop; orchestrates its container. */
  DESKTOP_DO?: DurableObjectNamespace;

  /** Deploy environment tag, e.g. "production" | "preview". */
  ENVIRONMENT?: string;
}
