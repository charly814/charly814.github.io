'use strict';
// ───────── Pantalla de venta ─────────
const newCart = () => ({ lines: [], member: null, disc: 0, pts: 0, seller: null });
let CART = newCart(), POSF = { q: '', cat: '' }, PAY = null;
try { const c = JSON.parse(localStorage.getItem('bis-cart')); if (c && c.lines) CART = c; } catch (e) {}
const saveCart = () => localStorage.setItem('bis-cart', JSON.stringify(CART));
const voucher = code => S.vouchers.find(v => v.code === String(code).toUpperCase());
const focusScan = () => { const q = $('#q'); if (q && matchMedia('(pointer:fine)').matches) q.focus(); };

function activePromos() { const d = dstr(Date.now()); return S.promos.filter(p => p.active && (!p.from || p.from <= d) && (!p.to || p.to >= d)); }
function promoHits(p, l) {
  const pr = l.pid && prod(l.pid); if (!pr || pr.noDisc) return false;
  return p.scope === 'all' || (p.scope === 'cat' && pr.cat === p.target) || (p.scope === 'prod' && pr.id === p.target);
}
// Calcula el ticket: dto. de línea → promociones → dto. general / nivel de socio → canje de puntos.
function calcCart(c) {
  const m = c.member && member(c.member), lv = m ? mLevel(m) : null;
  const g = Math.max(num(c.disc), lv ? lv.disc : 0), promos = activePromos();
  const ls = c.lines.map(l => ({ ...l, gross: r2(l.price * l.qty), manual: 0, promo: 0, promoName: '', gdisc: 0 }));
  ls.forEach(l => {
    l.manual = r2(l.gross * (l.disc || 0) / 100);
    if (!l.disc) {
      let best = null; promos.filter(p => p.type === 'pct' && promoHits(p, l)).forEach(p => { if (!best || p.pct > best.pct) best = p; });
      if (best) { l.promo = r2(l.gross * best.pct / 100); l.promoName = best.name; }
    }
  });
  promos.filter(p => p.type === 'nxm').forEach(p => {
    const units = [];
    ls.forEach((l, i) => { if (!l.disc && !l.promo && l.qty > 0 && Number.isInteger(l.qty) && promoHits(p, l)) for (let k = 0; k < l.qty; k++) units.push({ i, price: l.price }); });
    const free = Math.floor(units.length / p.n) * (p.n - p.m);
    units.sort((a, b) => a.price - b.price).slice(0, Math.max(free, 0)).forEach(u => { ls[u.i].promo = r2(ls[u.i].promo + u.price); ls[u.i].promoName = p.name; });
  });
  ls.forEach(l => {
    const base = l.gross - l.manual - l.promo, pr = l.pid && prod(l.pid);
    if (g && !l.promo && !l.disc && !(pr && pr.noDisc)) l.gdisc = r2(base * g / 100);
    l.total = r2(base - l.gdisc);
  });
  const gross = r2(sum(ls, 'gross')), sub = r2(sum(ls, 'total'));
  let ptsValue = 0, pts = 0;
  if (c.pts && m && S.cfg.points.on) {
    pts = Math.min(c.pts, m.points); ptsValue = r2(pts * S.cfg.points.value);
    if (ptsValue > sub) { ptsValue = sub; pts = Math.ceil(sub / S.cfg.points.value - 1e-9); }
    let left = ptsValue; const pos = ls.filter(l => l.total > 0);
    pos.forEach((l, i) => { const d = i === pos.length - 1 ? left : Math.min(left, r2(ptsValue * l.total / sub)); l.total = r2(l.total - d); left = r2(left - d); });
  }
  ls.forEach(l => l.dto = r2(l.gross - l.total));
  const total = r2(sum(ls, 'total'));
  return { lines: ls, gross, sub, g, ptsValue, pts, total, discount: r2(gross - total), member: m, level: lv };
}

