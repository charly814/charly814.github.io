// Service worker: guarda la aplicación en el dispositivo para que el TPV
// arranque aunque no haya internet (p. ej. tras un corte de luz, mientras el
// router se reinicia). Primero intenta la red (para recibir actualizaciones)
// y si no responde en 3 s usa la copia guardada.
var CACHE = 'platet-app-v6';
var FILES = [
  './', 'index.html', 'pos.html', 'pedir.html', 'qr.html', 'config.js',
  'admin.html', 'css/pos.css', 'css/admin.css', 'js/admin.js', 'js/store.js', 'js/common.js', 'js/i18n.js', 'js/voice.js', 'js/devices.js', 'js/pos.js',
  'manifest.webmanifest', 'icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  // Solo los archivos de la propia aplicación; Firebase y la IA van siempre por la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    var fromCache = function () {
      return caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); });
    };
    var timer = setTimeout(function () {
      fromCache().then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 3000);
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(function (r) {
        if (done) return;
        done = true;
        resolve(r || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      });
    });
  }));
});
