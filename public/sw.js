// Keeps the page and its files on this device, so the app opens with no network at all: the data shows from the copy
// kept in IndexedDB (see src/ownerCache.ts) while the fresh data loads. The /api/ calls always go to the network.
//
// The page shows at once from here, and the live one replaces it here for the next open. A new deploy reaches the
// page that is open through the build check in src/main.tsx, whose request for the page also lands here.

const CACHE = 'tillroll-v1';
const PAGE = '/';

/** The /assets/ files a page names: its script and its stylesheet. */
const assetsOf = html => [...html.matchAll(/\/assets\/[^"']+/g)].map(match => match[0]);

/** Keeps the live page; a new build's page also drops the files of the builds before it. */
async function keepPage(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const before = await cache.match(PAGE);
  const sameBuild = before !== undefined && (await before.text()) === html;
  await cache.put(PAGE, response);
  if (sameBuild) return;
  const named = new Set(assetsOf(html));
  for (const request of await cache.keys()) {
    const {pathname} = new URL(request.url);
    if (pathname.startsWith('/assets/') && !named.has(pathname)) await cache.delete(request);
  }
}

/** The page from the network, kept when it came. */
async function livePage(request) {
  const response = await fetch(request, {cache: 'no-cache'});
  if (response.ok && !response.redirected) await keepPage(response.clone());
  return response;
}

/** The page kept here when there is one (the live one is kept for the next open), else the network's. */
async function openPage(event) {
  const kept = await caches.match(PAGE);
  if (!kept) return livePage(event.request);
  event.waitUntil(livePage(PAGE).catch(() => undefined));
  return kept;
}

/** A file under /assets/: its name changes with its content, so a copy kept here is always right. */
async function assetFile(request) {
  const {pathname} = new URL(request.url);
  const cache = await caches.open(CACHE);
  const kept = await cache.match(pathname);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await cache.put(pathname, response.clone());
  return response;
}

// Installed, it keeps the page and its files at once, so the next open needs no network.
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      try {
        const response = await livePage(PAGE);
        if (response.ok) await Promise.all(assetsOf(await response.text()).map(asset => assetFile(new Request(asset))));
      } catch {
        // Offline: the files are kept as the page asks for them.
      }
      await self.skipWaiting();
    })(),
  );
});

// A new version of this file takes over at once and drops the copies of the one before.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === PAGE) event.respondWith(request.mode === 'navigate' ? openPage(event) : livePage(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetFile(request));
});