V.pos = () => {
  $('#main').innerHTML = `<div class="pos" id="pos"><div class="pos-l">
    <div class="row"><input id="q" class="grow" placeholder="${L('🔍 Escanear código o buscar producto / cliente…', '🔍 扫码,或搜索商品 / 会员…')}" value="${esc(POSF.q)}" oninput="A.q(this.value)" onkeydown="if(event.key==='Enter'){A.scan(this.value)}" autocomplete="off">
    <button onclick="A.freeItem()">✎ ${L('Artículo libre', '手输商品')}</button></div>
    <div class="cats" id="cats"></div><div class="gridp" id="grid"></div></div>
    <div class="pos-r" id="cart"></div>
    <button class="pri cartfab" onclick="$('#pos').classList.add('showcart')" id="fab"></button></div>`;
  drawCats(); drawGrid(); drawCart(); focusScan();
};
function drawCats() {
  $('#cats').innerHTML = `<button class="${POSF.cat ? '' : 'on'}" onclick="A.cat('')">${L('Todo', '全部')}</button>` +
    S.cats.map(c => `<button class="${POSF.cat === c.id ? 'on' : ''}" onclick="A.cat('${c.id}')">${esc(catName(c.id))}</button>`).join('');
}
function matchProducts() {
  const q = POSF.q.trim().toLowerCase();
  return S.products.filter(p => p.active !== false && (!POSF.cat || p.cat === POSF.cat) &&
    (!q || (p.name + ' ' + (p.zh || '') + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().includes(q)));
}
function drawGrid() {
  const ps = matchProducts().slice(0, 150);
  $('#grid').innerHTML = ps.length ? ps.map(p => `<button class="tile" onclick="A.add('${p.id}')">
    <div class="im" ${p.img ? `style="background-image:url(${p.img})"` : ''}>${p.img ? '' : esc(pname(p).slice(0, 1).toUpperCase())}</div>
    <span class="st ${p.stock <= 0 ? 'low' : ''}">${p.stock}</span><div class="nm">${esc(pname(p))}</div><div class="pr">${eur(p.price)}</div></button>`).join('')
    : `<div class="empty" style="grid-column:1/-1">${L('Sin resultados', '没有找到商品')}</div>`;
}
function drawCart() {
  const c = calcCart(CART), m = c.member; saveCart();
  const nItems = sum(c.lines, 'qty');
  let h = m ? `<div class="mbar"><div class="grow"><b>${esc(m.name)}</b> <span class="tag gold">${esc(c.level.name)}${c.level.disc ? ' -' + c.level.disc + '%' : ''}</span>${isBirthday(m) ? ' 🎂' : ''}<br>
      <span class="small">⭐ ${m.points} ${L('pts', '积分')} · 💳 ${eur(m.balance)}</span></div>
      <button class="sm" onclick="A.memberView('${m.id}')">${L('Ficha', '详情')}</button><button class="sm" onclick="A.setMember(null)">✕</button></div>`
    : `<div class="mbar none"><span class="grow muted">${L('Sin cliente', '未选择会员')}</span><button class="sm" onclick="A.pickMember()">👤 ${L('Cliente', '选择会员')}</button></div>`;
  h += `<div class="lines">` + (c.lines.length ? c.lines.map((l, i) => `<div class="line">
      <div class="nm" onclick="A.editLine(${i})">${esc(l.name)}<br><span class="small muted">${eur(l.price)}${l.disc ? ' · -' + l.disc + '%' : ''}</span></div>
      <div class="qty"><button onclick="A.qty(${i},-1)">−</button><b>${l.qty}</b><button onclick="A.qty(${i},1)">+</button></div>
      <div class="b num r" style="min-width:70px">${eur(l.total)}</div>
      ${l.dto ? `<div class="sub">${l.promoName ? '🏷️ ' + esc(l.promoName) + ' ' : ''}${L('Descuento', '优惠')} -${eur(l.dto)}</div>` : ''}</div>`).join('')
    : `<div class="empty">${L('Escanee o toque un producto para empezar', '扫码或点击商品开始收银')}</div>`) + '</div>';
  if (S.users.length > 1) h += `<div class="seller" onclick="A.pickSeller()">🧑 ${L('Vendedor', '销售员')}: <b>${esc(sellerOf().name)}</b> ▾</div>`;
  h += `<div class="tot">${c.discount ? `<div class="lr"><span>${L('Importe', '原价')}</span><span>${eur(c.gross)}</span></div><div class="lr" style="color:var(--ok)"><span>${L('Descuentos', '优惠')}${c.g ? ' (' + c.g + '%)' : ''}${c.pts ? ' · ' + c.pts + L(' pts', ' 积分') : ''}</span><span>-${eur(c.discount)}</span></div>` : ''}
    <div class="lr g"><span>${L('TOTAL', '合计')} <span class="small muted" style="font-weight:400">${nItems} ${L('art.', '件')}</span></span><span class="num">${eur(c.total)}</span></div></div>
    <div class="acts"><button onclick="A.discount()">％ ${L('Dto.', '折扣')}</button><button onclick="A.usePoints()" ${m && S.cfg.points.on ? '' : 'disabled'}>⭐ ${L('Puntos', '积分')}</button>
    <button onclick="A.park()">⏸ ${L('Aparcar', '挂单')}${S.parked.length ? ' (' + S.parked.length + ')' : ''}</button><button class="bad" onclick="A.clearCart()">🗑</button></div>
    <button class="ok big paybtn" onclick="A.pay()">${L('COBRAR', '收款')} ${eur(c.total)} <span class="small">F9</span></button>
    <button class="backbtn" onclick="$('#pos').classList.remove('showcart')">← ${L('Productos', '返回商品')}</button>`;
  $('#cart').innerHTML = h;
  const fab = $('#fab'); if (fab) fab.textContent = `🛒 ${nItems} · ${eur(c.total)}`;
}
const isBirthday = m => { if (!m.birthday) return false; const n = new Date(), b = new Date(n.getFullYear(), Number(m.birthday.slice(5, 7)) - 1, Number(m.birthday.slice(8, 10))); return Math.abs(b - n) < 7 * 864e5; };

A.q = v => { POSF.q = v; drawGrid(); };
A.cat = c => { POSF.cat = c; drawCats(); drawGrid(); };
A.add = (id, qty = 1) => {
  const p = prod(id); if (!p) return;
  const l = CART.lines.find(l => l.pid === id && !l.disc);
  if (S.cfg.blockNoStock && p.stock < (l ? l.qty : 0) + qty) return toast(L('Sin stock', '库存不足'), true);
  if (l) l.qty += qty; else CART.lines.push({ pid: p.id, name: p.name, sku: p.sku, price: p.price, qty, disc: 0, iva: p.iva ?? S.cfg.iva, cost: p.cost || 0 });
  drawCart(); const li = $('#cart .lines'); if (li) li.scrollTop = li.scrollHeight;
};
// Lo que entra por el lector: producto, tarjeta de cliente, vale o número de ticket.
A.scan = raw => {
  const code = String(raw).trim(); if (!code) return;
  const lc = code.toLowerCase(), clear = () => { POSF.q = ''; const q = $('#q'); if (q) q.value = ''; drawGrid(); };
  const p = S.products.find(p => p.active !== false && ((p.barcode && p.barcode === code) || p.sku.toLowerCase() === lc));
  if (p) { A.add(p.id); return clear(); }
  const m = S.members.find(m => m.code.toLowerCase() === lc || (m.phone && m.phone.replace(/\s/g, '') === code.replace(/\s/g, '')));
  if (m) { A.setMember(m.id); return clear(); }
  const v = voucher(code);
  if (v) { clear(); return A.voucherView(v.code); }
  const s = S.sales.find(s => s.no.toLowerCase() === lc);
  if (s) { clear(); return A.saleView(s.id); }
  const list = matchProducts();
  if (list.length === 1) { A.add(list[0].id); return clear(); }
  if (!list.length) toast(L('Código no encontrado: ', '未找到:') + code, true);
};
A.qty = (i, d) => { const l = CART.lines[i]; l.qty += d; if (l.qty <= 0) CART.lines.splice(i, 1); drawCart(); };
A.clearCart = () => { if (CART.lines.length && !confirm(L('¿Vaciar el ticket?', '清空当前单据?'))) return; CART = newCart(); drawCart(); };
A.editLine = i => {
  const l = CART.lines[i];
  modal(`<h3>${esc(l.name)}</h3><div class="grid3">${fld(L('Cantidad', '数量'), 'e-q', l.qty, 'inputmode="decimal" autofocus')}${fld(L('Precio', '单价'), 'e-p', l.price, 'inputmode="decimal"')}${fld(L('Dto. %', '折扣 %'), 'e-d', l.disc || '', 'inputmode="decimal"')}</div>
    ${mfoot(`<button class="bad" onclick="A.qty(${i},-1e9);closeModal()">${L('Quitar', '删除')}</button>`, btnClose(), `<button class="pri" data-enter onclick="A.saveLine(${i})">OK</button>`)}`);
};
// Comprueba permisos; si falta alguno pide autorización y vuelve a intentarlo.
function discOk(d, retry) {
  if (d < 0 || d > 100) return false;
  if (d > 0 && !needPerm('disc', retry)) return false;
  if (d > maxDisc() && !needPerm('discMax', retry)) return false;
  return true;
}
A.saveLine = (i, v) => {
  const l = CART.lines[i]; if (!l) return;
  v = v || { q: num(fv('e-q')), p: r2(num(fv('e-p'))), d: num(fv('e-d')) };
  const retry = () => A.saveLine(i, v);
  if (v.q <= 0 || v.p < 0) return;
  if (v.d !== (l.disc || 0) && !discOk(v.d, retry)) return;
  if (v.p !== l.price && l.pid && !needPerm('price', retry)) return;
  l.qty = v.q; l.price = v.p; l.disc = v.d; closeModal(); drawCart();
};
A.freeItem = () => modal(`<h3>✎ ${L('Artículo libre', '手输商品')}</h3>${fld(L('Descripción', '名称'), 'f-n', 'Artículo', 'autofocus')}
  <div class="grid2">${fld(L('Precio (IVA incl.)', '价格(含税)'), 'f-p', '', 'inputmode="decimal"')}${fld('IVA %', 'f-i', S.cfg.iva, 'inputmode="decimal"')}</div>
  ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.addFree()">${L('Añadir', '添加')}</button>`)}`);
A.addFree = () => { const p = num(fv('f-p')); if (p <= 0) return; CART.lines.push({ pid: null, name: fv('f-n') || 'Artículo', sku: '', price: r2(p), qty: 1, disc: 0, iva: num(fv('f-i')), cost: 0 }); closeModal(); drawCart(); };
A.discount = () => modal(`<h3>％ ${L('Descuento general', '整单折扣')}</h3>${fld('%', 'd-g', CART.disc || '', 'inputmode="decimal" autofocus')}
  <div class="row">${[5, 10, 15, 20, 30, 50].map(n => `<button onclick="$('#d-g').value=${n}">${n}%</button>`).join('')}</div>
  <p class="small muted">${L('No se suma a promociones ni a descuentos de línea. Si el cliente tiene descuento de nivel se aplica el mayor.', '不与促销、单品折扣叠加。会员有等级折扣时取较大者。')}</p>
  ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.setDisc()">OK</button>`)}`);
