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
import type { DesktopContainer } from './containers/DesktopContainer.js';
import type { DesktopRegistry } from './containers/DesktopRegistry.js';

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

  /**
   * One DesktopContainer DO (container-enabled) per live desktop; it runs the
   * Linux workstation image and serves websockify/VNC on VNC_CONTAINER_PORT.
   * Driven via `getContainer(env.DESKTOP, desktopId)`.
   */
  DESKTOP: DurableObjectNamespace<DesktopContainer>;

  /** Single SQLite DO holding the authoritative desktop list (M2: per-user). */
  REGISTRY: DurableObjectNamespace<DesktopRegistry>;

  /** HMAC secret for signing/verifying short-lived VNC connection tickets. */
  VNC_TICKET_SECRET?: string;

  /** Deploy environment tag, e.g. "production" | "preview". */
  ENVIRONMENT?: string;
}
