// Install-only service worker: Chrome Android wants a fetch handler to offer install.
// No caching on purpose, so deploys are never stale. Add caching here if offline support is wanted.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