A.setDisc = d => { d = d ?? num(fv('d-g')); if (d && !discOk(d, () => A.setDisc(d))) return; CART.disc = d; closeModal(); drawCart(); };
A.usePoints = () => {
  const m = member(CART.member), P = S.cfg.points;
  if (m.points < P.min) return toast(L(`Mínimo ${P.min} puntos para canjear`, `满 ${P.min} 积分才能抵扣`), true);
  const c = calcCart({ ...CART, pts: 0 }), max = Math.min(m.points, Math.ceil(c.total / P.value - 1e-9));
  modal(`<h3>⭐ ${L('Canjear puntos', '积分抵扣')}</h3><p>${esc(m.name)}: <b>${m.points}</b> ${L('puntos', '积分')} = ${eur(m.points * P.value)}</p>
    ${fld(L('Puntos a usar', '使用积分'), 'p-n', CART.pts || max, 'inputmode="numeric" autofocus')}
    ${mfoot(`<button onclick="CART.pts=0;closeModal();drawCart()">${L('No usar', '不使用')}</button>`, `<button class="pri" data-enter onclick="CART.pts=Math.max(0,Math.min(${max},Math.floor(num(fv('p-n')))));closeModal();drawCart()">OK</button>`)}`);
};
A.park = () => {
  if (CART.lines.length) { S.parked.push({ ts: Date.now(), cart: CART, user: USER.name }); CART = newCart(); dirty('parked'); drawCart(); return toast(L('Ticket aparcado', '已挂单')); }
  if (!S.parked.length) return toast(L('No hay tickets aparcados', '没有挂单'));
  modal(`<h3>⏸ ${L('Tickets aparcados', '挂单列表')}</h3><table class="t">${S.parked.map((p, i) => `<tr class="click" onclick="A.unpark(${i})"><td>${fdt(p.ts)}</td><td>${p.cart.member ? esc(member(p.cart.member)?.name || '') : ''}</td><td>${sum(p.cart.lines, 'qty')} ${L('art.', '件')}</td><td class="r b">${eur(calcCart(p.cart).total)}</td></tr>`).join('')}</table>${mfoot(btnClose())}`);
};
A.unpark = i => { CART = S.parked.splice(i, 1)[0].cart; dirty('parked'); closeModal(); drawCart(); };
A.setMember = id => { CART.member = id; CART.pts = 0; if (VIEW === 'pos') drawCart(); else A.go('pos'); if (id && isBirthday(member(id))) toast('🎂 ' + L('¡Cumpleaños del cliente esta semana!', '该会员本周生日!')); };
A.pickMember = () => {
  modal(`<h3>👤 ${L('Elegir cliente', '选择会员')}</h3><input id="pm-q" autofocus placeholder="${L('Nombre, teléfono o nº de tarjeta', '姓名、电话或卡号')}" oninput="A.pmList(this.value)">
    <div id="pm-l" style="max-height:46vh;overflow:auto;margin-top:8px"></div>${mfoot(`<button onclick="A.memberEdit('',1)">＋ ${L('Nuevo cliente', '新会员')}</button>`, btnClose())}`);
  A.pmList('');
};
A.pmList = q => {
  q = q.toLowerCase().trim();
  const r = S.members.filter(m => !q || (m.name + ' ' + m.phone + ' ' + m.code + ' ' + (m.email || '')).toLowerCase().includes(q)).slice(0, 30);
  $('#pm-l').innerHTML = r.length ? `<table class="t">${r.map(m => `<tr class="click" onclick="closeModal();A.setMember('${m.id}')"><td><b>${esc(m.name)}</b><br><span class="small muted">${esc(m.phone)} · ${m.code}</span></td><td class="r small">⭐ ${m.points}<br>💳 ${eur(m.balance)}</td></tr>`).join('')}</table>` : `<div class="empty">${L('Sin clientes', '没有会员')}</div>`;
};

