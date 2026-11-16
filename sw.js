/* Service Worker：全ファイルをキャッシュしてオフラインで遊べるようにする */
const CACHE = 'pugpug-olympic-v1';
const ASSETS = [
  './',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './index.html',
  './js/ceremony.js',
  './js/character.js',
  './js/competition/base.js',
  './js/competition/fieldBase.js',
  './js/competition/highJump.js',
  './js/competition/hurdles110.js',
  './js/competition/javelin.js',
  './js/competition/longJump.js',
  './js/competition/relay.js',
  './js/competition/run400.js',
  './js/competition/sprint100.js',
  './js/gameEngine.js',
  './js/inputManager.js',
  './js/main.js',
  './js/physics.js',
  './js/saveManager.js',
  './js/scoreManager.js',
  './js/soundManager.js',
  './js/tournament.js',
  './js/ui.js',
  './manifest.json',
  './style.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先。なければネットワークから取得してキャッシュに追加
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    })
  );
});
