// Impresoras y cajón portamonedas.
//
// Los tickets se describen como un "documento" sencillo y se envían según la
// configuración de ESTE dispositivo (localStorage, cada caja la suya):
//   - browser: HTML + window.print() (cualquier impresora instalada en el
//     sistema; el cajón solo se abre si el driver lo hace al imprimir)
//   - epos:    impresora Epson en red con ePOS-Print (TM-m30, TM-T20III/T88 con
//     interfaz de red…): XML por HTTP(S) a la IP, sin diálogo, corta papel y
//     abre el cajón
//   - serial:  impresora térmica por USB/serie con Web Serial (Chrome/Edge en
//     ordenador): comandos ESC/POS directos, corta papel y abre el cajón
//
// Documento: lista de filas
//   ['h1', texto]            título grande centrado
//   ['c', texto]             centrado        ['cb', texto]  centrado grande
//   ['t', texto]             texto           ['b', texto]   negrita
//   ['lr', izq, der]         dos columnas    ['lrb', izq, der] total grande
//   ['item', cant, nombre, [subs], importe]  línea de ticket
//   ['kitem', cant, nombre, [subs]]          línea de comanda (grande)
//   ['hr']                   separador
//   ['img', dataURL, ancho%] imagen (logo), centrada; en térmicas se convierte a blanco y negro
(function () {
  'use strict';

  var KEY = 'platet-devices';
  var DEFAULT = {
    receipt: { mode: 'browser', ip: '', https: true, width: 48 },
    kitchen: { mode: 'same', ip: '', https: true, width: 48 },
    drawerOnCash: true
  };

  function cfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* ignorar */ }
    return {
      receipt: Object.assign({}, DEFAULT.receipt, c.receipt),
      kitchen: Object.assign({}, DEFAULT.kitchen, c.kitchen),
      drawerOnCash: c.drawerOnCash == null ? DEFAULT.drawerOnCash : !!c.drawerOnCash
    };
  }
  function save(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  function target(name) {
    var c = cfg();
    if (name === 'kitchen' && c.kitchen.mode !== 'same') return c.kitchen;
    return c.receipt;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------------------------------------------------------------- HTML (navegador)

  function toHtml(doc) {
    return doc.map(function (r) {
      switch (r[0]) {
        case 'h1': return '<h1>' + esc(r[1]) + '</h1>';
        case 'c': return '<div class="c">' + esc(r[1]) + '</div>';
        case 'cb': return '<div class="c big">' + esc(r[1]) + '</div>';
        case 'b': return '<div><b>' + esc(r[1]) + '</b></div>';
        case 'lr': return '<table><tr><td>' + esc(r[1]) + '</td><td class="r">' + esc(r[2]) + '</td></tr></table>';
        case 'lrb': return '<table><tr class="big"><td>' + esc(r[1]) + '</td><td class="r">' + esc(r[2]) + '</td></tr></table>';
        case 'item': return '<table><tr><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + (r[3] || []).map(function (x) { return '<br>&nbsp;' + esc(x); }).join('') + '</td><td class="r">' + esc(r[4]) + '</td></tr></table>';
        case 'kitem': return '<table class="kitchen"><tr><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + (r[3] || []).map(function (x) { return '<br>» ' + esc(x); }).join('') + '</td></tr></table>';
        case 'hr': return '<hr>';
        case 'img': return '<div class="c"><img class="logo" src="' + esc(r[1]) + '" alt="" style="width:' + (Number(r[2]) || 50) + '%"></div>';
        default: return '<div>' + esc(r[1]) + '</div>';
      }
    }).join('');
  }

  function printBrowser(doc, t, opts) {
    var pa = document.getElementById('print-area');
    if (!pa) { pa = document.createElement('div'); pa.id = 'print-area'; document.body.appendChild(pa); }
    pa.className = (Number(t && t.width) === 32 ? 'w58' : '') + (opts && opts.big ? ' bigtext' : '');
    pa.innerHTML = toHtml(doc);
    return new Promise(function (resolve) { setTimeout(function () { window.print(); resolve(); }, 50); });
  }

  // ---------------------------------------------------------------- maquetación en columnas

  function wrap(s, w) {
    var out = [], words = String(s).split(' '), line = '';
    words.forEach(function (wd) {
      while (wd.length > w) { if (line) { out.push(line); line = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
      if (!line) line = wd;
      else if ((line + ' ' + wd).length <= w) line += ' ' + wd;
      else { out.push(line); line = wd; }
    });
    if (line || !out.length) out.push(line);
    return out;
  }
  function lr(l, r, w) {
    r = String(r);
    var room = Math.max(1, w - r.length - 1);
    var ls = wrap(l, room);
    var last = ls.pop();
    return ls.concat([last + new Array(Math.max(1, w - last.length - r.length) + 1).join(' ') + r]);
  }

  // -> [{s, a:'left'|'center', b, dw, dh}]
  function layout(doc, W) {
    var out = [];
    function push(lines, o) { lines.forEach(function (s) { out.push(Object.assign({ s: s, a: 'left', b: false, dw: false, dh: false }, o)); }); }
    doc.forEach(function (r) {
      switch (r[0]) {
        case 'h1': push(wrap(r[1], Math.floor(W / 2)), { a: 'center', b: true, dw: true, dh: true }); break;
        case 'c': push(wrap(r[1], W), { a: 'center' }); break;
        case 'cb': push(wrap(r[1], W), { a: 'center', b: true, dh: true }); break;
        case 'b': push(wrap(r[1], W), { b: true }); break;
        case 'lr': push(lr(r[1], r[2], W), {}); break;
        case 'lrb': push(lr(r[1], r[2], W), { b: true, dh: true }); break;
        case 'item':
          push(lr(r[1] + ' ' + r[2], r[4], W), {});
          (r[3] || []).forEach(function (x) { push(wrap(x, W - 3).map(function (l) { return '   ' + l; }), {}); });
          break;
        case 'kitem':
          push(wrap(r[1] + ' ' + r[2], W), { b: true, dh: true });
          (r[3] || []).forEach(function (x) { push(wrap(x, W - 4).map(function (l) { return '  > ' + l; }), { dh: true }); });
          break;
        case 'hr': push([new Array(W + 1).join('-')], {}); break;
        case 'img': if (r.raster) out.push({ img: r.raster, a: 'center' }); break;
        default: push(wrap(r[1] || '', W), {});
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- ESC/POS

  // Página de códigos PC858 (latín + €), la habitual de las térmicas Epson y compatibles
  var CP858 = {
    'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A,
    'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D, 'Ä': 0x8E, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
    'Ö': 0x99, 'Ü': 0x9A, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6, 'º': 0xA7,
    '¿': 0xA8, '¡': 0xAD, 'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, '€': 0xD5, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, '·': 0xFA
  };
  function encode(s) {
    var out = [];
    String(s).split('').forEach(function (ch) {
      var c = ch.charCodeAt(0);
      if (c < 128) out.push(c);
      else if (CP858[ch] != null) out.push(CP858[ch]);
      else {
        var plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        out.push(plain.length === 1 && plain.charCodeAt(0) < 128 ? plain.charCodeAt(0) : 0x3F);
      }
    });
    return out;
  }

  var ESC = 0x1B, GS = 0x1D;
  var DRAWER = [ESC, 0x70, 0x00, 0x19, 0xFA];             // pulso al pin 2 del cajón
  function escpos(doc, W, opts) {
    var b = [ESC, 0x40, ESC, 0x74, 19];                   // inicializar + PC858
    layout(doc, W).forEach(function (l) {
      if (l.img) {
        // GS v 0: imagen de bits (1 = negro), ancho en bytes y alto en puntos
        var bw = l.img.w / 8, h = l.img.h;
        b.push(ESC, 0x61, 1, GS, 0x76, 0x30, 0, bw & 255, bw >> 8, h & 255, h >> 8);
        for (var i = 0; i < l.img.bytes.length; i++) b.push(l.img.bytes[i]);
        b.push(0x0A);
        return;
      }
      b.push(ESC, 0x61, l.a === 'center' ? 1 : 0);
      b.push(ESC, 0x45, l.b ? 1 : 0);
      b.push(GS, 0x21, (l.dw ? 0x10 : 0) | (l.dh ? 0x01 : 0));
      b = b.concat(encode(l.s.replace(/\s+$/, '')), [0x0A]);
    });
    b.push(GS, 0x21, 0, ESC, 0x45, 0, ESC, 0x61, 0);
    b.push(ESC, 0x64, 4);                                 // avanzar 4 líneas
    b.push(GS, 0x56, 0x42, 0x00);                         // corte parcial
    if (opts && opts.drawer) b = b.concat(DRAWER);
    return new Uint8Array(b);
  }

  // ---------------------------------------------------------------- Epson ePOS-Print (red)

  function eposXml(doc, W, opts) {
    var body = '';
    if (doc) {
      body = layout(doc, W).map(function (l) {
        if (l.img) {
          return '<text align="center"/><image width="' + l.img.w + '" height="' + l.img.h + '" color="color_1" mode="mono">' + b64(l.img.bytes) + '</image><feed/>';
        }
        return '<text align="' + l.a + '" em="' + l.b + '" dw="' + l.dw + '" dh="' + l.dh + '">' + esc(l.s.replace(/\s+$/, '')) + '&#10;</text>';
      }).join('') + '<text align="left" em="false" dw="false" dh="false"/><feed line="3"/><cut type="feed"/>';
    }
    if (opts && opts.drawer) body += '<pulse drawer="drawer_1" time="pulse_100"/>';
    return '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
      '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' + body + '</epos-print></s:Body></s:Envelope>';
  }
  function sendEpos(t, xml) {
    if (!t.ip) return Promise.reject(new Error('sin IP'));
    var url = (t.https ? 'https://' : 'http://') + t.ip + '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT', SOAPAction: '""' },
      body: xml
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var m = /success="(true|false)"[^>]*code="([^"]*)"/.exec(txt) || /success="(true|false)"/.exec(txt);
      if (!m || m[1] !== 'true') throw new Error('ePOS ' + ((m && m[2]) || 'sin respuesta'));
    });
  }

  // ---------------------------------------------------------------- Web Serial (USB / serie)

  var port = null;
  function serialPort() {
    if (!('serial' in navigator)) return Promise.reject(new Error('no-serial'));
    var ready = port ? Promise.resolve(port) : navigator.serial.getPorts().then(function (ps) {
      if (!ps.length) throw new Error('no-port');
      port = ps[0];
      return port;
    });
    return ready.then(function (p) {
      if (p.writable) return p;
      return p.open({ baudRate: Number(target('receipt').baud) || 9600 }).then(function () { return p; });
    });
  }
  function sendSerial(bytes) {
    return serialPort().then(function (p) {
      var w = p.writable.getWriter();
      return w.write(bytes).then(function () { w.releaseLock(); }, function (e) { w.releaseLock(); port = null; throw e; });
    });
  }
  // Solo desde un clic del usuario (Gestión → Impresoras)
  function connectSerial() {
    if (!('serial' in navigator)) return Promise.reject(new Error('no-serial'));
    return navigator.serial.requestPort().then(function (p) { port = p; return true; });
  }

  // ---------------------------------------------------------------- imágenes para térmicas

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  // Imagen -> mapa de bits de 1 bit (difusión de error Floyd–Steinberg),
  // `dots` puntos de ancho (múltiplo de 8). Resultado en caché.
  var rasterCache = {};
  function rasterize(src, dots) {
    var key = dots + '|' + src.length + '|' + src.slice(-40);
    if (rasterCache[key]) return Promise.resolve(rasterCache[key]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = Math.max(8, dots - dots % 8);
        var h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        var px = g.getImageData(0, 0, w, h).data;
        var lum = new Float32Array(w * h);
        for (var i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        var bytes = new Uint8Array(w / 8 * h);
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var k = y * w + x, old = lum[k], nw = old < 128 ? 0 : 255, err = old - nw;
            if (nw === 0) bytes[y * w / 8 + (x >> 3)] |= 0x80 >> (x & 7);
            if (x + 1 < w) lum[k + 1] += err * 7 / 16;
            if (y + 1 < h) {
              if (x > 0) lum[k + w - 1] += err * 3 / 16;
              lum[k + w] += err * 5 / 16;
              if (x + 1 < w) lum[k + w + 1] += err / 16;
            }
          }
        }
        resolve(rasterCache[key] = { w: w, h: h, bytes: bytes });
      };
      img.onerror = function () { reject(new Error('logo')); };
      img.src = src;
    });
  }

  // 80 mm = 576 puntos, 58 mm = 384 puntos (203 ppp)
  function prepare(doc, W) {
    var dots = W <= 32 ? 384 : 576;
    return Promise.all(doc.map(function (r) {
      if (r[0] !== 'img') return r;
      var d = Math.round(dots * (Number(r[2]) || 50) / 100 / 8) * 8;
      return rasterize(r[1], d).then(function (ras) { var c = r.slice(); c.raster = ras; return c; }, function () { return ['t', '']; });
    }));
  }

  // ---------------------------------------------------------------- API

  function print(doc, which, opts) {
    var t = target(which || 'receipt');
    var W = Number(t.width) || 48;
    if (t.mode === 'epos') return prepare(doc, W).then(function (d) { return sendEpos(t, eposXml(d, W, opts)); });
    if (t.mode === 'serial') return prepare(doc, W).then(function (d) { return sendSerial(escpos(d, W, opts)); });
    return printBrowser(doc, t, opts);
  }

  function openDrawer() {
    var t = target('receipt');
    if (t.mode === 'epos') return sendEpos(t, eposXml(null, 48, { drawer: true }));
    if (t.mode === 'serial') return sendSerial(new Uint8Array(DRAWER));
    return Promise.reject(new Error('browser'));
  }

  window.Devices = {
    cfg: cfg,
    save: save,
    print: print,
    openDrawer: openDrawer,
    connectSerial: connectSerial,
    hasSerial: 'serial' in navigator,
    toHtml: toHtml,
    rasterize: rasterize,
    // para pruebas
    _layout: layout,
    _escpos: escpos,
    _prepare: prepare,
    _eposXml: eposXml
  };
})();
