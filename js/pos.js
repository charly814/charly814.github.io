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
    adminTab: 'productos',
    adminCat: null,
    conn: Store.mode === 'local' ? 'local' : 'connecting',
    menu: P.DEFAULT_MENU,
    mods: P.DEFAULT_MODS,
    users: P.DEFAULT_USERS,
    settings: P.DEFAULT_SETTINGS,
    tickets: {},
    orders: {},
    sales: {},
    closures: {}
  };

  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');
  var mobile = function () { return window.innerWidth <= 860; };

  // ---------------------------------------------------------------- datos

  Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });
  Store.on('mods', function (v) { S.mods = v || P.DEFAULT_MODS; render(); });
  Store.on('users', function (v) { S.users = v || P.DEFAULT_USERS; render(); });
  Store.on('settings', function (v) { S.settings = Object.assign({}, P.DEFAULT_SETTINGS, v || {}); render(); });
  Store.on('tickets', function (v) { S.tickets = v || {}; render(); });
  Store.on('sales', function (v) { S.sales = v || {}; render(); });
  Store.on('closures', function (v) { S.closures = v || {}; render(); });
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
  window.addEventListener('platet-conn', function (e) {
    if (S.conn !== e.detail) { S.conn = e.detail; render(); }
  });

  function pendingOrders() {
    return Object.keys(S.orders).map(function (k) { return S.orders[k]; })
      .filter(function (o) { return o && o.status === 'new'; })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
  }

  function isAdmin() { return S.user && S.user.admin; }

  function ticketOf(table) {
    var tk = S.tickets[table];
    if (tk) { tk.lines = tk.lines || []; return tk; }
    return { table: table, lines: [], discountPct: 0, discountEur: 0 };
  }

  function saveTicket(tk) {
    if (!tk.lines.length && !tk.discountPct && !tk.discountEur) {
      delete S.tickets[tk.table];
      return Store.remove('tickets/' + tk.table);
    }
    if (!tk.openedAt) { tk.openedAt = Date.now(); tk.user = S.user.name; }
    S.tickets[tk.table] = tk;
    return Store.set('tickets/' + tk.table, tk);
  }

  function tableLabel(id) { return id === QUICK ? t('quickSale') : t('table', { t: id }); }
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

  function render() {
    // No repintar mientras se escribe en un campo de Ajustes (se pierde el foco).
    var a = document.activeElement;
    if (S.view === 'admin' && a && app.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) {
      S.dirty = true;
      return;
    }
    S.dirty = false;
    if (!S.user) S.view = 'login';
    if (Store.mode === 'cloud' && !Store.hasAuth) S.view = 'setup';
    app.innerHTML = ({
      setup: viewSetup, login: viewLogin, map: viewMap, ticket: viewTicket, caja: viewCaja, admin: viewAdmin
    })[S.view]();
  }
  app.addEventListener('focusout', function () { setTimeout(function () { if (S.dirty) render(); }, 0); });
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

  function viewLogin() {
    return '<section class="login"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h1>' + t('login.title') + '</h1>' + langSwitch() + '</div>' +
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
      var tk = S.tickets[id];
      return { busy: tk && (tk.lines || []).length, total: tk ? P.ticketTotals(tk).total : 0, qr: orderTables[id] || 0 };
    }
    var floor = P.LAYOUT.map(function (tb) {
      var st = state(tb.id);
      var cls = 'tbl ' + tb.shape + (st.busy ? ' busy' : '') + (st.qr ? ' qr' : '');
      return '<button class="' + cls + '" style="left:' + tb.x + '%;top:' + tb.y + '%" data-act="open-table" data-id="' + tb.id + '">' +
        '<span>' + tb.id + '</span>' + (st.busy && tb.shape !== 'stool' ? '<small>' + fmt(st.total) + '</small>' : '') +
        (st.qr ? '<i class="alert">QR ' + st.qr + '</i>' : '') + '</button>';
    }).join('');
    // En el móvil, una cuadrícula de botones es más rápida que el plano.
    var list = P.LAYOUT.map(function (tb) {
      var st = state(tb.id);
      return '<button class="tl' + (st.busy ? ' busy' : '') + (st.qr ? ' qr' : '') + '" data-act="open-table" data-id="' + tb.id + '">' +
        '<b>' + tb.id + '</b>' + (st.busy ? '<small>' + fmt(st.total) + '</small>' : '') + (st.qr ? '<i class="alert">QR</i>' : '') + '</button>';
    }).join('');
    var quick = S.tickets[QUICK] && (S.tickets[QUICK].lines || []).length;
    return topbar(t('map.title')) +
      (S.moveFrom ? '<div class="banner"><span>' + t('map.move', { t: '<b>' + esc(tableLabel(S.moveFrom)) + '</b>' }) + '</span><button class="btn" data-act="move-cancel">' + t('cancel') + '</button></div>' : '') +
      (quick ? '<div class="banner"><span>' + t('map.quickOpen', { n: fmt(P.ticketTotals(S.tickets[QUICK]).total) }) + '</span><button class="btn" data-act="open-table" data-id="' + QUICK + '">' + t('open') + '</button></div>' : '') +
      '<div class="floor-wrap"><div class="floor">' +
      '<div class="bar-h"></div><div class="bar-v"></div>' +
      '<span class="plant" style="left:89%;top:19%">🌳</span><span class="plant" style="left:17%;top:70%">🌳</span>' +
      floor + '</div></div>' +
      '<div class="tbl-list">' + list + '</div>' +
      '<div class="legend"><span class="l-free">' + t('legend.free') + '</span><span class="l-busy">' + t('legend.busy') + '</span><span class="l-qr">' + t('legend.qr') + '</span></div>';
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
        '<span>' + esc(lineName(l)) + (l.src === 'qr' ? '<i class="tag qr">QR</i>' : '') + (l.free ? '<i class="tag free">✎</i>' : '') +
        (l.sent ? '<i class="tag sent">✓ ' + t('tk.kitchen') + '</i>' : '') +
        (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span>' +
        '<span>' + fmt(l.price).replace(' €', '') + '</span><span>' + fmt(l.price * l.qty).replace(' €', '') + '</span></div>';
    }).join('');

    var key = function (k, label, cls) {
      return '<button class="' + (cls || '') + '" data-act="key" data-k="' + k + '">' + (label || k) + '</button>';
    };

    return '<div class="ticket-view' + (S.showTicket ? ' show' : '') + '">' +
      '<section class="tk-left">' +
      '<div class="tk-head"><div><h2>' + esc(tableLabel(S.table)) + '</h2><small>' + esc(tk.user || S.user.name) + '</small></div><small>' + new Date().toLocaleDateString('es-ES') + '</small></div>' +
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
      '<div class="m-bar"><button class="btn" data-act="go" data-v="map">← ' + t('tb.tables') + '</button><b>' + esc(tableLabel(S.table)) + '</b>' +
      '<button class="btn primary" data-act="show-ticket">🧾 ' + fmtQty(count) + ' · ' + fmt(tot.total) + '</button></div>' +
      '<div class="cats">' + S.menu.map(function (c) {
        return '<button class="cat' + (c.id === S.cat ? ' on' : '') + '" data-act="cat" data-id="' + esc(c.id) + '"><b>' + esc(c.icon || '🍽️') + '</b>' + esc(P.tr(c, I.lang)) + '</button>';
      }).join('') + '</div>' +
      '<div class="prods">' + ((cat && cat.items) || []).map(function (it) {
        return '<button class="prod' + (it.available === false ? ' off' : '') + '" data-act="add" data-id="' + esc(it.id) + '"><span>' + esc(P.tr(it, I.lang)) + '</span><b>' + fmt(it.price) + '</b></button>';
      }).join('') + '</div>' +
      '<nav class="actions">' +
      act('go', '🪑', t('tb.tables'), 'data-v="map"') +
      (pendingOrders().length ? act('orders', '📲', t('tb.orders') + ' (' + pendingOrders().length + ')', '', 'alert-act') : '') +
      act('print-ticket', '🖨️', t('act.print')) +
      act('kitchen', '👨‍🍳', t('act.kitchen')) +
      act('mods', '✏️', t('act.mod')) +
      act('free', '✎', t('act.free')) +
      act('qty-minus', '➖', t('act.minus')) +
      act('qty-plus', '➕', t('act.plus')) +
      act('del-line', '🗑️', t('act.del')) +
      act('move', '⇄', t('act.move')) +
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
      (isAdmin() ? '<button class="btn danger" data-act="close-z">' + t('caja.closeZ') + '</button>' : '') + '</div></div>' +
      '<div class="card"><h3>' + t('caja.tickets') + '</h3>' + (sales.length ? '<div class="scroll-x"><table class="list"><tr><th>' + t('caja.time') + '</th><th>' + t('caja.invoice') + '</th><th>' + t('tb.tables') + '</th><th>' + t('caja.waiter') + '</th><th>' + t('caja.method') + '</th><th class="num">' + t('total') + '</th><th></th></tr>' +
        sales.slice().reverse().map(function (x) {
          return '<tr><td>' + time(x.closedAt) + '</td><td>' + esc(x.invoice || '—') + '</td><td>' + esc(x.table) + '</td><td>' + esc(x.cashier) + '</td><td>' + t('m.' + x.method) + '</td><td class="num">' + fmt(x.total) + '</td>' +
            '<td><button class="btn" data-act="reprint" data-id="' + esc(x.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">' + t('caja.noSales') + '</p>') + '</div>' +
      '<div class="card"><h3>' + t('caja.prev') + '</h3>' + (closures.length ? '<div class="scroll-x"><table class="list"><tr><th>' + t('caja.date') + '</th><th>' + t('caja.by') + '</th><th class="num">' + t('caja.tickets') + '</th><th class="num">' + t('total') + '</th><th></th></tr>' +
        closures.map(function (c) {
          return '<tr><td>' + new Date(c.closedAt).toLocaleString('es-ES') + '</td><td>' + esc(c.user) + '</td><td class="num">' + c.summary.count + '</td><td class="num">' + fmt(c.summary.total) + '</td>' +
            '<td><button class="btn" data-act="print-z" data-id="' + esc(c.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table></div>' : '<p class="muted">' + t('caja.none') + '</p>') + '</div>' +
      '</div>';
  }

  function kpi(label, val) { return '<div class="kpi"><small>' + label + '</small><b>' + val + '</b></div>'; }
  function time(ts) { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }

  function viewAdmin() {
    var tabs = '<div class="tabs">' + [['productos', 'admin.products'], ['mods', 'admin.mods'], ['usuarios', 'admin.users'], ['ajustes', 'admin.settings']].map(function (x) {
      return '<button class="' + (S.adminTab === x[0] ? 'on' : '') + '" data-act="admin-tab" data-t="' + x[0] + '">' + t(x[1]) + '</button>';
    }).join('') + '</div>';
    var body = { productos: adminProducts, mods: adminMods, usuarios: adminUsers, ajustes: adminSettings }[S.adminTab]();
    return topbar(t('admin.title')) + '<div class="page">' + tabs + body + '</div>';
  }

  function input(val, edit, data, type) {
    return '<input type="' + (type || 'text') + '"' + (type === 'number' ? ' step="0.05" min="0"' : '') + ' value="' + esc(val == null ? '' : val) + '" data-edit="' + edit + '" ' + data + '>';
  }

  function adminProducts() {
    if (!S.adminCat || !S.menu.some(function (c) { return c.id === S.adminCat; })) S.adminCat = S.menu[0] && S.menu[0].id;
    var ci = S.menu.findIndex(function (c) { return c.id === S.adminCat; });
    var cat = S.menu[ci];
    var d = 'data-ci="' + ci + '"';
    return '<div class="card"><h3>' + t('admin.cats') + '</h3><div class="cats" style="padding:0;border:0">' +
      S.menu.map(function (c) {
        return '<button class="cat' + (c.id === S.adminCat ? ' on' : '') + '" data-act="admin-cat" data-id="' + esc(c.id) + '"><b>' + esc(c.icon) + '</b>' + esc(P.tr(c, I.lang)) + '</button>';
      }).join('') + '<button class="cat" data-act="cat-add"><b>＋</b>' + t('admin.newCat') + '</button></div></div>' +
      (cat ? '<div class="card"><h3>' + esc(cat.icon) + ' ' + esc(P.tr(cat, I.lang)) + '</h3><div class="scroll-x">' +
        '<div class="form-row cat-row">' + input(cat.icon, 'cat-icon', d) + input(cat.name, 'cat-name', d) + input(cat.en, 'cat-en', d) + input(cat.zh, 'cat-zh', d) +
        '<button class="btn" data-act="cat-up" ' + d + '>↑</button><button class="btn danger" data-act="cat-del" ' + d + '>' + t('admin.delCat') + '</button></div><hr>' +
        '<div class="form-row prod-row muted"><span>' + t('admin.nameEs') + '</span><span>EN</span><span>中文</span><span>' + t('admin.priceEur') + '</span><span>' + t('admin.available') + '</span><span></span></div>' +
        (cat.items || []).map(function (it, ii) {
          var di = d + ' data-ii="' + ii + '"';
          return '<div class="form-row prod-row">' + input(it.name, 'it-name', di) + input(it.en, 'it-en', di) + input(it.zh, 'it-zh', di) +
            input(it.price, 'it-price', di, 'number') +
            '<label><input type="checkbox" ' + (it.available !== false ? 'checked' : '') + ' data-edit="it-avail" ' + di + '> ' + t('yes') + '</label>' +
            '<button class="btn" data-act="it-del" ' + di + '>🗑️</button></div>';
        }).join('') + '</div>' +
        '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="it-add" ' + d + '>' + t('admin.addProduct') + '</button></div>' +
        '<p class="muted">' + t('admin.soldOutNote') + '</p></div>' : '') +
      '<div class="card"><button class="btn danger" data-act="menu-reset">' + t('admin.resetMenu') + '</button></div>';
  }

  function adminMods() {
    return '<p class="muted">' + t('admin.modsNote') + '</p>' +
      ['sin', 'extra', 'prep'].map(function (type) {
        return '<div class="card"><h3>' + t('mod.' + type) + '</h3><div class="scroll-x">' +
          '<div class="form-row mod-row muted"><span>' + t('admin.nameEs') + '</span><span>EN</span><span>中文</span><span>' + (type === 'extra' ? t('admin.priceEur') : '') + '</span><span></span></div>' +
          S.mods.map(function (m, mi) {
            if (m.type !== type) return '';
            var dm = 'data-mi="' + mi + '"';
            return '<div class="form-row mod-row">' + input(m.name, 'mod-name', dm) + input(m.en, 'mod-en', dm) + input(m.zh, 'mod-zh', dm) +
              (type === 'extra' ? input(m.price, 'mod-price', dm, 'number') : '<span></span>') +
              '<button class="btn" data-act="mod-del" ' + dm + '>🗑️</button></div>';
          }).join('') + '</div>' +
          '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="mod-add" data-type="' + type + '">＋ ' + t('add') + '</button></div></div>';
      }).join('') +
      '<div class="card"><button class="btn danger" data-act="mods-reset">' + t('admin.resetMods') + '</button></div>';
  }

  function adminUsers() {
    return '<div class="card"><h3>' + t('admin.users') + '</h3><div class="form-row users muted"><span>' + t('admin.name') + '</span><span>PIN</span><span>' + t('admin.admin') + '</span><span></span></div>' +
      S.users.map(function (u, i) {
        return '<div class="form-row users"><input type="text" value="' + esc(u.name) + '" data-edit="u-name" data-i="' + i + '">' +
          '<input type="text" inputmode="numeric" maxlength="6" value="' + esc(u.pin) + '" data-edit="u-pin" data-i="' + i + '">' +
          '<label><input type="checkbox" ' + (u.admin ? 'checked' : '') + ' data-edit="u-admin" data-i="' + i + '"> ' + t('yes') + '</label>' +
          '<button class="btn" data-act="u-del" data-i="' + i + '">🗑️</button></div>';
      }).join('') +
      '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="u-add">' + t('admin.addUser') + '</button></div>' +
      '<p class="muted">' + t('admin.adminNote') + '</p></div>';
  }

  function adminSettings() {
    var st = S.settings;
    var f = function (k) {
      return '<div class="field"><label>' + t('admin.f.' + k) + '</label><input type="text" value="' + esc(st[k]) + '" data-edit="set" data-k="' + k + '"></div>';
    };
    var qrUrl = new URL('qr.html', location.href).href;
    return '<div class="card"><h3>' + t('admin.ticketData') + '</h3>' + f('name') + f('address') + f('nif') + f('vat') + f('footer') + f('series') +
      '<p class="muted">' + t('admin.seriesNote') + '</p></div>' +
      '<div class="card"><h3>' + t('admin.qr') + '</h3>' +
      '<p>' + t('admin.mode', { m: '<b>' + t(Store.mode === 'local' ? 'admin.local' : 'admin.cloud') + '</b>' }) + '</p>' +
      (Store.mode === 'local'
        ? '<p class="warn">' + t('admin.localWarn') + '</p>'
        : '<p class="muted">' + t('admin.cloudOk') + '</p><p><button class="btn" data-act="reset-auth">' + t('admin.changeKey') + '</button></p>') +
      '<div class="btn-row"><a class="btn primary" href="' + esc(qrUrl) + '" target="_blank" rel="noopener">' + t('admin.printQr') + '</a>' +
      '<a class="btn" href="pedir.html?mesa=T1" target="_blank" rel="noopener">' + t('admin.testQr') + '</a></div></div>';
  }

  // ---------------------------------------------------------------- eventos

  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var fn = ACTIONS[b.dataset.act];
    if (fn) fn(b.dataset, b);
  });

  var FIELD = { 'cat-icon': 'icon', 'cat-name': 'name', 'cat-en': 'en', 'cat-zh': 'zh', 'it-name': 'name', 'it-en': 'en', 'it-zh': 'zh', 'mod-name': 'name', 'mod-en': 'en', 'mod-zh': 'zh' };

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.edit) return;
    var d = el.dataset;
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var menu = clone(S.menu), users = clone(S.users), mods = clone(S.mods);
    var price = round2(String(val).replace(',', '.'));
    switch (d.edit) {
      case 'cat-icon': case 'cat-name': case 'cat-en': case 'cat-zh':
        menu[d.ci][FIELD[d.edit]] = String(val).trim(); return saveMenu(menu);
      case 'it-name': case 'it-en': case 'it-zh':
        menu[d.ci].items[d.ii][FIELD[d.edit]] = String(val).trim(); return saveMenu(menu);
      case 'it-price': menu[d.ci].items[d.ii].price = price; return saveMenu(menu);
      case 'it-avail': menu[d.ci].items[d.ii].available = val; return saveMenu(menu);
      case 'mod-name': case 'mod-en': case 'mod-zh':
        mods[d.mi][FIELD[d.edit]] = String(val).trim(); return saveMods(mods);
      case 'mod-price': mods[d.mi].price = price; return saveMods(mods);
      case 'u-name': users[d.i].name = String(val).trim().toUpperCase() || users[d.i].name; return saveUsers(users);
      case 'u-pin':
        if (!/^\d{4,6}$/.test(val)) { toast(t('msg.pinFormat')); return render(); }
        users[d.i].pin = val; return saveUsers(users);
      case 'u-admin': users[d.i].admin = val; return saveUsers(users);
      case 'set':
        var st = Object.assign({}, S.settings);
        if (d.k === 'vat') st.vat = Number(String(val).replace(',', '.')) || 0;
        // La serie se usa como clave en la base de datos: solo letras, números y guiones.
        else if (d.k === 'series') st.series = String(val).toUpperCase().replace(/[^A-Z0-9_-]/g, '') || P.DEFAULT_SETTINGS.series;
        else st[d.k] = val;
        return Store.set('settings', st);
    }
  });

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function saveMenu(menu) { S.menu = menu; return Store.set('menu', menu); }
  function saveMods(mods) { S.mods = mods; return Store.set('mods', mods); }
  function saveUsers(users) {
    if (!users.some(function (u) { return u.admin; })) { toast(t('msg.needAdmin')); render(); return; }
    S.users = users;
    return Store.set('users', users);
  }

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
    logout: function () { S.user = null; S.table = null; S.moveFrom = null; closeModal(); render(); },
    go: function (d) {
      if ((d.v === 'admin') && !isAdmin()) return;
      S.view = d.v; S.sel = -1; S.buf = ''; S.showTicket = false; render();
    },
    orders: function () { openOrders(); },

    'open-table': function (d) {
      if (S.moveFrom) return moveTo(d.id);
      S.table = d.id; S.view = 'ticket'; S.sel = -1; S.buf = ''; S.showTicket = false; render();
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
    mods: function () {
      if (!ticketOf(S.table).lines[S.sel]) return toast(t('msg.selectLine'));
      openMods(S.sel);
    },
    key: function (d) { numKey(d.k); },
    'qty-plus': function () { changeQty(1); },
    'qty-minus': function () { changeQty(-1); },
    'del-line': function () {
      var tk = ticketOf(S.table);
      if (!tk.lines[S.sel]) return toast(t('msg.selectLine'));
      if (tk.lines[S.sel].sent && !isAdmin()) return toast(t('msg.sentAdmin'));
      tk.lines.splice(S.sel, 1); S.sel = -1; saveTicket(tk); render();
    },
    move: function () {
      if (!ticketOf(S.table).lines.length) return toast(t('msg.empty'));
      S.moveFrom = S.table; S.view = 'map'; render();
    },
    'cancel-ticket': function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return;
      if (!isAdmin()) return toast(t('msg.adminOnly'));
      if (!confirm(t('msg.cancelConfirm', { t: tableLabel(S.table) }))) return;
      Store.remove('tickets/' + S.table); delete S.tickets[S.table];
      S.view = 'map'; render();
    },
    'print-ticket': function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return toast(t('msg.empty'));
      printTicket(tk, null);
    },
    kitchen: function () {
      var tk = ticketOf(S.table);
      var pending = tk.lines.filter(function (l) { return !l.sent; });
      if (!pending.length) return toast(t('msg.noKitchen'));
      printKitchen(S.table, pending);
      tk.lines.forEach(function (l) { l.sent = true; });
      saveTicket(tk); render();
    },
    pay: function () {
      var tk = ticketOf(S.table);
      if (!tk.lines.length) return toast(t('msg.empty'));
      openPay(tk);
    },

    'print-x': function () { printReport('INFORME X (sin cierre)', summarize(salesList()), Date.now()); },
    csv: function () { exportCsv(); },
    'close-z': function () {
      if (!isAdmin()) return;
      var sales = salesList();
      if (!sales.length) return toast(t('caja.nothing'));
      if (Object.keys(S.tickets).length && !confirm(t('caja.openWarn'))) return;
      if (!confirm(t('caja.zConfirm', { n: fmt(summarize(sales).total) }))) return;
      var id = Store.newId();
      var c = { id: id, closedAt: Date.now(), user: S.user.name, summary: summarize(sales), sales: S.sales };
      Store.set('closures/' + id, c).then(function () {
        Store.remove('sales');
        // limpia avisos QR ya atendidos
        var keep = {};
        Object.keys(S.orders).forEach(function (k) { if (S.orders[k].status === 'new') keep[k] = S.orders[k]; });
        Store.set('orders', keep);
        printReport('CIERRE Z', c.summary, c.closedAt);
      });
    },
    'print-z': function (d) {
      var c = S.closures[d.id];
      if (c) printReport('CIERRE Z (copia)', c.summary, c.closedAt);
    },
    reprint: function (d) {
      var s = S.sales[d.id];
      if (s) printTicket(s, s);
    },

    'admin-tab': function (d) { S.adminTab = d.t; render(); },
    'admin-cat': function (d) { S.adminCat = d.id; render(); },
    'cat-add': function () {
      var name = prompt(t('admin.newCatPrompt'));
      if (!name) return;
      var menu = clone(S.menu);
      var id = 'c' + Store.newId();
      menu.push({ id: id, name: name.trim(), icon: '🍽️', items: [] });
      S.adminCat = id; saveMenu(menu); render();
    },
    'cat-up': function (d) {
      var i = +d.ci;
      if (i === 0) return;
      var menu = clone(S.menu);
      menu.splice(i - 1, 0, menu.splice(i, 1)[0]);
      saveMenu(menu); render();
    },
    'cat-del': function (d) {
      var menu = clone(S.menu);
      if (!confirm(t('admin.delCatConfirm', { n: menu[d.ci].name }))) return;
      menu.splice(+d.ci, 1); saveMenu(menu); render();
    },
    'it-add': function (d) {
      var menu = clone(S.menu);
      menu[d.ci].items = menu[d.ci].items || [];
      menu[d.ci].items.push({ id: menu[d.ci].id + '-' + Store.newId(), name: t('admin.newProduct'), price: 0, available: true });
      saveMenu(menu); render();
    },
    'it-del': function (d) {
      var menu = clone(S.menu);
      if (!confirm(t('admin.delConfirm', { n: menu[d.ci].items[d.ii].name }))) return;
      menu[d.ci].items.splice(+d.ii, 1); saveMenu(menu); render();
    },
    'menu-reset': function () {
      if (!confirm(t('admin.resetConfirm'))) return;
      saveMenu(clone(P.DEFAULT_MENU)); render();
    },
    'mod-add': function (d) {
      var mods = clone(S.mods);
      mods.push({ id: d.type.charAt(0) + Store.newId(), type: d.type, name: '…', price: 0 });
      saveMods(mods); render();
    },
    'mod-del': function (d) {
      var mods = clone(S.mods);
      if (!confirm(t('admin.delConfirm', { n: mods[d.mi].name }))) return;
      mods.splice(+d.mi, 1); saveMods(mods); render();
    },
    'mods-reset': function () {
      if (!confirm(t('admin.resetMods') + '?')) return;
      saveMods(clone(P.DEFAULT_MODS)); render();
    },
    'u-add': function () {
      var users = clone(S.users);
      users.push({ name: 'NUEVO', pin: '0000', admin: false });
      saveUsers(users); render();
    },
    'u-del': function (d) {
      var users = clone(S.users);
      if (users[d.i].name === S.user.name) return toast(t('msg.selfDel'));
      if (!confirm(t('admin.delUser', { n: users[d.i].name }))) return;
      users.splice(+d.i, 1); saveUsers(users); render();
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
    var tk = ticketOf(table);
    add.forEach(function (a) {
      var mods = a.mods || [];
      var price = round2(a.base + extrasOf(mods));
      var same = tk.lines.filter(function (l) {
        return l.pid === a.pid && l.name === a.name && l.price === price && !l.sent && (l.note || '') === (a.note || '') &&
          sameMods(l.mods, mods) && (l.src || 'pos') === (a.src || 'pos');
      })[0];
      if (same) same.qty = round2(same.qty + a.qty);
      else {
        tk.lines.push({
          pid: a.pid, name: a.name, base: a.base, price: price, qty: a.qty, mods: mods,
          note: a.note || '', src: a.src || 'pos', sent: false, free: !!a.free
        });
      }
    });
    if (table === S.table) S.sel = -1;
    saveTicket(tk);
    render();
  }

  function changeQty(delta) {
    var tk = ticketOf(S.table);
    var l = tk.lines[S.sel];
    if (!l) return toast(t('msg.selectLine'));
    if (delta < 0 && l.sent && !isAdmin()) return toast(t('msg.sentAdmin'));
    l.qty = round2(l.qty + delta);
    if (l.qty <= 0) { tk.lines.splice(S.sel, 1); S.sel = -1; }
    saveTicket(tk); render();
  }

  function numKey(k) {
    var tk = ticketOf(S.table);
    if (/^\d$/.test(k)) { if (S.buf.length < 8) S.buf += k; return render(); }
    if (k === ',') { if (S.buf.indexOf(',') < 0) S.buf = (S.buf || '0') + ','; return render(); }
    if (k === 'CLR') { S.buf = ''; return render(); }
    var n = takeNumber();
    if (k === 'DTO%') {
      if (n > 100) return toast(t('msg.max100'));
      tk.discountPct = n; tk.discountEur = 0;
      toast(n ? t('msg.discPct', { n: n }) : t('msg.discOff'));
    } else if (k === 'DTO€') {
      tk.discountEur = round2(n); tk.discountPct = 0;
      toast(n ? t('msg.discEur', { n: fmt(n) }) : t('msg.discOff'));
    } else if (k === 'PREC' || k === 'CANT') {
      var l = tk.lines[S.sel];
      if (!l) { render(); return toast(t('msg.numFirst')); }
      if (k === 'PREC') { l.price = round2(n); l.base = round2(n - extrasOf(l.mods)); }
      else if (n > 0) l.qty = round2(n);
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
    Store.remove('tickets/' + from); delete S.tickets[from];
    saveTicket(dst);
    toast(tableLabel(from) + ' → ' + tableLabel(target));
    S.table = target; S.view = 'ticket'; render();
  }

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
    if (line.sent && !isAdmin()) return toast(t('msg.sentAdmin'));
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
        addLines(S.table, [{ pid: 'libre', name: name, base: price, qty: st.qty, free: true }]);
      }
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
  function nextInvoice() {
    var series = S.settings.series || P.DEFAULT_SETTINGS.series;
    return Store.get('counters/' + series).then(function (n) {
      n = (Number(n) || 0) + 1;
      return Store.set('counters/' + series, n).then(function () {
        return series + '-' + String(n).padStart(6, '0');
      });
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
        nextInvoice().then(function (invoice) {
          var vat = Number(S.settings.vat) || 0;
          var base = round2(tot.total / (1 + vat / 100));
          var id = Store.newId();
          var sale = Object.assign({}, tk, {
            id: id, invoice: invoice, total: tot.total, subtotal: tot.subtotal, discount: tot.discount,
            vatRate: vat, base: base, vatAmount: round2(tot.total - base),
            method: st.method, given: round2(given), change: round2(given - tot.total),
            cashier: S.user.name, closedAt: Date.now()
          });
          return Store.set('sales/' + id, sale).then(function () {
            Store.remove('tickets/' + tk.table);
            delete S.tickets[tk.table];
            closeModal();
            if (st.print) printTicket(sale, sale);
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
    var all = salesList().slice();
    Object.keys(S.closures).forEach(function (k) {
      var c = S.closures[k];
      Object.keys(c.sales || {}).forEach(function (sk) { all.push(c.sales[sk]); });
    });
    all.sort(function (a, b) { return a.closedAt - b.closedAt; });
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
        (list.length ? list.map(function (o) {
          var head = '<header><b>' + esc(tableLabel(o.table)) + '</b><span class="muted">' + time(o.createdAt) + '</span></header>';
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
        if (cmd === 'bill') { closeModal(); S.table = o.table; S.view = 'ticket'; render(); return; }
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
    addLines(o.table, add);
    if (kitchen) {
      var tk = ticketOf(o.table);
      var pending = tk.lines.filter(function (l) { return !l.sent; });
      printKitchen(o.table, pending);
      tk.lines.forEach(function (l) { l.sent = true; });
      saveTicket(tk);
    }
    Store.update('orders/' + o.id, { status: 'accepted', handledBy: S.user.name, handledAt: Date.now() });
    toast(t('orders.added', { t: tableLabel(o.table) }));
  }

  // ---------------------------------------------------------------- impresión
  // Los tickets y comandas se imprimen siempre en español.

  function printHtml(html) {
    var pa = document.getElementById('print-area');
    pa.innerHTML = html;
    setTimeout(function () { window.print(); }, 50);
  }

  function header() {
    var st = S.settings;
    return '<h1>' + esc(st.name) + '</h1><div class="c">' + esc(st.address) + (st.nif ? '<br>NIF ' + esc(st.nif) : '') + '</div><hr>';
  }

  function printTicket(tk, sale) {
    var tot = P.ticketTotals(tk);
    var vat = sale && sale.vatRate != null ? sale.vatRate : (Number(S.settings.vat) || 0);
    var base = round2(tot.total / (1 + vat / 100));
    var when = sale ? sale.closedAt : Date.now();
    printHtml(header() +
      '<div>' + (sale ? 'Factura simplificada ' + esc(sale.invoice || sale.id.toUpperCase()) : '<b>PRE-CUENTA (no válida como factura)</b>') + '</div>' +
      '<div>' + esc(tableLabelEs(tk.table)) + ' · ' + esc(sale ? sale.cashier : S.user.name) + '</div>' +
      '<div>' + new Date(when).toLocaleString('es-ES') + '</div><hr>' +
      '<table>' + tk.lines.map(function (l) {
        var extras = (l.mods || []).filter(function (m) { return m.type === 'extra'; });
        return '<tr><td>' + fmtQty(l.qty) + '</td><td>' + esc(l.name) +
          (extras.length ? '<br>&nbsp;+ ' + esc(extras.map(function (m) { return m.name; }).join(', ')) : '') +
          '</td><td class="r">' + fmt(l.price * l.qty) + '</td></tr>';
      }).join('') + '</table><hr>' +
      '<table>' + (tot.discount ? '<tr><td>Subtotal</td><td class="r">' + fmt(tot.subtotal) + '</td></tr><tr><td>Descuento</td><td class="r">-' + fmt(tot.discount) + '</td></tr>' : '') +
      '<tr class="big"><td>TOTAL</td><td class="r">' + fmt(tot.total) + '</td></tr>' +
      '<tr><td>Base imponible</td><td class="r">' + fmt(base) + '</td></tr>' +
      '<tr><td>IVA ' + vat + '%</td><td class="r">' + fmt(tot.total - base) + '</td></tr>' +
      (sale ? '<tr><td>' + esc(METHOD_ES[sale.method] || sale.method) + '</td><td class="r">' + fmt(sale.given) + '</td></tr>' +
        (sale.change ? '<tr><td>Cambio</td><td class="r">' + fmt(sale.change) + '</td></tr>' : '') : '') +
      '</table><hr><div class="c">' + esc(S.settings.footer) + '</div>');
  }

  function printKitchen(table, lines) {
    printHtml('<h1>COCINA · ' + esc(tableLabelEs(table)) + '</h1><div class="c">' + new Date().toLocaleTimeString('es-ES') + ' · ' + esc(S.user.name) + '</div><hr>' +
      '<table class="kitchen">' + lines.map(function (l) {
        var sub = [P.modsText(l.mods, 'es'), l.note].filter(Boolean);
        return '<tr><td>' + fmtQty(l.qty) + ' x</td><td>' + esc(l.name) + sub.map(function (s) { return '<br>» ' + esc(s); }).join('') + '</td></tr>';
      }).join('') + '</table>');
  }

  function printReport(title, s, when) {
    printHtml(header() + '<div class="c"><b>' + title + '</b><br>' + new Date(when).toLocaleString('es-ES') + '</div><hr><table>' +
      '<tr><td>Tickets</td><td class="r">' + s.count + '</td></tr>' +
      METHODS.map(function (m) {
        return '<tr><td>' + METHOD_ES[m] + '</td><td class="r">' + fmt(s.byMethod[m] || 0) + '</td></tr>';
      }).join('') +
      '<tr><td>Descuentos</td><td class="r">' + fmt(s.discounts) + '</td></tr>' +
      '<tr class="big"><td>TOTAL</td><td class="r">' + fmt(s.total) + '</td></tr></table><hr><table>' +
      Object.keys(s.byUser).map(function (u) { return '<tr><td>' + esc(u) + '</td><td class="r">' + fmt(s.byUser[u]) + '</td></tr>'; }).join('') +
      '</table>');
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
    else if (e.key === 'Escape' && modalHandler) closeModal();
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
