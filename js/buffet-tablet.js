// Buffet · tablet de la mesa (buffet-mesa.html?mesa=T5): los clientes piden
// con fotos grandes, ven la cuenta atrás de la ronda y cuántos platos les quedan.
// Solo lee la configuración pública y escribe pedidos nuevos: no necesita la
// clave del TPV (igual que el pedido con QR).
(function () {
  'use strict';
  var P = window.Platet, B = window.Buffet;
  var I = window.I18N.init('platet-lang-tablet');
  var t = function (k, v) { return I.t(k, v); };
  var esc = P.esc;
  var TABLE_KEY = 'platet-buffet-mesa';

  var qs = new URLSearchParams(location.search);
  var table = String(qs.get('mesa') || '').toUpperCase().trim();
  try {
    if (table && B.tableOk(table)) localStorage.setItem(TABLE_KEY, table);
    else table = localStorage.getItem(TABLE_KEY) || '';
  } catch (e) { /* sin almacenamiento */ }
  if (!B.tableOk(table)) table = '';

  var S = { cfg: B.cfg(null), menu: P.DEFAULT_MENU, session: null, orders: {}, cart: {}, cat: null, sid: null, sending: false, unlocked: false };
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');
  var modalHandler = null;
  function openModal(draw, handler) { modalHandler = handler; draw(); modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); modalHandler = null; }
  modalBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && modalHandler) modalHandler(b.dataset.k);
  });
  var toastTimer;
  function toast(msg, ok) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.className = 't-toast' + (ok ? ' ok' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  // ---------------------------------------------------------------- que no se salgan
  // Una web no puede bloquear la tablet del todo: para eso está el «Acceso guiado»
  // del iPad o la «Fijación de pantalla» de Android (ver TPV-LEEME.md). Aquí se
  // pone a pantalla completa, se anula el botón «atrás» y el menú del dedo largo.
  function goFull() {
    var d = document.documentElement;
    if (S.unlocked || document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen().catch(function () { /* el navegador no deja: no pasa nada */ });
  }
  document.addEventListener('pointerdown', goFull, true);
  history.pushState({ bf: 1 }, '');
  window.addEventListener('popstate', function () { if (!S.unlocked) history.pushState({ bf: 1 }, ''); });
  document.addEventListener('contextmenu', function (e) { if (!S.unlocked) e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // 5 toques seguidos en el número de mesa: menú del personal (con PIN)
  var taps = [];
  function secretTap() {
    var now = Date.now();
    taps = taps.filter(function (x) { return now - x < 3000; }).concat([now]);
    if (taps.length >= 5) { taps = []; askStaffPin(); }
  }

  // ---------------------------------------------------------------- datos
  if (table) {
    Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });
    Store.on('buffet/public/config', function (v) { S.cfg = B.cfg(v); render(); });
    Store.on('buffet/public/sessions/' + table, function (v) {
      S.session = v && v.openedAt ? v : null;
      var sid = S.session ? S.session.id : null;
      if (sid !== S.sid) { S.sid = sid; S.cart = {}; }    // mesa nueva: carrito vacío
      render();
    });
    Store.on('buffet/orders', function (v) { S.orders = v || {}; render(); });
  }

  function cartCount() { return Object.keys(S.cart).reduce(function (a, k) { return a + S.cart[k]; }, 0); }
  function state() {
    var s = S.session, r = B.round(S.cfg, s), lim = B.limit(S.cfg, s), used = B.used(S.orders, s.id, r.idx);
    return { r: r, lim: lim, used: used, left: Math.max(0, lim - used - cartCount()) };
  }

  // ---------------------------------------------------------------- vistas
  function langs() {
    return '<span class="t-lang">' + Object.keys(I.LANGS).map(function (l) {
      return '<button class="' + (I.lang === l ? 'on' : '') + '" data-act="lang" data-l="' + l + '">' + I.LANGS[l] + '</button>';
    }).join('') + '</span>';
  }

  function viewSetup() {
    return '<div class="t-center"><h1>' + t('bft.setup') + '</h1><div class="t-form"><label>' + t('bft.table') + '</label>' +
      '<input id="t-table" type="text" autocapitalize="characters" placeholder="T5" value="' + esc(table) + '">' +
      '<button class="t-btn" data-act="set-table">' + t('bft.save') + '</button></div></div>';
  }

  // ¿Se puede pedir ahora? (cuenta pedida o tiempo terminado: no)
  function blocked() {
    if (!S.session) return 'wait';
    if (S.session.checkoutAt) return 'bill';
    if (S.cfg.stopAtLimit && B.timeState(S.cfg, S.session).over) return 'time';
    return null;
  }
  function timeText() {
    var ts = B.timeState(S.cfg, S.session);
    if (!ts.limited) return '';
    var txt = ts.left < 3600000 ? Math.ceil(ts.left / 60000) + ' min' : B.hmm(ts.left + 59999);
    return ts.over ? t('bft.timeOver') : (ts.warn ? '⚠️ ' : '') + t('bft.timeLeft', { t: txt });
  }
  function head(st) {
    var ts = B.timeState(S.cfg, S.session);
    return '<header class="t-head"><button class="t-table" data-act="secret">' + esc(table) + '</button>' +
      '<div class="t-round"><small>' + t('bf.round', { n: st.r.n }) + '</small><b id="t-clock">' + B.mmss(Math.min(st.r.left, ts.left)) + '</b>' +
      (ts.limited ? '<small id="t-total" class="' + (ts.warn || ts.over ? 'warn' : '') + '">' + timeText() + '</small>' : '') + '</div>' +
      '<div id="t-left" class="t-left' + (st.left ? '' : ' full') + '">' + leftText(st) + '</div>' +
      '<button class="t-mine" data-act="mine">🧾 ' + t('bft.mine') + '</button>' + langs() + '</header>';
  }
  function leftText(st) {
    return st.left ? t('bft.left', { n: '<b>' + st.left + '</b>' }) : t('bft.full', { t: B.mmss(st.r.left) });
  }

  function viewMenu() {
    var st = state();
    var cats = B.menu(S.menu, S.cfg);
    if (!cats.length) return head(st) + '<div class="t-center"><p>' + t('bf.noDishes') + '</p></div>';
    if (!S.cat || !cats.some(function (c) { return c.id === S.cat; })) S.cat = cats[0].id;
    var cat = cats.filter(function (c) { return c.id === S.cat; })[0];
    var n = cartCount();
    return head(st) +
      '<nav class="t-cats">' + cats.map(function (c) {
        return '<button class="' + (c.id === S.cat ? 'on' : '') + '" data-act="cat" data-id="' + esc(c.id) + '">' + esc(c.icon || '') + ' ' + esc(P.tr(c, I.lang)) + '</button>';
      }).join('') + '</nav>' +
      '<main class="t-grid">' + cat.items.map(function (it) {
        var q = S.cart[it.id] || 0;
        var img = it.img ? Store.imageURL('p-' + it.id, it.img, render) : '';
        var desc = P.trDesc(it, I.lang);
        return '<div class="t-card' + (q ? ' picked' : '') + '">' +
          '<button class="t-pic" data-act="plus" data-id="' + esc(it.id) + '"' + (st.left ? '' : ' disabled') + '>' + (img ? '<img src="' + img + '" alt="">' : '<span>' + esc(cat.icon || '🍽️') + '</span>') +
          (q ? '<i class="t-q">' + q + '</i>' : '') + '</button>' +
          '<div class="t-name"><b>' + esc(P.tr(it, I.lang)) + '</b>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</div>' +
          '<div class="t-step"><button data-act="minus" data-id="' + esc(it.id) + '"' + (q ? '' : ' disabled') + '>−</button><b>' + q + '</b>' +
          '<button class="add" data-act="plus" data-id="' + esc(it.id) + '"' + (st.left ? '' : ' disabled') + '>+</button></div></div>';
      }).join('') + '</main>' +
      '<footer class="t-bar"><button class="t-send" data-act="send"' + (n && !S.sending ? '' : ' disabled') + '>' + t('bft.send') + (n ? ' · ' + n : '') + '</button></footer>';
  }

  function viewWait(why) {
    var icon = why === 'bill' ? '🧾' : why === 'time' ? '⏰' : '🍣';
    var title = why === 'bill' ? t('bft.billTitle') : why === 'time' ? t('bft.timeOver') : t('bft.welcome');
    var text = why === 'bill' ? t('bft.billText') : why === 'time' ? t('bft.timeText') : t(S.cfg.on ? 'bft.wait' : 'bft.off');
    return '<header class="t-head"><button class="t-table" data-act="secret">' + esc(table) + '</button><div style="flex:1"></div>' +
      (S.session ? '<button class="t-mine" data-act="mine">🧾 ' + t('bft.mine') + '</button>' : '') + langs() + '</header>' +
      '<div class="t-center"><p style="font-size:80px;margin:0">' + icon + '</p><h1>' + title + '</h1><p>' + text + '</p></div>';
  }

  function render() {
    if (!table) { app.innerHTML = viewSetup(); return; }
    var y = window.scrollY;
    var why = S.cfg.on ? blocked() : 'wait';
    app.innerHTML = why ? viewWait(why) : viewMenu();
    window.scrollTo(0, y);
  }
  // reloj: solo se actualiza la cabecera (sin repintar las fotos)
  var lastRound = null;
  setInterval(function () {
    if (!S.session || !S.cfg.on) return;
    var st = state(), ts = B.timeState(S.cfg, S.session);
    var key = st.r.idx + '|' + blocked() + '|' + ts.warn;
    if (key !== lastRound) { lastRound = key; return render(); }    // ronda nueva, aviso o fin del tiempo
    var c = document.getElementById('t-clock'), l = document.getElementById('t-left'), tt = document.getElementById('t-total');
    if (c) c.textContent = B.mmss(Math.min(st.r.left, ts.left));
    if (tt) tt.textContent = timeText();
    if (l && !st.left) l.innerHTML = leftText(st);
  }, 1000);

  // ---------------------------------------------------------------- pedir
  function send() {
    var n = cartCount();
    if (!n || S.sending || !S.session || blocked()) return;
    var st = state(), room = st.lim - st.used;
    if (n > room) return toast(t('bft.over', { n: Math.max(0, room) }));
    var items = [];
    B.menu(S.menu, S.cfg).forEach(function (c) {
      c.items.forEach(function (it) { if (S.cart[it.id]) items.push({ pid: it.id, name: it.name, qty: S.cart[it.id] }); });
    });
    if (!items.length) { S.cart = {}; return render(); }
    var id = Store.newId();
    var order = { id: id, table: table, sid: S.session.id, round: st.r.idx, items: items, status: 'new', createdAt: Date.now() };
    S.sending = true; render();
    Store.set('buffet/orders/' + id, order, { wait: 12000 }).then(function () {
      S.sending = false; S.cart = {};
      toast(t('bft.sent'), true);
      render();
    }).catch(function () {
      S.sending = false; render();
      toast(t('bft.err'));
    });
  }

  function showMine() {
    var list = S.session ? B.ordersOf(S.orders, S.session.id).slice().reverse() : [];
    openModal(function () {
      modalBox.innerHTML = '<h2>🧾 ' + t('bft.mine') + '</h2>' + (list.length ? list.map(function (o) {
        var it = B.list(o.items).map(function (i) { var x = P.findItem(S.menu, i.pid); return i.qty + '× ' + esc(x ? P.tr(x, I.lang) : i.name); }).join(', ');
        return '<div class="t-ord"><div><small>' + t('bf.round', { n: (o.round || 0) + 1 }) + ' · ' + new Date(o.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</small><p>' + it + '</p></div>' +
          '<b class="' + (o.status === 'done' ? 'ok' : 'wait') + '">' + t(o.status === 'done' ? 'bf.sDone' : 'bf.sNew') + '</b></div>';
      }).join('') : '<p>' + t('bf.noOrders') + '</p>') + '<button class="t-btn" data-k="X">' + t('bft.back') + '</button>';
    }, function (k) { if (k === 'X') closeModal(); });
  }

  // Menú del personal: PIN de la tablet (Gestión → Buffet)
  function askStaffPin() {
    var pin = '';
    function draw() {
      modalBox.innerHTML = '<h2>' + t('bft.pin') + '</h2><div class="t-dots">' + pin.split('').map(function () { return '●'; }).join('') + '&nbsp;</div>' +
        '<div class="t-keys">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) { return '<button data-k="' + k + '">' + k + '</button>'; }).join('') + '</div>' +
        '<button class="t-btn ghost" data-k="X">' + t('bft.back') + '</button>';
    }
    openModal(draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === '⌫') { pin = pin.slice(0, -1); return draw(); }
      if (k !== 'OK') { if (pin.length < 6) pin += k; return draw(); }
      if (pin !== String(S.cfg.tabletPin)) { pin = ''; draw(); return toast(t('bft.pinWrong')); }
      staffMenu();
    });
  }
  function staffMenu() {
    openModal(function () {
      modalBox.innerHTML = '<h2>⚙️ ' + esc(table) + '</h2>' +
        '<button class="t-btn" data-k="table">' + t('bft.changeTable') + '</button>' +
        '<button class="t-btn ghost" data-k="exit">' + t('bft.exit') + '</button>' +
        '<button class="t-btn ghost" data-k="X">' + t('bft.back') + '</button>';
    }, function (k) {
      if (k === 'X') return closeModal();
      if (k === 'table') {
        try { localStorage.removeItem(TABLE_KEY); } catch (e) { /* ignorar */ }
        S.unlocked = true;
        location.replace('buffet-mesa.html');
      }
      if (k === 'exit') {
        S.unlocked = true;
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { /* ignorar */ });
        closeModal();
        toast('🔓');
      }
    });
  }

  // ---------------------------------------------------------------- acciones
  var ACTIONS = {
    lang: function (d) { I.set(d.l); render(); },
    cat: function (d) { S.cat = d.id; render(); window.scrollTo(0, 0); },
    plus: function (d) {
      if (!S.session || blocked()) return;
      if (state().left <= 0) return toast(t('bft.full', { t: B.mmss(state().r.left) }));
      S.cart[d.id] = (S.cart[d.id] || 0) + 1; render();
    },
    minus: function (d) {
      if (!S.cart[d.id]) return;
      S.cart[d.id]--; if (!S.cart[d.id]) delete S.cart[d.id];
      render();
    },
    send: send,
    mine: showMine,
    secret: secretTap,
    'set-table': function () {
      var v = String(document.getElementById('t-table').value || '').toUpperCase().trim();
      if (!B.tableOk(v)) return toast(t('bft.table'));
      location.replace('buffet-mesa.html?mesa=' + encodeURIComponent(v));
    }
  };
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var f = ACTIONS[el.dataset.act];
    if (f) f(el.dataset);
  });

  render();
})();
