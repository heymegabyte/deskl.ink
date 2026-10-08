/**
 * Computer — the universal container-backed computer, one Durable Object per computer id.
 *
 * REPLACES the 12 per-(distro × size) DesktopContainer classes with a SINGLE class that selects
 * the image + instance size AT RUNTIME, using Cloudflare's `durable_object` scheduling policy
 * (public beta). See `docs/adr/0002-durable-object-container-policy.md`.
 *
 * Uses the RAW `ctx.container` surface on a plain `DurableObject` (NOT the `@cloudflare/containers`
 * `Container` helper, which fixes image + instance per class). Confirmed against current CF docs:
 *   - `ctx.container.start({ image, instance, enableInternet, env })` — per-instance image + size.
 *   - `ctx.container.images[key]`        — the wrangler `images` map, keyed at runtime.
 *   - `ctx.container.getTcpPort(port).fetch(req)` — proxies HTTP **and WebSocket** (the VNC path).
 *   - `ctx.container.running` / `.destroy()` (SIGKILL) — lifecycle.
 *
 * Methods that belong to the `Container` HELPER rather than the raw surface — a graceful `stop()`
 * and `setInactivityTimeout()` (CF docs: the helper "handles ... sleep timeouts for you") — are
 * feature-detected so they work if the beta exposes them and NEVER throw on the hot create path if
 * it doesn't. (Activity-aware idle auto-stop is the M6 slice; this only wires the convenience.)
 */

import { DurableObject } from 'cloudflare:workers';
import { VNC_CONTAINER_PORT } from '@deskl/shared';
import type { Env } from '../env.js';

/** 10-minute idle auto-stop — the deskl.ink default (desktop form), when the runtime supports it. */
const IDLE_MS = 10 * 60 * 1000;

/** What a computer runs — persisted in DO storage at create, read on every start. */
export interface ComputerConfig {
  /** Key into `ctx.container.images` (the wrangler `images` map), e.g. "ubuntu-desktop". */
  imageKey: string;
  /** Instance size: "lite" | "standard-1" | "standard-2" | "standard-3" | "standard-4". */
  instance: string;
  /** Extra container env (merged over the VNC defaults). */
  env?: Record<string, string>;
}

/**
 * The `ctx.container` surface. Typed loosely because the `durable_object`-policy shape isn't in our
 * pinned `@cloudflare/workers-types` yet (beta). `stop`/`signal`/`setInactivityTimeout` are optional
 * — present on the helper, not guaranteed on the raw surface — so callers feature-detect them.
 */
interface ContainerCtx {
  running: boolean;
  images?: Record<string, unknown>;
  start(opts: {
    image?: unknown;
    instance?: string;
    enableInternet?: boolean;
    env?: Record<string, string>;
  }): void;
  destroy(): Promise<void>;
  getTcpPort(port: number): { fetch(req: Request): Promise<Response> };
  stop?: () => Promise<void>;
  signal?: (signo: number) => void;
  setInactivityTimeout?: (ms: number) => Promise<void> | void;
}

export class Computer extends DurableObject<Env> {
  private get container(): ContainerCtx | undefined {
    return (this.ctx as unknown as { container?: ContainerCtx }).container;
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const c = this.container;
    if (c?.running) this.applyIdleTimeout(c);
  }

  /** Persist which image + instance this computer runs. Called at create (and re-affirmed on start). */
  async configure(config: ComputerConfig): Promise<void> {
    await this.ctx.storage.put('config', config);
  }

  /** Idempotent start with the stored image + instance (falls back to ubuntu/standard-1). */
  async startComputer(): Promise<void> {
    const c = this.container;
    if (!c) throw new Error('no container binding on this Durable Object');
    if (c.running) return;
    const cfg =
      (await this.ctx.storage.get<ComputerConfig>('config')) ??
      ({ imageKey: 'ubuntu-desktop', instance: 'standard-1' } satisfies ComputerConfig);
    const image = c.images?.[cfg.imageKey] ?? c.images?.['ubuntu-desktop'];
    c.start({
      image,
      instance: cfg.instance,
      enableInternet: true,
      env: { VNC_RESOLUTION: '1920x1080', ...(cfg.env ?? {}) },
    });
    this.applyIdleTimeout(c);
  }

  /** Idempotent stop (no-op if not running). Graceful where the runtime offers it. */
  async stopComputer(): Promise<void> {
    const c = this.container;
    if (!c?.running) return;
    // No graceful stop() on the raw surface; prefer a helper stop() if present, else SIGTERM,
    // else fall back to destroy() (SIGKILL). Persistence isn't wired yet (M6), so stop is not
    // yet durability-critical — this will tighten when R2-truth checkpointing lands.
    if (typeof c.stop === 'function') {
      await c.stop();
      return;
    }
    if (typeof c.signal === 'function') {
      c.signal(15);
      return;
    }
    await c.destroy();
  }

  /** Destroy the container + forget its config. Idempotent. */
  async destroyComputer(): Promise<void> {
    const c = this.container;
    try {
      if (typeof c?.destroy === 'function') await c.destroy();
    } finally {
      await this.ctx.storage.deleteAll();
    }
  }

  /**
   * Proxy an (already ticket-verified, prefix-stripped) request to the container's websockify
   * port and return the response directly so WebSocket upgrades (the VNC data channel) pass
   * through. Starts the container if it isn't running yet.
   *
   * Only the URL SCHEME is rewritten (https → http): `getTcpPort` refuses an HTTPS connection to
   * the container ("use HTTP instead ... already secure by default"), and prod requests arrive
   * https. The port fetcher is bound to the TCP port, so host is irrelevant to routing. The
   * original request is passed as the init so method/headers/body — including the WebSocket
   * upgrade for the VNC data channel — carry through.
   */
  override async fetch(request: Request): Promise<Response> {
    const c = this.container;
    if (!c) return new Response('no container binding', { status: 500 });
    if (!c.running) await this.startComputer();
    const url = new URL(request.url);
    url.protocol = 'http:';
    return c.getTcpPort(VNC_CONTAINER_PORT).fetch(new Request(url, request));
  }

  /**
   * Apply the idle auto-stop IF the runtime exposes it (helper convenience; may be absent on the
   * raw surface). Never throws on the create path.
   */
  private applyIdleTimeout(c: ContainerCtx): void {
    try {
      if (typeof c.setInactivityTimeout === 'function') void c.setInactivityTimeout(IDLE_MS);
    } catch {
      /* raw surface without an inactivity timeout — idle-stop stays an M6 slice */
    }
  }
}
