// TPV Platet: usuarios con PIN, plano de mesas, tickets con modificadores
// (sin / extra / preparación), artículos fuera de carta, cobro, caja (X/Z),
// pedidos QR y ajustes. Todos los datos pasan por Store (local o nube).
(function () {
  'use strict';

  var P = window.Platet;
  var fmt = P.fmt, esc = P.esc, round2 = P.round2;
  var I = I18N.init('platet-lang-pos');
  var t = function (k, v) { return I.t(k, v); };
  var QUICK = 'RAPIDA';
  var METHODS = ['efectivo', 'tarjeta', 'bizum'];
  var METHOD_ES = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum' };

  var S = {
    view: 'login',
    user: null,
    table: null,
    cat: null,
    sel: -1,
    buf: '',
    moveFrom: null,
    showTicket: false,
    conn: Store.mode === 'local' ? 'local' : 'connecting',
    menu: P.DEFAULT_MENU,
    mods: P.DEFAULT_MODS,
    users: P.DEFAULT_USERS,
    settings: P.DEFAULT_SETTINGS,
    tickets: {},
    raw: {},
    layout: P.LAYOUT,
    temp: {},
    joins: {},
    qr: P.DEFAULT_QR,
    joinInto: null,
    joinPick: false,
    joinFrom: null,
    editLayout: false,
    orders: {},
    sales: {},
    closures: {},
    prints: {},
    counters: {},
    pending: Store.pending(),
    recovery: null
  };

  // ---------------------------------------------------------------- apagones
  // Mientras el TPV está abierto deja un "latido" cada 5 s. Si al arrancar el
  // latido sigue ahí (y no es de otra pestaña viva), el TPV se apagó de golpe:
  // corte de luz, cuelgue o cierre forzado.
  var ALIVE = 'platet-alive';
  (function () {
    try {
      var prev = JSON.parse(localStorage.getItem(ALIVE) || 'null');
      if (prev && prev.at && Date.now() - prev.at > 8000) S.recovery = { at: prev.at };
    } catch (e) { /* ignorar */ }
    var beat = function () { try { localStorage.setItem(ALIVE, JSON.stringify({ at: Date.now() })); } catch (e) { /* ignorar */ } };
    beat();
    setInterval(beat, 5000);
    window.addEventListener('pagehide', function () { try { localStorage.removeItem(ALIVE); } catch (e) { /* ignorar */ } });
  })();
  window.addEventListener('platet-pending', function (e) {
    if (S.pending !== e.detail) { S.pending = e.detail; render(); }
  });
  window.addEventListener('platet-storage-error', function (e) { toast(t('sync.storageErr', { e: e.detail })); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });

  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');
  var mobile = function () { return window.innerWidth <= 860; };

  // ---------------------------------------------------------------- datos

  Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });
  Store.on('mods', function (v) { S.mods = v || P.DEFAULT_MODS; render(); });
  Store.on('users', function (v) {
    S.users = v || P.DEFAULT_USERS;
    if (!S.user) {
      var name = null;
      try { name = sessionStorage.getItem('platet-session'); } catch (e) { /* ignorar */ }
      var u = name && S.users.filter(function (x) { return x.name === name; })[0];
      if (u) {
        S.user = u; S.view = 'map';
        // "Abrir el editor de plano" desde el back-office
        try {
          if (sessionStorage.getItem('platet-open-layout') && u.admin) S.editLayout = true;
          sessionStorage.removeItem('platet-open-layout');
        } catch (e) { /* ignorar */ }
      }
    }
    render();
  });
  Store.on('settings', function (v) { S.settings = Object.assign({}, P.DEFAULT_SETTINGS, v || {}); render(); });
  Store.on('tickets', function (v) {
    S.raw = v || {};
    S.tickets = {};
    Object.keys(S.raw).forEach(function (k) {
      var tk = toTicket(k, S.raw[k]);
      if (tk) S.tickets[k] = tk;
    });
    render();
  });
  Store.on('sales', function (v) { S.sales = v || {}; render(); });
  Store.on('closures', function (v) {
    S.closures = v || {};
    // Cierres antiguos que aún llevan todas las ventas dentro: se pasan al archivo.
    Object.keys(S.closures).forEach(function (k) {
      var c = S.closures[k];
      if (!c.sales || archiving[k]) return;
      archiving[k] = true;
      Store.archive(k, { id: k, closedAt: c.closedAt, sales: c.sales }).then(function () { Store.remove('closures/' + k + '/sales'); });
    });
    render();
  });
  var archiving = {};
  Store.on('prints', function (v) { S.prints = v || {}; render(); });
  Store.on('audit', function (v) { S.audit = v || {}; });
  Store.on('layout', function (v) { S.layout = (v && v.length) ? v : P.LAYOUT; render(); });
  Store.on('temp', function (v) { S.temp = v || {}; render(); });
  Store.on('joins', function (v) { S.joins = v || {}; render(); });
  Store.on('public/qr', function (v) { S.qr = Object.assign({}, P.DEFAULT_QR, v || {}); render(); });
  // el estado del horario cambia con la hora
  setInterval(function () { if (S.view === 'map' && modal.classList.contains('hidden')) render(); }, 60000);
  Store.on('counters', function (v) { S.counters = v || {}; });
  Store.on('orders', function (v) {
    var before = pendingOrders().length;
    S.orders = v || {};
    var now = pendingOrders();
    if (now.length > before && S.user) {
      beep();
      toast(t('msg.newAlert', { t: tableLabel(now[now.length - 1].table) }));
    }
    render();
    if (modal.dataset.kind === 'orders') openOrders();
  });
  // En modo nube, lo que aprende un móvil lo aprenden todos.
  var voiceSync = false;
  Voice.onMemChange = function (m) { if (!voiceSync && Store.mode === 'cloud') Store.set('voice', m); };
  Store.on('voice', function (v) {
    if (!v || Store.mode !== 'cloud') return;
    voiceSync = true; Voice.importMem(v, true); voiceSync = false;
  });

  // Sin internet (solo importa en modo nube: lo de este dispositivo no llega a los demás)
  function offline() { return Store.mode === 'cloud' && (S.conn === 'error' || !navigator.onLine); }
  window.addEventListener('offline', function () { render(); });
  window.addEventListener('online', function () { render(); });
  function offlineBanner() {
    return offline() ? '<div class="offline-banner">' + t('off.banner') + (S.pending ? ' <b>' + t('sync.pending', { n: S.pending }) + '</b>' : '') + '</div>' : '';
  }

  window.addEventListener('platet-conn', function (e) {
    if (S.conn !== e.detail) {
      var was = offline();
      S.conn = e.detail;
      if (was && !offline()) toast(t('off.back', { n: S.pending || 0 }));
      render();
    }
  });

  function pendingOrders() {
    return Object.keys(S.orders).map(function (k) { return S.orders[k]; })
      .filter(function (o) { return o && o.status === 'new'; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
  }

  function isAdmin() { return S.user && S.user.admin; }
  function can(perm) { return P.can(S.user, perm); }

  // Si el empleado no tiene permiso, un administrador lo autoriza con su PIN
  // (queda apuntado quién lo autorizó en S.authBy mientras dura la acción).
  function allow(perm, fn) {
    if (can(perm)) return fn();
    askSupervisor(perm, fn);
  }

  // Registro de acciones sensibles (se ve en Gestión → Permisos y registro)
  var KEEP_AUDIT = 400;
  function audit(action, detail) {
    var id = Store.newId();
    var rec = { id: id, at: Date.now(), user: S.user ? S.user.name : '', by: S.authBy || null, action: action, table: S.table || null, detail: String(detail || '').slice(0, 200) };
    var upd = {};
    upd['audit/' + id] = rec;
    var keys = Object.keys(S.audit || {});
    if (keys.length >= KEEP_AUDIT + 20) {
      keys.map(function (k) { return S.audit[k]; }).sort(function (a, b) { return a.at - b.at; }).slice(0, keys.length - KEEP_AUDIT)
        .forEach(function (r) { upd['audit/' + r.id] = null; });
    }
    Store.update('', upd);
  }

  function ticketOf(table) {
    var tk = S.tickets[table];
    if (tk) { tk.lines = tk.lines || []; return tk; }
    return { table: table, lines: [], discountPct: 0, discountEur: 0 };
  }

  // ---------------------------------------------------------------- sincronizar por líneas
  // Cada línea del ticket tiene su propio id y se guarda en tickets/T5/lines/<id>.
  // Los cambios se envían línea a línea (no el ticket entero), así si dos
  // dispositivos trabajan sin internet sobre la misma mesa, al volver la
  // conexión se conservan las líneas de los dos.
  var DEV = (function () {
    try {
      var d = localStorage.getItem('platet-device');
      if (!d) { d = Math.random().toString(36).slice(2, 8); localStorage.setItem('platet-device', d); }
      return d;
    } catch (e) { return 'x'; }
  })();
  var TK_FIELDS = ['table', 'openedAt', 'user', 'discountPct', 'discountEur'];

  function toTicket(table, raw) {
    if (!raw) return null;
    var tk = { table: table, discountPct: raw.discountPct || 0, discountEur: raw.discountEur || 0, openedAt: raw.openedAt, user: raw.user };
    var src = raw.lines || {};
    // Una línea sin nombre es un resto de un cambio llegado tarde a una línea ya cobrada o borrada.
    tk.lines = Object.keys(src).map(function (id) { return Object.assign({}, src[id], { id: id }); })
      .filter(function (l) { return l.name != null && l.qty != null; })
      .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0) || (a.id < b.id ? -1 : 1); });
    return tk;
  }

  function same(a, b) { return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b); }

  // Diferencias entre lo guardado y el ticket nuevo, como rutas relativas.
  function ticketDiff(tk) {
    var old = S.raw[tk.table] || {};
    var d = {};
    TK_FIELDS.forEach(function (k) { if (!same(old[k], tk[k])) d[k] = tk[k] == null ? null : tk[k]; });
    // orden: las líneas nuevas se colocan entre sus vecinas
    tk.lines.forEach(function (l, i) {
      if (!l.id) l.id = Store.newId();
      if (l.ord == null) {
        var prev = i > 0 ? tk.lines[i - 1].ord : 0;
        var next = null;
        for (var j = i + 1; j < tk.lines.length; j++) if (tk.lines[j].ord != null) { next = tk.lines[j].ord; break; }
        l.ord = next == null ? Math.max(prev + 1, Date.now()) : (prev + next) / 2;
      }
    });
    var ol = old.lines || {}, nl = {};
    tk.lines.forEach(function (l) { var c = Object.assign({}, l); delete c.id; nl[l.id] = c; });
    Object.keys(ol).forEach(function (id) { if (!nl[id]) d['lines/' + id] = null; });
    Object.keys(nl).forEach(function (id) {
      if (!ol[id] || typeof ol[id] !== 'object') { d['lines/' + id] = nl[id]; return; }
      Object.keys(Object.assign({}, ol[id], nl[id])).forEach(function (f) {
        if (!same(ol[id][f], nl[id][f])) d['lines/' + id + '/' + f] = nl[id][f] == null ? null : nl[id][f];
      });
    });
    return d;
  }

  // Añade a upd (escritura atómica desde la raíz) los cambios de un ticket.
  function ticketPatch(tk, upd) {
    if (!tk.lines.length && !tk.discountPct && !tk.discountEur) { upd['tickets/' + tk.table] = null; return upd; }
    var d = ticketDiff(tk);
    Object.keys(d).forEach(function (k) { upd['tickets/' + tk.table + '/' + k] = d[k]; });
    return upd;
  }

  function saveTicket(tk) {
    if (!tk.lines.length && !tk.discountPct && !tk.discountEur) {
      delete S.tickets[tk.table];
      return Store.remove('tickets/' + tk.table);
    }
    if (!tk.openedAt) { tk.openedAt = Date.now(); tk.user = S.user.name; }
    S.tickets[tk.table] = tk;
    var d = ticketDiff(tk);
    if (!Object.keys(d).length) return Promise.resolve();
    return Store.update('tickets/' + tk.table, d);
  }

  function tableLabel(id) { return id === QUICK ? t('quickSale') : t('table', { t: id }); }

  // ---------------------------------------------------------------- mesas
  // Plano fijo (S.layout, editable por el administrador) + mesas temporales
  // (S.temp: terraza, mesas añadidas al lado) + mesas juntadas (S.joins:
  // hija -> principal; la cuenta va siempre en la principal).
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function tempList() {
    return Object.keys(S.temp).map(function (k) { return S.temp[k]; }).sort(function (a, b) { return a.at - b.at; });
  }
  function allTables() {
    var out = S.layout.map(function (tb) { return Object.assign({}, tb); });
    var byId = {};
    out.forEach(function (tb) { byId[tb.id] = tb; });
    // Cada mesa temporal se coloca en el hueco más libre alrededor de su vecina
    // (el plano es 1,45 veces más ancho que alto: se corrige al medir distancias).
    function clearance(x, y) {
      return out.reduce(function (m, o) {
        var dx = o.x - x, dy = (o.y - y) / 1.45;
        return Math.min(m, Math.sqrt(dx * dx + dy * dy));
      }, 99);
    }
    var loose = 0;
    tempList().forEach(function (tp) {
      var near = tp.near && byId[tp.near];
      var x, y;
      if (near) {
        var best = null;
        [6, 8, 10, 13].some(function (r) {
          for (var a = 0; a < 8; a++) {
            var ang = Math.PI / 2 + a * Math.PI / 4;         // empieza por debajo
            var cx = clamp(near.x + Math.cos(ang) * r, 3, 97), cy = clamp(near.y + Math.sin(ang) * r * 1.45, 3, 97);
            var c = clearance(cx, cy);
            if (!best || c > best.c) best = { x: cx, y: cy, c: c };
          }
          return best.c >= 5;
        });
        x = best.x; y = best.y;
      } else { loose++; x = 4; y = 4 + loose * 9; }
      out.push({ id: tp.id, x: x, y: y, shape: 'square', temp: true, near: tp.near || null });
    });
    return out;
  }
  // Orden para la lista del móvil: cada mesa temporal justo después de su vecina.
  function tablesForList() {
    var all = allTables(), out = [];
    var temps = all.filter(function (x) { return x.temp; });
    all.filter(function (x) { return !x.temp; }).forEach(function (tb) {
      out.push(tb);
      temps.filter(function (x) { return x.near === tb.id; }).forEach(function (x) { out.push(x); });
    });
    return out.concat(temps.filter(function (x) { return !x.near || !S.layout.some(function (tb) { return tb.id === x.near; }); }));
  }
  function tableExists(id) { return id === QUICK || S.layout.some(function (tb) { return tb.id === id; }) || !!S.temp[id]; }
  function mainOf(id) {
    var m = id, guard = 0;
    while (S.joins[m] && guard++ < 10) m = S.joins[m];
    return m;
  }
  function childrenOf(id) { return Object.keys(S.joins).filter(function (c) { return S.joins[c] === id; }); }

  // Al cerrar la cuenta de una mesa: se deshacen sus uniones y desaparecen sus mesas temporales.
  function closeTablePatch(table, upd) {
    childrenOf(table).forEach(function (c) {
      upd['joins/' + c] = null;
      if (S.temp[c]) upd['temp/' + c] = null;
    });
    if (S.joins[table]) upd['joins/' + table] = null;
    if (S.temp[table]) upd['temp/' + table] = null;
    return upd;
  }

  function qrStateText() {
    var st = P.qrStatus(S.qr);
    if (st.reason === 'paused') return { cls: 'off', text: t('qr.stPaused') };
    if (!st.open) return { cls: 'off', text: t('qr.stClosed') };
    if (!st.kitchen) return { cls: 'warn', text: t('qr.stKitchen') };
    return { cls: 'on', text: t('qr.stOpen') };
  }
  function qrControls() {
    var st = qrStateText();
    var kOff = S.qr.kitchenOffUntil && S.qr.kitchenOffUntil > Date.now();
    return '<span class="qr-state ' + st.cls + '">' + st.text + '</span>' +
      '<button class="btn" data-act="qr-pause">' + t(S.qr.paused ? 'qr.resume' : 'qr.pause') + '</button>' +
      '<button class="btn" data-act="kitchen-toggle">' + t(kOff ? 'qr.kitchenOn' : 'qr.kitchenOff') + '</button>';
  }
  function tableLabelEs(id) { return id === QUICK ? 'Venta rápida' : 'Mesa ' + id; }

  // Nombre de una línea en el idioma del TPV (las líneas guardan el nombre en español).
  function lineName(l) {
    var it = l.pid && P.findItem(S.menu, l.pid);
    return it ? P.tr(it, I.lang) : l.name;
  }
  function extrasOf(mods) {
    return round2((mods || []).reduce(function (s, m) { return s + (m.type === 'extra' ? (m.price || 0) : 0); }, 0));
  }
  function sameMods(a, b) {
    var ka = (a || []).map(function (m) { return m.id; }).sort().join();
    var kb = (b || []).map(function (m) { return m.id; }).sort().join();
    return ka === kb;
  }

  // ---------------------------------------------------------------- render

  // repintado agrupado (p. ej. cuando terminan de cargar varias fotos)
  var raf = 0;
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }

  function render() {
    if (!S.user) S.view = 'login';
    if (Store.mode === 'cloud' && !Store.hasAuth) S.view = 'setup';
    app.innerHTML = (S.user ? offlineBanner() : '') + ({
      setup: viewSetup, login: viewLogin, map: viewMap, ticket: viewTicket, caja: viewCaja
    })[S.view]();
  }
  window.addEventListener('resize', function () { if (S.view === 'ticket' && !mobile() && S.showTicket) { S.showTicket = false; render(); } });

  function langSwitch() {
    return '<span class="lang">' + Object.keys(I.LANGS).map(function (l) {
      return '<button class="' + (I.lang === l ? 'on' : '') + '" data-act="lang" data-l="' + l + '">' + I.LANGS[l] + '</button>';
    }).join('') + '</span>';
  }

  function topbar(title) {
    var n = pendingOrders().length;
    var conn = S.conn === 'local' ? '<span class="conn">' + t('conn.local') + '</span>'
      : S.conn === 'error' ? '<span class="conn err">' + t('conn.err') + '</span>'
        : '<span class="conn">' + t('conn.ok') + '</span>';
    if (S.pending) conn += ' <span class="conn err">' + t('sync.pending', { n: S.pending }) + '</span>';
    return '<header class="topbar"><div><small>TPV/' + esc(S.user.name) + ' · ' + conn + '</small><h1>' + esc(title) + '</h1></div>' +
      '<div class="tb-actions">' +
      '<button class="tb-btn' + (n ? ' primary' : '') + '" data-act="orders">📲 ' + t('tb.orders') + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>' +
      (S.view !== 'map' ? '<button class="tb-btn" data-act="go" data-v="map">🪑 ' + t('tb.tables') + '</button>' : '<button class="tb-btn" data-act="open-table" data-id="' + QUICK + '">⚡ ' + t('quickSale') + '</button>') +
      '<button class="tb-btn" data-act="go" data-v="caja">💶 ' + t('tb.caja') + '</button>' +
      (isAdmin() ? '<button class="tb-btn" data-act="go" data-v="admin">⚙️ ' + t('tb.admin') + '</button>' : '') +
      langSwitch() +
      '<button class="tb-btn" data-act="logout">⎋ ' + t('tb.logout') + '</button>' +
      '</div></header>';
  }

  function viewSetup() {
    return '<section class="login"><div style="display:flex;justify-content:space-between;align-items:center"><h1>' + t('setup.title') + '</h1>' + langSwitch() + '</div>' +
      '<div class="card" style="max-width:560px"><p>' + t('setup.p1') + '</p><p class="muted">' + t('setup.p2') + '</p>' +
      '<div class="field"><input id="auth-key" type="password" autocomplete="off" placeholder="' + t('setup.placeholder') + '"></div>' +
      '<button class="btn primary" data-act="save-auth">' + t('setup.save') + '</button></div></section>';
  }

  function recentPrints(from, to) {
    return Object.keys(S.prints).map(function (k) { return S.prints[k]; })
      .filter(function (r) { return r.at >= from && r.at <= to; })
      .sort(function (a, b) { return a.at - b.at; });
  }

  function recoveryCard() {
    if (!S.recovery) return '';
    var open = Object.keys(S.tickets).map(function (k) { return S.tickets[k]; }).filter(function (x) { return (x.lines || []).length; });
    var sum = open.reduce(function (a, x) { return a + P.ticketTotals(x).total; }, 0);
    var prints = recentPrints(S.recovery.at - 10 * 60000, S.recovery.at + 10000);
    return '<div class="card recovery"><h3>' + t('rec.title', { t: time(S.recovery.at) }) + '</h3>' +
      '<p>' + t('rec.body', { n: open.length, s: fmt(sum) }) + '</p>' +
      (S.pending ? '<p>' + t('rec.pending', { n: S.pending }) + '</p>' : '') +
      (prints.length ? '<p>' + t('rec.prints') + '</p>' + printsTable(prints) : '') +
      '<button class="btn primary" data-act="rec-ok">' + t('rec.ok') + '</button></div>';
  }

  function printsTable(list) {
    return '<div class="scroll-x"><table class="list">' + list.map(function (r) {
      return '<tr><td><b>#' + r.n + '</b></td><td>' + time(r.at) + '</td><td>' + esc(tableLabel(r.table)) + '</td><td class="muted">' +
        esc(r.lines.map(function (l) { return fmtQty(l.qty) + '× ' + l.name; }).join(', ')) + '</td>' +
        '<td>' + (r.reprints ? '<small class="muted">×' + (r.reprints + 1) + '</small> ' : '') + '<button class="btn" data-act="reprint-k" data-id="' + esc(r.id) + '">🖨️ ' + t('k.reprint') + '</button></td></tr>';
    }).join('') + '</table></div>';
  }

  function viewLogin() {
    return '<section class="login">' + recoveryCard() + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h1>' + t('login.title') + '</h1>' + langSwitch() + '</div>' +
      '<div class="user-grid">' +
      S.users.map(function (u, i) {
        return '<button class="user-tile" data-act="pick-user" data-i="' + i + '">' + esc(u.name) + '</button>';
      }).join('') +
      '</div><div class="brand">🍴 <b>TPV</b> Platet</div>' +
      '<p class="mode-note">' + (Store.mode === 'local' ? t('login.local')
        : S.conn === 'error'
          ? '<span class="warn">' + t('login.connErr') + ' <button class="btn" data-act="reset-auth">' + t('login.changeKey') + '</button></span>'
          : t('login.cloud')) + '</p></section>';
  }

  function viewMap() {
    var orderTables = {};
    pendingOrders().forEach(function (o) { orderTables[o.table] = (orderTables[o.table] || 0) + 1; });
    function state(id) {
      var main = mainOf(id);
      var tk = S.tickets[main];
      return {
        busy: tk && (tk.lines || []).length, total: tk ? P.ticketTotals(tk).total : 0, qr: orderTables[id] || 0,
        joinedTo: main !== id ? main : null, hasChildren: childrenOf(id).length > 0
      };
    }
    function classes(base, tb, st) {
      return base + (st.busy ? ' busy' : '') + (st.qr ? ' qr' : '') + (tb.temp ? ' temp' : '') + (st.joinedTo ? ' joined' : '');
    }
    var editing = S.editLayout;
    var tables = editing ? S.layout : allTables();
    var floor = tables.map(function (tb) {
      var st = state(tb.id);
      var attrs = editing ? 'data-drag="' + esc(tb.id) + '"' : 'data-act="open-table" data-id="' + esc(tb.id) + '"';
      return '<button class="' + classes('tbl ' + tb.shape, tb, st) + '" style="left:' + tb.x + '%;top:' + tb.y + '%" ' + attrs + '>' +
        '<span>' + esc(tb.id) + '</span>' +
        (st.joinedTo ? '<small>→' + esc(st.joinedTo) + '</small>' : st.busy && tb.shape !== 'stool' ? '<small>' + fmt(st.total) + '</small>' : '') +
        (st.hasChildren ? '<i class="link">🔗</i>' : '') +
        (st.qr ? '<i class="alert">QR ' + st.qr + '</i>' : '') + '</button>';
    }).join('');
    // En el móvil, una cuadrícula de botones es más rápida que el plano.
    var list = tablesForList().map(function (tb) {
      var st = state(tb.id);
      return '<button class="' + classes('tl', tb, st) + '" data-act="open-table" data-id="' + esc(tb.id) + '">' +
        '<b>' + esc(tb.id) + '</b>' +
        (st.joinedTo ? '<small>→' + esc(st.joinedTo) + '</small>' : st.busy ? '<small>' + fmt(st.total) + '</small>' : '') +
        (st.hasChildren ? '<i class="link">🔗</i>' : '') +
        (st.qr ? '<i class="alert">QR</i>' : '') + '</button>';
    }).join('');
    var quick = S.tickets[QUICK] && (S.tickets[QUICK].lines || []).length;
    var tools = editing
      ? '<div class="map-tools"><span class="muted">' + t('map.editHint') + '</span>' +
        '<button class="btn primary" data-act="layout-add">' + t('map.addTable') + '</button>' +
        '<button class="btn" data-act="layout-reset">' + t('map.resetLayout') + '</button>' +
        '<button class="btn ok" data-act="layout-edit">' + t('map.editDone') + '</button></div>'
      : '<div class="map-tools">' +
        '<button class="btn temp-btn" data-act="temp-new">' + t('map.tempAdd') + '</button>' +
        '<button class="btn" data-act="join-start">' + t('map.join') + '</button>' +
        qrControls() +
        (isAdmin() ? '<button class="btn" data-act="layout-edit">' + t('map.edit') + '</button>' : '') + '</div>';
    return topbar(t('map.title')) +
      (S.recovery ? '<div style="padding:12px 12px 0">' + recoveryCard() + '</div>' : '') +
      tools +
      (S.moveFrom ? '<div class="banner"><span>' + t('map.move', { t: '<b>' + esc(tableLabel(S.moveFrom)) + '</b>' }) + '</span><button class="btn" data-act="move-cancel">' + t('cancel') + '</button></div>' : '') +
      (S.joinPick ? '<div class="banner"><span>' + t('map.joinPick') + '</span><button class="btn" data-act="join-done">' + t('cancel') + '</button></div>' : '') +
      (S.joinInto ? '<div class="banner"><span>' + t('map.joinBanner', { t: '<b>' + esc(S.joinInto) + '</b>' }) + '</span><button class="btn ok" data-act="join-done">' + t('done') + '</button></div>' : '') +
      (quick ? '<div class="banner"><span>' + t('map.quickOpen', { n: fmt(P.ticketTotals(S.tickets[QUICK]).total) }) + '</span><button class="btn" data-act="open-table" data-id="' + QUICK + '">' + t('open') + '</button></div>' : '') +
      '<div class="map-view' + (editing ? ' map-edit' : '') + '"><div class="floor-wrap"><div class="floor' + (editing ? ' editing' : '') + '">' +
      '<div class="bar-h"></div><div class="bar-v"></div>' +
      '<span class="plant" style="left:89%;top:19%">🌳</span><span class="plant" style="left:17%;top:70%">🌳</span>' +
      floor + '</div></div>' +
      '<div class="tbl-list">' + list + '</div></div>' +
      '<div class="legend"><span class="l-free">' + t('legend.free') + '</span><span class="l-busy">' + t('legend.busy') + '</span><span class="l-qr">' + t('legend.qr') + '</span>' +
      '<span class="l-temp">' + t('legend.temp') + '</span><span class="l-joined">' + t('legend.joined') + '</span></div>';
  }

  function viewTicket() {
    var tk = ticketOf(S.table);
    var tot = P.ticketTotals(tk);
    if (!S.cat || !S.menu.some(function (c) { return c.id === S.cat; })) S.cat = S.menu[0] && S.menu[0].id;
    var cat = S.menu.filter(function (c) { return c.id === S.cat; })[0];
    var count = tk.lines.reduce(function (s, l) { return s + l.qty; }, 0);

    var lines = tk.lines.map(function (l, i) {
      var sub = [P.modsText(l.mods, I.lang), l.note].filter(Boolean).join(' · ');
      return '<div class="tk-line' + (i === S.sel ? ' sel' : '') + '" data-act="sel-line" data-i="' + i + '">' +
        '<span>' + fmtQty(l.qty) + '</span>' +
        '<span>' + esc(lineName(l)) + (l.src === 'qr' ? '<i class="tag qr">QR</i>' : '') + (l.src === 'voice' ? '<i class="tag voice">🎤</i>' : '') + (l.free ? '<i class="tag free">✎</i>' : '') +
        (l.sent ? '<i class="tag sent">✓ ' + t('tk.kitchen') + '</i>' : '') +
        (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span>' +
        '<span>' + fmt(l.price).replace(' €', '') + '</span><span>' + fmt(l.price * l.qty).replace(' €', '') + '</span></div>';
    }).join('');

    var key = function (k, label, cls) {
      return '<button class="' + (cls || '') + '" data-act="key" data-k="' + k + '">' + (label || k) + '</button>';
    };

    return '<div class="ticket-view' + (S.showTicket ? ' show' : '') + '">' +
      '<section class="tk-left">' +
      '<div class="tk-head"><div><h2>' + esc(tableLabel(S.table)) + (S.temp[S.table] ? ' <i class="tag temp">' + t('legend.temp') + '</i>' : '') + '</h2><small>' + esc(tk.user || S.user.name) + '</small></div><small>' + new Date().toLocaleDateString('es-ES') + '</small></div>' +
      (childrenOf(S.table).length ? '<div class="joined-row">🔗 ' + t('tk.joined') + ': ' + childrenOf(S.table).map(function (c) {
        return '<button class="chip" data-act="unjoin" data-id="' + esc(c) + '" title="' + esc(t('tk.unjoin', { c: c })) + '">' + esc(c) + ' ✕</button>';
      }).join('') + '</div>' : '') +
      '<div class="tk-cols"><span>' + t('tk.units') + '</span><span>' + t('tk.product') + '</span><span>' + t('tk.price') + '</span><span>' + t('total') + '</span></div>' +
      '<div class="tk-lines">' + (lines || '<p class="muted" style="padding:14px">' + t('tk.empty') + '</p>') + '</div>' +
      (S.sel >= 0 ? '<p class="muted hint">' + t('tk.tapAgain') + '</p>' : '') +
      '<div class="tk-total">' +
      (tot.discount ? '<div class="row"><span>' + t('subtotal') + '</span><span>' + fmt(tot.subtotal) + '</span></div><div class="row"><span>' + t('discount') + (tk.discountPct ? ' ' + tk.discountPct + '%' : '') + '</span><span>−' + fmt(tot.discount) + '</span></div>' : '') +
      '<div class="row big"><span>' + t('total') + '</span><span>' + fmt(tot.total) + '</span></div></div>' +
      '<div class="numpad"><div class="disp">' + (S.buf ? esc(S.buf) : '<span class="muted">' + t('tk.numHint') + '</span>') + '</div>' +
      key('7') + key('8') + key('9') + key('DTO%', 'DTO%', 'fn') +
      key('4') + key('5') + key('6') + key('DTO€', 'DTO €', 'fn') +
      key('1') + key('2') + key('3') + key('PREC', 'PREC', 'fn') +
      key('0') + key(',') + key('CLR', 'CLR', 'fn') + key('CANT', 'CANT', 'fn') +
      '</div>' +
      '<nav class="m-ticket-actions">' +
      act('mods', '✏️', t('act.mod')) + act('qty-minus', '➖', t('act.minus')) + act('qty-plus', '➕', t('act.plus')) +
      act('del-line', '🗑️', t('act.del')) + act('kitchen', '👨‍🍳', t('act.kitchen')) +
      act('hide-ticket', '↩', t('act.back')) +
      '<button class="act pay" data-act="pay"><b>💶</b>' + t('act.pay') + ' ' + fmt(tot.total) + '</button></nav>' +
      '</section>' +
      '<section class="tk-right">' +
      '<div class="m-bar"><button class="btn" data-act="go" data-v="map">←</button><b>' + esc(tableLabel(S.table)) + '</b>' +
      '<button class="btn voice-btn" data-act="voice">🎤</button>' +
      '<button class="btn primary" data-act="show-ticket">🧾 ' + fmtQty(count) + ' · ' + fmt(tot.total) + '</button></div>' +
      '<div class="cats">' + S.menu.map(function (c) {
        var cu = c.img ? Store.imageURL('c-' + c.id, c.img, later) : '';
        return '<button class="cat' + (c.id === S.cat ? ' on' : '') + (cu ? ' has-img' : '') + '" data-act="cat" data-id="' + esc(c.id) + '">' +
          (cu ? '<img src="' + cu + '" alt="">' : '<b>' + esc(c.icon || '🍽️') + '</b>') + esc(P.tr(c, I.lang)) + '</button>';
      }).join('') + '</div>' +
      '<div class="prods">' + ((cat && cat.items) || []).map(function (it) {
        // foto del producto (subida en el back-office), como en los TPV de toda la vida
        var pu = it.img ? Store.imageURL('p-' + it.id, it.img, later) : '';
        return '<button class="prod' + (it.available === false ? ' off' : '') + (pu ? ' has-img' : '') + '" data-act="add" data-id="' + esc(it.id) + '">' +
          (pu ? '<img src="' + pu + '" alt="">' : '') + '<span>' + esc(P.tr(it, I.lang)) + '</span><b>' + fmt(it.price) + '</b></button>';
      }).join('') + '</div>' +
      '<nav class="actions">' +
      act('go', '🪑', t('tb.tables'), 'data-v="map"') +
      (pendingOrders().length ? act('orders', '📲', t('tb.orders') + ' (' + pendingOrders().length + ')', '', 'alert-act') : '') +
      act('print-ticket', '🖨️', t('act.print')) +
      act('drawer', '💶', t('act.drawer')) +
      act('kitchen', '👨‍🍳', t('act.kitchen')) +
      act('voice', '🎤', t('act.voice'), '', 'voice-act') +
      act('mods', '✏️', t('act.mod')) +
      act('free', '✎', t('act.free')) +
      act('qty-minus', '➖', t('act.minus')) +
      act('qty-plus', '➕', t('act.plus')) +
      act('del-line', '🗑️', t('act.del')) +
      act('move', '⇄', t('act.move')) +
      act('join', '🔗', t('act.join')) +
      act('temp-near', '➕', t('act.tempNear')) +
      act('table-qr', '🔳', t('act.qr')) +
      (S.temp[S.table] && !tk.lines.length ? act('temp-del', '🗑️', t('act.tempDel'), '', 'danger') : '') +
      act('cancel-ticket', '✖', t('act.cancel'), '', 'danger') +
      '<button class="act pay" data-act="pay"><b>💶</b>' + t('act.pay') + ' ' + fmt(tot.total) + '</button>' +
      '</nav></section></div>';
  }

  function act(name, icon, label, extra, cls) {
    return '<button class="act ' + (cls || '') + '" data-act="' + name + '" ' + (extra || '') + '><b>' + icon + '</b>' + label + '</button>';
  }

  function fmtQty(q) { return String(round2(q)).replace('.', ','); }

  function salesList() {
    return Object.keys(S.sales).map(function (k) { return S.sales[k]; })
      .sort(function (a, b) { return a.closedAt - b.closedAt; });
  }

  function summarize(sales) {
    var s = { count: sales.length, total: 0, byMethod: {}, byUser: {}, discounts: 0 };
    sales.forEach(function (x) {
      s.total += x.total;
      s.discounts += x.discount || 0;
      s.byMethod[x.method] = round2((s.byMethod[x.method] || 0) + x.total);
      s.byUser[x.cashier] = round2((s.byUser[x.cashier] || 0) + x.total);
    });
    s.total = round2(s.total);
    s.discounts = round2(s.discounts);
    return s;
  }

  function viewCaja() {
    var sales = salesList();
    var s = summarize(sales);
    var open = Object.keys(S.tickets).length;
    var closures = Object.keys(S.closures).map(function (k) { return S.closures[k]; })
      .sort(function (a, b) { return b.closedAt - a.closedAt; }).slice(0, 15);
    return topbar(t('caja.title')) + '<div class="page">' +
      '<div class="card"><h3>' + t('caja.shift') + '</h3><div class="kpis">' +
      kpi(t('caja.sold'), fmt(s.total)) + kpi(t('caja.tickets'), s.count) +
      METHODS.map(function (m) { return kpi(t('m.' + m), fmt(s.byMethod[m] || 0)); }).join('') +
      kpi(t('caja.open'), open) + '</div>' +
      '<p class="muted">' + t('caja.byUser') + ': ' + (Object.keys(s.byUser).map(function (u) { return esc(u) + ' ' + fmt(s.byUser[u]); }).join(' · ') || '—') + '</p>' +
      '<div class="btn-row"><button class="btn" data-act="print-x">' + t('caja.printX') + '</button>' +
      '<button class="btn" data-act="csv">' + t('caja.csv') + '</button>' +
      '<button class="btn" data-act="drawer">💶 ' + t('act.drawer') + '</button>' +
      '<button class="btn danger" data-act="close-z">' + t('caja.closeZ') + '</button></div></div>' +
      '<div class="card"><h3>' + t('caja.tickets') + '</h3>' + (sales.length ? '<div class="scroll-x"><table class="list"><tr><th>' + t('caja.time') + '</th><th>' + t('caja.invoice') + '</th><th>' + t('tb.tables') + '</th><th>' + t('caja.waiter') + '</th><th>' + t('caja.method') + '</th><th class="num">' + t('total') + '</th><th></th></tr>' +
        sales.slice().reverse().map(function (x) {
          return '<tr><td>' + time(x.closedAt) + '</td><td>' + esc(x.invoice || '—') + '</td><td>' + esc(x.table) + '</td><td>' + esc(x.cashier) + '</td><td>' + t('m.' + x.method) + '</td><td class="num">' + fmt(x.total) + '</td>' +
            '<td><button class="btn" data-act="reprint" data-id="' + esc(x.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">' + t('caja.noSales') + '</p>') + '</div>' +
      '<div class="card"><h3>' + t('k.title') + '</h3>' + (function () {
        var list = Object.keys(S.prints).map(function (k) { return S.prints[k]; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 15);
        return list.length ? printsTable(list) : '<p class="muted">' + t('k.none') + '</p>';
      })() + '</div>' +
      '<div class="card"><h3>' + t('caja.prev') + '</h3>' + (closures.length ? '<div class="scroll-x"><table class="list"><tr><th>' + t('caja.date') + '</th><th>' + t('caja.by') + '</th><th class="num">' + t('caja.tickets') + '</th><th class="num">' + t('total') + '</th><th></th></tr>' +
        closures.map(function (c) {
          return '<tr><td>' + new Date(c.closedAt).toLocaleString('es-ES') + '</td><td>' + esc(c.user) + '</td><td class="num">' + c.summary.count + '</td><td class="num">' + fmt(c.summary.total) + '</td>' +
            '<td><button class="btn" data-act="print-z" data-id="' + esc(c.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">' + t('caja.none') + '</p>') + '</div>' +
      '</div>';
  }

  function kpi(label, val) { return '<div class="kpi"><small>' + label + '</small><b>' + val + '</b></div>'; }
  function time(ts) { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }

  function aiAuto() {
    try { return localStorage.getItem('platet-ai-auto') !== '0'; } catch (e) { return true; }
  }

  // ---------------------------------------------------------------- eventos

  // Permiso que necesita cada botón (los que no aparecen, cualquiera)
  var GUARD = {
    pay: 'pay', free: 'free', drawer: 'drawer', move: 'tables', join: 'tables', 'join-start': 'tables',
    'temp-new': 'tables', 'temp-near': 'tables', 'qr-pause': 'qrControl', 'kitchen-toggle': 'qrControl',
    reprint: 'reprint', 'reprint-k': 'reprint', 'print-z': 'reprint', 'print-x': 'caja', csv: 'caja',
    'close-z': 'closeZ', 'cancel-ticket': 'cancel', orders: 'qrOrders'
  };
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var fn = ACTIONS[b.dataset.act];
    if (!fn) return;
    var perm = GUARD[b.dataset.act] || (b.dataset.act === 'go' && b.dataset.v === 'caja' ? 'caja' : null);
    if (perm) allow(perm, function () { fn(b.dataset, b); });
    else fn(b.dataset, b);
  });

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  var ACTIONS = {
    'pick-user': function (d) { askPin(S.users[d.i]); },
    lang: function (d) { I.set(d.l); render(); },
    'save-auth': function () {
      var k = document.getElementById('auth-key').value.trim();
      if (!k) return toast(t('setup.enterKey'));
      Store.setAuth(k); location.reload();
    },
    'reset-auth': function () {
      if (!confirm(t('setup.resetConfirm'))) return;
      Store.setAuth(''); location.reload();
    },
    logout: function () {
      try { sessionStorage.removeItem('platet-session'); } catch (e) { /* ignorar */ }
      S.user = null; S.table = null; S.moveFrom = null; closeModal(); render();
    },
    go: function (d) {
      // El back-office es una página aparte; la sesión del administrador pasa con sessionStorage.
      if (d.v === 'admin') {
        if (!isAdmin()) return;
        try { sessionStorage.setItem('platet-session', S.user.name); } catch (e) { /* ignorar */ }
        location.href = 'admin.html';
        return;
      }
      S.view = d.v; S.sel = -1; S.buf = ''; S.showTicket = false; render();
    },
    orders: function () { openOrders(); },

    'open-table': function (d) {
      if (S.moveFrom) return moveTo(mainOf(d.id));
      if (S.joinPick) { S.joinPick = false; S.joinInto = mainOf(d.id); return render(); }
      if (S.joinInto) return joinTable(d.id);
      // una mesa juntada abre la cuenta de su mesa principal
      S.table = mainOf(d.id); S.view = 'ticket'; S.sel = -1; S.buf = ''; S.showTicket = false; render();
    },
    'temp-new': function () { openTemp(null); },
    'temp-near': function () { openTemp(S.table); },
    'temp-del': function () {
      if (ticketOf(S.table).lines.length) return toast(t('lay.busy'));
      var upd = closeTablePatch(S.table, {});
      upd['tickets/' + S.table] = null;
      Store.update('', upd);
      S.view = 'map'; S.table = null; render();
    },
    'join-start': function () { S.joinPick = true; S.joinFrom = 'map'; render(); },
    join: function () { S.joinInto = S.table; S.joinFrom = 'ticket'; S.view = 'map'; render(); },
    'join-done': function () {
      var back = S.joinFrom === 'ticket' ? S.joinInto : null;
      S.joinInto = null; S.joinPick = false; S.joinFrom = null;
      if (back) { S.table = back; S.view = 'ticket'; }
      render();
    },
    unjoin: function (d) { Store.remove('joins/' + d.id); },
    'table-qr': function () { window.open('qr.html?mesas=' + encodeURIComponent(S.table), '_blank', 'noopener'); },
    'qr-pause': function () { Store.update('public/qr', { paused: !S.qr.paused }); },
    'kitchen-toggle': function () {
      var off = S.qr.kitchenOffUntil && S.qr.kitchenOffUntil > Date.now();
      Store.update('public/qr', { kitchenOffUntil: off ? 0 : P.endOfService() });
    },
    'layout-edit': function () {
      if (!isAdmin()) return;
      S.editLayout = !S.editLayout; S.moveFrom = null; S.joinInto = null; S.joinPick = false; render();
    },
    'layout-add': function () { openLayoutEdit(null); },
    'layout-reset': function () {
      if (!confirm(t('lay.resetConfirm'))) return;
      Store.remove('layout');
    },
    'move-cancel': function () { S.moveFrom = null; render(); },
    'show-ticket': function () { S.showTicket = true; render(); },
    'hide-ticket': function () { S.showTicket = false; render(); },

    cat: function (d) { S.cat = d.id; render(); },
    'sel-line': function (d) {
      var i = +d.i;
      if (S.sel === i) return openMods(i);
      S.sel = i; render();
    },
    add: function (d) {
      var it = P.findItem(S.menu, d.id);
      if (!it) return;
      var qty = takeNumber() || 1;
      addLines(S.table, [{ pid: it.id, name: it.name, base: it.price, qty: qty }]);
      if (mobile()) {
        toast(t('msg.added', { q: fmtQty(qty), n: P.tr(it, I.lang) }));
        if (navigator.vibrate) navigator.vibrate(15);
      }
    },
    free: function () { openFree(); },
    voice: function () { openVoice(); },
    mods: function () {
      if (!ticketOf(S.table).lines[S.sel]) return toast(t('msg.selectLine'));
      openMods(S.sel);
    },
    key: function (d) { numKey(d.k); },
    'qty-plus': function () { changeQty(1); },
    'qty-minus': function () { changeQty(-1); },
    'del-line': function () {
      var tk = ticketOf(S.table);
      var l = tk.lines[S.sel];
      if (!l) return toast(t('msg.selectLine'));
      var go = function () {
        if (l.sent) audit('delSent', fmtQty(l.qty) + '× ' + l.name);
        tk.lines.splice(tk.lines.indexOf(l), 1); S.sel = -1; saveTicket(tk); render();
      };
      if (l.sent) allow('delSent', go); else go();
    },
    move: function () {
      if (!ticketOf(S.table).lines.length) return toast(t('msg.empty'));
      S.moveFrom = S.table; S.view = 'map'; render();
    },
    'cancel-ticket': function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return;
      if (!confirm(t('msg.cancelConfirm', { t: tableLabel(S.table) }))) return;
      audit('cancel', tableLabel(S.table) + ' · ' + fmt(P.ticketTotals(tk).total) + ' · ' + tk.lines.map(function (l) { return fmtQty(l.qty) + '× ' + l.name; }).join(', '));
      var upd = closeTablePatch(S.table, {});
      upd['tickets/' + S.table] = null;
      Store.update('', upd); delete S.tickets[S.table];
      S.view = 'map'; render();
    },
    'print-ticket': function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return toast(t('msg.empty'));
      printTicket(tk, null);
    },
    kitchen: function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.some(function (l) { return !l.sent; })) return toast(t('msg.noKitchen'));
      var upd = {};
      var rec = kitchenRecord(tk, upd);
      stamp(tk);
      ticketPatch(tk, upd);
      S.tickets[tk.table] = tk;
      if (offline()) toast(t('off.kitchen'));
      // ticket marcado + comanda numerada en una sola escritura: si se va la luz
      // a mitad, o están las dos cosas o ninguna.
      Store.update('', upd);
      printComanda(rec, false);
      render();
    },
    'reprint-k': function (d) {
      var r = S.prints[d.id];
      if (!r) return;
      printComanda(r, true);
      Store.update('prints/' + r.id, { reprints: (r.reprints || 0) + 1 });
    },
    'rec-ok': function () { S.recovery = null; render(); },
    pay: function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return toast(t('msg.empty'));
      openPay(tk);
    },

    'print-x': function () { printReport('INFORME X (sin cierre)', summarize(salesList()), Date.now()); },
    csv: function () { exportCsv(); },
    'close-z': function () {
      var sales = salesList();
      if (!sales.length) return toast(t('caja.nothing'));
      if (Object.keys(S.tickets).length && !confirm(t('caja.openWarn'))) return;
      if (!confirm(t('caja.zConfirm', { n: fmt(summarize(sales).total) }))) return;
      var id = Store.newId();
      var c = { id: id, closedAt: Date.now(), user: S.user.name, summary: summarize(sales) };
      // 1) ventas al archivo (IndexedDB + nube)  2) cierre + vaciar turno, de una vez
      Store.archive(id, { id: id, closedAt: c.closedAt, sales: S.sales }).then(function () {
        var upd = { sales: null };
        upd['closures/' + id] = c;
        // limpia avisos QR ya atendidos
        Object.keys(S.orders).forEach(function (k) { if (S.orders[k].status !== 'new') upd['orders/' + k] = null; });
        return Store.update('', upd);
      }).then(function () {
        audit('closeZ', fmt(c.summary.total) + ' · ' + c.summary.count + ' tickets');
        printReport('CIERRE Z', c.summary, c.closedAt);
      }).catch(function (e) { toast(t('sync.storageErr', { e: e.message })); });
    },
    'print-z': function (d) {
      var c = S.closures[d.id];
      if (c) printReport('CIERRE Z (copia)', c.summary, c.closedAt);
    },
    reprint: function (d) {
      var s = S.sales[d.id];
      if (!s) return;
      audit('reprint', (s.invoice || s.id) + ' · ' + fmt(s.total));
      printTicket(s, s);
    },
    drawer: function () {
      Devices.openDrawer().then(function () {
        audit('drawer', '');
      }).catch(function (e) { toast(e.message === 'browser' ? t('dev.drawerBrowser') : t('dev.err', { e: e.message })); });
    }
  };

  // ---------------------------------------------------------------- ticket

  function takeNumber() {
    var n = Number(S.buf.replace(',', '.'));
    S.buf = '';
    return n > 0 ? n : 0;
  }

  // Cada línea: {pid, name, base, price, qty, mods, note, src, sent, free}
  // price = base + extras. Solo se juntan líneas idénticas sin enviar.
  function addLines(table, add) {
    var tk = mergeLines(ticketOf(table), add);
    if (table === S.table) S.sel = -1;
    saveTicket(tk);
    render();
  }

  function stamp(tk) {
    if (!tk.openedAt) { tk.openedAt = Date.now(); tk.user = S.user.name; }
    return tk;
  }

  function mergeLines(tk, add) {
    add.forEach(function (a) {
      var mods = a.mods || [];
      var price = round2(a.base + extrasOf(mods));
      var same = tk.lines.filter(function (l) {
        return l.pid === a.pid && l.name === a.name && l.price === price && !l.sent && (l.note || '') === (a.note || '') &&
          sameMods(l.mods, mods) && (l.src || 'pos') === (a.src || 'pos') && (l.dev || DEV) === DEV;
      })[0];
      if (same) same.qty = round2(same.qty + a.qty);
      else {
        tk.lines.push({
          pid: a.pid, name: a.name, base: a.base, price: price, qty: a.qty, mods: mods,
          note: a.note || '', src: a.src || 'pos', sent: false, free: !!a.free, dev: DEV
        });
      }
    });
    return tk;
  }

  function changeQty(delta) {
    var tk = ticketOf(S.table);
    var l = tk.lines[S.sel];
    if (!l) return toast(t('msg.selectLine'));
    var go = function () {
      if (delta < 0 && l.sent) audit('delSent', '1× ' + l.name);
      l.qty = round2(l.qty + delta);
      if (l.qty <= 0) { tk.lines.splice(tk.lines.indexOf(l), 1); S.sel = -1; }
      saveTicket(tk); render();
    };
    if (delta < 0 && l.sent) allow('delSent', go); else go();
  }

  function numKey(k) {
    var tk = ticketOf(S.table);
    if (/^\d$/.test(k)) { if (S.buf.length < 8) S.buf += k; return render(); }
    if (k === ',') { if (S.buf.indexOf(',') < 0) S.buf = (S.buf || '0') + ','; return render(); }
    if (k === 'CLR') { S.buf = ''; return render(); }
    var n = takeNumber();
    if (k === 'DTO%') {
      if (n > 100) return toast(t('msg.max100'));
      return allow('discount', function () {
        tk.discountPct = n; tk.discountEur = 0;
        audit('discount', tableLabel(S.table) + ' · ' + n + '%');
        toast(n ? t('msg.discPct', { n: n }) : t('msg.discOff'));
        saveTicket(tk); render();
      });
    } else if (k === 'DTO€') {
      return allow('discount', function () {
        tk.discountEur = round2(n); tk.discountPct = 0;
        audit('discount', tableLabel(S.table) + ' · ' + fmt(n));
        toast(n ? t('msg.discEur', { n: fmt(n) }) : t('msg.discOff'));
        saveTicket(tk); render();
      });
    } else if (k === 'PREC' || k === 'CANT') {
      var l = tk.lines[S.sel];
      if (!l) { render(); return toast(t('msg.numFirst')); }
      if (k === 'PREC') {
        return allow('price', function () {
          audit('price', l.name + ' · ' + fmt(l.price) + ' → ' + fmt(n));
          l.price = round2(n); l.base = round2(n - extrasOf(l.mods));
          saveTicket(tk); render();
        });
      }
      if (n > 0) l.qty = round2(n);
      else return render();
    }
    saveTicket(tk); render();
  }

  function moveTo(target) {
    var from = S.moveFrom;
    S.moveFrom = null;
    if (target === from) return render();
    var src = ticketOf(from);
    var dst = ticketOf(target);
    dst.lines = dst.lines.concat(src.lines);
    if (!dst.openedAt) { dst.openedAt = src.openedAt; dst.user = src.user; }
    if (!dst.discountPct && !dst.discountEur) { dst.discountPct = src.discountPct || 0; dst.discountEur = src.discountEur || 0; }
    var upd = {};
    ticketPatch(dst, upd);
    upd['tickets/' + from] = null;
    childrenOf(from).forEach(function (c) { upd['joins/' + c] = c === target ? null : target; });
    if (S.temp[from]) upd['temp/' + from] = null;
    S.tickets[target] = dst; delete S.tickets[from];
    Store.update('', upd);
    toast(tableLabel(from) + ' → ' + tableLabel(target));
    S.table = target; S.view = 'ticket'; render();
  }

  // Juntar `child` a la mesa principal S.joinInto (su cuenta pasa a la principal).
  function joinTable(child) {
    var main = S.joinInto;
    if (mainOf(child) === main) return;
    var upd = {};
    var src = S.tickets[child];
    if (src && src.lines.length) {
      var dst = stamp(ticketOf(main));
      dst.lines = dst.lines.concat(src.lines);
      ticketPatch(dst, upd);
      upd['tickets/' + child] = null;
      S.tickets[main] = dst; delete S.tickets[child];
    }
    childrenOf(child).forEach(function (c) { upd['joins/' + c] = main; });
    upd['joins/' + child] = main;
    S.joins[child] = main;
    Store.update('', upd);
    toast(t('msg.joined', { c: child, t: main }));
    render();
  }

  function suggestTemp(near) {
    if (near) {
      for (var i = 0; i < 26; i++) {
        var id = near + String.fromCharCode(65 + i);
        if (!tableExists(id)) return id;
      }
    }
    for (var n = 1; n < 100; n++) if (!tableExists('X' + n)) return 'X' + n;
    return '';
  }

  function openTemp(near) {
    near = near && near !== QUICK && tableExists(near) ? near : '';
    var st = { name: suggestTemp(near), near: near };
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + t('temp.title') + '</h2>' +
        '<div class="field"><label>' + t('temp.name') + '</label><input id="temp-name" type="text" maxlength="10" value="' + esc(st.name) + '" autocapitalize="characters"></div>' +
        '<div class="field"><label>' + t('temp.near') + '</label><select id="temp-near"><option value="">' + t('temp.none') + '</option>' +
        allTables().map(function (tb) { return '<option value="' + esc(tb.id) + '"' + (tb.id === st.near ? ' selected' : '') + '>' + esc(tb.id) + '</option>'; }).join('') +
        '</select></div><p class="muted">' + t('temp.note') + '</p>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('temp.create') + '</button></div>';
      var n = document.getElementById('temp-name');
      n.oninput = function () { st.name = n.value; };
      document.getElementById('temp-near').onchange = function (e) {
        var auto = st.name === suggestTemp(st.near);
        st.near = e.target.value;
        if (auto) { st.name = suggestTemp(st.near); n.value = st.name; }
      };
    }
    openModal('temp', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k !== 'OK') return;
      var id = String(st.name).trim().toUpperCase();
      if (!P.TABLE_ID_RE.test(id) || tableExists(id)) return toast(t('temp.badName'));
      var rec = { id: id, near: st.near || null, at: Date.now(), by: S.user.name };
      S.temp[id] = rec;
      Store.set('temp/' + id, rec);
      closeModal();
      S.table = id; S.view = 'ticket'; S.sel = -1; S.showTicket = false; render();
    });
  }

  // Editar el plano (solo administradores): mover, añadir, renombrar, borrar.
  function suggestNewTable() {
    var max = 0;
    S.layout.forEach(function (tb) { var m = /^T(\d+)$/.exec(tb.id); if (m) max = Math.max(max, +m[1]); });
    var id = 'T' + (max + 1);
    while (tableExists(id)) id = 'T' + (++max + 1);
    return id;
  }

  function openLayoutEdit(id) {
    var cur = id ? S.layout.filter(function (tb) { return tb.id === id; })[0] : null;
    if (id && !cur) return;
    var st = { id: cur ? cur.id : suggestNewTable(), shape: cur ? cur.shape : 'square' };
    function busy(x) { var tk = S.tickets[x]; return !!(tk && tk.lines.length) || childrenOf(x).length > 0 || !!S.joins[x]; }
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + (cur ? t('lay.title', { t: esc(cur.id) }) : t('lay.newTitle')) + '</h2>' +
        '<div class="field"><label>' + t('lay.id') + '</label><input id="lay-id" type="text" maxlength="10" value="' + esc(st.id) + '" autocapitalize="characters"></div>' +
        '<div class="field"><label>' + t('lay.shape') + '</label><div class="chips-sel">' + ['round', 'square', 'stool'].map(function (sh) {
          return '<button class="' + (st.shape === sh ? 'on' : '') + '" data-k="sh:' + sh + '">' + t('lay.' + sh) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="btn-row">' + (cur ? '<button class="btn danger" data-k="DEL">' + t('lay.delete') + '</button>' : '') +
        '<button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('save') + '</button></div>';
      document.getElementById('lay-id').oninput = function (e) { st.id = e.target.value; };
    }
    openModal('layout', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k.indexOf('sh:') === 0) { st.shape = k.slice(3); return draw(); }
      var layout = clone(S.layout);
      if (k === 'DEL') {
        if (busy(cur.id)) return toast(t('lay.busy'));
        if (!confirm(t('lay.delConfirm', { t: cur.id }))) return;
        layout = layout.filter(function (tb) { return tb.id !== cur.id; });
      } else if (k === 'OK') {
        var nid = String(st.id).trim().toUpperCase();
        if (!P.TABLE_ID_RE.test(nid) || (nid !== (cur && cur.id) && tableExists(nid))) return toast(t('temp.badName'));
        if (cur && nid !== cur.id && busy(cur.id)) return toast(t('lay.busy'));
        if (cur) layout.forEach(function (tb) { if (tb.id === cur.id) { tb.id = nid; tb.shape = st.shape; } });
        else layout.push({ id: nid, x: 50, y: 50, shape: st.shape });
      } else return;
      S.layout = layout;
      Store.set('layout', layout);
      closeModal();
      render();
    });
  }

  // Arrastrar mesas en el modo "Editar plano"
  var drag = null;
  app.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-drag]');
    if (!el || !S.editLayout) return;
    var floor = el.closest('.floor');
    drag = { id: el.dataset.drag, el: el, rect: floor.getBoundingClientRect(), sx: e.clientX, sy: e.clientY, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
    e.preventDefault();
  });
  app.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return;
    drag.moved = true;
    drag.x = clamp((e.clientX - drag.rect.left) / drag.rect.width * 100, 2, 98);
    drag.y = clamp((e.clientY - drag.rect.top) / drag.rect.height * 100, 2, 98);
    drag.el.style.left = drag.x + '%';
    drag.el.style.top = drag.y + '%';
  });
  app.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved) return openLayoutEdit(d.id);
    var layout = clone(S.layout);
    layout.forEach(function (tb) { if (tb.id === d.id) { tb.x = Math.round(d.x * 10) / 10; tb.y = Math.round(d.y * 10) / 10; } });
    S.layout = layout;
    Store.set('layout', layout);
  });

  // ---------------------------------------------------------------- modificadores

  function modChips(selected, type) {
    return '<div class="chips-sel">' + S.mods.filter(function (m) { return m.type === type; }).map(function (m) {
      return '<button class="' + (selected[m.id] ? 'on' : '') + '" data-k="m:' + esc(m.id) + '">' + esc(P.tr(m, I.lang)) +
        (m.price ? ' +' + fmt(m.price) : '') + '</button>';
    }).join('') + '</div>';
  }

  function openMods(index) {
    var tk = ticketOf(S.table);
    var line = tk.lines[index];
    if (!line) return;
    if (line.sent && !can('delSent') && !S.authBy) {
      return askSupervisor('delSent', function () { openMods(index); });
    }
    if (line.sent) audit('modSent', fmtQty(line.qty) + '× ' + line.name);
    var st = { sel: {}, note: line.note || '', units: Math.ceil(line.qty) };
    (line.mods || []).forEach(function (m) { st.sel[m.id] = true; });
    var whole = Math.ceil(line.qty) === line.qty && line.qty > 1;

    function draw() {
      var chosen = S.mods.filter(function (m) { return st.sel[m.id]; });
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>' + t('mod.title', { n: esc(lineName(line)) }) + '</h2>' +
        '<h4 class="mod-h sin">' + t('mod.sin') + '</h4>' + modChips(st.sel, 'sin') +
        '<h4 class="mod-h extra">' + t('mod.extra') + '</h4>' + modChips(st.sel, 'extra') +
        '<h4 class="mod-h">' + t('mod.prep') + '</h4>' + modChips(st.sel, 'prep') +
        '<div class="field" style="margin-top:12px"><label>' + t('mod.note') + '</label><input id="mod-note" type="text" maxlength="120" value="' + esc(st.note) + '"></div>' +
        (whole ? '<div class="field"><label>' + t('mod.units') + '</label><div class="stepper-row"><button class="btn" data-k="u:-1">−</button><b>' + st.units + '</b><button class="btn" data-k="u:1">+</button>' +
          '<span class="muted">' + t('mod.unitsHint', { n: line.qty }) + '</span></div></div>' : '') +
        '<p class="muted">' + esc(P.modsText(chosen, I.lang)) + ' &nbsp; <b>' + fmt(line.base + extrasOf(chosen)) + '</b></p>' +
        '<div class="btn-row"><button class="btn" data-k="clear">' + t('mod.clear') + '</button><button class="btn" data-k="X">' + t('cancel') + '</button>' +
        '<button class="btn ok" data-k="OK" style="flex:1">' + t('mod.apply') + '</button></div>';
      document.getElementById('mod-note').oninput = function (e) { st.note = e.target.value; };
    }

    openModal('mods', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === 'clear') { st.sel = {}; st.note = ''; return draw(); }
      if (k.indexOf('m:') === 0) {
        var id = k.slice(2);
        st.sel[id] = !st.sel[id];
        return draw();
      }
      if (k.indexOf('u:') === 0) {
        st.units = Math.min(line.qty, Math.max(1, st.units + Number(k.slice(2))));
        return draw();
      }
      if (k === 'OK') {
        var mods = S.mods.filter(function (m) { return st.sel[m.id]; }).map(function (m) {
          return { id: m.id, type: m.type, name: m.name, en: m.en || '', zh: m.zh || '', price: m.price || 0 };
        });
        var updated = Object.assign({}, line, { mods: mods, note: st.note.trim().slice(0, 120), price: round2(line.base + extrasOf(mods)), sent: false });
        if (whole && st.units < line.qty) {
          // Separar: p. ej. 3 hamburguesas, solo 1 "sin cebolla".
          line.qty = round2(line.qty - st.units);
          updated.qty = st.units;
          delete updated.id; delete updated.ord;
          updated.dev = DEV;
          tk.lines.splice(index + 1, 0, updated);
          S.sel = index + 1;
        } else {
          tk.lines[index] = updated;
        }
        saveTicket(tk);
        closeModal();
        render();
      }
    });
  }

  // Artículo fuera de carta con nombre y precio libres.
  function openFree() {
    var st = { name: '', price: S.buf ? S.buf : '', qty: 1 };
    S.buf = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + t('free.title') + '</h2>' +
        '<div class="field"><label>' + t('free.name') + '</label><input id="free-name" type="text" maxlength="60" placeholder="' + t('free.namePh') + '" value="' + esc(st.name) + '"></div>' +
        '<div class="field"><label>' + t('free.price') + '</label><input id="free-price" type="text" inputmode="decimal" value="' + esc(st.price) + '" placeholder="0,00"></div>' +
        '<div class="field"><label>' + t('free.qty') + '</label><div class="stepper-row"><button class="btn" data-k="q:-1">−</button><b>' + st.qty + '</b><button class="btn" data-k="q:1">+</button></div></div>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('add') + '</button></div>';
      var n = document.getElementById('free-name'), p = document.getElementById('free-price');
      n.oninput = function () { st.name = n.value; };
      p.oninput = function () { st.price = p.value; };
      if (!st.name) n.focus();
    }
    openModal('free', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k.indexOf('q:') === 0) { st.qty = Math.max(1, st.qty + Number(k.slice(2))); return draw(); }
      if (k === 'OK') {
        var name = st.name.trim();
        if (!name) return toast(t('free.needName'));
        var price = round2(String(st.price).replace(',', '.'));
        closeModal();
        audit('free', st.qty + '× ' + name + ' · ' + fmt(price));
        addLines(S.table, [{ pid: 'libre', name: name, base: price, qty: st.qty, free: true }]);
      }
    });
  }

  // ---------------------------------------------------------------- pedido por voz

  function modObjs(ids) {
    return (ids || []).map(function (id) { return P.findMod(S.mods, id); }).filter(Boolean)
      .map(function (m) { return { id: m.id, type: m.type, name: m.name, en: m.en || '', zh: m.zh || '', price: m.price || 0 }; });
  }

  function voiceLang() {
    try { return localStorage.getItem('platet-voice-lang') || I.lang; } catch (e) { return I.lang; }
  }

  function openVoice() {
    var st = { lang: voiceLang(), text: '', listening: false, res: null, picking: -1, q: '', busy: false, err: '' };
    var lines = function () { return st.res ? st.res.lines : []; };

    function itemName(pid) { var it = P.findItem(S.menu, pid); return it ? P.tr(it, I.lang) : '?'; }

    function pickList(i) {
      var l = lines()[i];
      var pids = st.q ? Voice.search(st.q, S.menu, S.mods) : (l && l.candidates) || [];
      return pids.map(function (pid) {
        return '<button data-k="set:' + i + ':' + esc(pid) + '">' + esc(itemName(pid)) + '</button>';
      }).join('');
    }

    function row(l, i) {
      var sub = [P.modsText(modObjs(l.mods), I.lang)].concat(l.notes || []).filter(Boolean).join(' · ');
      var picker = st.picking === i
        ? '<div class="v-pick"><input id="v-q" type="text" placeholder="' + t('v.searchPh') + '" value="' + esc(st.q) + '"><div class="chips-sel" id="v-pick-list">' + pickList(i) + '</div></div>'
        : '';
      var del = '<button class="btn" data-k="del:' + i + '">✕</button>';
      var qty = '<div class="stepper-row"><button class="btn" data-k="q:' + i + ':-1">−</button><b>' + l.qty + '</b><button class="btn" data-k="q:' + i + ':1">+</button></div>';
      if (l.pid) {
        return '<div class="v-row">' + qty + '<div class="v-main"><button class="v-name" data-k="pick:' + i + '">' + esc(itemName(l.pid)) + ' ▾</button>' +
          (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div><span class="v-badge">' + t('v.src.' + l.src) + '</span>' + del + '</div>' + picker;
      }
      return '<div class="v-row unk">' + qty + '<div class="v-main"><b>❓ «' + esc(l.raw || l.phrase) + '»</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') +
        '<div class="chips-sel">' + (l.candidates || []).map(function (pid) {
          return '<button data-k="set:' + i + ':' + esc(pid) + '">' + esc(itemName(pid)) + '</button>';
        }).join('') +
        '<button data-k="pick:' + i + '">🔍 ' + t('v.search') + '</button>' +
        (Voice.aiKey() && navigator.onLine ? '<button data-k="ai:' + i + '">🤖 ' + t('v.askAi') + '</button>' : '') +
        (i > 0 ? '<button data-k="note:' + i + '">💬 ' + t('v.asNote') + '</button>' : '') +
        '</div></div>' + del + '</div>' + picker;
    }

    function draw() {
      var ls = lines();
      var ok = ls.filter(function (l) { return l.pid; }).length;
      var vs = Voice.stats();
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>' + t('v.title', { t: esc(tableLabel(S.table)) }) + '</h2>' +
        '<div class="v-top"><button class="mic' + (st.listening ? ' on' : '') + '" data-k="mic"' + (Voice.canListen ? '' : ' disabled') + '>' + (st.listening ? '⏹' : '🎤') + '</button>' +
        '<div class="v-help"><span class="lang">' + Object.keys(I.LANGS).map(function (l) {
          return '<button class="' + (st.lang === l ? 'on' : '') + '" data-k="vl:' + l + '">' + I.LANGS[l] + '</button>';
        }).join('') + '</span><p class="muted">' + (st.listening ? t('v.listening') : Voice.canListen ? t('v.tap') : t('v.noMic')) + '</p></div></div>' +
        '<div class="field"><textarea id="v-text" rows="2" placeholder="' + t('v.textPh') + '">' + esc(st.text) + '</textarea></div>' +
        '<div class="btn-row"><button class="btn" data-k="parse">' + t('v.parse') + '</button></div>' +
        (st.err ? '<p class="warn">' + esc(st.err) + '</p>' : '') +
        (st.busy ? '<p class="muted">' + t('v.aiBusy') + '</p>' : '') +
        '<div class="v-lines">' + ls.map(row).join('') + '</div>' +
        (ok < ls.length ? '<p class="muted">' + t('v.skipped') + (!navigator.onLine ? ' ' + t('v.offline') : '') + '</p>' : '') +
        '<p class="muted v-stats">' + t('v.stats', { a: vs.aliases, u: vs.utter, c: vs.ai }) + '</p>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button>' +
        '<button class="btn ok" data-k="OK" style="flex:1"' + (ok ? '' : ' disabled') + '>' + t('v.add', { n: ok }) + '</button></div>';
      document.getElementById('v-text').oninput = function (e) { st.text = e.target.value; };
      var q = document.getElementById('v-q');
      if (q) {
        q.oninput = function () { st.q = q.value; document.getElementById('v-pick-list').innerHTML = pickList(st.picking); };
        q.focus();
      }
    }

    // De varias alternativas del reconocedor, la que mejor encaja con la carta.
    function best(alts) {
      var top = null;
      alts.forEach(function (a) {
        var r = Voice.parse(a, S.menu, S.mods);
        var good = r.lines.filter(function (l) { return l.pid; }).length;
        var sc = good * 2 - (r.lines.length - good) * 3;
        if (!top || sc > top.sc) top = { sc: sc, text: a, res: r };
      });
      return top;
    }

    function interpret() {
      st.res = Voice.parse(st.text, S.menu, S.mods);
      st.picking = -1; st.err = '';
      draw();
      autoAi();
    }

    function autoAi() {
      if (!aiAuto() || !Voice.aiKey() || !navigator.onLine) return;
      var idxs = [];
      lines().forEach(function (l, i) { if (!l.pid && l.src === 'unknown') idxs.push(i); });
      if (idxs.length) askAi(idxs);
    }

    function askAi(idxs) {
      st.busy = true; st.err = ''; draw();
      var segs = idxs.map(function (i) { return { i: i, text: lines()[i].raw || lines()[i].phrase }; });
      Voice.ai(segs, st.text, S.menu, S.mods).then(function (res) {
        res.forEach(function (r) {
          var l = lines()[r.segment];
          if (!l || l.pid || !r.pid || !P.findItem(S.menu, r.pid)) return;
          l.pid = r.pid; l.src = 'ai';
          if (r.qty > 0) l.qty = Math.min(50, r.qty);
          (r.mods || []).forEach(function (id) { if (l.mods.indexOf(id) < 0) l.mods.push(id); });
          if (r.note) l.notes.push(String(r.note).slice(0, 80));
        });
      }).catch(function (e) {
        st.err = t('v.aiErr', { e: e.message });
      }).then(function () { st.busy = false; if (modal.dataset.kind === 'voice') draw(); });
    }

    function startMic() {
      st.listening = true; st.err = ''; draw();
      Voice.listen(st.lang, function (partial) {
        st.text = partial;
        var ta = document.getElementById('v-text');
        if (ta) ta.value = partial;
      }).then(function (alts) {
        st.listening = false;
        if (!alts.length) return draw();
        var b = best(alts);
        st.text = b.text; st.res = b.res; st.picking = -1;
        draw();
        autoAi();
      }).catch(function (e) {
        st.listening = false;
        st.err = t('v.micErr', { e: e.message });
        draw();
      });
    }

    openModal('voice', draw, function (k) {
      var p = k.split(':'), cmd = p[0], i = +p[1], ls = lines(), l = ls[i];
      switch (cmd) {
        case 'X': Voice.stop(); return closeModal();
        case 'mic': return st.listening ? Voice.stop() : startMic();
        case 'vl':
          st.lang = p[1];
          try { localStorage.setItem('platet-voice-lang', st.lang); } catch (e) { /* ignorar */ }
          return draw();
        case 'parse': return interpret();
        case 'q':
          l.qty = Math.min(50, l.qty + Number(p[2]));
          if (l.qty <= 0) ls.splice(i, 1);
          return draw();
        case 'del': ls.splice(i, 1); st.picking = -1; return draw();
        case 'pick': st.picking = st.picking === i ? -1 : i; st.q = ''; return draw();
        case 'set':
          var pid = p.slice(2).join(':');
          // la misma frase sin resolver en otras líneas (p. ej. una unidad separada) toma el mismo producto
          ls.forEach(function (x) { if (x === l || (!x.pid && x.phrase === l.phrase)) { x.pid = pid; x.src = 'manual'; } });
          st.picking = -1;
          return draw();
        case 'ai': return askAi([i]);
        case 'note':
          var prev = ls.slice(0, i).reverse().filter(function (x) { return x.pid; })[0];
          if (prev) prev.notes.push(l.raw || l.phrase);
          ls.splice(i, 1);
          return draw();
        case 'OK':
          var ok = ls.filter(function (x) { return x.pid && P.findItem(S.menu, x.pid); });
          if (!ok.length) return;
          Voice.learn(st.res.key, ok);
          closeModal();
          addLines(S.table, ok.map(function (x) {
            var it = P.findItem(S.menu, x.pid);
            return { pid: it.id, name: it.name, base: it.price, qty: x.qty, mods: modObjs(x.mods), note: (x.notes || []).join(' · ').slice(0, 120), src: 'voice' };
          }));
          toast(t('v.added', { n: ok.length }));
          if (navigator.vibrate) navigator.vibrate(20);
      }
    });
  }

  // ---------------------------------------------------------------- autorización
  function askSupervisor(perm, fn) {
    var pin = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>🔐 ' + t('auth.title') + '</h2><p>' + t('auth.body', { u: '<b>' + esc(S.user.name) + '</b>', p: '<b>' + t('perm.' + perm) + '</b>' }) + '</p>' +
        '<div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) {
          return '<button data-k="' + k + '" class="' + (k === 'OK' ? 'ok' : '') + '">' + k + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:12px"><button class="btn" data-k="X">' + t('cancel') + '</button></div>';
    }
    function check() {
      var boss = S.users.filter(function (u) { return u.admin && String(u.pin) === pin; })[0];
      if (!boss) { pin = ''; draw(); return toast(t('pin.wrong')); }
      closeModal();
      toast(t('auth.ok', { u: boss.name }));
      S.authBy = boss.name;
      try { fn(); } finally { S.authBy = null; }
    }
    openModal('pin', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (k === 'OK') return check();
      else if (pin.length < 6) pin += k;
      draw();
      if (pin.length >= 4 && S.users.some(function (u) { return u.admin && String(u.pin) === pin; })) check();
    });
  }

  // ---------------------------------------------------------------- PIN

  function askPin(user) {
    var pin = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + esc(user.name) + '</h2><p class="muted" style="text-align:center">' + t('pin.enter') + '</p>' +
        '<div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) {
          return '<button data-k="' + k + '" class="' + (k === 'OK' ? 'ok' : '') + '">' + k + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:12px"><button class="btn" data-k="X">' + t('cancel') + '</button></div>';
    }
    function tryLogin() {
      if (pin === String(user.pin)) {
        S.user = user; S.view = 'map'; closeModal(); render();
        // la sesión sigue al volver del back-office (misma pestaña)
        try { sessionStorage.setItem('platet-session', user.name); } catch (e) { /* ignorar */ }
      } else { pin = ''; draw(); toast(t('pin.wrong')); }
    }
    openModal('pin', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (k === 'OK') return tryLogin();
      else if (pin.length < 6) pin += k;
      draw();
      if (pin.length === String(user.pin).length && pin.length >= 4) tryLogin();
    });
  }

  // ---------------------------------------------------------------- cobro

  // Numeración correlativa por serie (requisito de las facturas simplificadas).
  // El contador se guarda en la MISMA escritura que la venta y la mesa libre,
  // así un corte de luz no deja huecos en la numeración ni mesas a medias.
  function nextInvoice() {
    var series = S.settings.series || P.DEFAULT_SETTINGS.series;
    return Store.get('counters/' + series).then(function (n) {
      n = (Number(n) || 0) + 1;
      return { key: 'counters/' + series, n: n, invoice: series + '-' + String(n).padStart(6, '0') };
    });
  }

  function openPay(tk) {
    var tot = P.ticketTotals(tk);
    var st = { method: 'efectivo', given: '', print: true, busy: false };
    function draw() {
      var given = Number(String(st.given).replace(',', '.')) || 0;
      var change = round2(given - tot.total);
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + t('pay.title', { t: esc(tableLabel(tk.table)) }) + '</h2>' +
        '<div class="pay-total">' + fmt(tot.total) + '</div>' +
        '<div class="pay-methods">' + METHODS.map(function (m) {
          return '<button data-k="m:' + m + '" class="' + (st.method === m ? 'on' : '') + '">' + t('m.' + m) + '</button>';
        }).join('') + '</div>' +
        (st.method === 'efectivo'
          ? '<div class="field"><label>' + t('pay.given') + '</label><input id="pay-given" type="text" inputmode="decimal" value="' + esc(st.given) + '" placeholder="' + fmt(tot.total) + '"></div>' +
          '<div class="quick-cash">' + quickCash(tot.total).map(function (v) {
            return '<button data-k="g:' + v + '">' + fmt(v) + '</button>';
          }).join('') + '</div>' +
          '<div class="change">' + (given ? (change >= 0 ? t('pay.change') + ' <b>' + fmt(change) + '</b>' : '<span class="warn">' + t('pay.missing', { n: fmt(-change) }) + '</span>') : '&nbsp;') + '</div>'
          : '') +
        '<label style="display:block;margin-bottom:14px"><input type="checkbox" data-k="print" ' + (st.print ? 'checked' : '') + '> ' + t('pay.print') + '</label>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1"' + (st.busy ? ' disabled' : '') + '>' + t('pay.confirm') + '</button></div>';
      var inp = document.getElementById('pay-given');
      if (inp) inp.oninput = function () { st.given = inp.value; var p = inp.selectionStart; draw(); var n = document.getElementById('pay-given'); n.focus(); n.setSelectionRange(p, p); };
    }
    openModal('pay', draw, function (k) {
      if (st.busy) return;
      if (k === 'X') return closeModal();
      if (k === 'print') { st.print = !st.print; return; }
      if (k.indexOf('m:') === 0) { st.method = k.slice(2); return draw(); }
      if (k.indexOf('g:') === 0) { st.given = k.slice(2).replace('.', ','); return draw(); }
      if (k === 'OK') {
        var given = st.method === 'efectivo' ? (Number(String(st.given).replace(',', '.')) || tot.total) : tot.total;
        if (given < tot.total) return toast(t('msg.givenLow'));
        st.busy = true; draw();
        nextInvoice().then(function (num) {
          var invoice = num.invoice;
          var vat = Number(S.settings.vat) || 0;
          var base = round2(tot.total / (1 + vat / 100));
          var id = Store.newId();
          var sale = Object.assign({}, tk, {
            id: id, invoice: invoice, total: tot.total, subtotal: tot.subtotal, discount: tot.discount,
            vatRate: vat, base: base, vatAmount: round2(tot.total - base),
            method: st.method, given: round2(given), change: round2(given - tot.total),
            cashier: S.user.name, closedAt: Date.now()
          });
          var upd = {};
          upd[num.key] = num.n;
          upd['sales/' + id] = sale;
          upd['tickets/' + tk.table] = null;
          closeTablePatch(tk.table, upd);
          return Store.update('', upd).then(function () {
            delete S.tickets[tk.table];
            closeModal();
            var drawer = st.method === 'efectivo' && Devices.cfg().drawerOnCash;
            if (st.print) printTicket(sale, sale, { drawer: drawer });
            else if (drawer) Devices.openDrawer().catch(function () { /* navegador: lo abre el driver al imprimir */ });
            toast(t('msg.paid', { n: fmt(tot.total) }) + (sale.change ? ' · ' + t('msg.change', { n: fmt(sale.change) }) : ''));
            S.view = 'map'; S.table = null; S.showTicket = false; render();
          });
        }).catch(function () {
          st.busy = false; draw();
          toast(t('conn.err'));
        });
      }
    });
  }

  function quickCash(total) {
    var out = [total];
    [5, 10, 20, 50, 100].forEach(function (v) { if (v > total && out.length < 5) out.push(v); });
    return out;
  }

  function exportCsv() {
    Store.readArchive().then(function (arch) {
      var byId = {};
      salesList().forEach(function (x) { byId[x.id] = x; });
      (arch || []).forEach(function (a) { Object.keys((a && a.sales) || {}).forEach(function (k) { byId[k] = a.sales[k]; }); });
      writeCsv(Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.closedAt - b.closedAt; }));
    });
  }

  function writeCsv(all) {
    var rows = [['Factura', 'Fecha', 'Hora', 'Mesa', 'Camarero', 'Pago', 'Base', 'IVA %', 'Cuota IVA', 'Descuento', 'Total']];
    all.forEach(function (x) {
      var d = new Date(x.closedAt);
      var vat = x.vatRate != null ? x.vatRate : (Number(S.settings.vat) || 0);
      var base = x.base != null ? x.base : round2(x.total / (1 + vat / 100));
      var num = function (n) { return round2(n).toFixed(2).replace('.', ','); };
      rows.push([x.invoice || x.id, d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES'), x.table, x.cashier, METHOD_ES[x.method] || x.method,
        num(base), vat, num(x.total - base), num(x.discount || 0), num(x.total)]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ventas-platet-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------------- pedidos QR

  function openOrders() {
    function draw() {
      var list = pendingOrders();
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>' + t('orders.title') + '</h2>' +
        '<div class="btn-row qr-controls">' + qrControls() + '</div>' +
        (list.length ? list.map(function (o) {
          var at = P.qrStatus(S.qr, new Date(o.createdAt));
          var into = mainOf(o.table);
          var head = '<header><b>' + esc(tableLabel(o.table)) + (into !== o.table ? ' → ' + esc(into) : '') + '</b><span class="muted">' + time(o.createdAt) + '</span></header>' +
            (!tableExists(o.table) ? '<p class="warn">' + t('orders.unknownTable') + '</p>' : '') +
            (o.type === 'order' && !at.open ? '<p class="warn">' + t('orders.outHours') + '</p>' : '');
          if (o.type === 'waiter' || o.type === 'bill') {
            return '<div class="order-card req">' + head + '<p style="font-size:18px;margin:6px 0">' +
              t(o.type === 'bill' ? 'orders.bill' : 'orders.waiter') + '</p>' +
              '<div class="btn-row"><button class="btn ok" data-k="done:' + esc(o.id) + '">' + t('orders.done') + '</button>' +
              (o.type === 'bill' ? '<button class="btn" data-k="bill:' + esc(o.id) + '">' + t('orders.openBill') + '</button>' : '') + '</div></div>';
          }
          var lines = priceOrder(o);
          var total = lines.reduce(function (s, l) { return s + (l.item ? l.price * l.qty : 0); }, 0);
          return '<div class="order-card">' + head + '<ul>' + lines.map(function (l) {
            var sub = [P.modsText(l.mods, I.lang), l.note].filter(Boolean).join(' · ');
            return '<li>' + l.qty + ' × ' + esc(l.item ? P.tr(l.item, I.lang) : l.name) +
              (l.item ? ' — ' + fmt(l.price * l.qty) : ' <span class="warn">(' + t('orders.notFound') + ')</span>') +
              (l.item && l.item.available === false ? ' <span class="warn">(' + t('orders.soldOut') + ')</span>' : '') +
              (l.item && !at.kitchen && at.kitchenCats.indexOf(P.catOfItem(S.menu, l.item.id)) >= 0 ? ' <span class="warn">(' + t('orders.kitchenClosed') + ')</span>' : '') +
              (sub ? '<br><small class="mods-txt">' + esc(sub) + '</small>' : '') + '</li>';
          }).join('') + '</ul>' +
            (o.note ? '<div class="note">💬 ' + esc(o.note) + '</div>' : '') +
            '<p><b>' + t('total') + ': ' + fmt(total) + '</b></p>' +
            '<div class="btn-row"><button class="btn ok" data-k="ok:' + esc(o.id) + '">' + t('orders.accept') + '</button>' +
            '<button class="btn" data-k="okk:' + esc(o.id) + '">' + t('orders.acceptPrint') + '</button>' +
            '<button class="btn danger" data-k="no:' + esc(o.id) + '">' + t('orders.reject') + '</button></div></div>';
        }).join('') : '<p class="muted">' + t('orders.none') + '</p>') +
        (Store.mode === 'local' ? '<p class="warn">' + t('orders.localWarn') + '</p>' : '') +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('close') + '</button></div>';
    }
    openModal('orders', draw, function (k) {
      if (k === 'X') return closeModal();
      var i = k.indexOf(':');
      var cmd = k.slice(0, i), id = k.slice(i + 1);
      var o = S.orders[id];
      if (!o) return draw();
      if (cmd === 'ok' || cmd === 'okk') acceptOrder(o, cmd === 'okk');
      else if (cmd === 'no') {
        var reason = prompt(t('orders.reason'), '');
        if (reason === null) return;
        Store.update('orders/' + id, { status: 'rejected', reason: reason.slice(0, 120), handledBy: S.user.name, handledAt: Date.now() });
      } else if (cmd === 'done' || cmd === 'bill') {
        Store.update('orders/' + id, { status: 'done', handledBy: S.user.name, handledAt: Date.now() });
        if (cmd === 'bill') { closeModal(); S.table = mainOf(o.table); S.view = 'ticket'; render(); return; }
      }
      S.orders[id] = Object.assign({}, o, { status: 'handled' });
      draw();
    });
  }

  // Los precios siempre salen de la carta y los modificadores del TPV, nunca del
  // móvil del cliente.
  function priceOrder(o) {
    return (o.lines || []).map(function (l) {
      var qty = Math.min(50, Math.max(1, Math.floor(Number(l.qty) || 1)));
      var item = P.findItem(S.menu, l.pid);
      var mods = (l.mods || []).map(function (id) { return P.findMod(S.mods, id); }).filter(Boolean)
        .map(function (m) { return { id: m.id, type: m.type, name: m.name, en: m.en || '', zh: m.zh || '', price: m.price || 0 }; });
      return {
        item: item, name: String(l.name || '?'), qty: qty, mods: mods,
        note: String(l.note || '').slice(0, 120),
        price: item ? round2(item.price + extrasOf(mods)) : 0
      };
    });
  }

  function acceptOrder(o, kitchen) {
    var add = priceOrder(o).filter(function (l) { return l.item; }).map(function (l) {
      return { pid: l.item.id, name: l.item.name, base: l.item.price, qty: l.qty, mods: l.mods, note: l.note, src: 'qr' };
    });
    if (o.note && add.length) {
      var last = add[add.length - 1];
      last.note = [last.note, String(o.note).slice(0, 120)].filter(Boolean).join(' · ');
    }
    if (!add.length) return toast(t('orders.noValid'));
    // mesa + estado del pedido (+ comanda) en una sola escritura: tras un corte
    // de luz nunca queda un pedido aceptado sin sus líneas, ni líneas duplicadas.
    var table = mainOf(o.table);   // pedido desde una mesa juntada -> cuenta de la principal
    var tk = stamp(mergeLines(ticketOf(table), add));
    var upd = {}, rec = null;
    if (kitchen) rec = kitchenRecord(tk, upd);
    ticketPatch(tk, upd);
    upd['orders/' + o.id + '/status'] = 'accepted';
    upd['orders/' + o.id + '/handledBy'] = S.user.name;
    upd['orders/' + o.id + '/handledAt'] = Date.now();
    S.tickets[table] = tk;
    Store.update('', upd);
    if (rec) printComanda(rec, false);
    render();
    toast(t('orders.added', { t: tableLabel(table) }));
  }

  // ---------------------------------------------------------------- impresión
  // Los tickets y comandas se imprimen siempre en español.

  // Los documentos se imprimen con Devices (navegador, Epson en red o USB directa,
  // según la configuración de este dispositivo). Errores de impresora: aviso.
  function printDoc(doc, which, opts) {
    return Devices.print(doc, which, opts).catch(function (e) {
      toast(t('dev.err', { e: e.message === 'no-port' ? t('dev.connect') : e.message }));
    });
  }

  function header() {
    var st = S.settings;
    return [['h1', st.name], ['c', st.address]].concat(st.nif ? [['c', 'NIF ' + st.nif]] : []).concat([['hr']]);
  }

  function printTicket(tk, sale, opts) {
    var tot = P.ticketTotals(tk);
    var vat = sale && sale.vatRate != null ? sale.vatRate : (Number(S.settings.vat) || 0);
    var base = round2(tot.total / (1 + vat / 100));
    var when = sale ? sale.closedAt : Date.now();
    var doc = header().concat([
      sale ? ['t', 'Factura simplificada ' + (sale.invoice || sale.id.toUpperCase())] : ['b', 'PRE-CUENTA (no válida como factura)'],
      ['t', tableLabelEs(tk.table) + ' · ' + (sale ? sale.cashier : S.user.name)],
      ['t', new Date(when).toLocaleString('es-ES')], ['hr']
    ]);
    tk.lines.forEach(function (l) {
      var extras = (l.mods || []).filter(function (m) { return m.type === 'extra'; });
      doc.push(['item', fmtQty(l.qty), l.name, extras.length ? ['+ ' + extras.map(function (m) { return m.name; }).join(', ')] : [], fmt(l.price * l.qty)]);
    });
    doc.push(['hr']);
    if (tot.discount) doc.push(['lr', 'Subtotal', fmt(tot.subtotal)], ['lr', 'Descuento', '-' + fmt(tot.discount)]);
    doc.push(['lrb', 'TOTAL', fmt(tot.total)], ['lr', 'Base imponible', fmt(base)], ['lr', 'IVA ' + vat + '%', fmt(tot.total - base)]);
    if (sale) {
      doc.push(['lr', METHOD_ES[sale.method] || sale.method, fmt(sale.given)]);
      if (sale.change) doc.push(['lr', 'Cambio', fmt(sale.change)]);
    }
    doc.push(['hr'], ['c', S.settings.footer]);
    return printDoc(doc, 'receipt', opts);
  }

  // Comanda numerada (#57) guardada ANTES de imprimir: si la impresora o la luz
  // fallan a mitad, se puede reimprimir desde Caja o desde el aviso de
  // recuperación, y cocina ve "REIMPRESIÓN" para no hacer el plato dos veces.
  var KEEP_PRINTS = 60;
  function kitchenRecord(tk, upd) {
    var n = Math.max(Number(S.counters.comanda) || 0, maxPrintN()) + 1;
    var rec = {
      id: Store.newId(), n: n, table: tk.table, user: S.user.name, at: Date.now(), reprints: 0,
      lines: tk.lines.filter(function (l) { return !l.sent; }).map(function (l) {
        return { qty: l.qty, name: l.name, mods: P.modsText(l.mods, 'es'), note: l.note || '' };
      })
    };
    tk.lines.forEach(function (l) { l.sent = true; });
    upd['prints/' + rec.id] = rec;
    upd['counters/comanda'] = n;
    S.counters.comanda = n;
    S.prints[rec.id] = rec;
    var old = Object.keys(S.prints).map(function (k) { return S.prints[k]; }).sort(function (a, b) { return b.at - a.at; }).slice(KEEP_PRINTS);
    old.forEach(function (r) { upd['prints/' + r.id] = null; delete S.prints[r.id]; });
    return rec;
  }
  function maxPrintN() {
    return Object.keys(S.prints).reduce(function (m, k) { return Math.max(m, S.prints[k].n || 0); }, 0);
  }

  function printComanda(r, reprint) {
    var doc = [['h1', 'COMANDA #' + r.n]];
    if (reprint) doc.push(['cb', '*** REIMPRESIÓN ***']);
    doc.push(['cb', tableLabelEs(r.table)], ['c', time(r.at) + ' · ' + r.user]);
    if (reprint) doc.push(['c', 'reimpresa ' + time(Date.now())]);
    doc.push(['hr']);
    r.lines.forEach(function (l) { doc.push(['kitem', fmtQty(l.qty) + ' x', l.name, [l.mods, l.note].filter(Boolean)]); });
    return printDoc(doc, 'kitchen');
  }

  function printReport(title, s, when) {
    var doc = header().concat([['cb', title], ['c', new Date(when).toLocaleString('es-ES')], ['hr'], ['lr', 'Tickets', String(s.count)]]);
    METHODS.forEach(function (m) { doc.push(['lr', METHOD_ES[m], fmt(s.byMethod[m] || 0)]); });
    doc.push(['lr', 'Descuentos', fmt(s.discounts)], ['lrb', 'TOTAL', fmt(s.total)], ['hr']);
    Object.keys(s.byUser).forEach(function (u) { doc.push(['lr', u, fmt(s.byUser[u])]); });
    return printDoc(doc, 'receipt');
  }

  // ---------------------------------------------------------------- modal / avisos

  var modalHandler = null;
  function openModal(kind, draw, handler) {
    modal.dataset.kind = kind;
    modalHandler = handler;
    draw();
    modal.classList.remove('hidden');
  }
  function closeModal() { modal.classList.add('hidden'); modal.dataset.kind = ''; modalHandler = null; }
  modalBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && modalHandler) modalHandler(b.dataset.k);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal && modal.dataset.kind !== 'pay') closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (modal.dataset.kind === 'pin' && /^[0-9]$/.test(e.key)) modalHandler(e.key);
    else if (modal.dataset.kind === 'pin' && e.key === 'Backspace') modalHandler('⌫');
    else if (e.key === 'Escape' && modalHandler) { Voice.stop(); closeModal(); }
    else if (e.key === 'Enter' && modal.dataset.kind === 'voice' && e.target.id === 'v-text') { e.preventDefault(); modalHandler('parse'); }
  });

  // Lector de códigos de barras (se comporta como un teclado muy rápido + Enter)
  var scan = { buf: '', last: 0 };
  document.addEventListener('keydown', function (e) {
    if (S.view !== 'ticket' || !modal.classList.contains('hidden')) return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    var now = Date.now();
    if (now - scan.last > 80) scan.buf = '';
    scan.last = now;
    if (e.key === 'Enter') {
      var code = scan.buf; scan.buf = '';
      if (code.length < 4) return;
      e.preventDefault();
      var it = null;
      S.menu.some(function (c) { return (c.items || []).some(function (x) { if (x.barcode && String(x.barcode) === code) { it = x; return true; } return false; }); });
      if (!it) return toast(t('bc.notFound', { c: code }));
      addLines(S.table, [{ pid: it.id, name: it.name, base: it.price, qty: 1 }]);
      toast(t('msg.added', { q: 1, n: P.tr(it, I.lang) }));
    } else if (e.key.length === 1) scan.buf += e.key;
  });

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  var audio;
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(function (d) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.2, audio.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + d + 0.2);
        o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.2);
      });
    } catch (e) { /* sin audio */ }
  }

  render();
})();
