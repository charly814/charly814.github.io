// Producto «visual»: el cliente ve cómo se monta su plato capa a capa.
// Cada ingrediente es una capa dibujada en SVG (no hacen falta fotos). Al
// añadir un extra, la tapa se levanta y el ingrediente cae en su sitio; al
// quitarlo, sale deslizándose. El montaje se puede girar con el dedo.
//
//   var v = PlatetVisual.mount(el, 'burger', { lang: 'zh' });
//   v.set({ s1: true, e2: true })   // mismos id que los modificadores (sin/extra)
//   v.explode(true)                 // separa las capas y pone el nombre
(function () {
  'use strict';

  var CX = 150;
  // ---------------------------------------------------------------- dibujo
  function disk(R, T, side, top, extra) {
    var ry = Math.round(R * 0.26), cy = ry + 1, h = 2 * ry + T + 2;
    return {
      h: h, lift: T,
      svg: '<path d="M' + (CX - R) + ' ' + cy + ' L' + (CX - R) + ' ' + (cy + T) + ' A' + R + ' ' + ry + ' 0 0 0 ' + (CX + R) + ' ' + (cy + T) +
        ' L' + (CX + R) + ' ' + cy + ' Z" fill="' + side + '"/>' +
        '<ellipse cx="' + CX + '" cy="' + cy + '" rx="' + R + '" ry="' + ry + '" fill="' + top + '"/>' + (extra ? extra(cy, ry, R, T) : '')
    };
  }
  function wave(R, ry, cy, amp, n, ph) {
    var d = '';
    for (var i = 0; i <= 96; i++) {
      var a = i / 96 * Math.PI * 2, r = R + amp * Math.sin(n * a + (ph || 0));
      d += (i ? 'L' : 'M') + (CX + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a) * ry / R).toFixed(1);
    }
    return d + 'Z';
  }
  var G = '<defs>' +
    '<linearGradient id="pv-bun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a54b"/><stop offset="1" stop-color="#b8692a"/></linearGradient>' +
    '<radialGradient id="pv-dome" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#f6c06a"/><stop offset=".55" stop-color="#d98a35"/><stop offset="1" stop-color="#a45a20"/></radialGradient>' +
    '<linearGradient id="pv-meat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e3b1c"/><stop offset="1" stop-color="#3f1f0d"/></linearGradient>' +
    '<radialGradient id="pv-yolk" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffd54a"/><stop offset="1" stop-color="#f29b05"/></radialGradient>' +
    '</defs>';

  var LAYERS = {
    bunB: function () { return disk(118, 26, 'url(#pv-bun)', '#f3d9a4'); },
    patty: function () {
      return disk(126, 24, 'url(#pv-meat)', '#7a4321', function (cy, ry, R, T) {
        var s = '';
        for (var i = 0; i < 14; i++) s += '<circle cx="' + (CX - R + 10 + i * 17.5) + '" cy="' + (cy + T * 0.55 + Math.sin(i * 1.7) * 3) + '" r="2" fill="#2a1306" opacity=".6"/>';
        for (var j = 0; j < 9; j++) s += '<circle cx="' + (CX - 80 + (j * 41) % 160) + '" cy="' + (cy - 14 + (j * 13) % 28) + '" r="2.4" fill="#4d250e" opacity=".7"/>';
        return s;
      });
    },
    cheese: function () {
      var ry = 32, cy = ry + 2;
      var drip = function (x, len, w) { return 'M' + (x - w) + ' ' + (cy + 18) + ' Q' + (x - w) + ' ' + (cy + 18 + len) + ' ' + x + ' ' + (cy + 18 + len) + ' Q' + (x + w) + ' ' + (cy + 18 + len) + ' ' + (x + w) + ' ' + (cy + 18) + 'Z'; };
      return {
        h: cy + ry + 30, lift: 5, below: 20,
        svg: '<path d="M' + (CX - 142) + ' ' + (cy + 4) + ' L' + CX + ' ' + (cy - ry) + ' L' + (CX + 142) + ' ' + (cy + 4) + ' L' + CX + ' ' + (cy + ry + 6) + 'Z" fill="#f2b622"/>' +
          '<path d="M' + (CX - 142) + ' ' + (cy + 4) + ' L' + CX + ' ' + (cy + ry + 6) + ' L' + (CX + 142) + ' ' + (cy + 4) + ' L' + (CX + 142) + ' ' + (cy + 10) + ' L' + CX + ' ' + (cy + ry + 12) + ' L' + (CX - 142) + ' ' + (cy + 10) + 'Z" fill="#d9960f"/>' +
          '<path d="' + drip(CX - 60, 16, 9) + drip(CX + 20, 24, 10) + drip(CX + 85, 12, 8) + '" fill="#f2b622"/>' +
          '<path d="M' + (CX - 120) + ' ' + (cy + 2) + ' L' + CX + ' ' + (cy - ry + 4) + '" stroke="#ffd866" stroke-width="3" opacity=".7"/>'
      };
    },
    lettuce: function () {
      var R = 134, ry = 35, cy = ry + 9;
      return {
        h: cy + ry + 12, lift: 7, below: 6,
        svg: '<path d="' + wave(R, ry, cy + 6, 8, 14) + '" fill="#3f9a2b"/>' +
          '<path d="' + wave(R - 4, ry, cy, 8, 14, 0.6) + '" fill="#68c443"/>' +
          '<path d="' + wave(R - 30, ry - 8, cy - 2, 5, 11, 1.2) + '" fill="#8bd862" opacity=".8"/>' +
          '<path d="M' + (CX - 90) + ' ' + cy + ' Q' + CX + ' ' + (cy - 14) + ' ' + (CX + 90) + ' ' + cy + '" stroke="#c6f0a8" stroke-width="2" fill="none" opacity=".8"/>'
      };
    },
    tomato: function () {
      var one = function (x) {
        var R = 60, ry = 16, cy = ry + 1, T = 9, s = '';
        s += '<path d="M' + (x - R) + ' ' + cy + ' L' + (x - R) + ' ' + (cy + T) + ' A' + R + ' ' + ry + ' 0 0 0 ' + (x + R) + ' ' + (cy + T) + ' L' + (x + R) + ' ' + cy + 'Z" fill="#b3221a"/>';
        s += '<ellipse cx="' + x + '" cy="' + cy + '" rx="' + R + '" ry="' + ry + '" fill="#e5412f"/>';
        s += '<ellipse cx="' + x + '" cy="' + cy + '" rx="' + (R - 8) + '" ry="' + (ry - 3) + '" fill="#f26a4f"/>';
        for (var i = 0; i < 6; i++) {
          var a = i / 6 * Math.PI * 2;
          s += '<ellipse cx="' + (x + Math.cos(a) * 30).toFixed(1) + '" cy="' + (cy + Math.sin(a) * 8).toFixed(1) + '" rx="6" ry="2.4" fill="#ffd6a3"/>';
        }
        return s + '<ellipse cx="' + x + '" cy="' + cy + '" rx="8" ry="3" fill="#ffb59c"/>';
      };
      return { h: 44, lift: 9, svg: one(CX - 58) + one(CX + 58) };
    },
    onion: function () {
      var s = '', rings = [[CX - 70, 14, 46], [CX + 10, 12, 42], [CX + 78, 16, 40], [CX - 20, 22, 30]];
      rings.forEach(function (r) {
        s += '<ellipse cx="' + r[0] + '" cy="' + r[1] + '" rx="' + r[2] + '" ry="' + (r[2] * 0.26).toFixed(1) + '" fill="none" stroke="#8e3d91" stroke-width="7"/>';
        s += '<ellipse cx="' + r[0] + '" cy="' + (r[1] - 1) + '" rx="' + r[2] + '" ry="' + (r[2] * 0.26).toFixed(1) + '" fill="none" stroke="#f3e3f5" stroke-width="3"/>';
      });
      return { h: 36, lift: 4, svg: s };
    },
    bacon: function () {
      var strip = function (y, ph) {
        var top = '', bot = '';
        for (var i = 0; i <= 20; i++) {
          var x = CX - 140 + i * 14, w = Math.sin(i * 0.9 + ph) * 6;
          top += (i ? 'L' : 'M') + x + ' ' + (y + w);
          bot = 'L' + x + ' ' + (y + w + 14) + bot;
        }
        return '<path d="' + top + bot + 'Z" fill="#a8371f"/><path d="' + top.replace(/M|L/g, function (m) { return m; }) + '" stroke="#f1b59a" stroke-width="3.5" fill="none" transform="translate(0,6)"/>';
      };
      return { h: 48, lift: 8, svg: strip(10, 0) + strip(26, 1.6) };
    },
    egg: function () {
      return {
        h: 50, lift: 8,
        svg: '<path d="M' + (CX - 120) + ' 26 C' + (CX - 130) + ' 4 ' + (CX - 40) + ' -2 ' + (CX + 10) + ' 6 C' + (CX + 70) + ' -4 ' + (CX + 136) + ' 8 ' + (CX + 118) + ' 28 C' + (CX + 104) + ' 46 ' + (CX - 20) + ' 48 ' + (CX - 70) + ' 42 C' + (CX - 110) + ' 40 ' + (CX - 112) + ' 34 ' + (CX - 120) + ' 26Z" fill="#fffaf0" stroke="#efe4cc" stroke-width="2"/>' +
          '<ellipse cx="' + (CX + 6) + '" cy="22" rx="34" ry="13" fill="url(#pv-yolk)"/><ellipse cx="' + (CX - 6) + '" cy="17" rx="10" ry="3.5" fill="#fff3b0" opacity=".9"/>'
      };
    },
    bunT: function () {
      var R = 122, y = 100, s = '';
      var seeds = [[-70, 62], [-40, 40], [-8, 30], [28, 36], [62, 50], [88, 70], [-92, 80], [-30, 66], [10, 58], [48, 74], [-58, 86], [78, 92], [0, 84], [-100, 96]];
      seeds.forEach(function (p, i) {
        s += '<ellipse cx="' + (CX + p[0]) + '" cy="' + p[1] + '" rx="5" ry="2.6" fill="#fff4d6" transform="rotate(' + ((i * 37) % 70 - 35) + ' ' + (CX + p[0]) + ' ' + p[1] + ')"/>';
      });
      return {
        h: y + 30, lift: 0, below: 6,
        svg: '<path d="M' + (CX - R) + ' ' + y + ' C' + (CX - R) + ' ' + (y - 118) + ' ' + (CX + R) + ' ' + (y - 118) + ' ' + (CX + R) + ' ' + y +
          ' A' + R + ' 28 0 0 1 ' + (CX - R) + ' ' + y + 'Z" fill="url(#pv-dome)"/>' + s +
          '<path d="M' + (CX - 70) + ' 40 Q' + (CX - 40) + ' 20 ' + (CX) + ' 18" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".25"/>'
      };
    }
  };

  // ---------------------------------------------------------------- recetas
  // order: de abajo a arriba. show(sel) decide si la capa está.
  var NAMES = {
    bunB: ['Pan', 'Bun', '面包底'], bunT: ['Pan', 'Bun', '面包盖'], patty: ['Carne', 'Beef', '牛肉饼'], patty2: ['Doble carne', 'Double meat', '双份肉'],
    cheese: ['Queso', 'Cheese', '芝士'], cheese2: ['Queso', 'Cheese', '芝士'], lettuce: ['Lechuga', 'Lettuce', '生菜'],
    tomato: ['Tomate', 'Tomato', '番茄'], onion: ['Cebolla', 'Onion', '洋葱'], bacon: ['Bacon', 'Bacon', '培根'], egg: ['Huevo', 'Egg', '煎蛋']
  };
  var RECIPES = {
    burger: {
      order: ['bunB', 'lettuce', 'tomato', 'patty', 'patty2', 'cheese', 'cheese2', 'bacon', 'egg', 'onion', 'bunT'],
      draw: { patty2: 'patty', cheese2: 'cheese' },
      // ids de los modificadores por defecto (P.DEFAULT_MODS): s1 cebolla, s2 tomate, s3 lechuga, s4 queso,
      // e1 queso, e2 bacon, e3 huevo, e7 doble carne
      show: {
        lettuce: function (s) { return !s.s3; }, tomato: function (s) { return !s.s2; }, cheese: function (s) { return !s.s4; },
        onion: function (s) { return !s.s1; }, patty2: function (s) { return !!s.e7; }, cheese2: function (s) { return !!s.e1; },
        bacon: function (s) { return !!s.e2; }, egg: function (s) { return !!s.e3; }
      },
      extras: ['patty2', 'cheese2', 'bacon', 'egg'],
      lid: 'bunT'
    }
  };

  var css = false;
  function addCss() {
    if (css) return; css = true;
    var st = document.createElement('style');
    st.textContent =
      '.pv{position:relative;width:300px;height:360px;max-width:100%;margin:0 auto;perspective:900px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}' +
      '.pv-plate{position:absolute;left:10px;width:280px;bottom:6px;height:56px;border-radius:50%;background:radial-gradient(ellipse at center,#fff 0 52%,#e8ecf2 53% 62%,#fff 63% 70%,rgba(0,0,0,.12) 71%,transparent 74%)}' +
      '.pv-stack{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.2,1)}' +
      '.pv-l{position:absolute;left:calc(50% - 150px);width:300px;transition:bottom .45s cubic-bezier(.3,1.4,.5,1),opacity .3s;will-change:bottom,transform}' +
      '.pv-l svg{display:block;width:300px;overflow:visible;filter:drop-shadow(0 5px 3px rgba(0,0,0,.28))}' +
      '.pv-l.drop{animation:pv-drop .7s cubic-bezier(.3,0,.4,1) both}' +
      '@keyframes pv-drop{0%{transform:translateY(-320px) rotate(-8deg);opacity:0}15%{opacity:1}62%{transform:translateY(0) rotate(0)}76%{transform:translateY(-16px) scaleY(1.04)}88%{transform:translateY(0) scaleY(.94)}100%{transform:none}}' +
      '.pv-l.out{transition:transform .45s ease-in,opacity .45s ease-in;transform:translateX(130%) rotate(28deg);opacity:0}' +
      '.pv-l.out.left{transform:translateX(-130%) rotate(-28deg)}' +
      '.pv-l.hit svg{animation:pv-hit .6s ease-out}' +
      '@keyframes pv-hit{0%{transform:scaleY(.8);filter:drop-shadow(0 0 10px #fde047) brightness(1.35)}55%{transform:scaleY(1.06)}100%{transform:none}}' +
      '.pv-tag{position:absolute;right:0;bottom:50%;transform:translate(10px,50%);font:600 13px/1.2 system-ui,sans-serif;color:#334155;background:#fff;border-radius:999px;padding:3px 9px;box-shadow:0 2px 6px rgba(0,0,0,.15);white-space:nowrap;opacity:0;transition:opacity .3s;pointer-events:none}' +
      '.pv.exploded .pv-tag{opacity:1}' +
      '.pv-l.extra .pv-tag{opacity:1;background:#16a34a;color:#fff;font-size:12px;padding:2px 8px}' +
      '.pv-tag.tl{right:auto;left:0;transform:translate(-10px,50%)}' +
      '.pv.exploded .pv-l{transition:bottom .55s cubic-bezier(.3,1.3,.5,1)}' +
      '.pv-land{animation:pv-land .35s ease-out}' +
      '@keyframes pv-land{40%{transform:scaleY(.97)}100%{transform:none}}' +
      '.pv-fly{position:fixed;z-index:1000;pointer-events:none;will-change:transform}' +
      '.pv-fly svg{display:block;width:100%;overflow:visible;filter:drop-shadow(0 14px 10px rgba(0,0,0,.3))}' +
      '.pv-bub{position:absolute;left:50%;top:4px;z-index:200;font:700 16px/1 system-ui,sans-serif;color:#fff;padding:6px 12px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.2);animation:pv-bub 1.4s ease-out forwards;pointer-events:none}' +
      '.pv-bub.yes{background:#16a34a}.pv-bub.no{background:#dc2626}' +
      '@keyframes pv-bub{0%{transform:translate(-50%,20px) scale(.6);opacity:0}15%{transform:translate(-50%,0) scale(1.08);opacity:1}25%{transform:translate(-50%,0) scale(1)}75%{opacity:1}100%{transform:translate(-50%,-26px);opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){.pv-l.drop,.pv-l.hit svg,.pv-bub{animation:none}.pv-l,.pv-stack{transition:none}}';
    document.head.appendChild(st);
  }
  var MOTION = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function svgOf(id) {
    var sp = LAYERS[id]();
    return '<svg viewBox="0 -2 300 ' + (sp.h + 2) + '">' + G + sp.svg + '</svg>';
  }

  function mount(el, kind, opts) {
    addCss();
    opts = opts || {};
    var R = RECIPES[kind] || RECIPES.burger;
    var H = opts.height || 360, W = opts.width || 300, lang = opts.lang || 'es', sel = {}, exploded = opts.exploded !== false, lidUp = 0, nodes = {}, first = true;
    el.innerHTML = '<div class="pv"><div class="pv-plate"></div><div class="pv-stack"></div></div>';
    var box = el.firstChild, stack = box.lastChild, plate = box.firstChild;
    box.classList.toggle('exploded', exploded);

    function spec(id) { return LAYERS[(R.draw && R.draw[id]) || id](); }
    function visible() { return R.order.filter(function (id) { return !R.show[id] || R.show[id](sel); }); }
    function name(id) { var n = NAMES[id] || [id, id, id]; return n[{ es: 0, en: 1, zh: 2 }[lang] || 0]; }
    function isExtra(id) { return (R.extras || []).indexOf(id) >= 0; }
    function tagText(id) { return (isExtra(id) ? '+ ' : '') + name(id); }

    function layout() {
      // las capas van un poco separadas para que se distinga bien cada una
      var ids = visible(), base = 34, gap = exploded ? 20 : 10, ex = 0, tags = [];
      ids.forEach(function (id, i) {
        var n = nodes[id], sp = n.sp;
        if (id === R.lid) base += lidUp + (exploded ? 0 : 8);
        n.el.style.bottom = (base - (sp.below || 0)) + 'px';
        n.el.style.zIndex = 10 + i;
        // etiquetas: una a cada lado (los extras siempre, el resto al despiezar)
        var left = isExtra(id) ? ex++ % 2 === 1 : exploded && i % 2 === 1;
        n.tag.classList.toggle('tl', left);
        if (isExtra(id) || exploded) tags.push({ n: n, left: left, y: base + sp.lift / 2 + 4, b: base - (sp.below || 0) });
        base += sp.lift + gap;
      });
      var top = base + (nodes[R.lid] ? nodes[R.lid].sp.h : 0);
      // se agranda hasta llenar el sitio disponible (ancho y alto)
      var k = Math.min((W - 24) / 300, (H - 8) / top, 1.8);
      // que no se pisen: en cada lado, al menos 24 px (ya escalados) entre una y otra
      [true, false].forEach(function (side) {
        var prev = -1e9;
        tags.filter(function (t) { return t.left === side; }).forEach(function (t) {
          t.y = Math.max(t.y, prev + 24 / k); prev = t.y;
          t.n.tag.style.bottom = (t.y - t.b) + 'px';
        });
      });
      box.style.height = H + 'px'; box.style.width = W + 'px';
      var pw = 290 * Math.max(k, 0.75);
      plate.style.width = pw + 'px'; plate.style.left = ((W - pw) / 2) + 'px'; plate.style.height = (pw * 0.2) + 'px';
      stack.style.transformOrigin = '50% 100%';
      stack.dataset.k = k;
      applyTilt();
    }

    function make(id) {
      var sp = spec(id), d = document.createElement('div');
      d.className = 'pv-l' + (isExtra(id) ? ' extra' : ''); d.dataset.id = id;
      d.innerHTML = '<svg viewBox="0 -2 300 ' + (sp.h + 2) + '" height="' + (sp.h + 2) + '">' + G + sp.svg + '</svg><span class="pv-tag"></span>';
      var n = { el: d, sp: sp, tag: d.lastChild };
      n.tag.textContent = tagText(id);
      return n;
    }

    function bubble(text, kind) {
      var b = document.createElement('span');
      b.className = 'pv-bub ' + kind; b.textContent = text;
      var others = box.querySelectorAll('.pv-bub').length;
      b.style.top = (4 + others * 34) + 'px';
      box.appendChild(b);
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 1500);
    }

    // Una copia de la capa vuela desde la tarjeta del ingrediente (o vuelve a ella)
    function flight(svg, from, to, back) {
      var f = document.createElement('div');
      f.className = 'pv-fly';
      f.style.left = to.left + 'px'; f.style.top = to.top + 'px'; f.style.width = to.width + 'px'; f.style.height = to.height + 'px';
      f.appendChild(svg);
      document.body.appendChild(f);
      var dx = (from.left + from.width / 2) - (to.left + to.width / 2), dy = (from.top + from.height / 2) - (to.top + to.height / 2);
      var sc = Math.max(0.15, Math.min(1, from.width * 0.9 / to.width));
      var arc = Math.min(dy, 0) - 110;
      var kf = [
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ') rotate(-30deg)', opacity: back ? 1 : 0.4 },
        { transform: 'translate(' + (dx * 0.4) + 'px,' + (dy * 0.45 + arc * 0.6) + 'px) scale(' + (back ? 0.8 : 1.15) + ') rotate(12deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }
      ];
      if (back) kf.reverse();
      if (back) kf[2].opacity = 0.2;
      var a = f.animate(kf, { duration: back ? 560 : 720, easing: back ? 'cubic-bezier(.5,0,.8,.6)' : 'cubic-bezier(.35,0,.25,1)', fill: 'both' });
      return new Promise(function (res) {
        var done = function () { if (f.parentNode) f.parentNode.removeChild(f); res(); };
        a.onfinish = done; setTimeout(done, 1200);
      });
    }

    var outSide = 0, lidTimer;
    // o.origin(capa) -> elemento de la tarjeta de ese ingrediente (para el vuelo)
    function set(s, o) {
      o = o || {};
      sel = Object.assign({}, s || {});
      var want = visible(), added = [];
      Object.keys(nodes).forEach(function (id) {
        if (want.indexOf(id) >= 0) return;
        var n = nodes[id]; delete nodes[id];
        var org = MOTION && o.origin && o.origin(id);
        bubble('− ' + name(id), 'no');
        if (org) {
          var r = n.el.querySelector('svg').getBoundingClientRect();
          flight(n.el.querySelector('svg').cloneNode(true), org.getBoundingClientRect(), r, true);
          n.el.parentNode.removeChild(n.el);
          return;
        }
        n.el.classList.add('out'); if (outSide++ % 2) n.el.classList.add('left');
        n.el.style.zIndex = 50;
        setTimeout(function () { if (n.el.parentNode) n.el.parentNode.removeChild(n.el); }, 480);
      });
      want.forEach(function (id) {
        if (nodes[id]) return;
        nodes[id] = make(id); stack.appendChild(nodes[id].el);
        if (!first) added.push(id);
      });
      if (added.length) {
        lidUp = 70; layout();
        var last = 0;
        added.forEach(function (id, i) {
          var n = nodes[id], org = MOTION && o.origin && o.origin(id);
          if (!org) {
            n.el.style.animationDelay = (i * 0.12) + 's'; n.el.classList.add('drop');
            setTimeout(function () { n.el.classList.remove('drop'); n.el.style.animationDelay = ''; }, 800 + i * 120);
            last = Math.max(last, 520 + i * 120);
            bubble('+ ' + name(id), 'yes');
            return;
          }
          n.el.style.opacity = '0';
          last = Math.max(last, 300 + i * 160 + 720);
          setTimeout(function () {
            if (nodes[id] !== n) return;
            bubble('+ ' + name(id), 'yes');
            var to = n.el.querySelector('svg').getBoundingClientRect();
            flight(n.el.querySelector('svg').cloneNode(true), org.getBoundingClientRect(), to).then(function () {
              n.el.style.opacity = '';
              n.el.classList.remove('hit'); void n.el.offsetWidth; n.el.classList.add('hit');
              setTimeout(function () { n.el.classList.remove('hit'); }, 650);
            });
          }, 300 + i * 160);   // primero se levanta la tapa
        });
        clearTimeout(lidTimer);
        lidTimer = setTimeout(function () {
          lidUp = 0; layout();
          stack.classList.remove('pv-land'); void stack.offsetWidth; stack.classList.add('pv-land');
        }, last);
      } else layout();
      if (first) {
        // al abrir: el plato se monta de abajo arriba
        first = false;
        want.forEach(function (id, i) {
          var e = nodes[id].el; e.style.animationDelay = (i * 0.09) + 's'; e.classList.add('drop');
          setTimeout(function () { e.classList.remove('drop'); e.style.animationDelay = ''; }, 800 + i * 90);
        });
      }
    }

    // ---------------------------------------------------------------- girar con el dedo
    var rx = 14, ry = -10, drag = null, idle = 0, raf;
    function applyTilt() {
      var k = Number(stack.dataset.k) || 1;
      stack.style.transform = 'scale(' + k + ') rotateX(' + rx.toFixed(1) + 'deg) rotateY(' + ry.toFixed(1) + 'deg)';
      // un poco de paralaje: cada capa se separa en profundidad
      Object.keys(nodes).forEach(function (id) {
        var z = (Number(nodes[id].el.style.zIndex) || 10) - 10;
        nodes[id].el.style.transform = nodes[id].el.classList.contains('out') ? '' : 'translateZ(' + (z * 3) + 'px)';
      });
    }
    box.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, rx: rx, ry: ry };
      stack.style.transition = 'none'; box.style.cursor = 'grabbing';
      try { box.setPointerCapture(e.pointerId); } catch (x) { /* ignorar */ }
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      ry = Math.max(-35, Math.min(35, drag.ry + (e.clientX - drag.x) * 0.35));
      rx = Math.max(-5, Math.min(30, drag.rx - (e.clientY - drag.y) * 0.25));
      applyTilt();
    });
    function end() {
      if (!drag) return;
      drag = null; stack.style.transition = ''; box.style.cursor = '';
      idle = Date.now();
    }
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    // vaivén suave cuando nadie lo toca
    var t0 = Date.now();
    function sway() {
      if (!box.isConnected) return;
      if (!drag && Date.now() - idle > 2500) {
        var t = (Date.now() - t0) / 1000;
        ry += ((-10 + Math.sin(t * 0.8) * 14) - ry) * 0.04;
        rx += ((14 + Math.sin(t * 0.5) * 3) - rx) * 0.04;
        stack.style.transition = 'none'; applyTilt();
      }
      raf = requestAnimationFrame(sway);
    }
    if (MOTION) raf = requestAnimationFrame(sway);

    return {
      set: set,
      explode: function (on) { exploded = !!on; box.classList.toggle('exploded', exploded); layout(); },
      lang: function (l) { lang = l; Object.keys(nodes).forEach(function (id) { nodes[id].tag.textContent = tagText(id); }); },
      layers: visible,
      destroy: function () { cancelAnimationFrame(raf); el.innerHTML = ''; }
    };
  }

  window.PlatetVisual = { mount: mount, svg: svgOf, RECIPES: RECIPES, LAYERS: LAYERS, NAMES: NAMES };
})();
