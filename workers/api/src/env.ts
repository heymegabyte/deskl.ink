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
import type {
  DesktopContainer,
  FedoraDesktop,
  DebianDesktop,
  UbuntuDeveloper,
  UbuntuPower,
  UbuntuHeavy,
  FedoraDeveloper,
  FedoraPower,
  FedoraHeavy,
  DebianDeveloper,
  DebianPower,
  DebianHeavy,
} from './containers/DesktopContainer.js';
import type { DesktopRegistry } from './containers/DesktopRegistry.js';
import type { Computer } from './containers/Computer.js';

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
   * Ubuntu workstation image and serves websockify/VNC on VNC_CONTAINER_PORT.
   * Driven via `getContainer(env.DESKTOP, desktopId)`. This is the default
   * (`ubuntu`) distro + the live golden path.
   */
  DESKTOP: DurableObjectNamespace<DesktopContainer>;

  /**
   * The UNIVERSAL computer DO (one per computer id) — Cloudflare `durable_object` scheduling
   * policy. Selects image + instance size AT RUNTIME (`ctx.container.start`), so ONE class spans
   * every distro × size (and, later, desktop/server form + version + snapshot restore). This is
   * the live create path; the 12 per-(distro × size) DESKTOP* namespaces below are the superseded
   * `default`-policy fleet, kept defined for a clean revert while this is verified in prod.
   * See docs/adr/0002-durable-object-container-policy.md.
   */
  COMPUTER: DurableObjectNamespace<Computer>;

  /** Per-distro container DO for `fedora` desktops (Fedora image). */
  DESKTOP_FEDORA: DurableObjectNamespace<FedoraDesktop>;

  /** Per-distro container DO for `debian` desktops (Debian image). */
  DESKTOP_DEBIAN: DurableObjectNamespace<DebianDesktop>;

  // Per-SIZE namespaces: the `everyday` row is the 3 bindings above (standard-1,
  // 4 GiB). These 9 are developer/power/heavy (standard-2/3/4 = 6/8/12 GiB), each
  // bound to its distro's image at that instance_type. See routes/desktops.ts.
  DESKTOP_UBUNTU_DEVELOPER: DurableObjectNamespace<UbuntuDeveloper>;
  DESKTOP_UBUNTU_POWER: DurableObjectNamespace<UbuntuPower>;
  DESKTOP_UBUNTU_HEAVY: DurableObjectNamespace<UbuntuHeavy>;
  DESKTOP_FEDORA_DEVELOPER: DurableObjectNamespace<FedoraDeveloper>;
  DESKTOP_FEDORA_POWER: DurableObjectNamespace<FedoraPower>;
  DESKTOP_FEDORA_HEAVY: DurableObjectNamespace<FedoraHeavy>;
  DESKTOP_DEBIAN_DEVELOPER: DurableObjectNamespace<DebianDeveloper>;
  DESKTOP_DEBIAN_POWER: DurableObjectNamespace<DebianPower>;
  DESKTOP_DEBIAN_HEAVY: DurableObjectNamespace<DebianHeavy>;

  /** Single SQLite DO holding the authoritative desktop list (M2: per-user). */
  REGISTRY: DurableObjectNamespace<DesktopRegistry>;

  /** HMAC secret for signing/verifying short-lived VNC connection tickets. */
  VNC_TICKET_SECRET?: string;

  /**
   * Feature flag (default off): when `'1'`, route compute through the universal `Computer` DO
   * (durable_object policy, ADR-0002) instead of the 12-class `default`-policy fleet. OFF because
   * the durable_object multi-image runtime launch isn't confirmed yet (start() → 0 instances).
   * Flip via a wrangler var to re-test without a code change.
   */
  COMPUTER_DO?: string;

  /** Deploy environment tag, e.g. "production" | "preview". */
  ENVIRONMENT?: string;
}
