// Almacén de datos compartido entre el TPV (pos.html) y los pedidos QR (pedir.html).
// Dos modos con la misma API:
//   - local: localStorage (solo este navegador, se sincroniza entre pestañas)
//   - nube:  Firebase Realtime Database por REST + EventSource (sin SDK)
(function () {
  'use strict';

  var cfg = window.PLATET_CONFIG || {};
  var base = String(cfg.firebaseUrl || '').trim().replace(/\/+$/, '');
  var root = cfg.rootPath || 'platet';
  // Clave secreta de Firebase: solo se guarda en el navegador del TPV, nunca en
  // el repositorio. Sin ella solo se puede leer la carta y crear pedidos.
  var AUTH_KEY = 'platet-auth:' + root;
  var auth = '';
  try { auth = localStorage.getItem(AUTH_KEY) || ''; } catch (e) { /* sin almacenamiento */ }

  function parts(p) { return String(p || '').split('/').filter(Boolean); }
  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function getAt(obj, ps) {
    for (var i = 0; i < ps.length; i++) {
      if (obj == null || typeof obj !== 'object') return null;
      obj = obj[ps[i]];
    }
    return obj === undefined ? null : obj;
  }

  // Escribe val en la ruta ps y devuelve la nueva raíz. null borra, y los
  // objetos que quedan vacíos se eliminan (igual que hace Firebase).
  function setAt(obj, ps, val) {
    if (!ps.length) return val == null ? null : val;
    if (obj == null || typeof obj !== 'object') obj = {};
    var k = ps[0];
    var child = setAt(obj[k], ps.slice(1), val);
    if (child == null) delete obj[k]; else obj[k] = child;
    return Object.keys(obj).length ? obj : null;
  }

  function conn(state) {
    window.dispatchEvent(new CustomEvent('platet-conn', { detail: state }));
  }

  var local = (function () {
    var KEY = 'platet-db:' + root;
    var listeners = [];
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function fire() {
      var db = load();
      listeners.slice().forEach(function (l) { l.cb(clone(getAt(db, l.ps))); });
    }
    function save(db) {
      localStorage.setItem(KEY, JSON.stringify(db || {}));
      fire();
      return Promise.resolve();
    }
    window.addEventListener('storage', function (e) { if (e.key === KEY) fire(); });
    return {
      get: function (p) { return Promise.resolve(clone(getAt(load(), parts(p)))); },
      set: function (p, v) { return save(setAt(load(), parts(p), clone(v))); },
      update: function (p, obj) {
        var db = load();
        Object.keys(obj).forEach(function (k) {
          db = setAt(db, parts(p).concat(parts(k)), clone(obj[k]));
        });
        return save(db);
      },
      remove: function (p) { return save(setAt(load(), parts(p), null)); },
      on: function (p, cb) {
        var l = { ps: parts(p), cb: cb };
        listeners.push(l);
        cb(clone(getAt(load(), l.ps)));
        return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
      }
    };
  })();

  var cloud = (function () {
    function url(p) {
      return base + '/' + parts(root + '/' + p).map(encodeURIComponent).join('/') + '.json' +
        (auth ? '?auth=' + encodeURIComponent(auth) : '');
    }
    function req(method, p, body) {
      return fetch(url(p), {
        method: method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { conn('error'); throw e; });
    }
    return {
      get: function (p) { return req('GET', p); },
      set: function (p, v) { return v == null ? req('DELETE', p) : req('PUT', p, v); },
      update: function (p, obj) { return req('PATCH', p, obj); },
      remove: function (p) { return req('DELETE', p); },
      on: function (p, cb) {
        var cache = null;
        var es = new EventSource(url(p));
        es.addEventListener('put', function (e) {
          var m = JSON.parse(e.data);
          cache = setAt(cache, parts(m.path), m.data);
          conn('ok');
          cb(clone(cache));
        });
        es.addEventListener('patch', function (e) {
          var m = JSON.parse(e.data);
          Object.keys(m.data || {}).forEach(function (k) {
            cache = setAt(cache, parts(m.path).concat(parts(k)), m.data[k]);
          });
          cb(clone(cache));
        });
        es.onerror = function () { conn('error'); };
        return function () { es.close(); };
      }
    };
  })();

  var impl = base ? cloud : local;
  window.Store = {
    mode: base ? 'cloud' : 'local',
    newId: newId,
    hasAuth: !!auth,
    setAuth: function (key) {
      if (key) localStorage.setItem(AUTH_KEY, key); else localStorage.removeItem(AUTH_KEY);
    },
    get: impl.get,
    set: impl.set,
    update: impl.update,
    remove: impl.remove,
    on: impl.on
  };
})();
