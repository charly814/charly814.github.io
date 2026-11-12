'use strict';
// Documentos impresos. Siempre en español (son documentos para el cliente / Hacienda).
const PME = m => (PM[m] ? PM[m][0] : m);
const lr = (l, r, cls = '') => `<div class="lr ${cls}"><span>${l}</span><span>${r}</span></div>`;
function tkHead(title) {
  const s = S.cfg.shop;
  return `<div class="c b big">${esc(s.name)}</div>${s.nif ? `<div class="c">NIF: ${esc(s.nif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}${s.city ? `<div class="c">${esc(s.city)}</div>` : ''}${s.phone ? `<div class="c">Tel. ${esc(s.phone)}</div>` : ''}
    <hr><div class="c b">${title}</div>`;
}
function ivaBreak(lines) {
  const g = {};
  lines.forEach(l => { const k = l.iva ?? S.cfg.iva; g[k] = (g[k] || 0) + l.total; });
  return Object.keys(g).map(k => { const tot = r2(g[k]), base = r2(tot / (1 + k / 100)); return { rate: Number(k), base, iva: r2(tot - base), total: tot }; });
}
function ticketHtml(s, gift) {
  const ret = s.type === 'return';
  let h = `<div class="tk">` + tkHead(gift ? 'TICKET REGALO' : ret ? 'DEVOLUCIÓN' : 'FACTURA SIMPLIFICADA');
  h += lr('Nº ' + s.no, fdt(s.ts)) + lr('Le atendió: ' + esc(s.userName || ''), '');
  if (ret) h += `<div>Ticket original: ${s.ref}</div>`;
  if (s.memberName && !gift) h += `<div>Cliente: ${esc(s.memberName)}</div>`;
  h += '<hr>';
  s.lines.forEach(l => {
    h += `<div>${esc(l.name)}</div>`;
    if (gift) h += lr('&nbsp;&nbsp;' + l.qty + ' ud.', l.sku ? esc(l.sku) : '');
    else {
      h += lr('&nbsp;&nbsp;' + l.qty + ' x ' + eur(l.price), eur(l.price * l.qty));
      if (l.dto) h += lr('&nbsp;&nbsp;Dto.' + (l.promoName ? ' ' + esc(l.promoName) : ''), '-' + eur(l.dto));
    }
  });
  h += '<hr>';
  if (gift) {
    const until = s.ts + S.cfg.returnDays * 864e5;
    h += `<div class="c">Este ticket no muestra precios.<br>Válido para cambios hasta el <b>${fd(until)}</b>.</div>`;
  } else {
    if (s.ptsValue) h += lr('Canje ' + s.ptsUsed + ' puntos', '(incluido) -' + eur(s.ptsValue));
    h += lr('TOTAL', eur(s.total), 'xl');
    h += '<hr>' + ivaBreak(s.lines).map(b => lr(`Base ${eur(b.base)} · IVA ${b.rate}%`, eur(b.iva))).join('') + '<div class="c">IVA incluido</div><hr>';
    s.pays.forEach(p => { h += lr(PME(p.m) + (p.code ? ' ' + p.code : ''), eur(p.m === 'cash' && s.given ? s.given : p.amount)); });
    if (s.change) h += lr('Cambio', eur(s.change));
    if (s.vcode) h += `<hr><div class="c b">VALE DE COMPRA ${eur(-s.total)}</div>` + barcode(s.vcode) + `<div class="c">Válido hasta ${fd(voucher(s.vcode)?.expires || 0)}</div>`;
    const m = s.member && member(s.member);
    if (m) {
      h += '<hr>';
      if (s.ptsEarned) h += lr('Puntos ' + (s.ptsEarned > 0 ? 'ganados' : 'descontados'), (s.ptsEarned > 0 ? '+' : '') + s.ptsEarned);
      h += lr('Puntos acumulados', s.ptsAfter ?? m.points) + lr('Saldo disponible', eur(s.balAfter ?? m.balance));
    }
    if (!ret) h += `<hr><div class="c">${esc(S.cfg.returnText.replace('{d}', S.cfg.returnDays))}</div>`;
  }
  h += `<div class="c" style="margin-top:6px">${esc(S.cfg.footer)}</div>` + barcode(s.no) + '<div>&nbsp;</div></div>';
  return h;
}
function topupHtml(s) {
  return `<div class="tk">${tkHead('RECARGA DE SALDO')}${lr('Nº ' + s.no, fdt(s.ts))}<div>Cliente: ${esc(s.memberName)}</div><hr>
    ${lr('Importe recargado', eur(s.total))}${s.bonus ? lr('Regalo', '+' + eur(s.bonus)) : ''}${lr('Forma de pago', PME(s.pays[0].m))}<hr>
    ${lr('SALDO ACTUAL', eur(s.balAfter), 'big b')}<hr><div class="c">El saldo no es reembolsable en efectivo.<br>${esc(S.cfg.footer)}</div><div>&nbsp;</div></div>`;
}
function voucherHtml(v) {
  return `<div class="tk">${tkHead(v.type === 'gift' ? 'TARJETA REGALO' : 'VALE DE COMPRA')}<div class="c xl" style="margin:8px 0">${eur(v.balance)}</div>
    ${barcode(v.code, 50)}<hr>${lr('Emitido', fd(v.ts))}${lr('Válido hasta', fd(v.expires))}${v.balance !== v.amount ? lr('Importe inicial', eur(v.amount)) : ''}
    <hr><div class="c">Canjeable por artículos de la tienda. No reembolsable en efectivo. Se puede usar en varias compras.</div><div>&nbsp;</div></div>`;
}
function invoiceHtml(inv) {
  const s = S.sales.find(x => x.id === inv.saleId), sh = S.cfg.shop, c = inv.customer;
  const rows = s.lines.map(l => {
    const base = r2(l.total / (1 + l.iva / 100));
    return `<tr><td>${esc(l.sku || '')}</td><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${eur(base / l.qty)}</td><td class="r">${l.iva}%</td><td class="r">${eur(base)}</td></tr>`;
  }).join('');
  const br = ivaBreak(s.lines);
  return `<div class="inv"><div class="hd"><div><h1>${inv.rect ? 'FACTURA RECTIFICATIVA' : 'FACTURA'}</h1><div><b>Nº:</b> ${inv.no}</div><div><b>Fecha:</b> ${fd(inv.ts)}</div>
    <div><b>Ticket:</b> ${s.no}</div>${inv.rect ? `<div><b>Rectifica a:</b> ${inv.rect} (devolución de mercancía)</div>` : ''}</div>
    <div class="r"><b style="font-size:16px">${esc(sh.name)}</b><br>NIF: ${esc(sh.nif)}<br>${esc(sh.address)}<br>${esc(sh.city)}<br>${esc(sh.phone)} ${esc(sh.email)}</div></div>
    <div class="box" style="margin-top:14px;width:55%"><b>Cliente</b><br>${esc(c.name)}<br>NIF/CIF: ${esc(c.nif)}<br>${esc(c.address)}</div>
    <table><tr><th>Ref.</th><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">IVA</th><th class="r">Importe</th></tr>${rows}</table>
    <table style="width:50%;margin-left:50%"><tr><th>Base imponible</th><th class="r">IVA</th><th class="r">Cuota</th></tr>
    ${br.map(b => `<tr><td>${eur(b.base)}</td><td class="r">${b.rate}%</td><td class="r">${eur(b.iva)}</td></tr>`).join('')}
    <tr><td colspan="2"><b>TOTAL FACTURA</b></td><td class="r"><b>${eur(s.total)}</b></td></tr></table>
    <p>Forma de pago: ${s.pays.map(p => PME(p.m)).join(', ')}</p></div>`;
}
function sessionHtml(ss, title) {
  const t = sessionTotals(ss);
  let h = `<div class="tk">${tkHead(title)}${lr('Apertura', fdt(ss.openTs))}${ss.closeTs ? lr('Cierre', fdt(ss.closeTs)) : lr('Impreso', fdt(Date.now()))}${lr('Usuario', esc(ss.closeUser || ss.openUser))}<hr>
    ${lr('Ventas (' + t.nSales + ' tickets)', eur(t.sales))}${lr('Devoluciones (' + t.nRet + ')', eur(t.returns))}${lr('VENTA NETA', eur(t.sales + t.returns), 'b')}
    ${lr('Recargas de saldo (' + t.nTop + ')', eur(t.topups))}${lr('Tarjetas regalo vendidas', eur(t.gifts))}<hr><div class="b">Cobros por forma de pago</div>`;
  Object.keys(PM).forEach(m => { if (t.by[m]) h += lr(PME(m), eur(t.by[m])); });
  h += `<hr><div class="b">Efectivo en caja</div>${lr('Fondo inicial', eur(ss.float))}${lr('Cobros en efectivo', eur(t.by.cash || 0))}${lr('Entradas', eur(t.ins))}${lr('Salidas', eur(-t.outs))}${lr('ESPERADO', eur(t.expected), 'b')}`;
  if (ss.closeTs) h += lr('CONTADO', eur(ss.counted), 'b') + lr('DESCUADRE', eur(ss.counted - t.expected), 'b');
  if (ss.moves.length) h += '<hr>' + ss.moves.map(m => lr((m.type === 'in' ? '+ ' : '- ') + esc(m.note || ''), eur(m.amount))).join('');
  h += '<hr><div class="b">IVA</div>' + t.iva.map(b => lr(`${b.rate}%  Base ${eur(b.base)}`, eur(b.iva))).join('') + '<div>&nbsp;</div></div>';
  return h;
}
function sessionTotals(ss) {
  const ops = S.sales.filter(s => s.session === ss.id), by = {};
  ops.forEach(o => o.pays.forEach(p => by[p.m] = r2((by[p.m] || 0) + p.amount)));
  const of = t => ops.filter(o => o.type === t);
  const ins = sum(ss.moves.filter(m => m.type === 'in'), 'amount'), outs = sum(ss.moves.filter(m => m.type === 'out'), 'amount');
  return {
    by, ins, outs, nSales: of('sale').length, nRet: of('return').length, nTop: of('topup').length,
    sales: r2(sum(of('sale'), 'total')), returns: r2(sum(of('return'), 'total')), topups: r2(sum(of('topup'), 'total')), gifts: r2(sum(of('giftcard'), 'total')),
    expected: r2(ss.float + (by.cash || 0) + ins - outs),
    iva: ivaBreak(ops.filter(o => o.type === 'sale' || o.type === 'return').flatMap(o => o.lines))
  };
}
function memberCardHtml(m) {
  return `<div class="mcard"><div><b style="font-size:15pt">${esc(S.cfg.shop.name)}</b><br><span style="font-size:9pt">TARJETA CLIENTE</span></div>
    <div style="font-size:13pt"><b>${esc(m.name)}</b></div><div>${barcode(m.code, 34)}</div></div>`;
}
function labelsHtml(items) { // items: [{p, n}]
  const lb = S.cfg.label, roll = lb.mode === 'roll', w = roll ? lb.w + 'mm' : (100 / lb.cols) + '%', hh = lb.h + 'mm';
  let h = '<div class="labels">';
  items.forEach(it => {
    for (let i = 0; i < it.n; i++) h += `<div class="lab ${roll ? 'roll' : ''}" style="width:${w};height:${hh}"><div class="n">${esc(it.p.name)}</div><div class="p">${eur(it.p.price)}</div>${barcode(it.p.barcode || it.p.sku, 30, false)}<div class="s">${esc(it.p.barcode || it.p.sku)}</div></div>`;
  });
  return h + '</div>';
}
