'use strict';
// ───────── Caja: apertura, movimientos, cierre ─────────
V.cash = () => {
  const ss = curSession(), hist = S.sessions.filter(s => s.closeTs).reverse().slice(0, 60);
  let h = '<div class="page">';
  if (!ss) h += `<div class="card c"><h2>${L('La caja está cerrada', '当前未开班')}</h2><button class="pri big" onclick="needSession()">💶 ${L('Abrir caja', '开班')}</button></div>`;
  else {
    const t = sessionTotals(ss);
    h += `<div class="stats"><div class="stat"><div class="k">${L('Abierta desde', '开班时间')}</div><div class="v" style="font-size:16px">${fdt(ss.openTs)}</div><div class="k">${esc(ss.openUser)}</div></div>
      <div class="stat"><div class="k">${L('Venta neta', '净销售额')} · ${t.nSales} tickets</div><div class="v">${eur(t.sales + t.returns)}</div></div>
      <div class="stat"><div class="k">${L('Recargas + T. regalo', '充值 + 礼品卡')}</div><div class="v">${eur(t.topups + t.gifts)}</div></div>
      <div class="stat"><div class="k">${L('Efectivo esperado en cajón', '钱箱应有现金')}</div><div class="v" style="color:var(--ok)">${eur(t.expected)}</div></div></div>
      <div class="card"><div class="row" style="margin-bottom:12px"><button onclick="A.moveForm('in')">➕ ${L('Entrada de efectivo', '现金存入')}</button><button onclick="A.moveForm('out')">➖ ${L('Salida / pago', '现金支出')}</button>
      <button onclick="openDrawer()">🔓 ${L('Abrir cajón', '开钱箱')}</button><button onclick="printDoc(sessionHtml(curSession(),'INFORME X (parcial)'))">🖨 ${L('Informe X', 'X 报表')}</button>
      <span class="grow"></span><button class="pri" onclick="A.closeForm()">🔒 ${L('Cerrar caja (Z)', '日结关班 (Z)')}</button></div>
      <table class="t"><tr><th>${L('Forma de pago', '付款方式')}</th><th class="r">${L('Importe', '金额')}</th></tr>${Object.keys(PM).filter(m => t.by[m]).map(m => `<tr><td>${pmName(m)}</td><td class="r b">${eur(t.by[m])}</td></tr>`).join('')}
      <tr><td>${L('Fondo inicial', '备用金')}</td><td class="r">${eur(ss.float)}</td></tr>${ss.moves.map(m => `<tr><td>${m.type === 'in' ? '➕' : '➖'} ${esc(m.note)} <span class="small muted">${fdt(m.ts)} ${esc(m.user)}</span></td><td class="r">${m.type === 'in' ? '' : '-'}${eur(m.amount)}</td></tr>`).join('')}</table></div>`;
  }
  h += `<div class="card tablewrap"><h3>${L('Cierres anteriores', '历史日结')}</h3><table class="t"><tr><th>${L('Apertura', '开班')}</th><th>${L('Cierre', '关班')}</th><th>${L('Usuario', '员工')}</th><th class="r">${L('Venta neta', '净销售')}</th><th class="r">${L('Contado', '实点现金')}</th><th class="r">${L('Descuadre', '差额')}</th></tr>
    ${hist.map(s => `<tr class="click" onclick="A.sessView('${s.id}')"><td>${fdt(s.openTs)}</td><td>${fdt(s.closeTs)}</td><td>${esc(s.closeUser)}</td><td class="r b">${eur(s.net)}</td><td class="r">${eur(s.counted)}</td>
    <td class="r" style="color:${Math.abs(s.diff) >= 0.01 ? 'var(--bad)' : 'var(--ok)'}">${eur(s.diff)}</td></tr>`).join('')}</table>${hist.length ? '' : `<div class="empty">${L('Sin cierres todavía', '还没有日结记录')}</div>`}</div></div>`;
  $('#main').innerHTML = h;
};
A.moveForm = type => modal(`<h3>${type === 'in' ? '➕ ' + L('Entrada de efectivo', '现金存入') : '➖ ' + L('Salida de efectivo', '现金支出')}</h3>
  <div class="grid2">${fld(L('Importe', '金额'), 'mv-a', '', 'inputmode="decimal" autofocus')}${fld(L('Motivo *', '原因 *'), 'mv-n', '', `placeholder="${type === 'in' ? L('Cambio del banco', '银行换零钱') : L('Pago proveedor, retirada…', '付供应商、取现…')}"`)}</div>
  ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.move('${type}')">${L('Guardar', '保存')}</button>`)}`);
A.move = type => {
  const a = r2(num(fv('mv-a'))), n = fv('mv-n'); if (a <= 0 || !n) return toast(L('Importe y motivo obligatorios', '金额和原因必填'), true);
  curSession().moves.push({ ts: Date.now(), type, amount: a, note: n, user: USER.name }); dirty('sessions'); openDrawer(true); closeModal(); V.cash();
};
A.closeForm = () => {
  const ss = curSession(), t = sessionTotals(ss);
  modal(`<h3>🔒 ${L('Cerrar caja', '日结关班')}</h3>${S.users.filter(u => isIn(u.id)).length ? `<div class="banner">⏱ ${L('Siguen fichados (sin salida)', '还没下班打卡')}: ${esc(S.users.filter(u => isIn(u.id)).map(u => u.name).join(', '))}</div>` : ''}${S.parked.length ? `<div class="banner">${L('Hay tickets aparcados sin cobrar', '还有未结的挂单')}: ${S.parked.length}</div>` : ''}
    <table class="t"><tr><td>${L('Venta neta', '净销售额')}</td><td class="r b">${eur(t.sales + t.returns)}</td></tr><tr><td>${L('Efectivo esperado', '应有现金')}</td><td class="r b">${eur(t.expected)}</td></tr></table>
    <div style="margin-top:12px">${fld(L('Efectivo contado en el cajón *', '实际清点的现金 *'), 'cl-c', '', 'inputmode="decimal" autofocus oninput="A.closeCalc()"')}</div>
    <div class="change" id="cl-d" style="font-size:18px">—</div>${fld(L('Efectivo que dejas como fondo para mañana', '留作明天备用金'), 'cl-f', ss.float, 'inputmode="decimal"')}
    ${mfoot(btnClose(), `<button class="pri" onclick="A.close()">${L('Cerrar e imprimir Z', '关班并打印 Z')}</button>`)}`);
};
A.closeCalc = () => { const d = r2(num(fv('cl-c')) - sessionTotals(curSession()).expected), e = $('#cl-d'); e.textContent = L('Descuadre', '差额') + ': ' + (d > 0 ? '+' : '') + eur(d); e.style.color = Math.abs(d) >= 0.01 ? 'var(--bad)' : 'var(--ok)'; };
A.close = () => {
  if (fv('cl-c') === '') return toast(L('Cuente el efectivo', '请输入清点的现金'), true);
  const ss = curSession(), t = sessionTotals(ss);
  Object.assign(ss, { closeTs: Date.now(), closeUser: USER.name, counted: r2(num(fv('cl-c'))), expected: t.expected, net: r2(t.sales + t.returns), nextFloat: r2(num(fv('cl-f'))) });
  ss.diff = r2(ss.counted - t.expected); dirty('sessions'); closeModal(); printDoc(sessionHtml(ss, 'CIERRE DE CAJA (Z)')); V.cash();
  if (Date.now() - S.cfg.lastBackup > 6 * 864e5) setTimeout(() => { if (confirm(L('Hace más de una semana que no hace copia de seguridad. ¿Descargarla ahora?', '已超过一周没有备份数据,现在下载备份吗?'))) A.backup(); }, 1500);
};
A.sessView = id => { const s = S.sessions.find(x => x.id === id); modal(`<h3>${L('Cierre', '日结')} ${fdt(s.closeTs)}</h3><div class="preview">${sessionHtml(s, 'CIERRE DE CAJA (Z)')}</div>${mfoot(`<button onclick="printDoc(sessionHtml(S.sessions.find(x=>x.id==='${id}'),'CIERRE DE CAJA (Z) - COPIA'))">🖨 ${L('Imprimir', '打印')}</button>`, btnClose())}`); };

// ───────── Informes ─────────
let RP = { preset: 'today', from: dstr(Date.now()), to: dstr(Date.now()) };
A.rep = p => {
  const n = new Date(), d = x => dstr(Date.now() - x * 864e5); RP.preset = p;
  if (p === 'today') { RP.from = RP.to = d(0); } else if (p === 'yest') { RP.from = RP.to = d(1); } else if (p === '7') { RP.from = d(6); RP.to = d(0); } else if (p === '30') { RP.from = d(29); RP.to = d(0); }
  else if (p === 'month') { RP.from = dstr(new Date(n.getFullYear(), n.getMonth(), 1)); RP.to = d(0); }
  else if (p === 'quarter') { RP.from = dstr(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)); RP.to = d(0); }
  V.reports();
};
function repData() {
  const ops = S.sales.filter(s => s.ts >= dayStart(RP.from) && s.ts <= dayEnd(RP.to)), sr = ops.filter(o => o.type === 'sale' || o.type === 'return');
  const agg = (keyFn, list = sr.flatMap(o => o.lines.map(l => ({ ...l, o })))) => { const g = {}; list.forEach(l => { const k = keyFn(l); (g[k] = g[k] || { k, qty: 0, total: 0 }); g[k].qty += l.qty; g[k].total = r2(g[k].total + l.total); }); return Object.values(g).sort((a, b) => b.total - a.total); };
  const lines = sr.flatMap(o => o.lines), net = r2(sum(sr, 'total'));
  const base = sum(lines, l => l.total / (1 + l.iva / 100)), cost = sum(lines, l => (l.cost || 0) * l.qty);
  const by = {}; ops.forEach(o => o.pays.forEach(p => by[p.m] = r2((by[p.m] || 0) + p.amount)));
  const days = {}; sr.forEach(o => { const k = dstr(o.ts); (days[k] = days[k] || { k, n: 0, total: 0 }); if (o.type === 'sale') days[k].n++; days[k].total = r2(days[k].total + o.total); });
  const users = {}; sr.forEach(o => { const un = o.sellerName || o.userName; (users[un] = users[un] || { k: un, n: 0, total: 0 }); if (o.type === 'sale') users[un].n++; users[un].total = r2(users[un].total + o.total); });
  const nS = sr.filter(o => o.type === 'sale').length;
  return { ops, sr, lines, net, nS, base, cost, by, days: Object.values(days).sort((a, b) => a.k < b.k ? -1 : 1), users: Object.values(users),
    prods: agg(l => l.name), cats: agg(l => { const p = l.pid && prod(l.pid); return p ? (S.cats.find(c => c.id === p.cat) || {}).name || '—' : '—'; }),
    returns: r2(sum(sr.filter(o => o.type === 'return'), 'total')), topups: r2(sum(ops.filter(o => o.type === 'topup'), 'total')), bonus: r2(sum(ops.filter(o => o.type === 'topup'), 'bonus')), gifts: r2(sum(ops.filter(o => o.type === 'giftcard'), 'total')),
    disc: r2(sum(sr.filter(o => o.type === 'sale'), 'discount')), withMember: sr.filter(o => o.type === 'sale' && o.member).length };
}
const barRow = (label, right, v, max) => `<tr><td>${esc(label)}</td><td style="width:40%"><div class="bar" style="width:${max > 0 ? Math.max(0, v / max * 100) : 0}%"></div></td><td class="r b num">${right}</td></tr>`;
V.reports = () => {
  const d = repData(), P = [['today', 'Hoy', '今天'], ['yest', 'Ayer', '昨天'], ['7', '7 días', '近 7 天'], ['30', '30 días', '近 30 天'], ['month', 'Este mes', '本月'], ['quarter', 'Trimestre', '本季度']];
  const mx = a => Math.max(0, ...a.map(x => x.total));
  $('#main').innerHTML = `<div class="page"><div class="tabs">${P.map(p => `<button class="${RP.preset === p[0] ? 'on' : ''}" onclick="A.rep('${p[0]}')">${L(p[1], p[2])}</button>`).join('')}
    <input type="date" style="width:150px" value="${RP.from}" onchange="RP.from=this.value;RP.preset='';V.reports()"><input type="date" style="width:150px" value="${RP.to}" onchange="RP.to=this.value;RP.preset='';V.reports()">
    <button onclick="A.repCsv()">⬇ CSV</button></div>
    <div class="stats"><div class="stat"><div class="k">${L('Venta neta (IVA incl.)', '净销售额(含税)')}</div><div class="v">${eur(d.net)}</div></div>
    <div class="stat"><div class="k">${L('Tickets', '单数')}</div><div class="v">${d.nS}</div><div class="k">${d.withMember} ${L('con cliente', '单为会员')}</div></div>
    <div class="stat"><div class="k">${L('Ticket medio', '客单价')}</div><div class="v">${eur(d.nS ? d.net / d.nS : 0)}</div></div>
    <div class="stat"><div class="k">${L('Beneficio bruto (sin IVA − coste)', '毛利(不含税 − 成本)')}</div><div class="v" style="color:var(--ok)">${eur(d.base - d.cost)}</div><div class="k">${d.base > 0 ? Math.round((d.base - d.cost) / d.base * 100) : 0}% ${L('margen', '毛利率')}</div></div>
    <div class="stat"><div class="k">${L('Devoluciones', '退货')}</div><div class="v" style="color:var(--bad)">${eur(d.returns)}</div></div>
    <div class="stat"><div class="k">${L('Descuentos dados', '优惠金额')}</div><div class="v">${eur(d.disc)}</div></div>
    <div class="stat"><div class="k">${L('Recargas de saldo', '会员充值')}</div><div class="v">${eur(d.topups)}</div><div class="k">+${eur(d.bonus)} ${L('regalado', '赠送')}</div></div>
    <div class="stat"><div class="k">${L('Tarjetas regalo', '礼品卡销售')}</div><div class="v">${eur(d.gifts)}</div></div></div>
    <div class="grid2" style="gap:14px">
    <div class="card"><h3>${L('Ventas por día', '每日销售')}</h3><table class="t">${d.days.map(x => barRow(fd(dayStart(x.k)) + ' · ' + x.n, eur(x.total), x.total, mx(d.days))).join('') || '<tr><td class="muted">—</td></tr>'}</table></div>
    <div class="card"><h3>${L('Cobros por forma de pago', '按付款方式')}</h3><table class="t">${Object.keys(PM).filter(m => d.by[m]).map(m => barRow(pmName(m), eur(d.by[m]), d.by[m], Math.max(...Object.values(d.by)))).join('') || '<tr><td class="muted">—</td></tr>'}</table>
      <h3 style="margin-top:14px">${L('Por empleado', '按员工')}</h3><table class="t">${d.users.map(x => barRow(x.k + ' · ' + x.n, eur(x.total), x.total, mx(d.users))).join('')}</table>
      <h3 style="margin-top:14px">IVA</h3><table class="t"><tr><th>%</th><th class="r">${L('Base', '税基')}</th><th class="r">${L('Cuota', '税额')}</th><th class="r">Total</th></tr>${ivaBreak(d.lines).map(b => `<tr><td>${b.rate}%</td><td class="r">${eur(b.base)}</td><td class="r">${eur(b.iva)}</td><td class="r b">${eur(b.total)}</td></tr>`).join('')}</table></div>
    <div class="card"><h3>${L('Productos más vendidos', '热销商品')}</h3><table class="t">${d.prods.slice(0, 20).map(x => barRow(x.k + ' × ' + x.qty, eur(x.total), x.total, mx(d.prods))).join('') || '<tr><td class="muted">—</td></tr>'}</table></div>
    <div class="card"><h3>${L('Por categoría', '按分类')}</h3><table class="t">${d.cats.map(x => barRow(x.k + ' × ' + x.qty, eur(x.total), x.total, mx(d.cats))).join('') || '<tr><td class="muted">—</td></tr>'}</table></div></div></div>`;
};
A.repCsv = () => {
  const d = repData(), c = n => String(r2(n)).replace('.', ',');
  download(`ventas_${RP.from}_${RP.to}.csv`, csv([['ticket', 'fecha', 'tipo', 'cliente', 'empleado', 'referencia', 'articulo', 'cantidad', 'precio', 'total_linea', 'iva', 'pago', 'factura'],
    ...d.sr.flatMap(o => o.lines.map(l => [o.no, fdt(o.ts), o.type === 'sale' ? 'venta' : 'devolucion', o.memberName, o.userName, l.sku, l.name, l.qty, c(l.price), c(l.total), l.iva, o.pays.map(p => PME(p.m)).join('+'), o.invoice || '']))]), 'text/csv');
};

// ───────── Ajustes ─────────
V.settings = () => {
  const c = S.cfg, s = c.shop, old = Date.now() - c.lastBackup > 7 * 864e5;
  $('#main').innerHTML = `<div class="page" style="max-width:900px">
    ${old ? `<div class="banner">💾 ${L('Los datos están solo en este ordenador. Haga una copia de seguridad cada semana.', '数据只保存在这台电脑的浏览器里,请每周备份一次。')} <button class="sm" onclick="A.backup()">${L('Copiar ahora', '立即备份')}</button></div>` : ''}
    <div class="card"><h3>🏪 ${L('Datos de la tienda (salen en tickets y facturas)', '店铺信息(显示在小票和发票上)')}</h3><div class="grid2">${fld(L('Nombre comercial', '店名'), 'c-n', s.name)}${fld('NIF / CIF', 'c-f', s.nif)}${fld(L('Dirección', '地址'), 'c-a', s.address)}${fld(L('C.P. y ciudad', '邮编和城市'), 'c-c', s.city)}${fld(L('Teléfono', '电话'), 'c-p', s.phone)}${fld('Email', 'c-e', s.email)}</div>
    ${fld(L('Pie del ticket', '小票结尾语'), 'c-ft', c.footer)}${fld(L('Texto de devoluciones ({d} = días)', '退换货说明({d} = 天数)'), 'c-rt', c.returnText)}
    <div class="grid3">${fld(L('Días para devolver', '退货期限(天)'), 'c-rd', c.returnDays, 'inputmode="numeric"')}${fld(L('IVA por defecto %', '默认 IVA %'), 'c-iva', c.iva, 'inputmode="decimal"')}${fld(L('Validez de vales (meses)', '券有效期(月)'), 'c-vm', c.valeMonths, 'inputmode="numeric"')}</div></div>
    <div class="card"><h3>⭐ ${L('Puntos', '积分')}</h3>${chk(L('Activar programa de puntos', '启用积分'), 'c-pon', c.points.on)}
    <div class="grid3">${fld(L('Puntos por cada 1 € gastado', '每消费 1 € 得几分'), 'c-pe', c.points.earn, 'inputmode="decimal"')}${fld(L('Valor de 1 punto en €', '1 积分抵多少 €'), 'c-pv', c.points.value, 'inputmode="decimal"')}${fld(L('Mínimo de puntos para canjear', '最少多少分可抵扣'), 'c-pm', c.points.min, 'inputmode="numeric"')}</div>
    <p class="small muted">${L('Ejemplo: 1 punto por € y 0,01 € por punto = 1% de vuelta.', '例如:每 1 € 得 1 分,1 分抵 0,01 € = 返 1%。')}</p></div>
    <div class="card"><h3>🥇 ${L('Niveles de cliente', '会员等级')}</h3><table class="t"><tr><th>${L('Nombre', '名称')}</th><th>${L('Gasto acumulado desde €', '累计消费满 €')}</th><th>${L('Descuento %', '折扣 %')}</th><th>${L('Puntos ×', '积分倍数')}</th><th></th></tr>
    ${c.levels.map((l, i) => `<tr><td><input class="lv-n" value="${esc(l.name)}"></td><td><input class="lv-m" value="${l.min}"></td><td><input class="lv-d" value="${l.disc}"></td><td><input class="lv-x" value="${l.mult}"></td><td>${i ? `<button class="sm bad" onclick="A.cfgSave(1);S.cfg.levels.splice(${i},1);dirty('cfg');V.settings()">✕</button>` : ''}</td></tr>`).join('')}</table>
    <button class="sm" style="margin-top:8px" onclick="A.cfgSave(1);S.cfg.levels.push({id:uid(),name:'VIP',min:2000,disc:15,mult:2});dirty('cfg');V.settings()">＋ ${L('Nivel', '添加等级')}</button></div>
    <div class="card"><h3>💶 ${L('Regalo al recargar saldo', '充值赠送')}</h3><table class="t"><tr><th>${L('Recarga desde €', '充值满 €')}</th><th>${L('Regalo €', '赠送 €')}</th><th></th></tr>
    ${c.bonus.map((b, i) => `<tr><td><input class="bn-m" value="${b.min}"></td><td><input class="bn-b" value="${b.bonus}"></td><td><button class="sm bad" onclick="A.cfgSave(1);S.cfg.bonus.splice(${i},1);dirty('cfg');V.settings()">✕</button></td></tr>`).join('')}</table>
    <button class="sm" style="margin-top:8px" onclick="A.cfgSave(1);S.cfg.bonus.push({min:300,bonus:70});dirty('cfg');V.settings()">＋ ${L('Tramo', '添加档位')}</button></div>
    <div class="card"><h3>🖨 ${L('Impresión y permisos', '打印和权限')}</h3><div class="grid3">${sel(L('Papel del ticket', '小票纸宽'), 'c-pa', [[80, '80 mm'], [58, '58 mm']], c.paper)}
    ${sel(L('Cajón portamonedas', '钱箱'), 'c-dr', [['none', L('Lo abre la impresora al imprimir', '由打印机在打印时弹开')], ['serial', 'Web Serial (ESC/POS)']], c.drawer)}${fld(L('Baudios (serie)', '波特率(串口)'), 'c-bd', c.baud, 'inputmode="numeric"')}</div>
    ${chk(L('Imprimir el ticket automáticamente al cobrar', '收款后自动打印小票'), 'c-ap', c.autoPrint)}${chk(L('No permitir vender sin stock', '库存不足时禁止销售'), 'c-bs', c.blockNoStock)}</div>
    <button class="pri big" style="width:100%;margin-bottom:14px" onclick="A.cfgSave()">💾 ${L('Guardar ajustes', '保存设置')}</button>
    <p class="small muted">👥 ${L('Usuarios, permisos, fichajes y comisiones: menú ⏱ Equipo.', '员工账号、权限、考勤和提成:在「⏱ 员工」菜单里。')}</p>
    <div class="card"><h3>💾 ${L('Copia de seguridad', '数据备份')}</h3><p class="small muted">${L('Última copia', '上次备份')}: ${c.lastBackup ? fdt(c.lastBackup) : L('nunca', '从未')}. ${L('Guarde el archivo en un USB o en la nube. Si se borra el navegador o se rompe el ordenador, es la única forma de recuperar los datos.', '请把文件存到 U 盘或网盘。浏览器数据被清除或电脑损坏时,只能靠它恢复。')}</p>
    <div class="row"><button class="pri" onclick="A.backup()">⬇ ${L('Descargar copia', '下载备份')}</button><button onclick="$('#bk-f').click()">⬆ ${L('Restaurar copia', '恢复备份')}</button><input type="file" id="bk-f" accept=".json" class="hidden" onchange="A.restore(this)">
    <span class="grow"></span><button class="bad" onclick="A.wipe()">${L('Borrar productos de ejemplo', '删除示例商品')}</button></div></div></div>`;
};
A.cfgSave = quiet => {
  const c = S.cfg, n = id => num(fv(id));
  Object.assign(c.shop, { name: fv('c-n') || 'Mi Bisutería', nif: fv('c-f').toUpperCase(), address: fv('c-a'), city: fv('c-c'), phone: fv('c-p'), email: fv('c-e') });
  Object.assign(c, { footer: fv('c-ft'), returnText: fv('c-rt'), returnDays: n('c-rd'), iva: n('c-iva'), valeMonths: n('c-vm') || 12, paper: Number(fv('c-pa')), drawer: fv('c-dr'), baud: n('c-bd') || 9600, autoPrint: fv('c-ap'), blockNoStock: fv('c-bs') });
  Object.assign(c.points, { on: fv('c-pon'), earn: n('c-pe'), value: n('c-pv') || 0.01, min: n('c-pm') });
  const g = cls => $$('.' + cls).map(e => e.value.trim());
  const ln = g('lv-n'), lm = g('lv-m'), ld = g('lv-d'), lx = g('lv-x');
  c.levels.forEach((l, i) => Object.assign(l, { name: ln[i] || l.name, min: i ? num(lm[i]) : 0, disc: Math.min(100, num(ld[i])), mult: num(lx[i]) || 1 }));
  const bm = g('bn-m'), bb = g('bn-b'); c.bonus = c.bonus.map((b, i) => ({ min: num(bm[i]), bonus: num(bb[i]) })).filter(b => b.min > 0).sort((a, b) => a.min - b.min);
  dirty('cfg'); if (!quiet) { toast(L('Ajustes guardados', '设置已保存')); render(); }
};
A.backup = () => {
  S.cfg.lastBackup = Date.now(); dirty('cfg');
  download(`bisuteria-copia-${dstr(Date.now())}.json`, JSON.stringify({ app: 'bisuteria-pos', v: 1, ts: Date.now(), data: S }), 'application/json');
  if (VIEW === 'settings') V.settings();
};
A.restore = inp => {
  const f = inp.files[0]; if (!f) return;
  f.text().then(async txt => {
    let j; try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j || j.app !== 'bisuteria-pos' || !j.data || !j.data.cfg) return toast(L('El archivo no es una copia válida', '不是有效的备份文件'), true);
    if (!confirm(L(`Se sustituirán TODOS los datos actuales por la copia del ${fdt(j.ts)}. ¿Continuar?`, `当前所有数据将被 ${fdt(j.ts)} 的备份替换,确定继续?`))) return;
    await DB.flush(); await DB.replaceAll(j.data); location.reload();
  });
  inp.value = '';
};
A.wipe = () => {
  if (S.sales.length) return toast(L('Ya hay ventas: borre los productos uno a uno', '已经有销售记录,请逐个删除商品'), true);
  if (!confirm(L('¿Borrar todos los productos de ejemplo?', '删除所有示例商品?'))) return;
  S.products = []; S.cfg.seq.prod = 0; dirty('products'); dirty('cfg'); toast('OK');
};
