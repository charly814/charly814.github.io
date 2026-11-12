'use strict';
// ───────── Tickets, devoluciones, facturas, vales ─────────
let SF = { from: dstr(Date.now()), to: dstr(Date.now()), q: '', tab: 'tickets' };
const TYPES = { sale: ['Venta', '销售'], return: ['Devolución', '退货'], topup: ['Recarga', '充值'], giftcard: ['T. regalo', '礼品卡'] };
const dayStart = d => new Date(d + 'T00:00:00').getTime(), dayEnd = d => new Date(d + 'T23:59:59.999').getTime();

V.sales = () => {
  const q = SF.q.toLowerCase().trim();
  let body;
  if (SF.tab === 'tickets') {
    const list = S.sales.filter(s => q ? (s.no + ' ' + s.memberName).toLowerCase().includes(q) : s.ts >= dayStart(SF.from) && s.ts <= dayEnd(SF.to)).reverse().slice(0, 500);
    body = `<table class="t"><tr><th>Nº</th><th>${L('Fecha', '时间')}</th><th>${L('Tipo', '类型')}</th><th>${L('Cliente', '会员')}</th><th>${L('Pago', '付款')}</th><th>${L('Usuario', '员工')}</th><th class="r">${L('Total', '金额')}</th></tr>
      ${list.map(s => `<tr class="click" onclick="A.saleView('${s.id}')"><td>${s.no}${s.invoice ? ' <span class="tag">' + s.invoice + '</span>' : ''}</td><td>${fdt(s.ts)}</td>
      <td><span class="tag ${s.type === 'return' ? 'bad' : s.type === 'sale' ? 'ok' : 'gold'}">${L(...TYPES[s.type])}</span></td><td>${esc(s.memberName || '')}</td>
      <td class="small">${s.pays.map(p => pmName(p.m)).join(' + ')}</td><td class="small">${esc(s.userName)}</td><td class="r b num">${eur(s.total)}</td></tr>`).join('')}</table>
      ${list.length ? `<p class="r b">${L('Venta neta', '净销售额')}: ${eur(sum(list.filter(s => s.type === 'sale' || s.type === 'return'), 'total'))}</p>` : `<div class="empty">${L('No hay tickets en estas fechas', '该日期没有单据')}</div>`}`;
  } else {
    const list = S.invoices.filter(i => !q || (i.no + ' ' + i.customer.name + ' ' + i.customer.nif).toLowerCase().includes(q)).reverse();
    body = `<table class="t"><tr><th>Nº</th><th>${L('Fecha', '日期')}</th><th>${L('Cliente', '客户')}</th><th>NIF</th><th class="r">${L('Total', '金额')}</th></tr>
      ${list.map(i => `<tr class="click" onclick="A.invoicePrint('${i.no}')"><td>${i.no}</td><td>${fd(i.ts)}</td><td>${esc(i.customer.name)}</td><td>${esc(i.customer.nif)}</td><td class="r b">${eur(S.sales.find(s => s.id === i.saleId)?.total)}</td></tr>`).join('')}</table>
      ${list.length ? '' : `<div class="empty">${L('Aún no hay facturas. Se crean desde un ticket.', '还没有发票。在单据里点「开发票」生成。')}</div>`}`;
  }
  $('#main').innerHTML = `<div class="page"><div class="tabs"><button class="${SF.tab === 'tickets' ? 'on' : ''}" onclick="SF.tab='tickets';V.sales()">🧾 Tickets</button><button class="${SF.tab === 'inv' ? 'on' : ''}" onclick="SF.tab='inv';V.sales()">📄 ${L('Facturas', '发票')}</button></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><input type="date" style="width:150px" value="${SF.from}" onchange="SF.from=this.value;V.sales()"><input type="date" style="width:150px" value="${SF.to}" onchange="SF.to=this.value;V.sales()">
    <input class="grow" placeholder="${L('Buscar nº de ticket o cliente (todas las fechas)', '搜索单号或会员(所有日期)')}" value="${esc(SF.q)}" onchange="SF.q=this.value;V.sales()"></div><div class="tablewrap">${body}</div></div></div>`;
};
const saleDoc = s => s.type === 'topup' ? topupHtml(s) : s.type === 'giftcard' ? voucherHtml(voucher(s.vcode)) : ticketHtml(s);
A.saleView = id => {
  const s = S.sales.find(x => x.id === id), isSale = s.type === 'sale';
  const canRet = isSale && s.lines.some(l => l.qty - (l.returned || 0) > 0);
  modal(`<h3>${s.no} <span class="tag">${L(...TYPES[s.type])}</span></h3><div class="preview">${saleDoc(s)}</div>
    ${mfoot(`<button onclick="A.reprint('${id}')">🧾 ${L('Reimprimir', '重打小票')}</button>`,
    isSale ? `<button onclick="A.reprint('${id}',1)">🎁 ${L('Ticket regalo', '礼品小票')}</button>` : '',
    isSale || (s.type === 'return' && s.invoice) ? `<button onclick="A.invoice('${id}')">📄 ${s.invoice ? s.invoice : L('Factura', '开发票')}</button>` : '',
    canRet ? `<button class="bad" onclick="A.returnForm('${id}')">↩ ${L('Devolución', '退货')}</button>` : '', btnClose())}`, true);
};
A.reprint = (id, gift) => { const s = S.sales.find(x => x.id === id); printDoc(gift ? ticketHtml(s, true) : saleDoc(s)); };

