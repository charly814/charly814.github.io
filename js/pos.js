// TPV Platet: usuarios con PIN, plano de mesas, tickets, cobro, caja (X/Z),
// pedidos QR y ajustes. Todos los datos pasan por Store (local o nube).
(function () {
  'use strict';

  var P = window.Platet;
  var fmt = P.fmt, esc = P.esc, round2 = P.round2;
  var QUICK = 'RAPIDA';

  var S = {
    view: 'login',
    user: null,
    table: null,
    cat: null,
    sel: -1,
    buf: '',
    moveFrom: null,
    adminTab: 'productos',
    adminCat: null,
    conn: Store.mode === 'local' ? 'local' : 'connecting',
    menu: P.DEFAULT_MENU,
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

  // ---------------------------------------------------------------- datos

  Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });
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
      toast('📲 Nuevo aviso de mesa ' + now[now.length - 1].table);
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
    var t = S.tickets[table];
    if (t) { t.lines = t.lines || []; return t; }
    return { table: table, lines: [], discountPct: 0, discountEur: 0 };
  }

  function saveTicket(t) {
    if (!t.lines.length && !t.discountPct && !t.discountEur) return Store.remove('tickets/' + t.table);
    if (!t.openedAt) { t.openedAt = Date.now(); t.user = S.user.name; }
    S.tickets[t.table] = t;
    return Store.set('tickets/' + t.table, t);
  }

  function tableLabel(id) { return id === QUICK ? 'Venta rápida' : 'Mesa ' + id; }

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

  function topbar(title) {
    var n = pendingOrders().length;
    var conn = S.conn === 'local' ? '<span class="conn">● Modo local</span>'
      : S.conn === 'error' ? '<span class="conn err">● Sin conexión</span>'
        : '<span class="conn">● Nube conectada</span>';
    return '<header class="topbar"><div><small>TPV/' + esc(S.user.name) + ' · ' + conn + '</small><h1>' + esc(title) + '</h1></div>' +
      '<div class="tb-actions">' +
      '<button class="tb-btn' + (n ? ' primary' : '') + '" data-act="orders">📲 Pedidos QR' + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>' +
      (S.view !== 'map' ? '<button class="tb-btn" data-act="go" data-v="map">🪑 Mesas</button>' : '<button class="tb-btn" data-act="open-table" data-id="' + QUICK + '">⚡ Venta rápida</button>') +
      '<button class="tb-btn" data-act="go" data-v="caja">💶 Caja</button>' +
      (isAdmin() ? '<button class="tb-btn" data-act="go" data-v="admin">⚙️ Ajustes</button>' : '') +
      '<button class="tb-btn" data-act="logout">⎋ Salir</button>' +
      '</div></header>';
  }

  function viewSetup() {
    return '<section class="login"><h1>Configurar TPV (modo nube)</h1><div class="card" style="max-width:560px">' +
      '<p>Introduce la <b>clave secreta</b> de tu Firebase Realtime Database (Configuración del proyecto → Cuentas de servicio → Secretos de la base de datos).</p>' +
      '<p class="muted">Se guarda solo en este dispositivo. Sin ella, nadie puede ver ventas, usuarios ni PIN; los clientes solo pueden leer la carta y enviar pedidos.</p>' +
      '<div class="field"><input id="auth-key" type="password" autocomplete="off" placeholder="Clave secreta"></div>' +
      '<button class="btn primary" data-act="save-auth">Guardar y entrar</button></div></section>';
  }

  function viewLogin() {
    return '<section class="login"><h1>Seleccionar Usuario</h1><div class="user-grid">' +
      S.users.map(function (u, i) {
        return '<button class="user-tile" data-act="pick-user" data-i="' + i + '">' + esc(u.name) + '</button>';
      }).join('') +
      '</div><div class="brand">🍴 <b>TPV</b> Platet</div>' +
      '<p class="mode-note">' + (Store.mode === 'local'
        ? 'Modo local: los datos se guardan solo en este dispositivo.'
        : S.conn === 'error'
          ? '<span class="warn">No se puede conectar con la nube. Revisa internet o la clave secreta. <button class="btn" data-act="reset-auth">Cambiar clave</button></span>'
          : 'Modo nube: sincronizado con los pedidos QR.') + '</p></section>';
  }

  function viewMap() {
    var orderTables = {};
    pendingOrders().forEach(function (o) { orderTables[o.table] = (orderTables[o.table] || 0) + 1; });
    var tables = P.LAYOUT.map(function (t) {
      var tk = S.tickets[t.id];
      var busy = tk && (tk.lines || []).length;
      var cls = 'tbl ' + t.shape + (busy ? ' busy' : '') + (orderTables[t.id] ? ' qr' : '');
      return '<button class="' + cls + '" style="left:' + t.x + '%;top:' + t.y + '%" data-act="open-table" data-id="' + t.id + '">' +
        '<span>' + t.id + '</span>' + (busy && t.shape !== 'stool' ? '<small>' + fmt(P.ticketTotals(tk).total) + '</small>' : '') +
        (orderTables[t.id] ? '<i class="alert">QR ' + orderTables[t.id] + '</i>' : '') + '</button>';
    }).join('');
    var quick = S.tickets[QUICK] && (S.tickets[QUICK].lines || []).length;
    return topbar('Seleccionar Mesa') +
      (S.moveFrom ? '<div class="banner"><span>Elige la mesa de destino para <b>' + esc(tableLabel(S.moveFrom)) + '</b> (si está ocupada, se juntan los tickets).</span><button class="btn" data-act="move-cancel">Cancelar</button></div>' : '') +
      (quick ? '<div class="banner"><span>Hay una venta rápida abierta: ' + fmt(P.ticketTotals(S.tickets[QUICK]).total) + '</span><button class="btn" data-act="open-table" data-id="' + QUICK + '">Abrir</button></div>' : '') +
      '<div class="floor-wrap"><div class="floor">' +
      '<div class="bar-h"></div><div class="bar-v"></div>' +
      '<span class="plant" style="left:89%;top:19%">🌳</span><span class="plant" style="left:17%;top:70%">🌳</span>' +
      tables + '</div></div>' +
      '<div class="legend"><span class="l-free">Libre</span><span class="l-busy">Ocupada</span><span class="l-qr">Pedido QR pendiente</span></div>';
  }

  function viewTicket() {
    var t = ticketOf(S.table);
    var tot = P.ticketTotals(t);
    if (!S.cat || !S.menu.some(function (c) { return c.id === S.cat; })) S.cat = S.menu[0] && S.menu[0].id;
    var cat = S.menu.filter(function (c) { return c.id === S.cat; })[0];

    var lines = t.lines.map(function (l, i) {
      return '<div class="tk-line' + (i === S.sel ? ' sel' : '') + '" data-act="sel-line" data-i="' + i + '">' +
        '<span>' + fmtQty(l.qty) + '</span>' +
        '<span>' + esc(l.name) + (l.src === 'qr' ? '<i class="tag qr">QR</i>' : '') + (l.sent ? '<i class="tag sent">✓ cocina</i>' : '') +
        (l.note ? '<em>' + esc(l.note) + '</em>' : '') + '</span>' +
        '<span>' + fmt(l.price).replace(' €', '') + '</span><span>' + fmt(l.price * l.qty).replace(' €', '') + '</span></div>';
    }).join('');

    var key = function (k, label, cls) {
      return '<button class="' + (cls || '') + '" data-act="key" data-k="' + k + '">' + (label || k) + '</button>';
    };

    return '<div class="ticket-view">' +
      '<section class="tk-left">' +
      '<div class="tk-head"><div><h2>' + esc(tableLabel(S.table)) + '</h2><small>' + esc(t.user || S.user.name) + '</small></div><small>' + new Date().toLocaleDateString('es-ES') + '</small></div>' +
      '<div class="tk-cols"><span>Uds</span><span>Producto</span><span>Precio</span><span>Total</span></div>' +
      '<div class="tk-lines">' + (lines || '<p class="muted" style="padding:14px">Ticket vacío. Toca un producto para añadirlo.</p>') + '</div>' +
      '<div class="tk-total">' +
      (tot.discount ? '<div class="row"><span>Subtotal</span><span>' + fmt(tot.subtotal) + '</span></div><div class="row"><span>Descuento' + (t.discountPct ? ' ' + t.discountPct + '%' : '') + '</span><span>−' + fmt(tot.discount) + '</span></div>' : '') +
      '<div class="row big"><span>Total</span><span>' + fmt(tot.total) + '</span></div></div>' +
      '<div class="numpad"><div class="disp">' + (S.buf ? esc(S.buf) : '<span class="muted">cantidad / importe</span>') + '</div>' +
      key('7') + key('8') + key('9') + key('DTO%', 'DTO%', 'fn') +
      key('4') + key('5') + key('6') + key('DTO€', 'DTO €', 'fn') +
      key('1') + key('2') + key('3') + key('PREC', 'PREC', 'fn') +
      key('0') + key(',') + key('CLR', 'CLR', 'fn') + key('CANT', 'CANT', 'fn') +
      '</div></section>' +
      '<section class="tk-right">' +
      '<div class="cats">' + S.menu.map(function (c) {
        return '<button class="cat' + (c.id === S.cat ? ' on' : '') + '" data-act="cat" data-id="' + esc(c.id) + '"><b>' + esc(c.icon || '🍽️') + '</b>' + esc(c.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="prods">' + ((cat && cat.items) || []).map(function (it) {
        return '<button class="prod' + (it.available === false ? ' off' : '') + '" data-act="add" data-id="' + esc(it.id) + '"><span>' + esc(it.name) + '</span><b>' + fmt(it.price) + '</b></button>';
      }).join('') + '</div>' +
      '<nav class="actions">' +
      act('go', '🪑', 'Mesas', 'data-v="map"') +
      act('print-ticket', '🖨️', 'Imprimir') +
      act('kitchen', '👨‍🍳', 'Marchar') +
      act('qty-minus', '➖', 'Quitar 1') +
      act('qty-plus', '➕', 'Añadir 1') +
      act('del-line', '🗑️', 'Borrar línea') +
      act('note', '💬', 'Añadir nota') +
      act('move', '⇄', 'Cambiar mesa') +
      act('cancel-ticket', '✖', 'Cancelar ticket', '', 'danger') +
      '<button class="act pay" data-act="pay"><b>💶</b>Cobrar ' + fmt(tot.total) + '</button>' +
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

  var METHODS = { efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', bizum: '📱 Bizum' };

  function viewCaja() {
    var sales = salesList();
    var s = summarize(sales);
    var open = Object.keys(S.tickets).length;
    var closures = Object.keys(S.closures).map(function (k) { return S.closures[k]; })
      .sort(function (a, b) { return b.closedAt - a.closedAt; }).slice(0, 15);
    return topbar('Caja') + '<div class="page">' +
      '<div class="card"><h3>Turno actual (desde el último cierre)</h3><div class="kpis">' +
      kpi('Total vendido', fmt(s.total)) + kpi('Tickets cobrados', s.count) +
      Object.keys(METHODS).map(function (m) { return kpi(METHODS[m], fmt(s.byMethod[m] || 0)); }).join('') +
      kpi('Mesas abiertas', open) + '</div>' +
      '<p class="muted">Por camarero: ' + (Object.keys(s.byUser).map(function (u) { return esc(u) + ' ' + fmt(s.byUser[u]); }).join(' · ') || '—') + '</p>' +
      '<div class="btn-row"><button class="btn" data-act="print-x">🖨️ Imprimir X (informe)</button>' +
      (isAdmin() ? '<button class="btn danger" data-act="close-z">Cerrar caja (Z)</button>' : '') + '</div></div>' +
      '<div class="card"><h3>Tickets cobrados</h3>' + (sales.length ? '<table class="list"><tr><th>Hora</th><th>Mesa</th><th>Camarero</th><th>Pago</th><th class="num">Total</th><th></th></tr>' +
        sales.slice().reverse().map(function (x) {
          return '<tr><td>' + time(x.closedAt) + '</td><td>' + esc(x.table) + '</td><td>' + esc(x.cashier) + '</td><td>' + esc(METHODS[x.method] || x.method) + '</td><td class="num">' + fmt(x.total) + '</td>' +
            '<td><button class="btn" data-act="reprint" data-id="' + esc(x.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table>' : '<p class="muted">Todavía no hay ventas en este turno.</p>') + '</div>' +
      '<div class="card"><h3>Cierres anteriores</h3>' + (closures.length ? '<table class="list"><tr><th>Fecha</th><th>Por</th><th class="num">Tickets</th><th class="num">Total</th><th></th></tr>' +
        closures.map(function (c) {
          return '<tr><td>' + new Date(c.closedAt).toLocaleString('es-ES') + '</td><td>' + esc(c.user) + '</td><td class="num">' + c.summary.count + '</td><td class="num">' + fmt(c.summary.total) + '</td>' +
            '<td><button class="btn" data-act="print-z" data-id="' + esc(c.id) + '">🖨️</button></td></tr>';
        }).join('') + '</table>' : '<p class="muted">Sin cierres.</p>') + '</div>' +
      '</div>';
  }

  function kpi(label, val) { return '<div class="kpi"><small>' + label + '</small><b>' + val + '</b></div>'; }
  function time(ts) { return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }

  function viewAdmin() {
    var tabs = '<div class="tabs">' + [['productos', 'Productos'], ['usuarios', 'Usuarios'], ['ajustes', 'Ajustes y QR']].map(function (t) {
      return '<button class="' + (S.adminTab === t[0] ? 'on' : '') + '" data-act="admin-tab" data-t="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var body = S.adminTab === 'productos' ? adminProducts() : S.adminTab === 'usuarios' ? adminUsers() : adminSettings();
    return topbar('Ajustes') + '<div class="page">' + tabs + body + '</div>';
  }

  function adminProducts() {
    if (!S.adminCat || !S.menu.some(function (c) { return c.id === S.adminCat; })) S.adminCat = S.menu[0] && S.menu[0].id;
    var ci = S.menu.findIndex(function (c) { return c.id === S.adminCat; });
    var cat = S.menu[ci];
    return '<div class="card"><h3>Categorías</h3><div class="cats" style="padding:0;border:0">' +
      S.menu.map(function (c) {
        return '<button class="cat' + (c.id === S.adminCat ? ' on' : '') + '" data-act="admin-cat" data-id="' + esc(c.id) + '"><b>' + esc(c.icon) + '</b>' + esc(c.name) + '</button>';
      }).join('') + '<button class="cat" data-act="cat-add"><b>＋</b>Nueva</button></div></div>' +
      (cat ? '<div class="card"><h3>' + esc(cat.icon) + ' ' + esc(cat.name) + '</h3>' +
        '<div class="form-row" style="grid-template-columns:80px 1fr auto auto"><input type="text" value="' + esc(cat.icon) + '" data-edit="cat-icon" data-ci="' + ci + '"><input type="text" value="' + esc(cat.name) + '" data-edit="cat-name" data-ci="' + ci + '">' +
        '<button class="btn" data-act="cat-up" data-ci="' + ci + '">↑</button><button class="btn danger" data-act="cat-del" data-ci="' + ci + '">Borrar categoría</button></div><hr>' +
        '<div class="form-row muted"><span>Producto</span><span>Precio €</span><span>Disponible</span><span></span></div>' +
        (cat.items || []).map(function (it, ii) {
          return '<div class="form-row"><input type="text" value="' + esc(it.name) + '" data-edit="it-name" data-ci="' + ci + '" data-ii="' + ii + '">' +
            '<input type="number" step="0.05" min="0" value="' + it.price + '" data-edit="it-price" data-ci="' + ci + '" data-ii="' + ii + '">' +
            '<label><input type="checkbox" ' + (it.available !== false ? 'checked' : '') + ' data-edit="it-avail" data-ci="' + ci + '" data-ii="' + ii + '"> sí</label>' +
            '<button class="btn" data-act="it-del" data-ci="' + ci + '" data-ii="' + ii + '">🗑️</button></div>';
        }).join('') +
        '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="it-add" data-ci="' + ci + '">＋ Añadir producto</button></div>' +
        '<p class="muted">Los productos no disponibles (agotados) no aparecen en la carta QR.</p></div>' : '') +
      '<div class="card"><button class="btn danger" data-act="menu-reset">Restaurar carta por defecto</button></div>';
  }

  function adminUsers() {
    return '<div class="card"><h3>Usuarios</h3><div class="form-row users muted"><span>Nombre</span><span>PIN</span><span>Admin</span><span></span></div>' +
      S.users.map(function (u, i) {
        return '<div class="form-row users"><input type="text" value="' + esc(u.name) + '" data-edit="u-name" data-i="' + i + '">' +
          '<input type="text" inputmode="numeric" maxlength="6" value="' + esc(u.pin) + '" data-edit="u-pin" data-i="' + i + '">' +
          '<label><input type="checkbox" ' + (u.admin ? 'checked' : '') + ' data-edit="u-admin" data-i="' + i + '"> sí</label>' +
          '<button class="btn" data-act="u-del" data-i="' + i + '">🗑️</button></div>';
      }).join('') +
      '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="u-add">＋ Añadir usuario</button></div>' +
      '<p class="muted">Los administradores pueden cancelar tickets, cerrar caja y entrar en Ajustes.</p></div>';
  }

  function adminSettings() {
    var st = S.settings;
    var f = function (k, label) {
      return '<div class="field"><label>' + label + '</label><input type="text" value="' + esc(st[k]) + '" data-edit="set" data-k="' + k + '"></div>';
    };
    var qrUrl = new URL('qr.html', location.href).href;
    return '<div class="card"><h3>Datos del ticket</h3>' + f('name', 'Nombre del local') + f('address', 'Dirección') + f('nif', 'NIF/CIF') +
      f('vat', 'IVA incluido (%)') + f('footer', 'Pie del ticket') + '</div>' +
      '<div class="card"><h3>Pedidos con QR</h3>' +
      '<p>Modo actual: <b>' + (Store.mode === 'local' ? 'LOCAL' : 'NUBE (Firebase)') + '</b></p>' +
      (Store.mode === 'local'
        ? '<p class="warn">En modo local los pedidos de los móviles de los clientes no llegan a este TPV. Para activarlo, configura Firebase en <code>config.js</code> (ver TPV-LEEME.md).</p>'
        : '<p class="muted">Los pedidos de los clientes llegan aquí en tiempo real.</p><p><button class="btn" data-act="reset-auth">Cambiar clave secreta de este TPV</button></p>') +
      '<div class="btn-row"><a class="btn primary" href="' + esc(qrUrl) + '" target="_blank" rel="noopener">🔳 Imprimir códigos QR de las mesas</a>' +
      '<a class="btn" href="pedir.html?mesa=T1" target="_blank" rel="noopener">Probar carta QR (mesa T1)</a></div></div>';
  }

  // ---------------------------------------------------------------- eventos

  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var fn = ACTIONS[b.dataset.act];
    if (fn) fn(b.dataset, b);
  });

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.edit) return;
    var d = el.dataset;
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var menu = JSON.parse(JSON.stringify(S.menu));
    var users = JSON.parse(JSON.stringify(S.users));
    switch (d.edit) {
      case 'cat-icon': menu[d.ci].icon = val; return saveMenu(menu);
      case 'cat-name': menu[d.ci].name = val; return saveMenu(menu);
      case 'it-name': menu[d.ci].items[d.ii].name = val; return saveMenu(menu);
      case 'it-price': menu[d.ci].items[d.ii].price = round2(String(val).replace(',', '.')); return saveMenu(menu);
      case 'it-avail': menu[d.ci].items[d.ii].available = val; return saveMenu(menu);
      case 'u-name': users[d.i].name = String(val).trim().toUpperCase() || users[d.i].name; return saveUsers(users);
      case 'u-pin':
        if (!/^\d{4,6}$/.test(val)) { toast('El PIN debe tener de 4 a 6 números'); return render(); }
        users[d.i].pin = val; return saveUsers(users);
      case 'u-admin': users[d.i].admin = val; return saveUsers(users);
      case 'set':
        var st = Object.assign({}, S.settings);
        st[d.k] = d.k === 'vat' ? (Number(String(val).replace(',', '.')) || 0) : val;
        return Store.set('settings', st);
    }
  });

  function saveMenu(menu) { S.menu = menu; return Store.set('menu', menu); }
  function saveUsers(users) {
    if (!users.some(function (u) { return u.admin; })) { toast('Debe quedar al menos un administrador'); render(); return; }
    S.users = users;
    return Store.set('users', users);
  }

  var ACTIONS = {
    'pick-user': function (d) { askPin(S.users[d.i]); },
    'save-auth': function () {
      var key = document.getElementById('auth-key').value.trim();
      if (!key) return toast('Introduce la clave');
      Store.setAuth(key); location.reload();
    },
    'reset-auth': function () {
      if (!confirm('¿Borrar la clave secreta guardada en este dispositivo?')) return;
      Store.setAuth(''); location.reload();
    },
    logout: function () { S.user = null; S.table = null; S.moveFrom = null; closeModal(); render(); },
    go: function (d) {
      if ((d.v === 'admin') && !isAdmin()) return;
      S.view = d.v; S.sel = -1; S.buf = ''; render();
    },
    orders: function () { openOrders(); },

    'open-table': function (d) {
      if (S.moveFrom) return moveTo(d.id);
      S.table = d.id; S.view = 'ticket'; S.sel = -1; S.buf = ''; render();
    },
    'move-cancel': function () { S.moveFrom = null; render(); },

    cat: function (d) { S.cat = d.id; render(); },
    'sel-line': function (d) { S.sel = S.sel === +d.i ? -1 : +d.i; render(); },
    add: function (d) {
      var it = P.findItem(S.menu, d.id);
      if (!it) return;
      var qty = takeNumber() || 1;
      addLines(S.table, [{ pid: it.id, name: it.name, price: it.price, qty: qty }]);
    },
    key: function (d) { numKey(d.k); },
    'qty-plus': function () { changeQty(1); },
    'qty-minus': function () { changeQty(-1); },
    'del-line': function () {
      var t = ticketOf(S.table);
      if (!t.lines[S.sel]) return toast('Selecciona una línea');
      if (t.lines[S.sel].sent && !isAdmin()) return toast('Línea ya enviada a cocina: solo un administrador puede borrarla');
      t.lines.splice(S.sel, 1); S.sel = -1; saveTicket(t); render();
    },
    note: function () {
      var t = ticketOf(S.table);
      var l = t.lines[S.sel];
      if (!l) return toast('Selecciona una línea');
      var n = prompt('Nota para "' + l.name + '" (ej.: sin cebolla, poco hecho):', l.note || '');
      if (n === null) return;
      l.note = n.trim().slice(0, 120); saveTicket(t); render();
    },
    move: function () {
      if (!ticketOf(S.table).lines.length) return toast('El ticket está vacío');
      S.moveFrom = S.table; S.view = 'map'; render();
    },
    'cancel-ticket': function () {
      var t = ticketOf(S.table);
      if (!t.lines.length) return;
      if (!isAdmin()) return toast('Solo un administrador puede cancelar tickets');
      if (!confirm('¿Cancelar el ticket de ' + tableLabel(S.table) + '? Se borrarán todas las líneas.')) return;
      Store.remove('tickets/' + S.table); delete S.tickets[S.table];
      S.view = 'map'; render();
    },
    'print-ticket': function () {
      var t = ticketOf(S.table);
      if (!t.lines.length) return toast('El ticket está vacío');
      printTicket(t, null);
    },
    kitchen: function () {
      var t = ticketOf(S.table);
      var pending = t.lines.filter(function (l) { return !l.sent; });
      if (!pending.length) return toast('No hay líneas nuevas para cocina');
      printKitchen(S.table, pending);
      t.lines.forEach(function (l) { l.sent = true; });
      saveTicket(t); render();
    },
    pay: function () {
      var t = ticketOf(S.table);
      if (!t.lines.length) return toast('El ticket está vacío');
      openPay(t);
    },

    'print-x': function () { printReport('INFORME X (sin cierre)', summarize(salesList()), Date.now()); },
    'close-z': function () {
      if (!isAdmin()) return;
      var sales = salesList();
      if (!sales.length) return toast('No hay ventas que cerrar');
      if (Object.keys(S.tickets).length && !confirm('Hay mesas abiertas sin cobrar. ¿Cerrar la caja de todos modos? (las mesas siguen abiertas)')) return;
      if (!confirm('¿Cerrar caja (Z)? Total: ' + fmt(summarize(sales).total))) return;
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
      var name = prompt('Nombre de la nueva categoría:');
      if (!name) return;
      var menu = JSON.parse(JSON.stringify(S.menu));
      var id = 'c' + Store.newId();
      menu.push({ id: id, name: name.trim(), icon: '🍽️', items: [] });
      S.adminCat = id; saveMenu(menu); render();
    },
    'cat-up': function (d) {
      var i = +d.ci;
      if (i === 0) return;
      var menu = JSON.parse(JSON.stringify(S.menu));
      menu.splice(i - 1, 0, menu.splice(i, 1)[0]);
      saveMenu(menu); render();
    },
    'cat-del': function (d) {
      var menu = JSON.parse(JSON.stringify(S.menu));
      if (!confirm('¿Borrar la categoría "' + menu[d.ci].name + '" y todos sus productos?')) return;
      menu.splice(+d.ci, 1); saveMenu(menu); render();
    },
    'it-add': function (d) {
      var menu = JSON.parse(JSON.stringify(S.menu));
      menu[d.ci].items = menu[d.ci].items || [];
      menu[d.ci].items.push({ id: menu[d.ci].id + '-' + Store.newId(), name: 'Nuevo producto', price: 0, available: true });
      saveMenu(menu); render();
    },
    'it-del': function (d) {
      var menu = JSON.parse(JSON.stringify(S.menu));
      if (!confirm('¿Borrar "' + menu[d.ci].items[d.ii].name + '"?')) return;
      menu[d.ci].items.splice(+d.ii, 1); saveMenu(menu); render();
    },
    'menu-reset': function () {
      if (!confirm('¿Restaurar la carta por defecto? Se perderán los cambios de productos y precios.')) return;
      saveMenu(JSON.parse(JSON.stringify(P.DEFAULT_MENU))); render();
    },
    'u-add': function () {
      var users = JSON.parse(JSON.stringify(S.users));
      users.push({ name: 'NUEVO', pin: '0000', admin: false });
      saveUsers(users); render();
    },
    'u-del': function (d) {
      var users = JSON.parse(JSON.stringify(S.users));
      if (users[d.i].name === S.user.name) return toast('No puedes borrar tu propio usuario');
      if (!confirm('¿Borrar el usuario ' + users[d.i].name + '?')) return;
      users.splice(+d.i, 1); saveUsers(users); render();
    }
  };

  // ---------------------------------------------------------------- ticket

  function takeNumber() {
    var n = Number(S.buf.replace(',', '.'));
    S.buf = '';
    return n > 0 ? n : 0;
  }

  function addLines(table, add) {
    var t = ticketOf(table);
    add.forEach(function (a) {
      var same = t.lines.filter(function (l) {
        return l.pid === a.pid && l.price === a.price && !l.sent && !l.note && !a.note && (l.src || 'pos') === (a.src || 'pos');
      })[0];
      if (same) same.qty = round2(same.qty + a.qty);
      else t.lines.push({ pid: a.pid, name: a.name, price: a.price, qty: a.qty, note: a.note || '', src: a.src || 'pos', sent: false });
    });
    if (table === S.table) S.sel = -1;
    saveTicket(t);
    render();
  }

  function changeQty(delta) {
    var t = ticketOf(S.table);
    var l = t.lines[S.sel];
    if (!l) return toast('Selecciona una línea');
    if (delta < 0 && l.sent && !isAdmin()) return toast('Línea ya enviada a cocina: solo un administrador puede quitarla');
    l.qty = round2(l.qty + delta);
    if (l.qty <= 0) { t.lines.splice(S.sel, 1); S.sel = -1; }
    saveTicket(t); render();
  }

  function numKey(k) {
    var t = ticketOf(S.table);
    if (/^\d$/.test(k)) { if (S.buf.length < 8) S.buf += k; return render(); }
    if (k === ',') { if (S.buf.indexOf(',') < 0) S.buf = (S.buf || '0') + ','; return render(); }
    if (k === 'CLR') { S.buf = ''; return render(); }
    var n = takeNumber();
    if (k === 'DTO%') {
      if (n > 100) return toast('Descuento máximo 100%');
      t.discountPct = n; t.discountEur = 0;
      toast(n ? 'Descuento ' + n + '% aplicado' : 'Descuento quitado');
    } else if (k === 'DTO€') {
      t.discountEur = round2(n); t.discountPct = 0;
      toast(n ? 'Descuento ' + fmt(n) + ' aplicado' : 'Descuento quitado');
    } else if (k === 'PREC' || k === 'CANT') {
      var l = t.lines[S.sel];
      if (!l) { render(); return toast('Escribe el número y selecciona una línea antes'); }
      if (k === 'PREC') l.price = round2(n);
      else if (n > 0) l.qty = round2(n);
      else return render();
    }
    saveTicket(t); render();
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

  // ---------------------------------------------------------------- PIN

  function askPin(user) {
    var pin = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + esc(user.name) + '</h2><p class="muted" style="text-align:center">Introduce tu PIN</p>' +
        '<div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) {
          return '<button data-k="' + k + '" class="' + (k === 'OK' ? 'ok' : '') + '">' + k + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:12px"><button class="btn" data-k="X">Cancelar</button></div>';
    }
    function tryLogin() {
      if (pin === String(user.pin)) {
        S.user = user; S.view = 'map'; closeModal(); render();
      } else { pin = ''; draw(); toast('PIN incorrecto'); }
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

  function openPay(t) {
    var tot = P.ticketTotals(t);
    var st = { method: 'efectivo', given: '', print: true };
    function draw() {
      var given = Number(String(st.given).replace(',', '.')) || 0;
      var change = round2(given - tot.total);
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>Cobrar · ' + esc(tableLabel(t.table)) + '</h2>' +
        '<div class="pay-total">' + fmt(tot.total) + '</div>' +
        '<div class="pay-methods">' + Object.keys(METHODS).map(function (m) {
          return '<button data-k="m:' + m + '" class="' + (st.method === m ? 'on' : '') + '">' + METHODS[m] + '</button>';
        }).join('') + '</div>' +
        (st.method === 'efectivo'
          ? '<div class="field"><label>Entregado por el cliente</label><input id="pay-given" type="text" inputmode="decimal" value="' + esc(st.given) + '" placeholder="' + fmt(tot.total) + '"></div>' +
          '<div class="quick-cash">' + quickCash(tot.total).map(function (v) {
            return '<button data-k="g:' + v + '">' + fmt(v) + '</button>';
          }).join('') + '</div>' +
          '<div class="change">' + (given ? (change >= 0 ? 'Cambio: <b>' + fmt(change) + '</b>' : '<span class="warn">Faltan ' + fmt(-change) + '</span>') : '&nbsp;') + '</div>'
          : '') +
        '<label style="display:block;margin-bottom:14px"><input type="checkbox" data-k="print" ' + (st.print ? 'checked' : '') + '> Imprimir ticket</label>' +
        '<div class="btn-row"><button class="btn" data-k="X">Cancelar</button><button class="btn ok" data-k="OK" style="flex:1">Confirmar cobro</button></div>';
      var inp = document.getElementById('pay-given');
      if (inp) inp.oninput = function () { st.given = inp.value; var p = inp.selectionStart; draw(); var n = document.getElementById('pay-given'); n.focus(); n.setSelectionRange(p, p); };
    }
    openModal('pay', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === 'print') { st.print = !st.print; return; }
      if (k.indexOf('m:') === 0) { st.method = k.slice(2); return draw(); }
      if (k.indexOf('g:') === 0) { st.given = k.slice(2).replace('.', ','); return draw(); }
      if (k === 'OK') {
        var given = st.method === 'efectivo' ? (Number(String(st.given).replace(',', '.')) || tot.total) : tot.total;
        if (given < tot.total) return toast('El importe entregado es menor que el total');
        var id = Store.newId();
        var sale = Object.assign({}, t, {
          id: id, total: tot.total, subtotal: tot.subtotal, discount: tot.discount,
          method: st.method, given: round2(given), change: round2(given - tot.total),
          cashier: S.user.name, closedAt: Date.now()
        });
        Store.set('sales/' + id, sale).then(function () { return Store.remove('tickets/' + t.table); });
        delete S.tickets[t.table];
        closeModal();
        if (st.print) printTicket(sale, sale);
        toast('Cobrado ' + fmt(tot.total) + (sale.change ? ' · cambio ' + fmt(sale.change) : ''));
        S.view = 'map'; S.table = null; render();
      }
    });
  }

  function quickCash(total) {
    var out = [total];
    [5, 10, 20, 50, 100].forEach(function (v) { if (v > total && out.length < 5) out.push(v); });
    return out;
  }

  // ---------------------------------------------------------------- pedidos QR

  function openOrders() {
    function draw() {
      var list = pendingOrders();
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>📲 Pedidos y avisos QR</h2>' +
        (list.length ? list.map(function (o) {
          var head = '<header><b>' + esc(tableLabel(o.table)) + '</b><span class="muted">' + time(o.createdAt) + '</span></header>';
          if (o.type === 'waiter' || o.type === 'bill') {
            return '<div class="order-card req">' + head + '<p style="font-size:18px;margin:6px 0">' +
              (o.type === 'bill' ? '🧾 Pide la cuenta' : '🙋 Llama al camarero') + '</p>' +
              '<div class="btn-row"><button class="btn ok" data-k="done:' + esc(o.id) + '">Atendido</button>' +
              (o.type === 'bill' ? '<button class="btn" data-k="bill:' + esc(o.id) + '">Abrir cuenta</button>' : '') + '</div></div>';
          }
          var lines = priceOrder(o);
          var total = lines.reduce(function (s, l) { return s + (l.item ? l.item.price * l.qty : 0); }, 0);
          return '<div class="order-card">' + head + '<ul>' + lines.map(function (l) {
            return '<li>' + l.qty + ' × ' + esc(l.item ? l.item.name : l.name) +
              (l.item ? ' — ' + fmt(l.item.price * l.qty) : ' <span class="warn">(producto no encontrado, se ignorará)</span>') +
              (l.item && l.item.available === false ? ' <span class="warn">(agotado)</span>' : '') + '</li>';
          }).join('') + '</ul>' +
            (o.note ? '<div class="note">💬 ' + esc(o.note) + '</div>' : '') +
            '<p><b>Total: ' + fmt(total) + '</b></p>' +
            '<div class="btn-row"><button class="btn ok" data-k="ok:' + esc(o.id) + '">✓ Aceptar y añadir a la mesa</button>' +
            '<button class="btn" data-k="okk:' + esc(o.id) + '">✓ Aceptar + imprimir cocina</button>' +
            '<button class="btn danger" data-k="no:' + esc(o.id) + '">Rechazar</button></div></div>';
        }).join('') : '<p class="muted">No hay pedidos pendientes.</p>') +
        (Store.mode === 'local' ? '<p class="warn">Modo local: solo se reciben pedidos hechos en este mismo navegador. Configura Firebase para recibir los de los móviles.</p>' : '') +
        '<div class="btn-row"><button class="btn" data-k="X">Cerrar</button></div>';
    }
    openModal('orders', draw, function (k) {
      if (k === 'X') return closeModal();
      var i = k.indexOf(':');
      var cmd = k.slice(0, i), id = k.slice(i + 1);
      var o = S.orders[id];
      if (!o) return draw();
      if (cmd === 'ok' || cmd === 'okk') acceptOrder(o, cmd === 'okk');
      else if (cmd === 'no') {
        var reason = prompt('Motivo del rechazo (lo verá el cliente, opcional):', '');
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

  // Los precios siempre salen de la carta del TPV, nunca del móvil del cliente.
  function priceOrder(o) {
    return (o.lines || []).map(function (l) {
      var qty = Math.min(50, Math.max(1, Math.floor(Number(l.qty) || 1)));
      return { item: P.findItem(S.menu, l.pid), name: String(l.name || '?'), qty: qty };
    });
  }

  function acceptOrder(o, kitchen) {
    var add = priceOrder(o).filter(function (l) { return l.item; }).map(function (l) {
      return { pid: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty, src: 'qr' };
    });
    if (o.note && add.length) add[add.length - 1].note = String(o.note).slice(0, 120);
    if (!add.length) return toast('El pedido no tiene productos válidos');
    var t = ticketOf(o.table);
    if (!t.openedAt) { t.openedAt = Date.now(); t.user = S.user.name; }
    addLines(o.table, add);
    if (kitchen) {
      t = ticketOf(o.table);
      var pending = t.lines.filter(function (l) { return !l.sent; });
      printKitchen(o.table, pending);
      t.lines.forEach(function (l) { l.sent = true; });
      saveTicket(t);
    }
    Store.update('orders/' + o.id, { status: 'accepted', handledBy: S.user.name, handledAt: Date.now() });
    toast('Pedido añadido a ' + tableLabel(o.table));
  }

  // ---------------------------------------------------------------- impresión

  function printHtml(html) {
    var pa = document.getElementById('print-area');
    pa.innerHTML = html;
    setTimeout(function () { window.print(); }, 50);
  }

  function header() {
    var st = S.settings;
    return '<h1>' + esc(st.name) + '</h1><div class="c">' + esc(st.address) + (st.nif ? '<br>NIF ' + esc(st.nif) : '') + '</div><hr>';
  }

  function printTicket(t, sale) {
    var tot = P.ticketTotals(t);
    var vat = Number(S.settings.vat) || 0;
    var base = round2(tot.total / (1 + vat / 100));
    var when = sale ? sale.closedAt : Date.now();
    printHtml(header() +
      '<div>' + (sale ? 'Factura simplificada ' + esc(sale.id.toUpperCase()) : '<b>PRE-CUENTA (no válida como factura)</b>') + '</div>' +
      '<div>' + esc(tableLabel(t.table)) + ' · ' + esc(sale ? sale.cashier : S.user.name) + '</div>' +
      '<div>' + new Date(when).toLocaleString('es-ES') + '</div><hr>' +
      '<table>' + t.lines.map(function (l) {
        return '<tr><td>' + fmtQty(l.qty) + '</td><td>' + esc(l.name) + '</td><td class="r">' + fmt(l.price * l.qty) + '</td></tr>';
      }).join('') + '</table><hr>' +
      '<table>' + (tot.discount ? '<tr><td>Subtotal</td><td class="r">' + fmt(tot.subtotal) + '</td></tr><tr><td>Descuento</td><td class="r">-' + fmt(tot.discount) + '</td></tr>' : '') +
      '<tr class="big"><td>TOTAL</td><td class="r">' + fmt(tot.total) + '</td></tr>' +
      '<tr><td>Base imponible</td><td class="r">' + fmt(base) + '</td></tr>' +
      '<tr><td>IVA ' + vat + '%</td><td class="r">' + fmt(tot.total - base) + '</td></tr>' +
      (sale ? '<tr><td>' + esc((METHODS[sale.method] || sale.method).replace(/^\S+\s/, '')) + '</td><td class="r">' + fmt(sale.given) + '</td></tr>' +
        (sale.change ? '<tr><td>Cambio</td><td class="r">' + fmt(sale.change) + '</td></tr>' : '') : '') +
      '</table><hr><div class="c">' + esc(S.settings.footer) + '</div>');
  }

  function printKitchen(table, lines) {
    printHtml('<h1>COCINA · ' + esc(tableLabel(table)) + '</h1><div class="c">' + new Date().toLocaleTimeString('es-ES') + ' · ' + esc(S.user.name) + '</div><hr>' +
      '<table class="kitchen">' + lines.map(function (l) {
        return '<tr><td>' + fmtQty(l.qty) + ' x</td><td>' + esc(l.name) + (l.note ? '<br>» ' + esc(l.note) : '') + '</td></tr>';
      }).join('') + '</table>');
  }

  function printReport(title, s, when) {
    printHtml(header() + '<div class="c"><b>' + title + '</b><br>' + new Date(when).toLocaleString('es-ES') + '</div><hr><table>' +
      '<tr><td>Tickets</td><td class="r">' + s.count + '</td></tr>' +
      Object.keys(METHODS).map(function (m) {
        return '<tr><td>' + METHODS[m].replace(/^\S+\s/, '') + '</td><td class="r">' + fmt(s.byMethod[m] || 0) + '</td></tr>';
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
