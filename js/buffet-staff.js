// Buffet · pantalla del personal (buffet.html): abrir mesas con el número de
// personas, ver el tiempo y las rondas de cada mesa y liberarlas.
// Usa el mismo inicio de sesión (PIN) y el mismo plano de mesas que el TPV.
(function () {
  'use strict';
  var P = window.Platet, B = window.Buffet;
  var I = window.I18N.init('platet-lang-pos');
  var t = function (k, v) { return I.t(k, v); };
  var esc = P.esc;

  var S = {
    user: null, users: P.DEFAULT_USERS, settings: null, cfg: B.cfg(null),
    layout: P.LAYOUT, temp: {}, sessions: {}, orders: {}, conn: 'ok', tickets: {}, sales: {}, alerted: {}
  };
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');
  var modalHandler = null;

  function openModal(draw, handler) { modalHandler = handler; draw(); modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); modalHandler = null; }
  modalBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && modalHandler) modalHandler(b.dataset.k, b);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  // Registro de acciones (el mismo de Gestión → Permisos y registro)
  function audit(action, detail, table) {
    var id = Store.newId();
    Store.set('audit/' + id, { id: id, at: Date.now(), user: S.user ? S.user.name : '', by: null, action: action, table: table || null, detail: String(detail || '').slice(0, 200) });
  }

  // ---------------------------------------------------------------- datos
  Store.on('settings', function (v) {
    S.settings = v || {};
    // modo bar: esta pantalla no se usa
    if (S.settings.mode !== 'buffet') { render(); return; }
    render();
  });
  Store.on('users', function (v) {
    S.users = v || P.DEFAULT_USERS;
    if (!S.user) {
      var name = null;
      try { name = sessionStorage.getItem('platet-session'); } catch (e) { /* ignorar */ }
      var u = name && S.users.filter(function (x) { return x.name === name; })[0];
      if (u) S.user = u;
    }
    render();
  });
  Store.on('layout', function (v) { S.layout = (v && v.length) ? v : P.LAYOUT; render(); });
  Store.on('temp', function (v) { S.temp = v || {}; render(); });
  Store.on('buffet/public/config', function (v) { S.cfg = B.cfg(v); render(); });
  Store.on('buffet/public/sessions', function (v) { S.sessions = v || {}; afterPay(); render(); });
  // el ticket del TPV de cada mesa (bebidas, extras y las líneas del buffet al cobrar)
  Store.on('tickets', function (v) { S.tickets = v || {}; afterPay(); render(); });
  Store.on('sales', function (v) { S.sales = v || {}; afterPay(); render(); });
  Store.on('buffet/orders', function (v) {
    S.orders = v || {};
    if (B.isPrinter(true)) B.autoPrint(S.orders, S.cfg, function (e) { toast(t('dev.err', { e: e.message })); });
    render();
  });
  window.addEventListener('platet-conn', function (e) { S.conn = e.detail; render(); });

  // Pedidos viejos de mesas ya liberadas: se borran pasado un día
  setTimeout(function () {
    if (!B.canWrite()) return;
    var upd = {}, old = Date.now() - 24 * 3600000;
    Object.keys(S.orders).forEach(function (k) {
      var o = S.orders[k], s = S.sessions[o.table];
      if (o.createdAt < old && !(s && s.id === o.sid)) upd['buffet/orders/' + k] = null;
    });
    if (Object.keys(upd).length) Store.update('', upd);
  }, 5000);

  function tables() {
    var out = S.layout.map(function (tb) { return tb.id; });
    Object.keys(S.temp).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    // mesas abiertas que ya no están en el plano (por si acaso)
    Object.keys(S.sessions).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function sessionOf(id) { var s = S.sessions[id]; return s && s.openedAt ? s : null; }

  // Líneas del ticket del TPV de una mesa
  function ticketLines(id) {
    var raw = (S.tickets[id] && S.tickets[id].lines) || {};
    return Object.keys(raw).map(function (k) { return Object.assign({ id: k }, raw[k]); }).filter(function (l) { return l.name != null && l.qty != null; });
  }
  // Bebidas y extras (todo lo que no son las personas del buffet)
  function extrasOf(id) {
    var ls = ticketLines(id).filter(function (l) { return l.src !== 'buffet'; });
    return { n: ls.reduce(function (a, l) { return a + l.qty; }, 0), total: P.round2(ls.reduce(function (a, l) { return a + l.qty * l.price; }, 0)) };
  }

  // Cobrada en el TPV: la mesa queda libre sola (se guarda en el historial del buffet)
  function afterPay() {
    if (!B.canWrite() || !S.user) return;
    Object.keys(S.sessions).forEach(function (id) {
      var s = sessionOf(id);
      if (!s || !s.checkoutAt || ticketLines(id).length) return;
      var sale = Object.keys(S.sales).map(function (k) { return S.sales[k]; })
        .filter(function (x) { return x.table === id && x.closedAt >= s.checkoutAt && !x.voided && x.invoiceType !== 'R'; })[0];
      if (!sale) return;
      var upd = {};
      upd['buffet/history/' + s.id] = Object.assign({}, s, { closedAt: sale.closedAt, invoice: sale.invoice || null, total: sale.total, service: B.service(S.cfg, s) });
      upd['buffet/public/sessions/' + id] = null;
      Store.update('', upd);
      audit('buffetClose', id + ' · ' + B.hmm(sale.closedAt - s.openedAt) + ' · ' + P.fmt(sale.total), id);
    });
  }

  // aviso (sonido + mensaje) cuando a una mesa le queda poco tiempo o se le acaba
  var actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.2, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
      o.start(); o.stop(actx.currentTime + 0.5);
    } catch (e) { /* sin audio */ }
  }
  function timeAlerts() {
    Object.keys(S.sessions).forEach(function (id) {
      var s = sessionOf(id);
      if (!s || s.checkoutAt) return;
      var ts = B.timeState(S.cfg, s);
      var k = ts.over ? s.id + ':over' : ts.warn ? s.id + ':warn' : null;
      if (!k || S.alerted[k]) return;
      S.alerted[k] = true;
      toast(ts.over ? t('bf.tOver', { t: id }) : t('bf.tWarn', { t: id, m: Math.ceil(ts.left / 60000) }));
      beep();
    });
  }

  // ---------------------------------------------------------------- vistas
  function langSwitch() {
    return '<span class="lang">' + Object.keys(I.LANGS).map(function (l) {
      return '<button class="' + (I.lang === l ? 'on' : '') + '" data-act="lang" data-l="' + l + '">' + I.LANGS[l] + '</button>';
    }).join('') + '</span>';
  }

  function viewSetup() {
    return '<section class="login"><h1>' + t('setup.title') + '</h1><div class="card" style="max-width:560px"><p>' + t('setup.p1') + '</p>' +
      '<div class="field"><input id="auth-key" type="password" autocomplete="off" placeholder="' + t('setup.placeholder') + '"></div>' +
      '<button class="btn primary" data-act="save-auth">' + t('setup.save') + '</button></div></section>';
  }

  function viewLogin() {
    return '<section class="login"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h1>🍣 ' + t('bf.title') + ' · ' + t('login.title') + '</h1>' + langSwitch() + '</div>' +
      '<div class="user-grid">' + S.users.map(function (u, i) {
        return '<button class="user-tile" data-act="pick-user" data-i="' + i + '">' + esc(u.name) + '</button>';
      }).join('') + '</div></section>';
  }

  function topbar() {
    var conn = Store.mode === 'local' ? t('conn.local') : S.conn === 'error' ? '<span class="bad-t">' + t('conn.err') + '</span>' : t('conn.ok');
    return '<header class="topbar"><div><small>' + esc(S.user.name) + ' · ' + conn + '</small><h1>🍣 ' + t('bf.title') + '</h1></div><div class="tb-actions">' +
      (S.cfg.kitchenPrint ? '<label class="tb-btn"><input type="checkbox" data-act="printer"' + (B.isPrinter(true) ? ' checked' : '') + '> ' + t('bf.printer') + '</label>' : '') +
      (S.cfg.kitchenScreen ? '<a class="tb-btn" href="cocina.html" target="_blank">' + t('bf.toKitchen') + '</a>' : '') +
      '<a class="tb-btn" href="pos.html?buffet=1&v=caja">💶 ' + t('tb.caja') + '</a>' +
      (S.user.admin ? '<button class="tb-btn" data-act="admin">⚙️ ' + t('tb.admin') + '</button>' : '') +
      langSwitch() + '<button class="tb-btn" data-act="logout">⎋ ' + t('tb.logout') + '</button></div></header>';
  }

  function card(id) {
    var s = sessionOf(id);
    if (!s) return '<button class="bf-table free" data-act="table" data-id="' + esc(id) + '"><b>' + esc(id) + '</b><small>' + t('bf.free') + '</small></button>';
    var now = Date.now(), r = B.round(S.cfg, s, now), lim = B.limit(S.cfg, s), used = B.used(S.orders, s.id, r.idx);
    var pend = B.ordersOf(S.orders, s.id).filter(function (o) { return o.status === 'new'; }).length;
    var ts = B.timeState(S.cfg, s, now), ex = extrasOf(id);
    var cls = s.checkoutAt ? ' paying' : ts.over ? ' over' : ts.warn ? ' warn' : '';
    return '<button class="bf-table busy' + cls + '" data-act="table" data-id="' + esc(id) + '"><b>' + esc(id) + '</b>' +
      '<span class="pp">👥 ' + (s.adults || 0) + (s.kids ? ' + ' + s.kids + ' 🧒' : '') + ' · ' + t(B.service(S.cfg, s) === 'dinner' ? 'bf.dinner' : 'bf.lunch') + '</span>' +
      '<span>⏱ ' + t('bf.time', { t: B.hmm(ts.used) }) + (ts.limited ? ' / ' + B.hmm(S.cfg.timeLimitMin * 60000) : '') + '</span>' +
      (s.checkoutAt ? '<span class="bf-state">💶 ' + t('bf.paying') + '</span>'
        : ts.over ? '<span class="bf-state">⏰ ' + t('bf.overBy', { m: Math.floor(-ts.left / 60000) }) + '</span>'
          : (ts.warn ? '<span class="bf-state">⏰ ' + t('bf.leftMin', { m: Math.ceil(ts.left / 60000) }) + '</span>' : '') +
            '<span>' + t('bf.round', { n: r.n }) + ' · ' + t('bf.usedOf', { u: used, l: lim }) + '</span>' +
            '<small>' + t('bf.next', { t: B.mmss(r.left) }) + '</small>') +
      (ex.n ? '<small>🥤 ' + ex.n + ' · ' + P.fmt(ex.total) + '</small>' : '') +
      (pend ? '<i class="bf-pend">' + t('bf.pending', { n: pend }) + '</i>' : '') + '</button>';
  }

  function viewMain() {
    if (S.settings && S.settings.mode !== 'buffet') {
      return topbar() + '<div class="page"><div class="card"><p>' + t('bf.offMode') + '</p><p><a class="btn" href="pos.html">TPV</a></p></div></div>';
    }
    var noDishes = !B.menu(S.menu, S.cfg).length;
    return topbar() + '<div class="page">' + (noDishes ? '<div class="banner"><span>' + t('bf.noDishes') + '</span></div>' : '') +
      '<div class="bf-grid">' + tables().map(card).join('') + '</div></div>';
  }

  function render() {
    if (Store.mode === 'cloud' && !Store.hasAuth) { app.innerHTML = viewSetup(); return; }
    app.innerHTML = S.user ? viewMain() : viewLogin();
  }
  // los relojes de las mesas
  setInterval(function () { if (!S.user) return; timeAlerts(); if (modal.classList.contains('hidden')) render(); }, 1000);
  Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });

  // ---------------------------------------------------------------- abrir / ver mesa
  function stepper(k, v) {
    return '<div class="bf-step"><button class="btn" data-k="' + k + ':-1">−</button><b>' + v + '</b><button class="btn" data-k="' + k + ':1">+</button></div>';
  }

  function openTable(id) {
    var st = { adults: 2, kids: 0 };
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + t('bf.open', { t: esc(id) }) + '</h2>' +
        '<div class="bf-people"><div><label>' + t('bf.adults') + '</label>' + stepper('a', st.adults) + '</div>' +
        '<div><label>' + t('bf.kids') + '</label>' + stepper('k', st.kids) + '</div></div>' +
        '<p class="muted">' + t('bf.usedOf', { u: 0, l: B.limit(S.cfg, st) }) + ' · ' + t('bf.round', { n: 1 }) + ' (' + S.cfg.roundMin + ' min)</p>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('bf.start') + '</button></div>';
    }
    openModal(draw, function (k) {
      if (k === 'X') return closeModal();
      var m = /^([ak]):(-?1)$/.exec(k);
      if (m) {
        var f = m[1] === 'a' ? 'adults' : 'kids';
        st[f] = Math.max(0, Math.min(99, st[f] + Number(m[2])));
        return draw();
      }
      if (k !== 'OK') return;
      if (!(st.adults + st.kids > 0)) return toast(t('bf.needPeople'));
      var s = { id: Store.newId(), table: id, adults: st.adults, kids: st.kids, openedAt: Date.now(), by: S.user.name };
      Store.set('buffet/public/sessions/' + id, s);
      audit('buffetOpen', id + ' · ' + st.adults + ' + ' + st.kids, id);
      closeModal();
      render();
    });
  }

  function showTable(id) {
    var s = sessionOf(id);
    var st = { adults: s.adults || 0, kids: s.kids || 0 };
    function draw() {
      var s2 = sessionOf(id);
      if (!s2) return closeModal();
      var now = Date.now(), r = B.round(S.cfg, s2, now);
      var list = B.ordersOf(S.orders, s2.id);
      var link = location.href.replace(/[^/]*$/, '') + 'buffet-mesa.html?mesa=' + encodeURIComponent(id);
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>' + t('bf.detail', { t: esc(id) }) + '</h2>' +
        '<p class="muted">' + t('bf.opened', { h: new Date(s2.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), u: esc(s2.by || '') }) + ' · ⏱ ' + B.hmm(now - s2.openedAt) + ' · ' + t('bf.round', { n: r.n }) + '</p>' +
        '<div class="bf-people"><div><label>' + t('bf.adults') + '</label>' + stepper('a', st.adults) + '</div>' +
        '<div><label>' + t('bf.kids') + '</label>' + stepper('k', st.kids) + '</div>' +
        '<div><button class="btn" data-k="save">' + t('bf.saveGuests') + '</button></div></div>' +
        (function () {
          var sv = B.service(S.cfg, s2), pr = B.price(S.cfg, Object.assign({}, s2, st)), ex = extrasOf(id), ts = B.timeState(S.cfg, s2, now);
          return (ts.limited ? '<p class="' + (ts.over ? 'bad-t' : ts.warn ? 'warn-t' : 'muted') + '">⏰ ' + (ts.over ? t('bf.overBy', { m: Math.floor(-ts.left / 60000) }) : t('bf.leftMin', { m: Math.ceil(ts.left / 60000) })) + '</p>' : '') +
            '<div class="bf-bill"><div class="seg-tabs"><button class="btn' + (sv === 'lunch' ? ' on' : '') + '" data-k="sv:lunch">☀️ ' + t('bf.lunch') + '</button>' +
            '<button class="btn' + (sv === 'dinner' ? ' on' : '') + '" data-k="sv:dinner">🌙 ' + t('bf.dinner') + '</button></div>' +
            '<table class="list">' + pr.lines.map(function (l) {
              return '<tr><td>' + l.qty + ' × ' + esc(t(l.key === 'adult' ? 'bf.adults' : 'bf.kids')) + '</td><td class="num">' + P.fmt(l.price) + '</td><td class="num">' + P.fmt(l.qty * l.price) + '</td></tr>';
            }).join('') +
            (ex.n ? '<tr><td>🥤 ' + t('bf.extras') + ' (' + ex.n + ')</td><td></td><td class="num">' + P.fmt(ex.total) + '</td></tr>' : '') +
            '<tr class="tot"><td>' + t('total') + '</td><td></td><td class="num">' + P.fmt(pr.total + ex.total) + '</td></tr></table>' +
            (st.adults !== (s2.adults || 0) || st.kids !== (s2.kids || 0) ? '<p class="warn-t">' + t('bf.unsaved') + '</p>' : '') + '</div>';
        })() +
        '<h4>' + t('bf.orders') + '</h4>' + (list.length ? '<table class="list">' + list.map(function (o) {
          return '<tr><td>' + new Date(o.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</td><td>' + t('bf.round', { n: (o.round || 0) + 1 }) + '</td>' +
            '<td>' + B.list(o.items).map(function (i) { return i.qty + '× ' + esc(i.name); }).join(', ') + '</td>' +
            '<td class="' + (o.status === 'done' ? 'ok-t' : 'warn-t') + '">' + t(o.status === 'done' ? 'bf.sDone' : 'bf.sNew') + '</td></tr>';
        }).join('') + '</table>' : '<p class="muted">' + t('bf.noOrders') + '</p>') +
        '<p style="margin-top:14px"><a class="btn" href="' + esc(link) + '" target="_blank">' + t('bf.tablet') + '</a> <small class="muted">' + esc(link) + '</small></p>' +
        '<div class="btn-row" style="flex-wrap:wrap"><button class="btn" data-k="X">' + t('close') + '</button>' +
        '<button class="btn" data-k="free">' + t('bf.close') + '</button>' +
        (s2.checkoutAt ? '<button class="btn" data-k="resume">↩ ' + t('bf.resume') + '</button>' : '') +
        '<button class="btn" data-k="drinks">🥤 ' + t('bf.addExtras') + '</button>' +
        '<button class="btn ok" data-k="pay" style="flex:1">💶 ' + t('bf.pay') + '</button></div>';
    }
    openModal(draw, function (k) {
      if (k === 'X') return closeModal();
      var m = /^([ak]):(-?1)$/.exec(k);
      if (m) {
        var f = m[1] === 'a' ? 'adults' : 'kids';
        st[f] = Math.max(0, Math.min(99, st[f] + Number(m[2])));
        return draw();
      }
      if (k === 'save') {
        if (!(st.adults + st.kids > 0)) return toast(t('bf.needPeople'));
        Store.update('buffet/public/sessions/' + id, { adults: st.adults, kids: st.kids });
        audit('buffetGuests', id + ' · ' + st.adults + ' + ' + st.kids, id);
        toast(t('adm.saved'));
        return;
      }
      if (k.indexOf('sv:') === 0) {
        Store.update('buffet/public/sessions/' + id, { service: k.slice(3) });
        S.sessions[id].service = k.slice(3);
        return draw();
      }
      if (k === 'resume') { Store.update('buffet/public/sessions/' + id, { checkoutAt: null }); return draw(); }
      if (k === 'drinks') { location.href = 'pos.html?buffet=1&mesa=' + encodeURIComponent(id); return; }
      if (k === 'pay') {
        var s4 = sessionOf(id);
        if (st.adults !== (s4.adults || 0) || st.kids !== (s4.kids || 0)) return toast(t('bf.unsaved'));
        checkout(id, s4);
        return;
      }
      if (k === 'free') {
        if (!confirm(t(ticketLines(id).length ? 'bf.closeConfirmTk' : 'bf.closeConfirm', { t: id }))) return;
        var s3 = sessionOf(id);
        Store.remove('buffet/public/sessions/' + id);
        audit('buffetClose', id + (s3 ? ' · ' + B.hmm(Date.now() - s3.openedAt) : ''), id);
        closeModal();
        toast(t('bf.closed', { t: id }));
        render();
      }
    });
  }

  // Cobrar: las personas del buffet entran como líneas en el ticket normal de la
  // mesa (junto a las bebidas) y se abre el cobro de siempre del TPV.
  function checkout(id, s) {
    var pr = B.price(S.cfg, s), now = Date.now(), upd = {};
    var cur = S.tickets[id] || {};
    ticketLines(id).forEach(function (l) { if (l.src === 'buffet') upd['tickets/' + id + '/lines/' + l.id] = null; });   // se rehacen
    pr.lines.forEach(function (l, i) {
      upd['tickets/' + id + '/lines/' + Store.newId()] = {
        name: l.name, qty: l.qty, price: l.price, base: l.price, mods: [], note: '', src: 'buffet', sent: true, free: false,
        dev: 'buffet', at: now, ord: i + 1, combo: null
      };
    });
    if (!cur.openedAt) { upd['tickets/' + id + '/openedAt'] = s.openedAt; upd['tickets/' + id + '/user'] = s.by || S.user.name; }
    if (!cur.guests) upd['tickets/' + id + '/guests'] = (s.adults || 0) + (s.kids || 0);
    upd['buffet/public/sessions/' + id + '/checkoutAt'] = now;
    upd['buffet/public/sessions/' + id + '/service'] = pr.service;
    Store.update('', upd).then(function () {
      location.href = 'pos.html?buffet=1&cobrar=1&mesa=' + encodeURIComponent(id);
    });
  }

  // ---------------------------------------------------------------- PIN
  function askPin(user) {
    var pin = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + esc(user.name) + '</h2><div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) {
          return '<button data-k="' + k + '" class="' + (k === 'OK' ? 'ok' : '') + '">' + k + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:12px"><button class="btn" data-k="X">' + t('cancel') + '</button></div>';
    }
    function tryLogin() {
      if (pin === String(user.pin)) {
        S.user = user; closeModal(); render();
        try { sessionStorage.setItem('platet-session', user.name); } catch (e) { /* ignorar */ }
      } else { pin = ''; draw(); toast(t('pin.wrong')); }
    }
    openModal(draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (k === 'OK') return tryLogin();
      else if (pin.length < 6) pin += k;
      draw();
      if (pin.length >= String(user.pin).length && pin === String(user.pin)) tryLogin();
    });
  }

  // ---------------------------------------------------------------- acciones
  var ACTIONS = {
    'pick-user': function (d) { askPin(S.users[d.i]); },
    lang: function (d) { I.set(d.l); render(); },
    'save-auth': function () {
      var k = document.getElementById('auth-key').value.trim();
      if (!k) return toast(t('setup.enterKey'));
      Store.setAuth(k); location.reload();
    },
    logout: function () {
      try { sessionStorage.removeItem('platet-session'); } catch (e) { /* ignorar */ }
      S.user = null; render();
    },
    admin: function () { location.href = 'admin.html'; },
    table: function (d) { if (sessionOf(d.id)) showTable(d.id); else openTable(d.id); }
  };
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    var f = ACTIONS[el.dataset.act];
    if (f) f(el.dataset);
  });
  app.addEventListener('change', function (e) {
    if (e.target.dataset.act === 'printer') {
      B.setPrinter(e.target.checked);
      if (e.target.checked) B.autoPrint(S.orders, S.cfg);
    }
  });

  // abrir el modal de mesa refresca su contenido cuando cambian los datos
  render();
})();
