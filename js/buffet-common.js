// Modo buffet: lógica común de las tres pantallas (personal, tablet de la mesa
// y cocina). No toca nada del modo bar/restaurante: sus datos van todos bajo
// "buffet/" y solo LEE la carta (menu), las imágenes y el plano de mesas.
//
//   buffet/public/config          ajustes (lo lee también la tablet, sin clave)
//   buffet/public/sessions/<mesa> mesa abierta: { id, table, adults, kids, openedAt, by }
//   buffet/orders/<id>            pedido de una tablet: { id, table, sid, round, items:[{pid,name,qty}],
//                                 status:'new'|'done', createdAt, doneAt, printedAt, printedBy }
(function () {
  'use strict';
  var P = window.Platet;

  var DEFAULT_CFG = {
    on: false,            // modo buffet activo (copia de settings.mode para la tablet)
    roundMin: 10,         // minutos de cada ronda
    perAdult: 5,          // platos por adulto y ronda
    perKid: 5,            // platos por niño y ronda (0 = los niños no cuentan)
    cats: [],             // categorías enteras que entran en el buffet
    items: [],            // y/o productos sueltos
    kitchenScreen: true,  // pantalla de cocina (cocina.html)
    kitchenPrint: true,   // imprimir los pedidos en la impresora de cocina
    tabletPin: '1234',    // PIN para salir de la tablet o cambiarle la mesa
    // precios por persona (el IVA, el de Negocio y ticket)
    lunchAdult: 12.9, lunchKid: 7.9, dinnerAdult: 15.9, dinnerKid: 8.9,
    dinnerFrom: '16:00',  // a partir de esta hora (al abrir la mesa) es precio de cena
    weekendDinner: true,  // sábados y domingos, todo el día precio de cena
    timeLimitMin: 120,    // tiempo total en la mesa (0 = sin límite)
    warnMin: 10,          // aviso cuando quedan estos minutos
    stopAtLimit: true     // al acabar el tiempo, la tablet deja de pedir
  };
  var PRICE_KEYS = ['lunchAdult', 'lunchKid', 'dinnerAdult', 'dinnerKid'];

  function cfg(v) {
    var c = Object.assign({}, DEFAULT_CFG, v || {});
    c.cats = list(c.cats); c.items = list(c.items);
    ['roundMin', 'perAdult', 'perKid', 'timeLimitMin', 'warnMin'].forEach(function (k) { c[k] = Math.max(0, Number(c[k]) || 0); });
    if (!c.roundMin) c.roundMin = DEFAULT_CFG.roundMin;
    PRICE_KEYS.forEach(function (k) { c[k] = P.round2(Math.max(0, Number(c[k]) || 0)); });
    if (!/^\d{1,2}:\d{2}$/.test(String(c.dinnerFrom))) c.dinnerFrom = DEFAULT_CFG.dinnerFrom;
    return c;
  }

  // ¿Comida o cena? La elige el camarero (s.service) o sale de la hora a la que se abrió la mesa.
  function service(c, s) {
    if (s && (s.service === 'lunch' || s.service === 'dinner')) return s.service;
    var d = new Date((s && s.openedAt) || Date.now());
    if (c.weekendDinner && (d.getDay() === 0 || d.getDay() === 6)) return 'dinner';
    var hm = String(c.dinnerFrom).split(':');
    return d.getHours() * 60 + d.getMinutes() >= Number(hm[0]) * 60 + Number(hm[1]) ? 'dinner' : 'lunch';
  }
  // Lo que se cobra por las personas: líneas para el ticket del TPV
  var SERVICE_ES = { lunch: 'comida', dinner: 'cena' };
  function price(c, s) {
    var sv = service(c, s), a = c[sv + 'Adult'], k = c[sv + 'Kid'];
    var lines = [];
    if (s.adults) lines.push({ key: 'adult', name: 'Buffet ' + SERVICE_ES[sv] + ' adulto', qty: s.adults, price: a });
    if (s.kids) lines.push({ key: 'kid', name: 'Buffet ' + SERVICE_ES[sv] + ' niño', qty: s.kids, price: k });
    return { service: sv, adult: a, kid: k, lines: lines, total: P.round2(lines.reduce(function (x, l) { return x + l.qty * l.price; }, 0)) };
  }

  // Tiempo total en la mesa
  function timeState(c, s, now) {
    now = now || Date.now();
    var used = now - s.openedAt;
    if (!c.timeLimitMin) return { limited: false, used: used, left: Infinity, warn: false, over: false };
    var left = c.timeLimitMin * 60000 - used;
    return { limited: true, used: used, left: left, warn: left > 0 && left <= c.warnMin * 60000, over: left <= 0, endsAt: s.openedAt + c.timeLimitMin * 60000 };
  }
  function list(v) { return !v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.keys(v).map(function (k) { return v[k]; }); }

  // Platos por ronda para la mesa
  function limit(c, s) { return s ? (s.adults || 0) * c.perAdult + (s.kids || 0) * c.perKid : 0; }

  // Ronda actual: la 1 empieza al abrir la mesa
  function round(c, s, now) {
    now = now || Date.now();
    var len = c.roundMin * 60000;
    var idx = Math.max(0, Math.floor((now - s.openedAt) / len));
    var ends = s.openedAt + (idx + 1) * len;
    return { idx: idx, n: idx + 1, endsAt: ends, left: Math.max(0, ends - now) };
  }

  function ordersOf(orders, sid) {
    return Object.keys(orders || {}).map(function (k) { return orders[k]; })
      .filter(function (o) { return o && o.sid === sid; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
  }
  function qtyOf(o) { return list(o.items).reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0); }
  // Platos ya pedidos en una ronda
  function used(orders, sid, idx) {
    return ordersOf(orders, sid).filter(function (o) { return o.round === idx; }).reduce(function (a, o) { return a + qtyOf(o); }, 0);
  }

  // Carta del buffet: categorías con los productos elegidos y disponibles
  function inBuffet(c, catId, it) { return c.cats.indexOf(catId) >= 0 || c.items.indexOf(it.id) >= 0; }
  function menu(fullMenu, c) {
    return (fullMenu || []).map(function (cat) {
      return Object.assign({}, cat, { items: (cat.items || []).filter(function (it) { return it.available !== false && !(it.combo && it.combo.courses) && inBuffet(c, cat.id, it); }) });
    }).filter(function (cat) { return cat.items.length; });
  }

  function mmss(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function hmm(ms) {
    var m = Math.max(0, Math.floor(ms / 60000));
    return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  }

  // ---------------------------------------------------------------- impresión en cocina
  // Solo imprime el dispositivo marcado como «impresora de cocina» (ajuste local).
  // Para no imprimir dos veces, primero se apunta el pedido y luego se comprueba.
  var PRINT_KEY = 'platet-buffet-printer';
  function isPrinter(def) {
    try { var v = localStorage.getItem(PRINT_KEY); return v == null ? !!def : v === '1'; } catch (e) { return !!def; }
  }
  function setPrinter(on) { try { localStorage.setItem(PRINT_KEY, on ? '1' : '0'); } catch (e) { /* ignorar */ } }
  var DEV = (function () {
    try {
      var d = localStorage.getItem('platet-device');
      if (!d) { d = Math.random().toString(36).slice(2, 8); localStorage.setItem('platet-device', d); }
      return d;
    } catch (e) { return 'x'; }
  })();
  var since = Date.now() - 30 * 60000;   // al arrancar, no reimprime lo antiguo
  var claimed = {};
  function orderDoc(o) {
    var t = new Date(o.createdAt);
    var doc = [['h1', 'BUFFET · ' + o.table], ['cb', 'Ronda ' + ((o.round || 0) + 1)], ['c', String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0')], ['hr']];
    list(o.items).forEach(function (i) { doc.push(['kitem', i.qty + ' x', i.name, []]); });
    return doc;
  }
  function autoPrint(orders, c, onErr) {
    if (!c.on || !c.kitchenPrint || !window.Devices) return;
    Object.keys(orders || {}).forEach(function (k) {
      var o = orders[k];
      if (!o || o.printedAt || o.status !== 'new' || o.createdAt < since || claimed[o.id]) return;
      claimed[o.id] = true;
      var upd = {};
      upd['buffet/orders/' + o.id + '/printedAt'] = Date.now();
      upd['buffet/orders/' + o.id + '/printedBy'] = DEV;
      Store.update('', upd).then(function () {
        return Store.get('buffet/orders/' + o.id + '/printedBy');
      }).then(function (by) {
        if (by !== DEV) return;
        return Devices.print(orderDoc(o), 'kitchen');
      }).catch(function (e) { if (onErr) onErr(e); });
    });
  }

  window.Buffet = {
    DEFAULT_CFG: DEFAULT_CFG, cfg: cfg, list: list, limit: limit, round: round,
    ordersOf: ordersOf, qtyOf: qtyOf, used: used, menu: menu, inBuffet: inBuffet,
    mmss: mmss, hmm: hmm, service: service, price: price, timeState: timeState, PRICE_KEYS: PRICE_KEYS, isPrinter: isPrinter, setPrinter: setPrinter, autoPrint: autoPrint, orderDoc: orderDoc, DEV: DEV,
    // ¿Está este dispositivo autorizado a escribir? (en local siempre)
    canWrite: function () { return Store.mode === 'local' || Store.hasAuth; },
    tableOk: function (id) { return P.TABLE_ID_RE.test(String(id || '')); }
  };
})();
