import type { Env } from '../env.js';
import type { DesktopRegistry } from './DesktopRegistry.js';

/**
 * Resolve the (single global) desktop registry DO stub. Shared by the control-plane routes + auth
 * (claim-on-login). TODO(M2+): shard per user once the authenticated userId is the registry key.
 *
 * The `.get()` stub-proxy type over DesktopRegistry's RPC methods expands recursively under
 * exactOptionalPropertyTypes (TS2589); the annotation is the authoritative contract, so cast the
 * expression to it to break the deep inference without weakening the public type.
 */
export function getRegistryStub(env: Env): DurableObjectStub<DesktopRegistry> {
  const id = env.REGISTRY.idFromName('global');
  return env.REGISTRY.get(id) as unknown as DurableObjectStub<DesktopRegistry>;
}
