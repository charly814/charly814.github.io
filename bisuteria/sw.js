// Copia la aplicación en el dispositivo para que la caja arranque sin internet.
// Red primero (para recibir actualizaciones); si no responde, copia guardada.
var CACHE = 'bisuteria-v1';
var FILES = ['./', 'index.html', 'app.css', 'icon.svg', 'manifest.webmanifest',
  'js/core.js', 'js/docs.js', 'js/pos.js', 'js/sales.js', 'js/members.js', 'js/products.js', 'js/admin.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('bisuteria-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (r) {
      return r || new Response('Sin conexión', { status: 503 });
    });
  }));
});
