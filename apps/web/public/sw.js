/*
 * deskl.ink service worker — conservative offline shell.
 *
 * SAFETY (why this can't break the product):
 *  - /api/* (and therefore the noVNC /vnc/* + ttyd /term/* proxies, which live under it) is NEVER
 *    cached — those requests are left entirely to the network. The control plane + live desktop
 *    streams are untouched.
 *  - Navigations are NETWORK-FIRST: online you always get the freshest shell; the cache is only a
 *    fallback when the network fails (offline). So there is no "stuck on an old version" failure mode.
 *  - Only fingerprinted, immutable assets (/assets/*, /fonts/*) and static icons/manifest are
 *    cache-first — safe because their URLs change when their content does.
 *  - skipWaiting + clients.claim + old-cache cleanup make a new SW take over promptly.
 *  - If anything here throws, respondWith's promise rejects and the browser falls back to a normal
 *    network fetch — a buggy SW degrades to plain network, it doesn't brick the app.
 */
const VERSION = 'v2';
const SHELL = `deskl-shell-${VERSION}`;
const ASSETS = `deskl-assets-${VERSION}`;
// Canonical (extensionless) URL — Workers Assets 307-redirects /offline.html -> /offline, and a
// cached *redirected* response throws "redirections" when served for a navigation. Precache /offline.
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(['/', OFFLINE_URL]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // NEVER touch the control plane or the live VNC/terminal proxies — always hit the network.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network-first → cached shell / offline page only when the network is unreachable.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put('/', net.clone());
          return net;
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match('/')) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })()
    );
    return;
  }

  // Fingerprinted assets / fonts / icons / manifest: cache-first (immutable content-hashed URLs).
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(?:svg|png|ico|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const net = await fetch(request);
          if (net.ok) cache.put(request, net.clone());
          return net;
        } catch {
          return cached || Response.error();
        }
      })()
    );
  }
  // Everything else: default browser handling (network).
});
