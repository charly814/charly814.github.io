// Almacén de datos compartido entre el TPV (pos.html) y los pedidos QR (pedir.html).
//
// Pensado para cortes de luz y de internet:
//   - Todo se guarda PRIMERO en este dispositivo (localStorage + copia en
//     IndexedDB con escritura "strict", que obliga a grabar en disco). Un
//     apagón no borra lo que ya se ha guardado.
//   - En modo nube, cada cambio entra además en una cola persistente
//     (outbox) que se envía a Firebase en orden cuando hay internet. Si el
//     router está apagado, el TPV sigue funcionando y sincroniza al volver.
//   - Varios cambios pueden escribirse a la vez de forma atómica
//     (Store.update('', {...})), p. ej. cobrar = factura + venta + liberar mesa.
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

  var KEY = 'platet-db:' + root;
  var SEQ_KEY = 'platet-seq:' + root;
  var OUT_KEY = 'platet-outbox:' + root;

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

  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail })); }

  // Estado de conexión. Una conexión en tiempo real que se reconecta también
  // da "error" un instante: solo se avisa de "sin internet" si en 4 s no
  // vuelve a funcionar nada.
  var connTimer = null;
  function connOk() { clearTimeout(connTimer); connTimer = null; emit('platet-conn', 'ok'); }
  function connLost(now) {
    if (now) { clearTimeout(connTimer); connTimer = null; emit('platet-conn', 'error'); return; }
    if (!connTimer) connTimer = setTimeout(function () { connTimer = null; emit('platet-conn', 'error'); }, 4000);
  }

  // ---------------------------------------------------------------- copia local

  var mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { mem = {}; }
    return mem;
  }
  function seq() { return Number(localStorage.getItem(SEQ_KEY)) || 0; }
  function loadOutbox() {
    try { return JSON.parse(localStorage.getItem(OUT_KEY)) || []; } catch (e) { return []; }
  }

  var listeners = [];
  function fire() {
    var db = load();
    listeners.slice().forEach(function (l) { l.cb(clone(getAt(db, l.ps))); });
  }

  function persist(db, outbox) {
    mem = db || {};
    var n = seq() + 1;
    try {
      localStorage.setItem(KEY, JSON.stringify(mem));
      if (outbox) localStorage.setItem(OUT_KEY, JSON.stringify(outbox));
      localStorage.setItem(SEQ_KEY, String(n));
    } catch (e) {
      emit('platet-storage-error', e.message);
    }
    mirror(n);
  }

  // Otra pestaña ha cambiado los datos.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { mem = null; fire(); }
    if (e.key === OUT_KEY) emit('platet-pending', loadOutbox().length);
  });

  // ---------------------------------------------------------------- IndexedDB
  // localStorage puede tardar unos segundos en llegar al disco; IndexedDB con
  // durability "strict" no confirma hasta que está grabado. Al arrancar se usa
  // la copia más reciente de las dos.

  var idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('no-idb'));
      var r = indexedDB.open('platet-' + root, 2);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('snap')) r.result.createObjectStore('snap');
        if (!r.result.objectStoreNames.contains('archive')) r.result.createObjectStore('archive');
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
    return idbP;
  }
  var writing = false, again = false;
  function mirror() {
    if (writing) { again = true; return; }
    writing = true; again = false;
    idb().then(function (d) {
      return new Promise(function (resolve) {
        var tx;
        try { tx = d.transaction('snap', 'readwrite', { durability: 'strict' }); } catch (e) { tx = d.transaction('snap', 'readwrite'); }
        tx.objectStore('snap').put({ seq: seq(), db: load(), outbox: loadOutbox(), at: Date.now() }, 'last');
        tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
      });
    }).catch(function () { /* sin IndexedDB: queda localStorage */ }).then(function () {
      writing = false;
      if (again) mirror();
    });
  }
  // Recuperación al arrancar
  var ready = idb().then(function (d) {
    return new Promise(function (resolve) {
      var g = d.transaction('snap', 'readonly').objectStore('snap').get('last');
      g.onsuccess = function () { resolve(g.result); };
      g.onerror = function () { resolve(null); };
    });
  }).then(function (snap) {
    if (snap && snap.seq > seq()) {
      mem = snap.db || {};
      localStorage.setItem(KEY, JSON.stringify(mem));
      localStorage.setItem(OUT_KEY, JSON.stringify(snap.outbox || []));
      localStorage.setItem(SEQ_KEY, String(snap.seq));
      emit('platet-restored', { seq: snap.seq, at: snap.at });
      fire();
      flush();
    } else if (!snap || snap.seq < seq()) mirror();
  }).catch(function () { /* sin IndexedDB */ });

  // ---------------------------------------------------------------- escrituras

  // ops: [{ps, v}] — se aplican todas juntas (una sola escritura a disco).
  function applyOps(db, ops) {
    ops.forEach(function (o) { db = setAt(db, o.ps, clone(o.v)); });
    return db || {};
  }

  var waiters = {};
  function write(ops, remote, opts) {
    var outbox = null, op = null;
    if (base && remote) {
      outbox = loadOutbox();
      op = Object.assign({ id: newId() }, remote);
      outbox.push(op);
    }
    persist(applyOps(load(), ops), outbox);
    fire();
    if (!op) return Promise.resolve();
    emit('platet-pending', outbox.length);
    var p = Promise.resolve();
    // {wait: ms} espera a que el servidor lo confirme (pedidos de clientes).
    if (opts && opts.wait) {
      p = new Promise(function (resolve, reject) {
        waiters[op.id] = { resolve: resolve, reject: reject };
        setTimeout(function () {
          if (!waiters[op.id]) return;
          if (inFlight === op.id) return;            // ya se está enviando: esperar el resultado
          delete waiters[op.id];
          var ob = loadOutbox().filter(function (x) { return x.id !== op.id; });
          localStorage.setItem(OUT_KEY, JSON.stringify(ob));
          emit('platet-pending', ob.length);
          reject(new Error('timeout'));
        }, opts.wait);
      });
    }
    flush();
    return p;
  }

  // ---------------------------------------------------------------- nube

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
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }

  // Envía la cola en orden, de uno en uno. Con varias pestañas abiertas, solo
  // una envía (Web Locks) para no duplicar.
  var inFlight = null, retryTimer = null, delay = 2000;
  function flush() {
    if (!base || inFlight) return;
    var run = function () {
      return new Promise(function (done) {
        var outbox = loadOutbox();
        if (!outbox.length) { emit('platet-pending', 0); return done(); }
        var op = outbox[0];
        inFlight = op.id;
        req(op.m, op.path, op.m === 'DELETE' ? undefined : op.body).then(function () {
          var ob = loadOutbox().filter(function (x) { return x.id !== op.id; });
          localStorage.setItem(OUT_KEY, JSON.stringify(ob));
          mirror();
          inFlight = null; delay = 2000;
          connOk();
          emit('platet-pending', ob.length);
          if (waiters[op.id]) { waiters[op.id].resolve(); delete waiters[op.id]; }
          done();
          flush();
        }, function (e) {
          inFlight = null;
          connLost(true);
          if (e.status === 400) {
            // petición imposible: se aparta para no bloquear la cola
            var ob = loadOutbox().filter(function (x) { return x.id !== op.id; });
            localStorage.setItem(OUT_KEY, JSON.stringify(ob));
            if (waiters[op.id]) { waiters[op.id].reject(e); delete waiters[op.id]; }
          }
          clearTimeout(retryTimer);
          retryTimer = setTimeout(flush, delay);
          delay = Math.min(delay * 2, 30000);
          done();
        });
      });
    };
    if (navigator.locks && navigator.locks.request) navigator.locks.request('platet-flush-' + root, run);
    else run();
  }
  window.addEventListener('online', function () { delay = 2000; flush(); });
  if (base) setInterval(flush, 20000);

  // Cambios que llegan del servidor: se aplican a la copia local y se vuelven a
  // aplicar encima los cambios propios todavía sin enviar.
  function reapplyPending(db) {
    loadOutbox().forEach(function (op) {
      var ps = parts(op.path);
      if (op.m === 'PUT') db = setAt(db, ps, clone(op.body));
      else if (op.m === 'DELETE') db = setAt(db, ps, null);
      else if (op.m === 'PATCH') Object.keys(op.body || {}).forEach(function (k) { db = setAt(db, ps.concat(parts(k)), clone(op.body[k])); });
    });
    return db || {};
  }
  var streams = {};
  function subscribe(p) {
    if (!base) return;
    var key = parts(p).join('/');
    if (streams[key]) return;
    var es = new EventSource(url(p));
    streams[key] = es;
    function apply(ps, data) {
      var db = load();
      db = setAt(db, parts(p).concat(ps), data);
      persist(reapplyPending(db || {}), null);
      fire();
    }
    es.addEventListener('put', function (e) {
      var m = JSON.parse(e.data);
      apply(parts(m.path), m.data);
      connOk();
      flush();
    });
    es.addEventListener('patch', function (e) {
      var m = JSON.parse(e.data);
      var db = load();
      Object.keys(m.data || {}).forEach(function (k) {
        db = setAt(db, parts(p).concat(parts(m.path), parts(k)), m.data[k]);
      });
      persist(reapplyPending(db || {}), null);
      fire();
    });
    es.onerror = function () { connLost(!navigator.onLine); };
  }

  // ---------------------------------------------------------------- archivo
  // Las ventas de cierres anteriores no caben en localStorage (≈5 MB): se
  // guardan en IndexedDB y, en modo nube, también en el servidor.

  function idbTx(store, mode, fn) {
    return idb().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = d.transaction(store, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); } catch (e) { tx = d.transaction(store, mode); }
        var out = fn(tx.objectStore(store));
        tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function archive(id, data) {
    var p = idbTx('archive', 'readwrite', function (st) { st.put(clone(data), id); });
    if (base) {
      var ob = loadOutbox();
      ob.push({ id: newId(), m: 'PUT', path: 'archive/' + id, body: clone(data) });
      localStorage.setItem(OUT_KEY, JSON.stringify(ob));
      emit('platet-pending', ob.length);
      flush();
    }
    return p;
  }
  function readArchive() {
    var local = idbTx('archive', 'readonly', function (st) { return st.getAll(); }).catch(function () { return []; });
    if (!base) return local;
    return Promise.all([local, req('GET', 'archive').catch(function () { return null; })]).then(function (r) {
      var all = r[0] || [];
      var seen = {};
      all.forEach(function (a) { if (a && a.id) seen[a.id] = 1; });
      Object.keys(r[1] || {}).forEach(function (k) { if (!seen[k]) all.push(r[1][k]); });
      return all;
    });
  }

  // ---------------------------------------------------------------- API

  window.Store = {
    mode: base ? 'cloud' : 'local',
    newId: newId,
    hasAuth: !!auth,
    ready: ready,
    setAuth: function (key) {
      if (key) localStorage.setItem(AUTH_KEY, key); else localStorage.removeItem(AUTH_KEY);
    },
    pending: function () { return base ? loadOutbox().length : 0; },
    archive: archive,
    readArchive: readArchive,
    get: function (p) {
      var v = getAt(load(), parts(p));
      if (v != null || !base) return Promise.resolve(clone(v));
      return req('GET', p).then(function (r) {
        if (r != null) { persist(reapplyPending(setAt(load(), parts(p), r) || {}), null); fire(); }
        return clone(getAt(load(), parts(p)));
      }, function () { return null; });
    },
    set: function (p, v, opts) {
      return write([{ ps: parts(p), v: v }], v == null ? { m: 'DELETE', path: p } : { m: 'PUT', path: p, body: clone(v) }, opts);
    },
    // Varias rutas a la vez, de forma atómica: Store.update('', {'a/b': 1, 'c': null})
    update: function (p, obj, opts) {
      var ops = Object.keys(obj).map(function (k) { return { ps: parts(p).concat(parts(k)), v: obj[k] }; });
      return write(ops, { m: 'PATCH', path: p, body: clone(obj) }, opts);
    },
    remove: function (p, opts) {
      return write([{ ps: parts(p), v: null }], { m: 'DELETE', path: p }, opts);
    },
    on: function (p, cb) {
      var l = { ps: parts(p), cb: cb };
      listeners.push(l);
      cb(clone(getAt(load(), l.ps)));
      subscribe(p);
      return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
    }
  };
  flush();
})();