// ───────── Cobro ─────────
function needSession(then) {
  if (curSession()) return true;
  modal(`<h3>💶 ${L('Abrir caja', '开钱箱(开班)')}</h3><p class="muted">${L('Para vender hay que abrir la caja con el fondo de cambio.', '开始收银前请先开班,输入备用金。')}</p>
    ${fld(L('Fondo inicial en efectivo', '备用金(现金)'), 'os-f', (S.sessions[S.sessions.length - 1] || {}).nextFloat || '', 'inputmode="decimal" autofocus placeholder="0,00"')}
    ${mfoot(btnClose(), `<button class="pri" data-enter id="os-b">${L('Abrir caja', '开班')}</button>`)}`);
  $('#os-b').onclick = () => {
    S.sessions.push({ id: uid(), openTs: Date.now(), openUser: USER.name, float: r2(num(fv('os-f'))), moves: [] }); dirty('sessions');
    closeModal(); if (then) then(); else render();
  };
  return false;
}
A.pay = () => {
  if (!CART.lines.length) return toast(L('El ticket está vacío', '单据是空的'));
  if (!needSession(A.pay)) return;
  PAY = { pays: [], inp: '', given: 0, change: 0 }; payModal();
};
function payModal() {
  const c = calcCart(CART), rem = r2(c.total - sum(PAY.pays, 'amount')), m = c.member;
  const quick = [...new Set([rem, Math.ceil(rem / 5) * 5, Math.ceil(rem / 10) * 10, Math.ceil(rem / 20) * 20, Math.ceil(rem / 50) * 50])].filter(x => x > 0).slice(0, 5);
  modal(`<h3 data-lock>${L('Cobrar', '收款')}</h3><div class="paygrid"><div>
    <div class="muted">${L('Pendiente', '待收')}</div><div class="bigamt">${eur(rem)}</div>
    ${PAY.pays.map(p => `<div class="row between"><span>${pmName(p.m)} ${p.code || ''}</span><b>${eur(p.amount)}</b></div>`).join('')}
    <label class="f" style="margin-top:10px"><span>${L('Importe entregado (vacío = exacto)', '实收金额(留空 = 刚好)')}</span><input id="pay-in" value="${esc(PAY.inp)}" inputmode="decimal" oninput="PAY.inp=this.value" autofocus></label>
    <div class="row">${quick.map(x => `<button onclick="A.payKey('=${x}')">${eur(x)}</button>`).join('')}</div>
    ${rem > 0 ? `<div class="methods"><button class="ok" onclick="A.payWith('cash')">💶 ${pmName('cash')}</button><button class="pri" onclick="A.payWith('card')">💳 ${pmName('card')}</button>
    <button onclick="A.payWith('bizum')">📱 Bizum</button><button onclick="A.payWith('vale')">🎁 ${pmName('vale')}</button>
    ${m ? `<button class="gold" style="grid-column:1/-1" onclick="A.payWith('saldo')" ${m.balance > 0 ? '' : 'disabled'}>👤 ${pmName('saldo')} (${eur(m.balance)})</button>` : ''}</div>`
      : `<button class="ok big" style="width:100%;margin-top:10px" onclick="finishSale()">${L('Finalizar', '完成')}</button>`}
    </div><div><div class="keys">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', ',', '⌫'].map(k => `<button onclick="A.payKey('${k}')">${k}</button>`).join('')}</div></div></div>
    ${mfoot(`<button onclick="closeModal()">${L('Cancelar', '取消')}</button>`)}`, true);
}
A.payKey = k => {
  if (k[0] === '=') PAY.inp = k.slice(1).replace('.', ','); else if (k === '⌫') PAY.inp = PAY.inp.slice(0, -1); else PAY.inp += k;
  $('#pay-in').value = PAY.inp;
};
A.payWith = (mth, code) => {
  const c = calcCart(CART), rem = r2(c.total - sum(PAY.pays, 'amount'));
  let amt = PAY.inp ? r2(num(PAY.inp)) : rem;
  if (amt <= 0) return;
  const p = { m: mth, amount: Math.min(amt, rem) };
  if (mth === 'cash') { if (amt >= rem) { PAY.given = r2(sum(PAY.pays.filter(x => x.m === 'cash'), 'amount') + amt); PAY.change = r2(amt - rem); } }
  if (mth === 'saldo') {
    const free = r2(c.member.balance - sum(PAY.pays.filter(x => x.m === 'saldo'), 'amount'));
    if (free <= 0) return toast(L('Saldo insuficiente', '余额不足'), true);
    p.amount = Math.min(p.amount, free);
  }
  if (mth === 'vale') {
    if (!code) {
      return modal(`<h3 data-lock>🎁 ${L('Código del vale o tarjeta regalo', '代金券 / 礼品卡号码')}</h3><input id="v-code" autofocus placeholder="${L('Escanear o escribir', '扫码或输入')}">
        ${mfoot(`<button onclick="payModal()">${L('Volver', '返回')}</button>`, `<button class="pri" data-enter onclick="A.payWith('vale',fv('v-code')||' ')">OK</button>`)}`);
    }
    const v = voucher(code.trim()), free = v ? r2(v.balance - sum(PAY.pays.filter(x => x.code === v.code), 'amount')) : 0;
    if (!v) { payModal(); return toast(L('Vale no encontrado', '找不到该券'), true); }
    if (v.expires < Date.now()) { payModal(); return toast(L('Vale caducado', '该券已过期'), true); }
    if (free <= 0) { payModal(); return toast(L('Vale sin saldo', '该券已用完'), true); }
    p.amount = Math.min(p.amount, free); p.code = v.code;
  }
  PAY.pays.push(p); PAY.inp = '';
  if (r2(c.total - sum(PAY.pays, 'amount')) <= 0) finishSale(); else payModal();
};
function finishSale() {
  const c = calcCart(CART), m = c.member, now = Date.now(), seller = sellerOf();
  if (r2(c.total - sum(PAY.pays, 'amount')) > 0) return;
  const s = {
    id: uid(), no: nextNo('T'), type: 'sale', ts: now, user: USER.id, userName: USER.name, session: curSession().id,
    member: m ? m.id : null, memberName: m ? m.name : '', seller: seller.id, sellerName: seller.name,
    lines: c.lines.map(l => { const x = { pid: l.pid, name: l.name, sku: l.sku, cat: (l.pid && prod(l.pid) || {}).cat || '', qty: l.qty, price: l.price, iva: l.iva, cost: l.cost, total: l.total, dto: l.dto, promoName: l.promoName, returned: 0 }; x.comm = commFor(seller, x); return x; }),
    gross: c.gross, discount: c.discount, ptsUsed: c.pts, ptsValue: c.ptsValue, total: c.total,
    pays: PAY.pays, given: PAY.given, change: PAY.change, ptsEarned: 0
  };
  s.lines.forEach(l => { const p = l.pid && prod(l.pid); if (p) stockMove(p, -l.qty, 'sale', s.no); });
  PAY.pays.filter(p => p.m === 'vale').forEach(p => { const v = voucher(p.code); v.balance = r2(v.balance - p.amount); v.log.push({ ts: now, amount: -p.amount, ref: s.no }); dirty('vouchers'); });
  if (m) {
    const saldo = sum(PAY.pays.filter(p => p.m === 'saldo'), 'amount');
    if (saldo) { m.balance = r2(m.balance - saldo); mlogAdd(m, 'pay', { amount: -saldo, ref: s.no, bal: m.balance }); }
    if (c.pts) { m.points -= c.pts; mlogAdd(m, 'redeem', { points: -c.pts, ref: s.no, pts: m.points }); }
    if (S.cfg.points.on) { s.ptsEarned = Math.floor(c.total * S.cfg.points.earn * (c.level.mult || 1) + 1e-9); if (s.ptsEarned) { m.points += s.ptsEarned; mlogAdd(m, 'earn', { points: s.ptsEarned, ref: s.no, pts: m.points }); } }
    m.spent = r2((m.spent || 0) + c.total); m.visits = (m.visits || 0) + 1; m.lastVisit = now;
    s.ptsAfter = m.points; s.balAfter = m.balance; dirty('members');
  }
  s.comm = r2(sum(s.lines, 'comm'));
  S.sales.push(s); dirty('sales', s);
  CART = newCart(); saveCart(); OVR = null;
  if (s.pays.some(p => p.m === 'cash')) openDrawer(true);
  afterSale(s);
  if (S.cfg.autoPrint) printDoc(ticketHtml(s));
  if (VIEW === 'pos') { drawCart(); drawGrid(); }
}
function afterSale(s) {
  modal(`<h3>✅ ${L('Venta cobrada', '收款成功')} · ${s.no}</h3>
    ${s.change ? `<div class="change">${L('Cambio', '找零')}: ${eur(s.change)}</div>` : `<div class="change">${eur(s.total)}</div>`}
    ${s.ptsEarned ? `<p class="c">⭐ +${s.ptsEarned} ${L('puntos', '积分')} → ${s.ptsAfter}</p>` : ''}
    <div class="methods"><button onclick="printDoc(ticketHtml(S.sales.find(x=>x.id==='${s.id}')))">🧾 ${L('Ticket', '打印小票')}</button>
    <button onclick="printDoc(ticketHtml(S.sales.find(x=>x.id==='${s.id}'),true))">🎁 ${L('Ticket regalo', '礼品小票')}</button>
    <button onclick="A.invoice('${s.id}')">📄 ${L('Factura', '开发票')}</button>
    <button class="pri" data-enter onclick="closeModal()">${L('Nueva venta', '下一单')}</button></div>`);
}
