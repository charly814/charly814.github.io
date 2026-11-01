// Buffet · pantalla de cocina (cocina.html): los pedidos de las tablets en
// tiempo real, por mesa y en orden de llegada. «✓ Hecho» los marca servidos.
// Puede ser también el dispositivo que imprime las comandas.
(function () {
  'use strict';
  var P = window.Platet, B = window.Buffet;
  var I = window.I18N.init('platet-lang-pos');
  var t = function (k, v) { return I.t(k, v); };
  var esc = P.esc;

  var S = { cfg: B.cfg(null), orders: {}, menu: P.DEFAULT_MENU, sessions: {}, struck: {}, sound: false, seen: null };
  var app = document.getElementById('app');
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.className = 't-toast';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3000);
  }

  // aviso sonoro de pedido nuevo (el navegador exige un toque antes de sonar)
  var ctx = null;
  function beep() {
    if (!S.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach(function (d) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.2);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.22);
      });
    } catch (e) { /* sin audio */ }
  }

  Store.on('menu', function (v) { S.menu = v || P.DEFAULT_MENU; render(); });
  Store.on('buffet/public/config', function (v) { S.cfg = B.cfg(v); render(); });
  Store.on('buffet/public/sessions', function (v) { S.sessions = v || {}; render(); });
  Store.on('buffet/orders', function (v) {
    S.orders = v || {};
    var ids = Object.keys(S.orders).filter(function (k) { return S.orders[k].status === 'new'; });
    if (S.seen && ids.some(function (k) { return !S.seen[k]; })) beep();
    S.seen = {};
    ids.forEach(function (k) { S.seen[k] = true; });
    if (B.isPrinter(false)) B.autoPrint(S.orders, S.cfg, function (e) { toast(t('dev.err', { e: e.message })); });
    render();
  });

  function nameOf(i) { var it = P.findItem(S.menu, i.pid); return it ? P.tr(it, I.lang) : i.name; }

  function render() {
    if (Store.mode === 'cloud' && !Store.hasAuth) {
      app.innerHTML = '<div class="k-setup"><h1>' + t('setup.title') + '</h1><p>' + t('setup.p1') + '</p><input id="auth-key" type="password" placeholder="' + t('setup.placeholder') + '"><button data-act="save-auth">' + t('setup.save') + '</button></div>';
      return;
    }
    var head = '<header class="k-head"><h1>🍳 ' + t('bfk.title') + '</h1><div class="k-tools">' +
      (S.sound ? '' : '<button data-act="sound">' + t('bfk.sound') + '</button>') +
      (S.cfg.kitchenPrint ? '<label><input type="checkbox" data-act="printer"' + (B.isPrinter(false) ? ' checked' : '') + '> ' + t('bf.printer') + '</label>' : '') +
      '<span class="k-lang">' + Object.keys(I.LANGS).map(function (l) {
        return '<button class="' + (I.lang === l ? 'on' : '') + '" data-act="lang" data-l="' + l + '">' + I.LANGS[l] + '</button>';
      }).join('') + '</span></div></header>';
    if (!S.cfg.kitchenScreen) { app.innerHTML = head + '<p class="k-empty">' + t('bfk.off') + '</p>'; return; }
    var all = Object.keys(S.orders).map(function (k) { return S.orders[k]; });
    var open = all.filter(function (o) { return o.status === 'new'; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
    var done = all.filter(function (o) { return o.status === 'done'; }).sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); }).slice(0, 8);
    var now = Date.now();
    app.innerHTML = head + (open.length ? '<main class="k-grid">' + open.map(function (o) {
      var mins = Math.floor((now - o.createdAt) / 60000);
      var s = S.sessions[o.table];
      return '<section class="k-card' + (mins >= 15 ? ' late' : mins >= 8 ? ' warn' : '') + '">' +
        '<div class="k-top"><b>' + esc(o.table) + '</b><span>' + t('bf.round', { n: (o.round || 0) + 1 }) + (s && s.id === o.sid ? ' · 👥 ' + ((s.adults || 0) + (s.kids || 0)) : '') + '</span><em>' + t('bfk.ago', { m: mins }) + '</em></div>' +
        '<ul>' + B.list(o.items).map(function (i, n) {
          var key = o.id + ':' + n;
          return '<li class="' + (S.struck[key] ? 'struck' : '') + '" data-act="strike" data-k="' + esc(key) + '"><b>' + i.qty + '×</b> ' + esc(nameOf(i)) + '</li>';
        }).join('') + '</ul>' +
        '<button class="k-done" data-act="done" data-id="' + esc(o.id) + '">' + t('bfk.done') + '</button></section>';
    }).join('') + '</main>' : '<p class="k-empty">' + t('bfk.none') + '</p>') +
      (done.length ? '<h2 class="k-sub">' + t('bfk.recent') + '</h2><div class="k-recent">' + done.map(function (o) {
        return '<div><b>' + esc(o.table) + '</b> ' + B.list(o.items).map(function (i) { return i.qty + '× ' + esc(nameOf(i)); }).join(', ') +
          ' <button data-act="undo" data-id="' + esc(o.id) + '">' + t('bfk.undo') + '</button></div>';
      }).join('') + '</div>' : '');
  }
  setInterval(render, 30000);   // minutos de espera

  var ACTIONS = {
    lang: function (d) { I.set(d.l); render(); },
    sound: function () { S.sound = true; beep(); render(); },
    strike: function (d) { S.struck[d.k] = !S.struck[d.k]; render(); },
    done: function (d) { Store.update('buffet/orders/' + d.id, { status: 'done', doneAt: Date.now() }); },
    undo: function (d) { Store.update('buffet/orders/' + d.id, { status: 'new', doneAt: null }); },
    'save-auth': function () {
      var k = document.getElementById('auth-key').value.trim();
      if (!k) return;
      Store.setAuth(k); location.reload();
    }
  };
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    var f = ACTIONS[el.dataset.act];
    if (f) f(el.dataset);
  });
  app.addEventListener('change', function (e) {
    if (e.target.dataset.act === 'printer') { B.setPrinter(e.target.checked); if (e.target.checked) B.autoPrint(S.orders, S.cfg); render(); }
  });
  render();
})();