// Factura completa a partir de un ticket
A.invoice = id => {
  const s = S.sales.find(x => x.id === id);
  if (s.invoice) return A.invoicePrint(s.invoice);
  const m = s.member && member(s.member) || {};
  modal(`<h3>📄 ${L('Factura del ticket', '为单据开发票')} ${s.no}</h3>${fld(L('Nombre / Razón social', '姓名 / 公司名'), 'i-n', m.fiscalName || m.name || '', 'autofocus')}
    ${fld('NIF / CIF', 'i-f', m.nif || '')}${fld(L('Dirección completa', '完整地址'), 'i-a', m.address || '')}
    <p class="small muted">${L('La numeración de facturas es correlativa y no se puede borrar. Para anular, haga una devolución (genera factura rectificativa).', '发票号码连续,不能删除。要作废请做退货(自动生成更正发票 rectificativa)。')}</p>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.invoiceCreate('${id}')">${L('Crear e imprimir', '生成并打印')}</button>`)}`);
};
A.invoiceCreate = id => {
  const s = S.sales.find(x => x.id === id), c = { name: fv('i-n'), nif: fv('i-f').toUpperCase(), address: fv('i-a') };
  if (!c.name || !c.nif) return toast(L('Nombre y NIF son obligatorios', '姓名和税号必填'), true);
  const inv = { no: nextNo('F', 4), ts: Date.now(), saleId: s.id, customer: c };
  S.invoices.push(inv); s.invoice = inv.no; dirty('invoices'); dirty('sales', s);
  const m = s.member && member(s.member); if (m && !m.nif) { m.nif = c.nif; m.address = m.address || c.address; m.fiscalName = c.name; dirty('members'); }
  closeModal(); A.invoicePrint(inv.no); if (VIEW === 'sales') V.sales();
};
A.invoicePrint = no => printDoc(invoiceHtml(S.invoices.find(i => i.no === no)), 'a4');

// Devolución total o parcial
A.returnForm = id => {
  if (!isAdmin() && !S.cfg.empReturn) return toast(L('Solo el administrador puede hacer devoluciones', '只有管理员可以退货'), true);
  if (!needSession(() => A.returnForm(id))) return;
  const s = S.sales.find(x => x.id === id), late = Date.now() > s.ts + S.cfg.returnDays * 864e5;
  const def = s.pays.length === 1 && ['cash', 'card', 'bizum', 'saldo'].includes(s.pays[0].m) ? s.pays[0].m : 'vale';
  const ms = [['vale', L('Vale de compra', '代金券(店内消费)')], ['cash', pmName('cash')], ['card', pmName('card')], ['bizum', 'Bizum']];
  if (s.member && member(s.member)) ms.push(['saldo', pmName('saldo')]);
  modal(`<h3>↩ ${L('Devolución de', '退货')} ${s.no}</h3>${late ? `<div class="banner">⚠️ ${L(`Fuera del plazo de ${S.cfg.returnDays} días`, `已超过 ${S.cfg.returnDays} 天退货期`)} (${fd(s.ts)})</div>` : ''}
    <table class="t"><tr><th>${L('Artículo', '商品')}</th><th class="r">${L('Pagado/ud.', '实付单价')}</th><th class="r">${L('Disponible', '可退')}</th><th style="width:90px">${L('Devolver', '退货数量')}</th></tr>
    ${s.lines.map((l, i) => { const av = l.qty - (l.returned || 0); return `<tr><td>${esc(l.name)}</td><td class="r">${eur(l.total / l.qty)}</td><td class="r">${av}</td><td><input id="rt-${i}" inputmode="numeric" value="0" ${av > 0 ? '' : 'disabled'} oninput="A.retSum('${id}')"></td></tr>`; }).join('')}</table>
    <div class="row" style="margin:8px 0"><button class="sm" onclick="A.retAll('${id}')">${L('Devolver todo', '全部退货')}</button><span class="grow"></span><span>${L('A devolver', '应退金额')}: <b id="rt-sum" class="bigamt" style="font-size:22px">${eur(0)}</b></span></div>
    <div class="grid2">${sel(L('Forma de devolución', '退款方式'), 'rt-m', ms, def)}<div style="padding-top:22px">${chk(L('Devolver artículos al stock', '商品退回库存'), 'rt-st', true)}</div></div>
    ${mfoot(btnClose(), `<button class="pri" onclick="A.doReturn('${id}')">${L('Confirmar devolución', '确认退货')}</button>`)}`, true);
};
function retRead(s) {
  return s.lines.map((l, i) => { const q = Math.max(0, Math.min(l.qty - (l.returned || 0), Math.floor(num(fv('rt-' + i))))); return { l, q, amt: r2(l.total / l.qty * q) }; }).filter(x => x.q > 0);
}
A.retSum = id => { $('#rt-sum').textContent = eur(sum(retRead(S.sales.find(x => x.id === id)), 'amt')); };
A.retAll = id => { S.sales.find(x => x.id === id).lines.forEach((l, i) => { const e = $('#rt-' + i); if (!e.disabled) e.value = l.qty - (l.returned || 0); }); A.retSum(id); };
A.doReturn = id => {
  const s = S.sales.find(x => x.id === id), items = retRead(s), refund = r2(sum(items, 'amt')), mth = fv('rt-m'), restock = fv('rt-st'), now = Date.now();
  if (!items.length) return toast(L('Indique las unidades a devolver', '请输入退货数量'), true);
  const m = s.member && member(s.member);
  const r = {
    id: uid(), no: nextNo('D'), type: 'return', ts: now, user: USER.id, userName: USER.name, session: curSession().id, ref: s.no, refId: s.id,
    member: s.member, memberName: s.memberName, total: -refund, pays: [{ m: mth, amount: -refund }], ptsEarned: 0,
    lines: items.map(x => ({ pid: x.l.pid, name: x.l.name, sku: x.l.sku, qty: -x.q, price: r2(x.amt / x.q), iva: x.l.iva, cost: x.l.cost, total: -x.amt }))
  };
  items.forEach(x => { x.l.returned = (x.l.returned || 0) + x.q; const p = x.l.pid && prod(x.l.pid); if (p && restock) stockMove(p, x.q, 'return', r.no); });
  if (mth === 'vale') {
    const v = { code: 'V' + String(Math.floor(1e7 + Math.random() * 9e7)), type: 'vale', amount: refund, balance: refund, ts: now, expires: now + S.cfg.valeMonths * 30.5 * 864e5, member: s.member, log: [{ ts: now, amount: refund, ref: r.no }] };
    S.vouchers.push(v); dirty('vouchers'); r.vcode = v.code; r.pays[0].code = v.code;
  }
  if (m) {
    if (mth === 'saldo') { m.balance = r2(m.balance + refund); mlogAdd(m, 'refund', { amount: refund, ref: r.no, bal: m.balance }); }
    if (s.ptsEarned && s.total > 0) { const back = Math.min(m.points, Math.round(s.ptsEarned * refund / s.total)); if (back) { m.points -= back; r.ptsEarned = -back; mlogAdd(m, 'earn', { points: -back, ref: r.no, pts: m.points }); } }
    m.spent = r2(Math.max(0, (m.spent || 0) - refund)); r.ptsAfter = m.points; r.balAfter = m.balance; dirty('members');
  }
  if (s.invoice) { const o = S.invoices.find(i => i.no === s.invoice); const inv = { no: nextNo('R', 4), ts: now, saleId: r.id, customer: o.customer, rect: o.no }; S.invoices.push(inv); r.invoice = inv.no; dirty('invoices'); }
  S.sales.push(r); dirty('sales', r); dirty('sales', s);
  if (mth === 'cash') openDrawer(true);
  closeModal(); toast(L('Devolución registrada', '退货已完成')); printDoc(ticketHtml(r)); A.saleView(r.id); if (VIEW === 'sales') V.sales();
};

// ───────── Vales y tarjetas regalo ─────────
V.vouchers = () => {
  const now = Date.now(), list = [...S.vouchers].reverse();
  $('#main').innerHTML = `<div class="page"><div class="row between" style="margin-bottom:12px"><h2 style="margin:0">🎁 ${L('Vales y tarjetas regalo', '代金券和礼品卡')}</h2><button class="pri" onclick="A.giftForm()">＋ ${L('Vender tarjeta regalo', '出售礼品卡')}</button></div>
    <div class="stats"><div class="stat"><div class="k">${L('Saldo pendiente de canjear', '未使用余额')}</div><div class="v">${eur(sum(list.filter(v => v.expires > now), 'balance'))}</div></div></div>
    <div class="card tablewrap"><table class="t"><tr><th>${L('Código', '号码')}</th><th>${L('Tipo', '类型')}</th><th>${L('Emitido', '发行')}</th><th>${L('Caduca', '到期')}</th><th class="r">${L('Inicial', '面额')}</th><th class="r">${L('Saldo', '余额')}</th></tr>
    ${list.map(v => `<tr class="click" onclick="A.voucherView('${v.code}')"><td><b>${v.code}</b></td><td>${v.type === 'gift' ? L('Tarjeta regalo', '礼品卡') : L('Vale devolución', '退货券')}</td><td>${fd(v.ts)}</td>
      <td>${fd(v.expires)} ${v.expires < now ? `<span class="tag bad">${L('Caducado', '已过期')}</span>` : ''}</td><td class="r">${eur(v.amount)}</td><td class="r b">${eur(v.balance)}</td></tr>`).join('')}</table>
    ${list.length ? '' : `<div class="empty">${L('No hay vales todavía', '还没有券')}</div>`}</div></div>`;
};
A.voucherView = code => {
  const v = voucher(code);
  modal(`<h3>🎁 ${v.code}</h3><div class="preview">${voucherHtml(v)}</div><table class="t" style="margin-top:8px">${v.log.map(l => `<tr><td>${fdt(l.ts)}</td><td>${l.ref}</td><td class="r">${eur(l.amount)}</td></tr>`).join('')}</table>
    ${mfoot(`<button onclick="printDoc(voucherHtml(voucher('${v.code}')))">🖨 ${L('Imprimir', '打印')}</button>`, btnClose())}`);
};
A.giftForm = () => {
  if (!needSession(A.giftForm)) return;
  modal(`<h3>🎁 ${L('Vender tarjeta regalo', '出售礼品卡')}</h3>${fld(L('Importe', '金额'), 'g-a', '', 'inputmode="decimal" autofocus')}
    <div class="row" style="margin-bottom:10px">${[10, 20, 30, 50].map(n => `<button onclick="$('#g-a').value=${n}">${n} €</button>`).join('')}</div>
    ${sel(L('Forma de pago', '付款方式'), 'g-m', [['cash', pmName('cash')], ['card', pmName('card')], ['bizum', 'Bizum']], 'cash')}
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.giftSell()">${L('Cobrar e imprimir', '收款并打印')}</button>`)}`);
};
A.giftSell = () => {
  const a = r2(num(fv('g-a'))), mth = fv('g-m'), now = Date.now(); if (a <= 0) return;
  const s = { id: uid(), no: nextNo('G'), type: 'giftcard', ts: now, user: USER.id, userName: USER.name, session: curSession().id, member: null, memberName: '', lines: [], total: a, pays: [{ m: mth, amount: a }] };
  const v = { code: 'G' + String(Math.floor(1e7 + Math.random() * 9e7)), type: 'gift', amount: a, balance: a, ts: now, expires: now + S.cfg.valeMonths * 30.5 * 864e5, log: [{ ts: now, amount: a, ref: s.no }] };
  s.vcode = v.code; S.vouchers.push(v); S.sales.push(s); dirty('vouchers'); dirty('sales', s);
  if (mth === 'cash') openDrawer(true);
  closeModal(); printDoc(voucherHtml(v)); if (VIEW === 'vouchers') V.vouchers(); A.voucherView(v.code);
};
