'use strict';
// ───────── Utilidades ─────────
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => { n = Number(n) || 0; return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-6) / 100; };
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const eur = n => r2(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const sum = (a, f) => a.reduce((t, x) => t + (typeof f === 'function' ? f(x) : Number(x[f]) || 0), 0);
const pad = (n, l = 2) => String(n).padStart(l, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dstr = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fd = ts => { const d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
const fdt = ts => { const d = new Date(ts); return fd(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const monthKey = ts => dstr(ts).slice(0, 7);
const fv = id => { const e = $('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
const fld = (label, id, value = '', attrs = '') => `<label class="f"><span>${label}</span><input id="${id}" value="${esc(value)}" ${attrs}></label>`;
const sel = (label, id, opts, value) => `<label class="f"><span>${label}</span><select id="${id}">${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(value) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
const chk = (label, id, on) => `<label class="ck"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;

let LANG = 'zh', USER = null, VIEW = 'pos';
const L = (es, zh) => LANG === 'zh' ? zh : es;

// ───────── Datos ─────────
const S = { cfg: null, users: [], cats: [], products: [], members: [], promos: [], vouchers: [], sessions: [], invoices: [], parked: [], sales: [], mlog: [], stocklog: [], att: [] };
const SHARDED = ['sales', 'mlog', 'stocklog', 'att']; // se guardan por meses para que no crezcan sin límite
const DEF_CFG = () => ({
  lang: 'zh',
  shop: { name: 'Mi Bisutería', nif: '', address: '', city: '', phone: '', email: '' },
  footer: '¡Gracias por su compra!', returnDays: 15,
  returnText: 'Cambios y devoluciones en {d} días presentando el ticket. Pendientes no admiten devolución por higiene.',
  iva: 21, paper: 80, autoPrint: true, drawer: 'none', baud: 9600,
  points: { on: true, earn: 1, value: 0.01, min: 100 },
  bonus: [{ min: 50, bonus: 5 }, { min: 100, bonus: 15 }, { min: 200, bonus: 40 }],
  levels: [{ id: 'l0', name: 'Normal', min: 0, disc: 0, mult: 1 }, { id: 'l1', name: 'Plata', min: 300, disc: 5, mult: 1.5 }, { id: 'l2', name: 'Oro', min: 1000, disc: 10, mult: 2 }],
  valeMonths: 12, empMaxDisc: 10, empReturn: true, blockNoStock: false,
  label: { mode: 'a4', w: 40, h: 30, cols: 5 },
  comm: { basis: 'base' }, askClock: true,
  seq: {}, lastBackup: 0
});

const DB = {
  db: null, pending: new Map(), queued: false,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('bisuteria-pos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  all() {
    return new Promise((res, rej) => {
      const out = {}, c = DB.db.transaction('kv').objectStore('kv').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    });
  },
  flush() {
    DB.queued = false;
    const items = [...DB.pending]; DB.pending.clear();
    if (!items.length) return Promise.resolve();
    return new Promise((res) => {
      const tx = DB.db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
      items.forEach(([k, v]) => st.put(v, k));
      tx.oncomplete = res;
      tx.onerror = tx.onabort = () => { toast(L('⚠️ Error al guardar los datos', '⚠️ 数据保存失败'), true); res(); };
    });
  },
  replaceAll(data) {
    return new Promise((res, rej) => {
      const tx = DB.db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
      st.clear();
      Object.keys(data).forEach(k => {
        if (SHARDED.includes(k)) {
          const g = {}; (data[k] || []).forEach(x => (g[monthKey(x.ts)] = g[monthKey(x.ts)] || []).push(x));
          Object.keys(g).forEach(m => st.put(g[m], k + ':' + m));
        } else st.put(data[k], k);
      });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
};
// Marca una colección (o el mes de un registro) para guardar. Todo lo marcado
// en la misma operación se escribe en una única transacción.
function dirty(coll, rec) {
  if (SHARDED.includes(coll)) {
    const m = monthKey(rec.ts);
    DB.pending.set(coll + ':' + m, S[coll].filter(x => monthKey(x.ts) === m));
  } else DB.pending.set(coll, S[coll]);
  if (!DB.queued) { DB.queued = true; queueMicrotask(DB.flush); }
}
async function loadAll() {
  await DB.open();
  const all = await DB.all();
  Object.keys(all).forEach(k => {
    const [c] = k.split(':');
    if (SHARDED.includes(c)) S[c].push(...all[k]); else if (c in S) S[c] = all[k];
  });
  SHARDED.forEach(c => S[c].sort((a, b) => a.ts - b.ts));
  const d = DEF_CFG(), c = S.cfg || {};
  S.cfg = Object.assign(d, c, { shop: Object.assign(d.shop, c.shop), points: Object.assign(d.points, c.points), label: Object.assign(d.label, c.label), comm: Object.assign(d.comm, c.comm) });
  if (!S.users.length) seed();
  LANG = S.cfg.lang;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
}
function seed() {
  S.users = [{ id: uid(), name: 'ADMIN', pin: '1111', role: 'admin', perms: defPerms(), maxDisc: 100, comm: 0 }, { id: uid(), name: 'EMPLEADO', pin: '0000', role: 'emp', perms: defPerms(), maxDisc: 10, comm: 0 }];
  const cats = [['Pendientes', '耳环'], ['Collares', '项链'], ['Pulseras', '手链'], ['Anillos', '戒指'], ['Pelo', '发饰'], ['Relojes', '手表'], ['Bolsos', '包包'], ['Otros', '其他']];
  S.cats = cats.map(c => ({ id: uid(), name: c[0], zh: c[1] }));
  const P = [[0, 'Pendientes aro dorado', '金色圈形耳环', 4.95, 1.2, 30], [0, 'Pendientes perla', '珍珠耳环', 3.5, 0.8, 40], [0, 'Pendientes acero estrella', '不锈钢星星耳环', 6.95, 1.9, 25],
    [1, 'Collar corazón acero', '不锈钢爱心项链', 9.95, 2.8, 18], [1, 'Gargantilla perlas', '珍珠锁骨链', 7.5, 2.1, 20], [2, 'Pulsera hilo rojo', '红绳手链', 2.5, 0.4, 60],
    [2, 'Pulsera acero eslabones', '不锈钢链条手链', 8.95, 2.5, 15], [3, 'Anillo ajustable plata', '可调节银色戒指', 3.95, 0.9, 35], [3, 'Anillo circonita', '锆石戒指', 5.95, 1.5, 22],
    [4, 'Pinza pelo grande', '大号抓夹', 2.95, 0.6, 50], [4, 'Coletero satén', '缎面发圈', 1.5, 0.3, 80], [5, 'Reloj mujer dorado', '金色女表', 14.95, 5.5, 8], [6, 'Bolso bandolera', '斜挎包', 15.95, 6.2, 6]];
  S.products = P.map((p, i) => ({ id: uid(), sku: 'A' + pad(i + 1, 4), barcode: ean13('20' + pad(i + 1, 10)), name: p[1], zh: p[2], cat: S.cats[p[0]].id, price: p[3], cost: p[4], stock: p[5], min: 5, iva: 21, img: '', active: true, noDisc: false, supplier: '' }));
  S.cfg.seq.prod = P.length; S.cfg.demo = true;
  ['users', 'cats', 'products', 'cfg'].forEach(c => dirty(c));
}
function ean13(d12) { let s = 0; for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1); return d12 + ((10 - s % 10) % 10); }
function nextNo(prefix, digits = 6) {
  const y = new Date().getFullYear(), k = prefix + y;
  S.cfg.seq[k] = (S.cfg.seq[k] || 0) + 1; dirty('cfg');
  return prefix + '-' + y + '-' + pad(S.cfg.seq[k], digits);
}
const prod = id => S.products.find(p => p.id === id);
const member = id => S.members.find(m => m.id === id);
const catName = id => { const c = S.cats.find(c => c.id === id); return c ? (LANG === 'zh' && c.zh ? c.zh : c.name) : ''; };
const pname = p => LANG === 'zh' && p.zh ? p.zh : p.name;
const curSession = () => S.sessions.find(s => !s.closeTs);
const PM = { cash: ['Efectivo', '现金'], card: ['Tarjeta', '刷卡'], bizum: ['Bizum', 'Bizum'], saldo: ['Saldo cliente', '会员余额'], vale: ['Vale / T. regalo', '代金券/礼品卡'] };
const pmName = m => PM[m] ? L(PM[m][0], PM[m][1]) : m;
function mLevel(m) {
  const lv = S.cfg.levels;
  if (m.level) { const f = lv.find(l => l.id === m.level); if (f) return f; }
  return [...lv].sort((a, b) => b.min - a.min).find(l => (m.spent || 0) >= l.min) || lv[0];
}
function mlogAdd(m, type, o = {}) {
  const rec = Object.assign({ id: uid(), ts: Date.now(), member: m.id, type, amount: 0, points: 0, bal: r2(m.balance), pts: m.points, user: USER ? USER.name : '' }, o);
  S.mlog.push(rec); dirty('mlog', rec); dirty('members');
}
function stockMove(p, qty, type, note = '') {
  p.stock = r2((p.stock || 0) + qty);
  const rec = { id: uid(), ts: Date.now(), pid: p.id, qty, after: p.stock, type, note, user: USER ? USER.name : '' };
  S.stocklog.push(rec); dirty('stocklog', rec); dirty('products');
}

// ───────── UI base ─────────
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), bad ? 3500 : 2200);
}
function modal(html, wide) {
  $('#modal-box').className = 'modal-box' + (wide ? ' wide' : '');
  $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden');
  const f = $('#modal-box [autofocus]'); if (f) { f.focus(); if (f.select) f.select(); }
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; if (VIEW === 'pos' && USER) focusScan(); }
const modalOpen = () => !$('#modal').classList.contains('hidden');
const mfoot = (...b) => `<div class="mfoot">${b.join('')}</div>`;
const btnClose = () => `<button onclick="closeModal()">${L('Cerrar', '关闭')}</button>`;
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const csv = rows => '﻿' + rows.map(r => r.map(c => { c = String(c ?? ''); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';')).join('\r\n');

// Código de barras Code128-B como SVG
const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
// Solo cifras → juego C (dos cifras por símbolo: código más corto y fácil de leer en etiquetas pequeñas).
function c128codes(text) {
  let vals;
  if (/^\d{4,}$/.test(text)) {
    const even = text.length - text.length % 2;
    vals = [105]; for (let i = 0; i < even; i += 2) vals.push(Number(text.substr(i, 2)));
    if (even < text.length) vals.push(100, text.charCodeAt(even) - 32);
  } else vals = [104, ...[...text].map(ch => ch.charCodeAt(0) - 32)];
  const chk = vals.reduce((t, v, i) => t + v * (i || 1), 0);
  return [...vals, chk % 103, 106];
}
function barcode(text, h = 42, showText = true) {
  text = String(text).replace(/[^\x20-\x7e]/g, '?');
  const codes = c128codes(text);
  let x = 10, rects = '';
  codes.forEach(c => [...C128[c]].forEach((w, i) => { w = Number(w); if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w; }));
  const W = x + 10, H = h + (showText ? 12 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.min(W * 1.4, 260)}" height="${H}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${rects}${showText ? `<text x="${W / 2}" y="${H - 1}" text-anchor="middle" font-family="monospace" font-size="10">${esc(text)}</text>` : ''}</svg>`;
}
function printDoc(html, kind = 'ticket') {
  const lb = S.cfg.label;
  $('#page-style').textContent = ':root{--tkw:' + (S.cfg.paper == 58 ? 48 : 72) + 'mm}' +
    (kind === 'a4' ? '@page{size:A4;margin:12mm}' : kind === 'roll' ? `@page{size:${lb.w}mm ${lb.h}mm;margin:0}` : kind === 'sheet' ? '@page{size:A4;margin:8mm}' : `@page{size:${S.cfg.paper}mm auto;margin:0}`);
  $('#print-area').innerHTML = html;
  setTimeout(() => window.print(), 80);
}
// Cajón portamonedas: con impresora por puerto serie/USB (Web Serial). Con el
// controlador normal de Windows el cajón se abre solo al imprimir el ticket.
let serialPort = null;
async function openDrawer(silent) {
  if (S.cfg.drawer !== 'serial') { if (!silent) toast(L('Cajón: se abre al imprimir (o configure Web Serial en Ajustes)', '钱箱:打印小票时自动弹开(或在设置里配置串口)')); return; }
  try {
    if (!serialPort) { const ps = await navigator.serial.getPorts(); serialPort = ps[0] || await navigator.serial.requestPort(); }
    if (!serialPort.writable) await serialPort.open({ baudRate: Number(S.cfg.baud) || 9600 });
    const w = serialPort.writable.getWriter();
    await w.write(new Uint8Array([27, 112, 0, 25, 250])); w.releaseLock();
  } catch (e) { serialPort = null; if (!silent) toast(L('No se pudo abrir el cajón', '无法打开钱箱'), true); }
}

// ───────── Arranque, login y navegación ─────────
const V = {}, A = {};
const NAV = [['pos', '🛒', 'Venta', '收银'], ['sales', '🧾', 'Tickets', '单据'], ['members', '👥', 'Clientes', '会员'], ['vouchers', '🎁', 'Vales', '礼品卡/代金券'],
  ['products', '💍', 'Productos', '商品'], ['cash', '💶', 'Caja', '钱箱'], ['team', '⏱', 'Equipo', '员工'], ['reports', '📊', 'Informes', '报表', 'reports'], ['settings', '⚙️', 'Ajustes', '设置', 'settings']];
let CLOCKMODE = false;
let pinBuf = '';
async function boot() {
  try { await loadAll(); migrateUsers(); } catch (e) { document.body.innerHTML = '<p style="padding:20px">No se puede abrir la base de datos de este navegador (¿modo privado?).<br>无法打开浏览器数据库(是否处于无痕模式?)</p>'; return; }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('keydown', onKey);
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && !$('#modal-box [data-lock]')) closeModal(); });
  render();
}
function onKey(e) {
  if (!USER) {
    if (/^\d$/.test(e.key)) { e.preventDefault(); A.pin(e.key); } else if (e.key === 'Backspace') A.pin('<');
    return;
  }
  if (e.key === 'Escape' && modalOpen() && !$('#modal-box [data-lock]')) return closeModal();
  if (e.key === 'Enter' && modalOpen() && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { const b = $('#modal-box [data-enter]'); if (b) { e.preventDefault(); b.click(); } return; }
  if (VIEW === 'pos' && !modalOpen()) {
    if (e.key === 'F9') { e.preventDefault(); return A.pay(); }
    const tg = e.target.tagName;
    if (tg !== 'INPUT' && tg !== 'TEXTAREA' && tg !== 'SELECT' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { const q = $('#q'); if (q) q.focus(); }
  }
}
A.pin = k => {
  if (k === '<') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
  if (pinBuf.length === 4) {
    const u = S.users.find(u => u.pin === pinBuf); pinBuf = '';
    if (u && CLOCKMODE) { CLOCKMODE = false; render(); A.doClock(u.id); return; }
    if (u) { USER = u; VIEW = 'pos'; OVR = null; render(); if (S.cfg.askClock && !isIn(u.id)) A.clockMe(); return; }
    toast(L('PIN incorrecto', 'PIN 错误'), true);
  }
  $$('.dots i').forEach((d, i) => d.classList.toggle('on', i < pinBuf.length));
};
A.lang = () => { LANG = LANG === 'zh' ? 'es' : 'zh'; S.cfg.lang = LANG; dirty('cfg'); render(); };
A.lock = () => { USER = null; OVR = null; CLOCKMODE = false; pinBuf = ''; closeModal(); render(); };
A.go = v => { VIEW = v; render(); };
function render() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'es';
  const app = $('#app');
  if (!USER) {
    app.innerHTML = `<div class="login"><div style="font-size:44px">💍</div><h1>${esc(S.cfg.shop.name)}</h1><div class="muted">${CLOCKMODE ? '⏱ ' + L('PIN para fichar', '输入 PIN 打卡') : L('Introduzca su PIN', '请输入 PIN')}</div>
      <div class="dots"><i></i><i></i><i></i><i></i></div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button onclick="A.pin('${n}')">${n}</button>`).join('')}<button onclick="A.lang()" style="font-size:15px">${LANG === 'zh' ? 'ES' : '中文'}</button><button onclick="A.pin('0')">0</button><button onclick="A.pin('<')">⌫</button></div>
      <button class="${CLOCKMODE ? 'gold' : ''}" style="width:100%;margin-top:10px;padding:12px" onclick="CLOCKMODE=!CLOCKMODE;pinBuf='';render()">⏱ ${CLOCKMODE ? L('FICHAR: introduzca su PIN (toque para cancelar)', '打卡模式:请输入 PIN(点此取消)') : L('Fichar entrada / salida', '上班 / 下班打卡')}</button>
      ${S.cfg.demo ? `<p class="muted small">${L('PIN inicial: admin 1111 · empleado 0000 (cámbielos en Ajustes)', '初始 PIN:管理员 1111 · 员工 0000(请在设置里修改)')}</p>` : ''}</div>`;
    return;
  }
  const nv = NAV.find(n => n[0] === VIEW); if (nv[4] && !can(nv[4])) VIEW = 'pos';
  app.innerHTML = `<header class="top"><div class="brand">💍 ${esc(S.cfg.shop.name)}</div>
    <nav>${NAV.filter(n => !n[4] || can(n[4])).map(n => `<a class="${VIEW === n[0] ? 'on' : ''}" onclick="A.go('${n[0]}')">${n[1]} ${L(n[2], n[3])}</a>`).join('')}</nav>
    <div class="who"><button onclick="A.clockMe()" title="Fichar">${isIn(USER.id) ? '🟢' : '⚪'} ⏱</button><span>${esc(USER.name)}</span><button onclick="A.lang()">${LANG === 'zh' ? 'ES' : '中文'}</button><button onclick="A.lock()">🔒</button></div></header>
    <main id="main"></main>`;
  V[VIEW]();
}
