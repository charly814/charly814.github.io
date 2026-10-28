// Pedido por voz: convierte una frase ("dos cañas, una hamburguesa sin cebolla
// con bacon") en líneas de ticket.
//
// Todo se resuelve EN LOCAL, sin internet:
//   1. índice de la carta y de los modificadores en es / en / zh
//   2. números en palabras ("dos", "two", "两杯"), marcadores SIN / CON / 不要 / 加
//   3. coincidencia aproximada (plurales, errores de una letra)
//   4. memoria: cada corrección del camarero se guarda (frase -> producto) y la
//      próxima vez se reconoce al instante.
// Solo lo que no se entiende puede consultarse a la IA (opcional, con clave en
// este dispositivo) y su respuesta también se memoriza.
(function () {
  'use strict';

  var P = window.Platet;
  var MEM_KEY = 'platet-voice-mem:v1';
  var MAX_UTTER = 300;

  // ---------------------------------------------------------------- vocabulario

  var NUM = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, quince: 15, veinte: 20,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12
  };
  var ANOTHER = { otra: 1, otro: 1, otras: 1, otros: 1, another: 1 };
  var SEP = { y: 1, e: 1, and: 1, also: 1, luego: 1, despues: 1, tambien: 1, ademas: 1, then: 1, plus: 1 };
  var SIN_M = ['sin', 'without', 'no', 'sans'];
  var EXTRA_M = ['con', 'extra', 'with', 'add', 'mas'];
  var JOIN = { y: 1, ni: 1, and: 1, or: 1, o: 1, e: 1 };
  var STOP = {
    de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, al: 1, a: 1, en: 1, por: 1, favor: 1, para: 1, mesa: 1,
    ponme: 1, pon: 1, ponnos: 1, pongame: 1, quiero: 1, queremos: 1, me: 1, nos: 1, dame: 1, danos: 1,
    traeme: 1, traenos: 1, porfa: 1, vale: 1, ok: 1, oye: 1, bueno: 1, pues: 1, mira: 1, o: 1,
    the: 1, of: 1, please: 1, i: 1, we: 1, want: 1, would: 1, like: 1, give: 1, us: 1, some: 1, can: 1,
    have: 1, get: 1, for: 1, table: 1, to: 1, an: 1
  };
  var ZH_SIN = ['不要放', '不要加', '不要', '不加', '去掉', '别放', '别加', '免', '去'];
  var ZH_EXTRA = ['多加', '要加', '另加', '加', '多', '配'];
  var ZH_SEP = /和|还有|再来|然后|另外|以及/g;
  var ZH_STOP = /我要|我们要|给我|给我们|麻烦|请|一下|帮我|来个|来|要|的|吧|了|呢|啊|点/g;
  var ZH_DIGIT = { 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  var ZH_NUM_RE = /^([一二两俩三四五六七八九十]+)[个份杯瓶碗盘只串根块张支罐打条]?$/;
  var CJK = /[一-鿿]/;
  var KEEP = {};
  [NUM, ANOTHER, SEP, STOP, JOIN].forEach(function (o) { Object.keys(o).forEach(function (k) { KEEP[k] = 1; }); });
  SIN_M.concat(EXTRA_M).forEach(function (k) { KEEP[k] = 1; });

  function zhNum(s) {
    if (s.length === 1) return ZH_DIGIT[s] || 0;
    var i = s.indexOf('十');
    if (i < 0) return ZH_DIGIT[s.charAt(s.length - 1)] || 0;
    var tens = i === 0 ? 1 : (ZH_DIGIT[s.charAt(i - 1)] || 1);
    var ones = i < s.length - 1 ? (ZH_DIGIT[s.charAt(i + 1)] || 0) : 0;
    return tens * 10 + ones;
  }

  // Singular "canónico" en español/inglés: cañas -> cana, calamares -> calamar, tigres -> tigre.
  function sing(tok) {
    if (CJK.test(tok) || /\d/.test(tok) || KEEP[tok] || tok.length <= 3 || tok.charAt(tok.length - 1) !== 's') return tok;
    if (tok.length > 4 && /[rlndzj]es$/.test(tok)) return tok.slice(0, -2);
    return tok.slice(0, -1);
  }

  // Texto -> tokens canónicos separados por espacios ('|' marca pausas/comas).
  function canon(text) {
    var s = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[,;.!?¿¡，。；、！？\n]+/g, ' | ');
    s = s.replace(/[^a-z0-9一-鿿|\s]/g, ' ');
    s = s.replace(/([a-z0-9|])([一-鿿])/g, '$1 $2').replace(/([一-鿿])([a-z0-9|])/g, '$1 $2');
    return s.split(/\s+/).filter(Boolean).map(sing).join(' ');
  }
  function stripParens(s) { return String(s || '').replace(/\(.*?\)|（.*?）/g, ' '); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------------------------------------------------------------- memoria

  var mem = load();
  function load() {
    try {
      var m = JSON.parse(localStorage.getItem(MEM_KEY)) || {};
      return { aliases: m.aliases || {}, utter: m.utter || {}, hits: m.hits || {}, ai: m.ai || 0 };
    } catch (e) { return { aliases: {}, utter: {}, hits: {}, ai: 0 }; }
  }
  function save() {
    var keys = Object.keys(mem.utter);
    if (keys.length > MAX_UTTER) keys.slice(0, keys.length - MAX_UTTER).forEach(function (k) { delete mem.utter[k]; });
    try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
    if (Voice.onMemChange) Voice.onMemChange(mem);
  }

  // ---------------------------------------------------------------- índice

  var idx = null, idxKey = '';
  function index(menu, mods) {
    var key = JSON.stringify([menu, mods, Object.keys(mem.aliases).length]);
    if (idx && key === idxKey) return idx;
    var items = {}, itemVar = {}, modVar = { sin: [], extra: [], prep: [] };
    function addItem(v, pid) {
      v = v.trim();
      if (!v || v === '|') return;
      itemVar[v] = itemVar[v] || [];
      if (itemVar[v].indexOf(pid) < 0) itemVar[v].push(pid);
    }
    (menu || []).forEach(function (c) {
      (c.items || []).forEach(function (it) {
        items[it.id] = it;
        [it.name, it.en].forEach(function (n) {
          if (!n) return;
          [canon(n), canon(stripParens(n))].forEach(function (v) {
            addItem(v, it.id);
            if (/^1 2 /.test(v)) {
              ['media ', 'medio ', 'half ', 'media tostada ', 'half toast '].forEach(function (pre) { addItem(pre + v.slice(4), it.id); });
            }
          });
        });
        if (it.zh) { addItem(canon(it.zh), it.id); addItem(canon(stripParens(it.zh)), it.id); }
      });
    });
    // Lo aprendido manda sobre la carta.
    Object.keys(mem.aliases).forEach(function (a) { if (items[mem.aliases[a]]) itemVar[a] = [mem.aliases[a]]; });

    (mods || []).forEach(function (m) {
      var vs = [];
      [m.name, m.en, m.zh].forEach(function (n) { if (n) { var c = canon(n); if (vs.indexOf(c) < 0) vs.push(c); } });
      vs.forEach(function (v) { (modVar[m.type] || modVar.prep).push({ v: v, id: m.id }); });
    });
    var byLen = function (a, b) { return b.v.length - a.v.length; };
    Object.keys(modVar).forEach(function (k) { modVar[k].sort(byLen); });
    var itemList = Object.keys(itemVar).map(function (v) {
      return { v: v, pids: itemVar[v], memory: !!mem.aliases[v], marker: / (con|with|sin|no|without|extra|mas|add) /.test(' ' + v + ' ') || /不要|加|多|配/.test(v) };
    }).sort(byLen);
    idx = { items: items, itemList: itemList, modVar: modVar };
    idxKey = key;
    return idx;
  }

  // ---------------------------------------------------------------- análisis

  function parse(text, menu, mods) {
    var X = index(menu, mods);
    var full = canon(text);
    if (!full.replace(/\|/g, '').trim()) return { lines: [], key: full };

    var cached = mem.utter[full];
    if (cached && cached.every(function (l) { return X.items[l.pid]; })) {
      return {
        key: full,
        lines: cached.map(function (l) {
          return { pid: l.pid, qty: l.qty, mods: (l.mods || []).slice(), notes: (l.notes || []).slice(), phrase: '', raw: '', src: 'memory', candidates: [] };
        })
      };
    }

    var found = [];   // {pids, text, memory}
    var mf = [];      // {type, id, note, text}
    var s = ' ' + full + ' ';

    function putItem(it) {
      var k = found.length;
      found.push({ pids: it.pids, text: it.v, memory: it.memory });
      return ' §' + k + '§ ';
    }
    function replaceItems(onlyMarker) {
      X.itemList.forEach(function (it) {
        if (onlyMarker && !it.marker) return;
        if (CJK.test(it.v)) {
          if (s.indexOf(it.v) >= 0) s = s.split(it.v).join(putItem(it));
        } else {
          var re = new RegExp('(?<= )' + escRe(it.v) + '(?= )', 'g');
          s = s.replace(re, function () { return putItem(it).trim(); });
        }
      });
    }
    function putMod(m) { var k = mf.length; mf.push(m); return '¤' + k + '¤'; }

    // 1. platos cuyo nombre lleva "con"/"sin" (café con leche, huevos rotos con jamón)
    replaceItems(true);

    // 2. preparación (poco hecho, para llevar, 打包...)
    X.modVar.prep.forEach(function (m) {
      if (CJK.test(m.v)) { if (s.indexOf(m.v) >= 0) s = s.split(m.v).join(' ' + putMod({ type: 'prep', id: m.id, text: m.v }) + ' '); }
      else s = s.replace(new RegExp('(?<= )' + escRe(m.v) + '(?= )', 'g'), function () { return putMod({ type: 'prep', id: m.id, text: m.v }); });
    });

    // 3. SIN x / CON x (español, inglés)
    var toks = s.trim().split(/\s+/);
    var out = [];
    function matchMod(type, at) {
      var list = X.modVar[type];
      for (var j = 0; j < list.length; j++) {
        var w = list[j].v.split(' ');
        if (CJK.test(list[j].v)) continue;
        var ok = true;
        for (var q = 0; q < w.length; q++) if (toks[at + q] !== w[q]) { ok = false; break; }
        if (ok) return { id: list[j].id, len: w.length, text: list[j].v };
      }
      return null;
    }
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      var type = SIN_M.indexOf(tk) >= 0 ? 'sin' : EXTRA_M.indexOf(tk) >= 0 ? 'extra' : null;
      if (!type) { out.push(tk); continue; }
      var at = i + 1, got = false;
      while (at < toks.length) {
        var m = matchMod(type, at);
        if (m) {
          out.push(putMod({ type: type, id: m.id, text: tk + ' ' + m.text }));
          at += m.len; got = true;
        } else if (type === 'sin' && toks[at] && /^[a-z]+$/.test(toks[at]) && !STOP[toks[at]] && !NUM[toks[at]] && !SEP[toks[at]]) {
          out.push(putMod({ type: 'sin', note: 'SIN ' + toks[at], text: tk + ' ' + toks[at] }));
          at += 1; got = true;
        } else break;
        // "sin cebolla ni tomate", "sin cebolla y sin tomate"
        if (JOIN[toks[at]] && toks[at + 1] && (matchMod(type, at + 1) || toks[at + 1] === tk)) {
          at += toks[at + 1] === tk ? 2 : 1;
          continue;
        }
        break;
      }
      if (got) i = at - 1; else out.push(tk);
    }
    s = ' ' + out.join(' ') + ' ';

    // 3b. 不要X / 加X (chino, sin espacios)
    function zhMods(markers, type) {
      markers.forEach(function (mk) {
        var pos;
        while ((pos = s.indexOf(mk)) >= 0) {
          var after = s.slice(pos + mk.length);
          var hit = X.modVar[type].filter(function (m) { return CJK.test(m.v) && after.indexOf(m.v) === 0; })[0];
          if (hit) {
            s = s.slice(0, pos) + ' ' + putMod({ type: type, id: hit.id, text: mk + hit.v }) + ' ' + after.slice(hit.v.length);
          } else if (type === 'sin') {
            var word = (after.match(/^[一-鿿]{1,4}?(?=[和还再然另一二两三四五六七八九十]|\s|$)/) || after.match(/^[一-鿿]{1,3}/) || [''])[0];
            s = s.slice(0, pos) + ' ' + putMod({ type: 'sin', note: mk + word, text: mk + word }) + ' ' + after.slice(word.length);
          } else {
            s = s.slice(0, pos) + ' \u0001 ' + after;   // marcador sin uso: se descarta
          }
        }
      });
      s = s.replace(/\u0001/g, ' ');
    }
    zhMods(ZH_SIN, 'sin');
    zhMods(ZH_EXTRA, 'extra');

    // 4. resto de platos
    replaceItems(false);

    // 5. separadores y números en chino
    s = s.replace(ZH_SEP, ' | ');
    s = s.replace(/([一二两俩三四五六七八九十]+[个份杯瓶碗盘只串根块张支罐打条])/g, ' $1 ');

    // 6. recorrer tokens y formar segmentos
    var segs = [], cur = seg();
    function seg() { return { qty: null, items: [], mods: [], words: [], wtoks: [], raw: [], another: false }; }
    function has(c) { return c.items.length || c.words.length; }
    function flush() { if (has(cur) || cur.mods.length) segs.push(cur); cur = seg(); }
    s.trim().split(/\s+/).forEach(function (t) {
      if (!t) return;
      if (t === '|' || SEP[t]) { if (has(cur)) flush(); return; }
      var n = null;
      if (/^\d+$/.test(t)) n = Number(t);
      else if (NUM[t]) n = NUM[t];
      else if (ZH_NUM_RE.test(t)) n = zhNum(t.match(ZH_NUM_RE)[1]);
      if (ANOTHER[t]) { flush(); cur.qty = 1; cur.another = true; return; }
      if (n != null) { if (has(cur) || cur.mods.length || (cur.qty != null && !cur.another)) flush(); cur.qty = n; return; }
      var mi = t.match(/^§(\d+)§$/);
      if (mi) { if (cur.items.length) flush(); cur.items.push(+mi[1]); cur.raw.push(found[+mi[1]].text); return; }
      var mm = t.match(/^¤(\d+)¤$/);
      if (mm) { cur.mods.push(+mm[1]); cur.raw.push(mf[+mm[1]].text); return; }
      var w = CJK.test(t) ? t.replace(ZH_STOP, '') : (STOP[t] ? '' : t);
      if (!cur.items.length) cur.wtoks.push(CJK.test(t) ? w : t);
      if (!w) return;
      if (cur.items.length && cur.words.length === 0 && !CJK.test(w)) { cur.tail = (cur.tail || []).concat(w); cur.raw.push(t); return; }
      cur.words.push(w); cur.raw.push(t);
    });
    flush();

    // 7. resolver cada segmento
    var lines = [];
    segs.forEach(function (g) {
      var qty = Math.min(50, Math.max(1, g.qty || 1));
      var modIds = [], notes = [];
      g.mods.forEach(function (k) { if (mf[k].id) modIds.push(mf[k].id); else notes.push(mf[k].note); });
      var raw = g.raw.join(' ');

      if (!g.items.length && !g.words.length) {
        // "tres hamburguesas, una sin cebolla" -> se separa una unidad de la línea anterior
        var prev = lines[lines.length - 1];
        if (!prev) return;
        if (g.qty && prev.qty > g.qty) {
          prev.qty -= g.qty;
          lines.push(Object.assign({}, prev, { qty: g.qty, mods: prev.mods.concat(modIds), notes: prev.notes.concat(notes), raw: raw }));
        } else {
          prev.mods = prev.mods.concat(modIds); prev.notes = prev.notes.concat(notes);
        }
        return;
      }

      if (g.items.length) {
        var f = found[g.items[0]];
        var line = {
          pid: f.pids.length === 1 ? f.pids[0] : null, qty: qty, mods: modIds, notes: notes,
          phrase: f.text, raw: raw, src: f.pids.length === 1 ? (f.memory ? 'memory' : 'exact') : 'ambiguous',
          candidates: f.pids.length > 1 ? sortByHits(f.pids) : []
        };
        if (g.tail && g.tail.length) {
          // palabras sueltas tras el plato: o es otro plato o una nota ("bien caliente")
          var tm = fuzzy(g.tail.join(' '), X);
          if (tm.best && tm.best.score >= 0.8) {
            lines.push(line);
            line = { pid: tm.best.pid, qty: 1, mods: [], notes: [], phrase: g.tail.join(' '), raw: g.tail.join(' '), src: 'fuzzy', candidates: [] };
          } else line.notes.push(g.tail.join(' '));
        }
        lines.push(line);
        return;
      }

      // La frase que se memoriza conserva "de", "a la"... (así coincide tal cual la
      // próxima vez) pero sin las palabras de relleno del principio y del final.
      var wt = g.wtoks.filter(Boolean);
      while (wt.length && STOP[wt[0]]) wt.shift();
      while (wt.length && STOP[wt[wt.length - 1]]) wt.pop();
      var phrase = wt.join(' ') || g.words.join(' ');
      var fz = fuzzy(phrase, X);
      var ok = fz.best && fz.best.score >= 0.7 && (!fz.second || fz.best.score - fz.second.score >= 0.1);
      lines.push({
        pid: ok ? fz.best.pid : null, qty: qty, mods: modIds, notes: notes, phrase: phrase, raw: raw,
        src: ok ? 'fuzzy' : (fz.best && fz.best.score >= 0.45 ? 'ambiguous' : 'unknown'),
        candidates: ok ? [] : fz.top.filter(function (c) { return c.score >= 0.3; }).map(function (c) { return c.pid; })
      });
    });
    return { lines: lines, key: full };
  }

  function sortByHits(pids) {
    return pids.slice().sort(function (a, b) { return (mem.hits[b] || 0) - (mem.hits[a] || 0); });
  }

  // ---------------------------------------------------------------- aproximado

  function lev1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }
  function tokSim(a, b) {
    if (a === b) return 1;
    if (a.length >= 4 && b.length >= 4) {
      if (lev1(a, b)) return 0.85;
      var ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
      if (ratio >= 0.6 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 0.8;
    }
    return 0;
  }
  function content(v) { return v.split(' ').filter(function (t) { return t && t !== '|' && !STOP[t]; }); }
  function chars(v) { return v.replace(/[^一-鿿]/g, '').split(''); }

  function score(phrase, variant) {
    if (CJK.test(phrase) || CJK.test(variant)) {
      var A = chars(phrase), B = chars(variant);
      if (!A.length || !B.length) return 0;
      var hit = 0, pool = B.slice();
      A.forEach(function (c) { var k = pool.indexOf(c); if (k >= 0) { hit++; pool.splice(k, 1); } });
      return (2 * hit) / (A.length + B.length) * 0.6 + (hit / A.length) * 0.4;
    }
    var P1 = content(phrase), V = content(variant);
    if (!P1.length || !V.length) return 0;
    var recall = 0, prec = 0;
    P1.forEach(function (p) { recall += Math.max.apply(null, V.map(function (v) { return tokSim(p, v); })); });
    V.forEach(function (v) { prec += Math.max.apply(null, P1.map(function (p) { return tokSim(p, v); })); });
    return 0.7 * (recall / P1.length) + 0.3 * (prec / V.length);
  }

  function fuzzy(phrase, X) {
    var best = {};
    X.itemList.forEach(function (it) {
      var sc = score(phrase, it.v);
      if (!sc) return;
      it.pids.forEach(function (pid) {
        var bonus = Math.min(0.04, (mem.hits[pid] || 0) * 0.005);
        if (!best[pid] || best[pid] < sc + bonus) best[pid] = sc + bonus;
      });
    });
    var top = Object.keys(best).map(function (pid) { return { pid: pid, score: best[pid] }; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
    return { best: top[0], second: top[1], top: top };
  }

  function search(q, menu, mods) {
    var X = index(menu, mods);
    var c = canon(q).replace(/\|/g, ' ').trim();
    if (!c) return [];
    return fuzzy(c, X).top.concat(fuzzyAll(c, X)).filter(function (x, i, arr) {
      return arr.findIndex(function (y) { return y.pid === x.pid; }) === i;
    }).slice(0, 8).map(function (x) { return x.pid; });
  }
  function fuzzyAll(c, X) {
    var out = [];
    X.itemList.forEach(function (it) {
      if (it.v.indexOf(c) >= 0) it.pids.forEach(function (pid) { out.push({ pid: pid, score: 0.5 }); });
    });
    return out;
  }

  // ---------------------------------------------------------------- aprender

  // lines: las líneas confirmadas por el camarero ({pid, qty, mods, notes, phrase, src})
  function learn(key, lines) {
    lines.forEach(function (l) {
      if (!l.pid) return;
      mem.hits[l.pid] = (mem.hits[l.pid] || 0) + 1;
      if (l.phrase && l.src !== 'exact' && l.src !== 'memory') mem.aliases[l.phrase] = l.pid;
    });
    if (key) {
      delete mem.utter[key];
      mem.utter[key] = lines.filter(function (l) { return l.pid; }).map(function (l) {
        return { pid: l.pid, qty: l.qty, mods: l.mods, notes: l.notes };
      });
    }
    idx = null;
    save();
  }

  function stats() {
    return { aliases: Object.keys(mem.aliases).length, utter: Object.keys(mem.utter).length, ai: mem.ai };
  }
  function clear() { mem = { aliases: {}, utter: {}, hits: {}, ai: 0 }; idx = null; save(); }
  function exportMem() { return JSON.stringify(mem); }
  function importMem(json, merge) {
    var m = typeof json === 'string' ? JSON.parse(json) : json;
    if (!m || typeof m !== 'object') return;
    ['aliases', 'utter', 'hits'].forEach(function (k) { mem[k] = Object.assign({}, merge ? mem[k] : {}, m[k] || {}); });
    idx = null;
    save();
  }

  // ---------------------------------------------------------------- micrófono

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var LANG = { es: 'es-ES', en: 'en-GB', zh: 'zh-CN' };
  var active = null;

  // Devuelve una promesa con las alternativas reconocidas. Pide reconocimiento
  // en el propio dispositivo cuando el navegador lo permite (sin internet).
  function listen(lang, onPartial, local) {
    return new Promise(function (resolve, reject) {
      if (!SR) return reject(new Error('unsupported'));
      var rec = new SR();
      rec.lang = LANG[lang] || 'es-ES';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 3;
      if (local !== false && 'processLocally' in rec) rec.processLocally = true;
      var alts = [], done = false;
      rec.onresult = function (e) {
        var r = e.results[e.results.length - 1];
        var text = Array.prototype.map.call(e.results, function (x) { return x[0].transcript; }).join(' ');
        if (onPartial) onPartial(text);
        if (r.isFinal) {
          var prefix = Array.prototype.slice.call(e.results, 0, -1).map(function (x) { return x[0].transcript; }).join(' ');
          alts = Array.prototype.map.call(r, function (a) { return (prefix + ' ' + a.transcript).trim(); });
        }
      };
      rec.onerror = function (e) {
        done = true; active = null;
        // Si el idioma no se puede reconocer en el dispositivo, se reintenta normal.
        if (local !== false && (e.error === 'language-not-supported' || e.error === 'service-not-allowed')) {
          return listen(lang, onPartial, false).then(resolve, reject);
        }
        reject(new Error(e.error || 'error'));
      };
      rec.onend = function () { active = null; if (!done) resolve(alts); };
      active = rec;
      rec.start();
    });
  }
  function stop() { if (active) active.stop(); }

  // ---------------------------------------------------------------- IA (opcional)

  var AI_KEY = 'platet-ai-key';
  function aiKey() { try { return localStorage.getItem(AI_KEY) || ''; } catch (e) { return ''; } }
  function setAiKey(k) { if (k) localStorage.setItem(AI_KEY, k); else localStorage.removeItem(AI_KEY); }

  // Solo se envían los trozos que no se han entendido en local. La respuesta
  // se guarda en la memoria al confirmar el pedido, así que la misma frase no
  // vuelve a consultarse.
  function ai(segments, transcript, menu, mods) {
    var key = aiKey();
    if (!key) return Promise.reject(new Error('no-key'));
    var pids = [], menuTxt = [], modIds = [], modTxt = [];
    (menu || []).forEach(function (c) {
      (c.items || []).forEach(function (it) {
        pids.push(it.id);
        menuTxt.push(it.id + ' | ' + it.name + ' | ' + (it.en || '') + ' | ' + (it.zh || '') + ' | ' + c.name);
      });
    });
    (mods || []).forEach(function (m) {
      modIds.push(m.id);
      modTxt.push(m.id + ' | ' + m.type + ' | ' + m.name + ' | ' + (m.en || '') + ' | ' + (m.zh || ''));
    });
    var schema = {
      type: 'object',
      additionalProperties: false,
      required: ['lines'],
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['segment', 'pid', 'qty', 'mods', 'note'],
            properties: {
              segment: { type: 'integer' },
              pid: { type: 'string', enum: pids.concat(['']) },
              qty: { type: 'integer' },
              mods: { type: 'array', items: { type: 'string', enum: modIds } },
              note: { type: 'string' }
            }
          }
        }
      }
    };
    var system = 'You interpret spoken orders taken by a waiter in a Spanish bar-restaurant (Elche). ' +
      'Speech may be Spanish, English or Chinese, may contain speech-recognition errors, slang or brand names. ' +
      'Map each numbered fragment to ONE menu item id (pid) from the menu, or "" if nothing fits. ' +
      'Use modifier ids for "sin/without/不要" (type sin), "con/extra/加" (type extra) and preparation (type prep). ' +
      'Put anything else the guest asked for into note, in Spanish, short. qty defaults to 1.\n\n' +
      'MENU (id | es | en | zh | category):\n' + menuTxt.join('\n') +
      '\n\nMODIFIERS (id | type | es | en | zh):\n' + modTxt.join('\n');
    var user = 'Full transcript: ' + JSON.stringify(transcript) + '\nFragments to resolve:\n' +
      segments.map(function (s) { return s.i + ': ' + JSON.stringify(s.text); }).join('\n');
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }]
      })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    }).then(function (j) {
      if (j.stop_reason === 'refusal') throw new Error('refusal');
      var txt = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      mem.ai = (mem.ai || 0) + 1;
      save();
      return JSON.parse(txt).lines || [];
    });
  }

  var Voice = {
    canon: canon,
    parse: parse,
    search: search,
    learn: learn,
    stats: stats,
    clear: clear,
    exportMem: exportMem,
    importMem: importMem,
    canListen: !!SR,
    listen: listen,
    stop: stop,
    ai: ai,
    aiKey: aiKey,
    setAiKey: setAiKey,
    onMemChange: null
  };
  window.Voice = Voice;
})();
