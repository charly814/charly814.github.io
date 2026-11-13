'use strict';
// ───────── Clientes / socios: saldo, puntos, niveles ─────────
let MF = { q: '' };
const MLT = { topup: ['Recarga', '充值'], pay: ['Pago con saldo', '余额消费'], earn: ['Puntos por compra', '消费积分'], redeem: ['Canje de puntos', '积分抵扣'], adjust: ['Ajuste manual', '手动调整'], refund: ['Devolución a saldo', '退款到余额'] };

V.members = () => {
  const q = MF.q.toLowerCase().trim(), mon = pad(new Date().getMonth() + 1);
  const list = S.members.filter(m => !q || (m.name + ' ' + m.phone + ' ' + m.code + ' ' + (m.email || '') + ' ' + (m.nif || '')).toLowerCase().includes(q)).sort((a, b) => (b.lastVisit || b.created) - (a.lastVisit || a.created));
  $('#main').innerHTML = `<div class="page"><div class="stats">
    <div class="stat"><div class="k">${L('Clientes', '会员数')}</div><div class="v">${S.members.length}</div></div>
    <div class="stat"><div class="k">${L('Saldo total de clientes', '会员余额合计')}</div><div class="v">${eur(sum(S.members, 'balance'))}</div></div>
    <div class="stat"><div class="k">${L('Puntos en circulación', '未用积分')}</div><div class="v">${sum(S.members, 'points')}</div></div>
    <div class="stat"><div class="k">🎂 ${L('Cumpleaños este mes', '本月生日')}</div><div class="v">${S.members.filter(m => m.birthday && m.birthday.slice(5, 7) === mon).length}</div></div></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><input class="grow" placeholder="${L('Buscar nombre, teléfono, tarjeta…', '搜索姓名、电话、卡号…')}" value="${esc(MF.q)}" oninput="MF.q=this.value;A.mList()">
    <button class="pri" onclick="A.memberEdit('')">＋ ${L('Nuevo cliente', '新会员')}</button>${can('mExport') ? `<button onclick="A.membersCsv()">⬇ CSV</button>` : ''}</div><div class="tablewrap" id="m-list"></div></div></div>`;
  A.mList();
};
A.mList = () => {
  const q = MF.q.toLowerCase().trim(), mon = pad(new Date().getMonth() + 1);
  const list = S.members.filter(m => !q || (m.name + ' ' + m.phone + ' ' + m.code + ' ' + (m.email || '') + ' ' + (m.nif || '')).toLowerCase().includes(q)).sort((a, b) => (b.lastVisit || b.created) - (a.lastVisit || a.created)).slice(0, 300);
  $('#m-list').innerHTML = `<table class="t"><tr><th>${L('Cliente', '会员')}</th><th>${L('Teléfono', '电话')}</th><th>${L('Nivel', '等级')}</th><th class="r">${L('Puntos', '积分')}</th><th class="r">${L('Saldo', '余额')}</th><th class="r">${L('Gastado', '累计消费')}</th><th>${L('Última visita', '最近到店')}</th></tr>
    ${list.map(m => `<tr class="click" onclick="A.memberView('${m.id}')"><td><b>${esc(m.name)}</b> ${m.birthday && m.birthday.slice(5, 7) === mon ? '🎂' : ''}<br><span class="small muted">${m.code}</span></td><td>${esc(m.phone)}</td>
    <td><span class="tag gold">${esc(mLevel(m).name)}</span></td><td class="r">${m.points}</td><td class="r b">${eur(m.balance)}</td><td class="r">${eur(m.spent)}</td><td class="small">${m.lastVisit ? fd(m.lastVisit) : '—'}</td></tr>`).join('')}</table>
    ${list.length ? '' : `<div class="empty">${L('Todavía no hay clientes. Cree el primero.', '还没有会员,点击「新会员」添加。')}</div>`}`;
};
A.memberEdit = (id, toCart) => {
  const m = id ? member(id) : { name: '', phone: '', email: '', nif: '', address: '', birthday: '', notes: '', level: '' };
  modal(`<h3>${id ? L('Editar cliente', '编辑会员') : L('Nuevo cliente', '新会员')}</h3><div class="grid2">${fld(L('Nombre *', '姓名 *'), 'm-n', m.name, 'autofocus')}${fld(L('Teléfono', '电话'), 'm-p', m.phone, 'inputmode="tel"')}
    ${fld('Email', 'm-e', m.email)}${fld(L('Cumpleaños', '生日'), 'm-b', m.birthday, 'type="date"')}${fld('NIF / CIF', 'm-f', m.nif)}
    ${sel(L('Nivel', '等级'), 'm-l', [['', L('Automático según gasto', '按累计消费自动')], ...S.cfg.levels.map(l => [l.id, l.name + (l.disc ? ' -' + l.disc + '%' : '')])], m.level || '')}</div>
    ${fld(L('Dirección (para facturas)', '地址(开发票用)'), 'm-a', m.address)}${fld(L('Notas (gustos, alergias al níquel…)', '备注(喜好、镍过敏…)'), 'm-o', m.notes)}
    ${chk(L('Acepta recibir promociones (RGPD)', '同意接收促销信息(RGPD)'), 'm-g', m.marketing)}
    ${mfoot(id && can('mDel') ? `<button class="bad" onclick="A.memberDel('${id}')">${L('Eliminar', '删除')}</button>` : '', btnClose(), `<button class="pri" data-enter onclick="A.memberSave('${id}',${toCart ? 1 : 0})">${L('Guardar', '保存')}</button>`)}`);
};
A.memberSave = (id, toCart) => {
  const name = fv('m-n'), phone = fv('m-p'); if (!name) return toast(L('El nombre es obligatorio', '姓名必填'), true);
  if (phone && S.members.some(x => x.id !== id && x.phone === phone)) return toast(L('Ya existe un cliente con ese teléfono', '该电话已有会员'), true);
  let m = id && member(id);
  if (!m) { S.cfg.seq.member = (S.cfg.seq.member || 0) + 1; dirty('cfg'); m = { id: uid(), code: 'M' + pad(S.cfg.seq.member, 6), points: 0, balance: 0, spent: 0, visits: 0, created: Date.now() }; S.members.push(m); }
  Object.assign(m, { name, phone, email: fv('m-e'), birthday: fv('m-b'), nif: fv('m-f').toUpperCase(), level: fv('m-l'), address: fv('m-a'), notes: fv('m-o'), marketing: fv('m-g') });
  dirty('members'); closeModal();
  if (toCart) return A.setMember(m.id);
  if (VIEW === 'members') V.members(); A.memberView(m.id);
};
A.memberDel = id => {
  const m = member(id);
  if (m.balance > 0 && !confirm(L(`Este cliente tiene ${eur(m.balance)} de saldo. ¿Eliminar igualmente?`, `该会员还有 ${eur(m.balance)} 余额,确定删除?`))) return;
  if (!confirm(L('¿Eliminar el cliente? Sus tickets se conservan.', '确定删除该会员?历史单据会保留。'))) return;
  S.members = S.members.filter(x => x.id !== id); if (CART.member === id) CART.member = null; dirty('members'); closeModal(); render();
};
A.memberView = id => {
  const m = member(id), lv = mLevel(m), next = [...S.cfg.levels].sort((a, b) => a.min - b.min).find(l => l.min > (m.spent || 0));
  const log = S.mlog.filter(l => l.member === id).reverse().slice(0, 60), sales = S.sales.filter(s => s.member === id && (s.type === 'sale' || s.type === 'return')).reverse().slice(0, 30);
  modal(`<h3>👤 ${esc(m.name)} <span class="tag gold">${esc(lv.name)}${lv.disc ? ' -' + lv.disc + '%' : ''}</span></h3>
    <div class="small muted">${m.code} · ${esc(m.phone)} ${esc(m.email || '')} ${m.birthday ? '· 🎂 ' + m.birthday.slice(8, 10) + '/' + m.birthday.slice(5, 7) : ''}${m.notes ? '<br>📝 ' + esc(m.notes) : ''}
    ${next && !m.level ? `<br>${L(`Le faltan ${eur(next.min - m.spent)} para nivel ${next.name}`, `再消费 ${eur(next.min - m.spent)} 升级到 ${next.name}`)}` : ''}</div>
    <div class="stats" style="margin-top:10px"><div class="stat"><div class="k">💳 ${L('Saldo', '余额')}</div><div class="v">${eur(m.balance)}</div></div><div class="stat"><div class="k">⭐ ${L('Puntos', '积分')}</div><div class="v">${m.points}</div><div class="k">= ${eur(m.points * S.cfg.points.value)}</div></div>
    <div class="stat"><div class="k">${L('Gastado', '累计消费')} · ${m.visits || 0} ${L('visitas', '次')}</div><div class="v">${eur(m.spent)}</div></div></div>
    <div class="row" style="margin-bottom:12px"><button class="ok" onclick="A.topupForm('${id}')">💶 ${L('Recargar saldo', '充值')}</button><button class="pri" onclick="closeModal();A.setMember('${id}')">🛒 ${L('Vender a este cliente', '选入收银')}</button>
    <button onclick="A.memberEdit('${id}')">✏️ ${L('Editar', '编辑')}</button><button onclick="printDoc(memberCardHtml(member('${id}')),'a4')">🪪 ${L('Tarjeta', '打印会员卡')}</button>
    <button onclick="A.adjustForm('${id}')">± ${L('Ajustar', '调整')}</button></div>
    <div class="tabs"><button class="on" id="mv-t1" onclick="$('#mv-1').classList.remove('hidden');$('#mv-2').classList.add('hidden');this.classList.add('on');$('#mv-t2').classList.remove('on')">${L('Movimientos', '余额/积分记录')}</button>
    <button id="mv-t2" onclick="$('#mv-2').classList.remove('hidden');$('#mv-1').classList.add('hidden');this.classList.add('on');$('#mv-t1').classList.remove('on')">${L('Compras', '消费记录')}</button></div>
    <div id="mv-1" style="max-height:34vh;overflow:auto"><table class="t"><tr><th>${L('Fecha', '时间')}</th><th>${L('Concepto', '类型')}</th><th class="r">€</th><th class="r">${L('Saldo', '余额')}</th><th class="r">${L('Pts', '积分')}</th><th class="r">${L('Total pts', '积分余额')}</th></tr>
    ${log.map(l => `<tr><td class="small">${fdt(l.ts)}</td><td>${L(...MLT[l.type])} <span class="small muted">${esc(l.ref || l.note || '')}</span></td><td class="r">${l.amount ? eur(l.amount) : ''}</td><td class="r">${eur(l.bal)}</td><td class="r">${l.points ? (l.points > 0 ? '+' : '') + l.points : ''}</td><td class="r">${l.pts}</td></tr>`).join('')}</table></div>
    <div id="mv-2" class="hidden" style="max-height:34vh;overflow:auto"><table class="t">${sales.map(s => `<tr class="click" onclick="A.saleView('${s.id}')"><td>${s.no}</td><td>${fdt(s.ts)}</td><td class="small">${s.lines.map(l => esc(l.name)).join(', ').slice(0, 60)}</td><td class="r b">${eur(s.total)}</td></tr>`).join('')}</table></div>
    ${mfoot(btnClose())}`, true);
};
const bonusFor = a => { const b = [...S.cfg.bonus].sort((x, y) => y.min - x.min).find(b => a >= b.min); return b ? b.bonus : 0; };
A.topupForm = id => {
  if (!needSession(() => A.topupForm(id))) return;
  const m = member(id);
  modal(`<h3>💶 ${L('Recargar saldo', '会员充值')} · ${esc(m.name)}</h3><p>${L('Saldo actual', '当前余额')}: <b>${eur(m.balance)}</b></p>
    <div class="row" style="margin-bottom:10px">${S.cfg.bonus.map(b => `<button class="gold" onclick="$('#t-a').value=${b.min};A.topupCalc()">${b.min} € <b>+${b.bonus}</b></button>`).join('')}</div>
    <div class="grid2">${fld(L('Importe que paga', '支付金额'), 't-a', '', 'inputmode="decimal" autofocus oninput="A.topupCalc()"')}${sel(L('Forma de pago', '付款方式'), 't-m', [['cash', pmName('cash')], ['card', pmName('card')], ['bizum', 'Bizum']], 'cash')}</div>
    <div class="change" id="t-r" style="font-size:20px">—</div>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.topup('${id}')">${L('Cobrar recarga', '确认充值')}</button>`)}`);
};
A.topupCalc = () => { const a = r2(num(fv('t-a'))), b = bonusFor(a); $('#t-r').textContent = a > 0 ? `${eur(a)}${b ? ' + ' + eur(b) + L(' de regalo', ' 赠送') : ''} = ${eur(a + b)}` : '—'; };
A.topup = id => {
  const m = member(id), a = r2(num(fv('t-a'))), mth = fv('t-m'), b = bonusFor(a); if (a <= 0) return;
  m.balance = r2(m.balance + a + b);
  const s = { id: uid(), no: nextNo('C'), type: 'topup', ts: Date.now(), user: USER.id, userName: USER.name, session: curSession().id, member: m.id, memberName: m.name, lines: [], total: a, bonus: b, pays: [{ m: mth, amount: a }], balAfter: m.balance };
  S.sales.push(s); dirty('sales', s);
  mlogAdd(m, 'topup', { amount: r2(a + b), ref: s.no, note: b ? '+' + b + ' regalo' : '', bal: m.balance });
  if (mth === 'cash') openDrawer(true);
  toast(L('Recarga realizada', '充值成功')); printDoc(topupHtml(s)); A.memberView(id);
  if (VIEW === 'members') A.mList(); if (VIEW === 'pos') drawCart();
};
A.adjustForm = id => {
  const m = member(id);
  modal(`<h3>± ${L('Ajuste manual', '手动调整')} · ${esc(m.name)}</h3><p class="small muted">${L('Use + o − (ej. -5). No mueve dinero en caja: es solo una corrección.', '输入正数或负数(例如 -5)。不影响钱箱,只做更正。')}</p>
    <div class="grid2">${fld(L('Saldo ± €', '余额 ± €'), 'a-b', '', 'inputmode="decimal" autofocus')}${fld(L('Puntos ±', '积分 ±'), 'a-p', '', 'inputmode="numeric"')}</div>${fld(L('Motivo *', '原因 *'), 'a-n', '')}
    ${mfoot(`<button onclick="A.memberView('${id}')">${L('Volver', '返回')}</button>`, `<button class="pri" data-enter onclick="A.adjust('${id}')">${L('Aplicar', '确认')}</button>`)}`);
};
A.adjust = id => {
  const m = member(id), b = r2(num(fv('a-b'))), p = Math.round(num(fv('a-p'))), note = fv('a-n');
  if (!b && !p) return; if (!note) return toast(L('Indique el motivo', '请填写原因'), true);
  if (m.balance + b < 0 || m.points + p < 0) return toast(L('No puede quedar en negativo', '不能调成负数'), true);
  m.balance = r2(m.balance + b); m.points += p; mlogAdd(m, 'adjust', { amount: b, points: p, note, bal: m.balance, pts: m.points });
  A.memberView(id); if (VIEW === 'members') A.mList(); if (VIEW === 'pos') drawCart();
};
A.membersCsv = () => download('clientes.csv', csv([['Tarjeta', 'Nombre', 'Teléfono', 'Email', 'NIF', 'Cumpleaños', 'Nivel', 'Puntos', 'Saldo', 'Gastado', 'Visitas', 'Promociones'],
  ...S.members.map(m => [m.code, m.name, m.phone, m.email, m.nif, m.birthday, mLevel(m).name, m.points, String(m.balance).replace('.', ','), String(m.spent).replace('.', ','), m.visits, m.marketing ? 'sí' : 'no'])]), 'text/csv');
