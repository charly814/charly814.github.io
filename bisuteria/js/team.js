'use strict';
// ───────── Equipo: permisos, fichajes (registro de jornada) y comisiones ─────────
// [clave, español, chino, activo por defecto para un empleado nuevo]
const PERMS = [
  ['disc', 'Hacer descuentos', '打折', 1],
  ['price', 'Cambiar precios en el ticket', '收银时改价', 0],
  ['free', 'Artículo libre (fuera de catálogo)', '手输商品', 1],
  ['ret', 'Devoluciones', '退货', 1],
  ['invoice', 'Hacer facturas', '开发票', 1],
  ['topup', 'Recargar saldo de clientes', '会员充值', 1],
  ['gift', 'Vender tarjetas regalo', '出售礼品卡', 1],
  ['mAdjust', 'Ajustar saldo / puntos a mano', '手动调整余额/积分', 0],
  ['mDel', 'Eliminar clientes', '删除会员', 0],
  ['mExport', 'Exportar clientes (CSV)', '导出会员资料', 0],
  ['history', 'Ver tickets de días anteriores', '查看以前的单据', 1],
  ['prodEdit', 'Crear / editar productos, categorías y promociones', '新建/编辑商品、分类、促销', 0],
  ['stock', 'Entradas de mercancía e inventario', '入库和盘点', 0],
  ['cost', 'Ver costes', '查看成本', 0],
  ['cashMove', 'Entradas / salidas de efectivo', '现金存入/支出', 1],
  ['close', 'Cerrar caja (Z)', '日结关班', 1],
  ['reports', 'Informes de ventas', '销售报表', 0],
  ['team', 'Ver y corregir fichajes y comisiones de todos', '查看/更正全员考勤和提成', 0],
  ['settings', 'Ajustes, usuarios y permisos', '系统设置、员工和权限', 0]
];
const defPerms = () => Object.fromEntries(PERMS.map(p => [p[0], !!p[3]]));
const PRESETS_P = {
  basic: defPerms,
  mgr: () => Object.fromEntries(PERMS.map(p => [p[0], p[0] !== 'settings'])),
  none: () => Object.fromEntries(PERMS.map(p => [p[0], false]))
};
function migrateUsers() {
  let ch = false;
  S.users.forEach(u => {
    if (!u.perms) { u.perms = defPerms(); if (S.cfg.empReturn === false) u.perms.ret = false; ch = true; }
    if (u.maxDisc == null) { u.maxDisc = S.cfg.empMaxDisc ?? 10; ch = true; }
    if (u.comm == null) { u.comm = 0; ch = true; }
  });
  if (ch) dirty('users');
}

// Autorización puntual: si falta un permiso, alguien que lo tenga pone su PIN.
let OVR = null;
const ovrOk = k => OVR && OVR.k === k && OVR.until > Date.now();
function can(k) {
  if (!USER) return false;
  if (USER.role === 'admin' || ovrOk(k)) return true;
  return !!(USER.perms || {})[k];
}
const maxDisc = () => USER.role === 'admin' || ovrOk('discMax') ? 100 : Number(USER.maxDisc ?? 10);
function needPerm(k, then) {
  if (k !== 'discMax' && can(k)) return true;
  const name = k === 'discMax' ? ['Descuento superior a su máximo (' + maxDisc() + '%)', '超过本人最大折扣(' + maxDisc() + '%)'] : PERMS.find(p => p[0] === k).slice(1, 3);
  modal(`<h3>🔐 ${L('Autorización necesaria', '需要授权')}</h3><p>${esc(USER.name)} ${L('no tiene permiso para:', '没有以下权限:')} <b>${esc(L(name[0], name[1]))}</b><br>${L('Un responsable puede autorizarlo con su PIN.', '请负责人输入 PIN 授权。')}</p>
    ${fld('PIN', 'ov-p', '', 'type="password" inputmode="numeric" maxlength="4" autocomplete="off" autofocus')}${mfoot(btnClose(), `<button class="pri" data-enter id="ov-b">OK</button>`)}`);
  $('#ov-b').onclick = () => {
    const u = S.users.find(u => u.pin === fv('ov-p'));
    if (!u || !(u.role === 'admin' || (k !== 'discMax' && (u.perms || {})[k]))) return toast(L('Ese PIN no tiene el permiso', '该 PIN 没有此权限'), true);
    closeModal(); OVR = { k, until: Date.now() + 90000, by: u.name };
    toast(L('Autorizado por ', '授权人:') + u.name); then();
  };
  return false;
}
const guard = (k, fn) => (...a) => { if (needPerm(k, () => fn(...a))) return fn(...a); };
A.freeItem = guard('free', A.freeItem);
A.returnForm = guard('ret', A.returnForm);
A.topupForm = guard('topup', A.topupForm);
A.giftForm = guard('gift', A.giftForm);
A.adjustForm = guard('mAdjust', A.adjustForm);
A.moveForm = guard('cashMove', A.moveForm);
A.closeForm = guard('close', A.closeForm);
A.discount = guard('disc', A.discount);
A.invoice = (orig => id => { const s = S.sales.find(x => x.id === id); if (s.invoice || needPerm('invoice', () => orig(id))) orig(id); })(A.invoice);

// ───────── Vendedor y comisión de cada venta ─────────
const sellerOf = () => S.users.find(u => u.id === CART.seller) || USER;
A.pickSeller = () => {
  const us = [...S.users].sort((a, b) => isIn(b.id) - isIn(a.id));
  modal(`<h3>🧑 ${L('¿Quién ha vendido?', '谁卖出的?')}</h3><p class="small muted">${L('La comisión de este ticket será para esta persona.', '这一单的提成算给这个人。')}</p>
    <div class="methods">${us.map(u => `<button class="${u.id === sellerOf().id ? 'pri' : ''}" onclick="CART.seller='${u.id}';closeModal();drawCart()">${isIn(u.id) ? '🟢 ' : ''}${esc(u.name)}</button>`).join('')}</div>${mfoot(btnClose())}`);
};
function commRate(u, cat) {
  if (!u || !(u.comm > 0)) return 0;
  const c = S.cats.find(c => c.id === cat);
  return c && c.comm !== '' && c.comm != null ? num(c.comm) : num(u.comm);
}
const commBase = l => S.cfg.comm.basis === 'total' ? l.total : l.total / (1 + (l.iva || 0) / 100);
const commFor = (u, l) => r2(commBase(l) * commRate(u, l.cat) / 100);

// ───────── Fichajes ─────────
const lastAtt = id => { for (let i = S.att.length - 1; i >= 0; i--) if (S.att[i].uid === id && !S.att[i].void) return S.att[i]; return null; };
const isIn = id => { const a = lastAtt(id); return !!a && a.type === 'in'; };
const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const hm = ms => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + ':' + pad(m % 60); };
const wd = day => L(['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], ['周日', '周一', '周二', '周三', '周四', '周五', '周六'])[new Date(day + 'T12:00').getDay()];
function clock(u, type, ts = Date.now(), extra = {}) {
  const rec = Object.assign({ id: uid(), ts, uid: u.id, name: u.name, type, src: 'pin' }, extra);
  S.att.push(rec); S.att.sort((a, b) => a.ts - b.ts); dirty('att', rec); return rec;
}
A.doClock = id => {
  const u = S.users.find(u => u.id === id), r = clock(u, isIn(id) ? 'out' : 'in'), today = dstr(r.ts);
  const d = attDays(today, today, id)[0];
  modal(`<div class="c"><div style="font-size:46px">${r.type === 'in' ? '🟢' : '👋'}</div><h3 style="margin:6px 0">${esc(u.name)}</h3>
    <div class="bigamt">${hhmm(r.ts)}</div><div class="b">${r.type === 'in' ? L('ENTRADA registrada', '上班打卡成功') : L('SALIDA registrada', '下班打卡成功')}</div>
    ${d ? `<p class="muted">${L('Hoy', '今天')}: ${hm(d.ms)} h</p>` : ''}</div>${mfoot(`<button class="pri" data-enter onclick="closeModal()">OK</button>`)}`);
  setTimeout(() => { if ($('#modal-box .bigamt') && !USER) closeModal(); }, 4000);
  return r;
};
A.clockMe = () => {
  const inn = isIn(USER.id), la = lastAtt(USER.id);
  modal(`<h3>⏱ ${esc(USER.name)}</h3><p>${inn ? L('Trabajando desde las ', '上班中,开始于 ') + hhmm(la.ts) : L('Ahora mismo no está fichado.', '现在未打卡上班。')}</p>
    ${mfoot(btnClose(), `<button class="${inn ? 'bad' : 'ok'} big" data-enter onclick="closeModal();A.doClock(USER.id);if(VIEW==='team')V.team();render()">${inn ? L('Fichar SALIDA', '下班打卡') : L('Fichar ENTRADA', '上班打卡')} ${hhmm(Date.now())}</button>`)}`);
};
// Empareja entradas y salidas de cada persona en tramos.
function segments() {
  const by = {}, out = [], today = dstr(Date.now());
  S.att.filter(a => !a.void).forEach(a => (by[a.uid] = by[a.uid] || []).push(a));
  Object.keys(by).forEach(id => {
    const u = S.users.find(u => u.id === id);
    const push = (i, o, flag) => out.push({ uid: id, name: (u || i || o).name, inR: i, outR: o, day: dstr((i || o).ts), flag, ms: i && o ? o.ts - i.ts : flag === 'run' ? Date.now() - i.ts : 0 });
    let open = null;
    by[id].forEach(a => {
      if (a.type === 'in') { if (open) push(open, null, 'noOut'); open = a; }
      else if (open) { push(open, a, ''); open = null; } else push(null, a, 'noIn');
    });
    if (open) push(open, null, dstr(open.ts) === today ? 'run' : 'noOut');
  });
  return out;
}
function attDays(from, to, uidF) {
  const g = {};
  segments().filter(s => s.day >= from && s.day <= to && (!uidF || s.uid === uidF)).forEach(s => {
    const k = s.uid + '|' + s.day, d = g[k] = g[k] || { uid: s.uid, name: s.name, day: s.day, segs: [], ms: 0, flags: 0 };
    d.segs.push(s); d.ms += s.ms; if (s.flag === 'noOut' || s.flag === 'noIn') d.flags++;
  });
  return Object.values(g).sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : a.name < b.name ? -1 : 1);
}
const segTxt = s => (s.inR ? hhmm(s.inR.ts) : '??') + '–' + (s.outR ? hhmm(s.outR.ts) : s.flag === 'run' ? '…' : '??') + ((s.inR && s.inR.log) || (s.outR && s.outR.log) ? ' ✎' : '');
const segTag = s => `<span class="tag ${s.flag === 'noOut' || s.flag === 'noIn' ? 'bad' : s.flag === 'run' ? 'ok' : ''}">${segTxt(s)}</span>`;

// ───────── Pantalla Equipo ─────────
let TF = { tab: 'today', preset: 'month', from: '', to: '', uid: '' };
function tfRange(p) {
  const n = new Date(); TF.preset = p;
  if (p === 'today') TF.from = TF.to = dstr(n);
  if (p === 'week') { const m = new Date(n); m.setDate(n.getDate() - (n.getDay() + 6) % 7); TF.from = dstr(m); TF.to = dstr(n); }
  if (p === 'month') { TF.from = dstr(new Date(n.getFullYear(), n.getMonth(), 1)); TF.to = dstr(n); }
  if (p === 'last') { TF.from = dstr(new Date(n.getFullYear(), n.getMonth() - 1, 1)); TF.to = dstr(new Date(n.getFullYear(), n.getMonth(), 0)); }
}
tfRange('month');
const TPRE = [['today', 'Hoy', '今天'], ['week', 'Esta semana', '本周'], ['month', 'Este mes', '本月'], ['last', 'Mes pasado', '上月']];
const tfUid = () => can('team') ? TF.uid : USER.id;
const rangeBar = () => `<div class="row" style="margin-bottom:12px">${TPRE.map(p => `<button class="${TF.preset === p[0] ? 'pri' : ''}" onclick="tfRange('${p[0]}');V.team()">${L(p[1], p[2])}</button>`).join('')}
  <input type="date" style="width:150px" value="${TF.from}" onchange="TF.from=this.value;TF.preset='';V.team()"><input type="date" style="width:150px" value="${TF.to}" onchange="TF.to=this.value;TF.preset='';V.team()">
  ${can('team') ? `<select style="width:160px" onchange="TF.uid=this.value;V.team()"><option value="">${L('Todo el equipo', '全部员工')}</option>${S.users.map(u => `<option value="${u.id}" ${TF.uid === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}</div>`;

V.team = () => {
  const tabs = [['today', '🟢', 'Hoy', '今日'], ['att', '⏱', 'Fichajes', '考勤记录'], ['comm', '💰', 'Comisiones', '提成']];
  if (can('settings')) tabs.push(['users', '🔐', 'Usuarios y permisos', '员工和权限']);
  if (!tabs.find(t => t[0] === TF.tab)) TF.tab = 'today';
  $('#main').innerHTML = `<div class="page"><div class="tabs">${tabs.map(t => `<button class="${TF.tab === t[0] ? 'on' : ''}" onclick="TF.tab='${t[0]}';V.team()">${t[1]} ${L(t[2], t[3])}</button>`).join('')}</div><div id="t-body"></div></div>`;
  ({ today: tToday, att: tAtt, comm: tComm, users: tUsers })[TF.tab]();
};
function tToday() {
  const today = dstr(Date.now()), us = can('team') ? S.users : [USER], days = attDays(today, today, '');
  $('#t-body').innerHTML = `<div class="card tablewrap"><table class="t"><tr><th>${L('Empleado', '员工')}</th><th>${L('Estado', '状态')}</th><th>${L('Tramos de hoy', '今天的时段')}</th><th class="r">${L('Horas hoy', '今天工时')}</th><th></th></tr>
    ${us.map(u => { const d = days.find(x => x.uid === u.id), inn = isIn(u.id);
      return `<tr><td><b>${esc(u.name)}</b></td><td>${inn ? `<span class="tag ok">🟢 ${L('Trabajando desde', '上班中,自')} ${hhmm(lastAtt(u.id).ts)}</span>` : `<span class="tag">${L('Fuera', '未上班')}</span>`}</td>
      <td>${d ? d.segs.map(segTag).join(' ') : '—'}</td><td class="r b">${d ? hm(d.ms) : '0:00'}</td>
      <td class="r">${u.id === USER.id ? `<button class="sm ${inn ? 'bad' : 'ok'}" onclick="A.clockMe()">${inn ? L('Fichar salida', '下班打卡') : L('Fichar entrada', '上班打卡')}</button>` : ''}
      ${can('team') ? `<button class="sm" onclick="A.attDay('${u.id}','${today}')">✏️</button>` : ''}</td></tr>`; }).join('')}</table></div>
    <p class="small muted">${L('También se puede fichar sin iniciar sesión: en la pantalla del PIN pulse «⏱ Fichar entrada / salida».', '不用登录也能打卡:在 PIN 界面点「⏱ 上班 / 下班打卡」再输入 PIN。')}</p>`;
}
function tAtt() {
  const days = attDays(TF.from, TF.to, tfUid()), tot = {}, T = can('team');
  days.forEach(d => { const t = tot[d.uid] = tot[d.uid] || { name: d.name, ms: 0, n: 0, flags: 0 }; t.ms += d.ms; t.n++; t.flags += d.flags; });
  $('#t-body').innerHTML = rangeBar() + `<div class="stats">${Object.values(tot).map(t => `<div class="stat"><div class="k">${esc(t.name)} · ${t.n} ${L('días', '天')}</div><div class="v">${hm(t.ms)} h</div>
    ${t.flags ? `<div class="k" style="color:var(--bad)">⚠️ ${t.flags} ${L('sin entrada o salida', '条缺上班或下班')}</div>` : ''}</div>`).join('') || ''}</div>
    <div class="card"><div class="row" style="margin-bottom:10px"><span class="grow small muted">${T ? L('Toque un día para corregirlo. Las correcciones quedan registradas con autor y motivo.', '点击某一天可更正。更正会记录操作人和原因。') : ''}</span>
    ${T ? `<button onclick="A.attAdd()">＋ ${L('Añadir fichaje', '补录打卡')}</button>` : ''}<button onclick="A.attCsv()">⬇ CSV</button><button onclick="A.attPrint()">🖨 ${L('Registro de jornada', '打印考勤表')}</button></div>
    <div class="tablewrap"><table class="t"><tr><th>${L('Fecha', '日期')}</th><th>${L('Empleado', '员工')}</th><th>${L('Tramos', '时段')}</th><th class="r">${L('Horas', '工时')}</th></tr>
    ${days.map(d => `<tr ${T ? `class="click" onclick="A.attDay('${d.uid}','${d.day}')"` : ''}><td>${fd(dayStart(d.day))} <span class="small muted">${wd(d.day)}</span></td><td>${esc(d.name)}</td><td>${d.segs.map(segTag).join(' ')}</td><td class="r b">${hm(d.ms)}</td></tr>`).join('')}</table>
    ${days.length ? '' : `<div class="empty">${L('No hay fichajes en estas fechas', '该日期没有打卡记录')}</div>`}</div></div>`;
}
A.attDay = (id, day) => {
  const u = S.users.find(u => u.id === id), recs = S.att.filter(a => a.uid === id && dstr(a.ts) === day);
  modal(`<h3>⏱ ${esc(u ? u.name : (recs[0] || {}).name || '')} · ${fd(dayStart(day))}</h3>
    <table class="t">${recs.map(a => `<tr style="${a.void ? 'text-decoration:line-through;opacity:.5' : ''}"><td>${a.type === 'in' ? '🟢 ' + L('Entrada', '上班') : '🔴 ' + L('Salida', '下班')}</td><td class="b">${hhmm(a.ts)}</td>
    <td class="small muted">${a.src === 'manual' ? L('añadido a mano', '补录') : ''}${(a.log || []).map(l => `<br>✎ ${esc(l.by)} ${fdt(l.at)}: ${l.from ? hhmm(l.from) + ' → ' + hhmm(l.to) + ' · ' : ''}${l.void ? L('anulado · ', '作废 · ') : ''}${esc(l.note)}`).join('')}</td>
    <td class="r">${a.void ? '' : `<button class="sm" onclick="A.attEdit('${a.id}')">✏️</button>`}</td></tr>`).join('') || `<tr><td class="muted">${L('Sin fichajes', '没有打卡记录')}</td></tr>`}</table>
    ${mfoot(`<button onclick="A.attAdd('${id}','${day}')">＋ ${L('Añadir fichaje', '补录打卡')}</button>`, btnClose())}`);
};
A.attAdd = (id, day) => modal(`<h3>＋ ${L('Añadir fichaje olvidado', '补录打卡')}</h3>${sel(L('Empleado', '员工'), 'aa-u', S.users.map(u => [u.id, u.name]), id || TF.uid || USER.id)}
  <div class="grid3">${fld(L('Fecha', '日期'), 'aa-d', day || dstr(Date.now()), 'type="date"')}${fld(L('Hora', '时间'), 'aa-t', '', 'type="time" autofocus')}${sel(L('Tipo', '类型'), 'aa-k', [['in', L('Entrada', '上班')], ['out', L('Salida', '下班')]], 'in')}</div>
  ${fld(L('Motivo *', '原因 *'), 'aa-n', '', `placeholder="${L('Olvidó fichar', '忘记打卡')}"`)}${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.attAddSave()">${L('Guardar', '保存')}</button>`)}`);
A.attAddSave = () => {
  const u = S.users.find(u => u.id === fv('aa-u')), d = fv('aa-d'), t = fv('aa-t'), n = fv('aa-n');
  if (!u || !d || !t || !n) return toast(L('Rellene fecha, hora y motivo', '请填写日期、时间和原因'), true);
  const ts = new Date(d + 'T' + t).getTime(); if (ts > Date.now()) return toast(L('No se puede fichar en el futuro', '不能补录未来的时间'), true);
  clock(u, fv('aa-k'), ts, { src: 'manual', by: USER.name, log: [{ at: Date.now(), by: USER.name, note: n }] });
  V.team(); A.attDay(u.id, d);
};
A.attEdit = id => {
  const a = S.att.find(x => x.id === id);
  modal(`<h3>✏️ ${esc(a.name)} · ${a.type === 'in' ? L('Entrada', '上班') : L('Salida', '下班')} ${fd(a.ts)}</h3><div class="grid2">${fld(L('Hora correcta', '正确时间'), 'ae-t', hhmm(a.ts), 'type="time" autofocus')}${fld(L('Motivo *', '原因 *'), 'ae-n', '')}</div>
    ${mfoot(`<button class="bad" onclick="A.attSave('${id}',1)">${L('Anular fichaje', '作废这条')}</button>`, btnClose(), `<button class="pri" data-enter onclick="A.attSave('${id}')">${L('Guardar hora', '保存时间')}</button>`)}`);
};
A.attSave = (id, del) => {
  const a = S.att.find(x => x.id === id), n = fv('ae-n'); if (!n) return toast(L('Indique el motivo', '请填写原因'), true);
  a.log = a.log || [];
  if (del) { a.void = true; a.log.push({ at: Date.now(), by: USER.name, note: n, void: 1 }); }
  else {
    const ts = new Date(dstr(a.ts) + 'T' + fv('ae-t')).getTime(); if (!ts || ts > Date.now()) return toast(L('Hora no válida', '时间不正确'), true);
    a.log.push({ at: Date.now(), by: USER.name, note: n, from: a.ts, to: ts }); a.ts = ts; S.att.sort((x, y) => x.ts - y.ts);
  }
  dirty('att', a); V.team(); A.attDay(a.uid, dstr(a.ts));
};
A.attCsv = () => {
  const rows = [['empleado', 'fecha', 'entrada', 'salida', 'horas', 'incidencia', 'corregido']];
  attDays(TF.from, TF.to, tfUid()).forEach(d => d.segs.forEach(s => rows.push([d.name, fd(dayStart(d.day)), s.inR ? hhmm(s.inR.ts) : '', s.outR ? hhmm(s.outR.ts) : '', hm(s.ms).replace(':', ','),
    s.flag === 'noOut' ? 'sin salida' : s.flag === 'noIn' ? 'sin entrada' : s.flag === 'run' ? 'en curso' : '', (s.inR && s.inR.log) || (s.outR && s.outR.log) ? 'sí' : ''])));
  download(`fichajes_${TF.from}_${TF.to}.csv`, csv(rows), 'text/csv');
};
// Hoja mensual firmable (registro diario de jornada, art. 34.9 ET).
A.attPrint = () => {
  const days = attDays(TF.from, TF.to, tfUid()), sh = S.cfg.shop, ids = [...new Set(days.map(d => d.uid))];
  if (!ids.length) return toast(L('No hay fichajes en estas fechas', '该日期没有打卡记录'));
  printDoc(ids.map((id, k) => {
    const ds = days.filter(d => d.uid === id);
    return `<div class="inv" style="${k ? 'page-break-before:always;break-before:page' : ''}"><h1>Registro diario de jornada</h1>
      <div class="hd"><div class="box"><b>Empresa:</b> ${esc(sh.name)}<br><b>NIF:</b> ${esc(sh.nif)}<br>${esc(sh.address)} ${esc(sh.city)}</div><div class="box"><b>Trabajador/a:</b> ${esc(ds[0].name)}<br><b>Periodo:</b> ${fd(dayStart(TF.from))} – ${fd(dayStart(TF.to))}</div></div>
      <table><tr><th>Fecha</th><th>Día</th><th>Entrada – Salida</th><th class="r">Horas</th><th>Observaciones</th></tr>
      ${ds.map(d => `<tr><td>${fd(dayStart(d.day))}</td><td>${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(d.day + 'T12:00').getDay()]}</td><td>${d.segs.map(segTxt).join(' · ')}</td><td class="r">${hm(d.ms)}</td><td>${d.flags ? 'Fichaje incompleto' : d.segs.some(s => (s.inR && s.inR.log) || (s.outR && s.outR.log)) ? 'Corregido (✎)' : ''}</td></tr>`).join('')}
      <tr><td colspan="3"><b>TOTAL</b></td><td class="r"><b>${hm(sum(ds, 'ms'))}</b></td><td></td></tr></table>
      <div class="hd" style="margin-top:40px"><div>Firma de la empresa<br><br><br>______________________</div><div>Firma del trabajador/a<br><br><br>______________________</div></div>
      <p style="font-size:10px;margin-top:20px">Registro conforme al art. 34.9 del Estatuto de los Trabajadores. Se conservará durante cuatro años.</p></div>`;
  }).join(''), 'a4');
};

// ───────── Comisiones ─────────
function commData(from, to, uidF) {
  const g = {};
  S.sales.filter(s => (s.type === 'sale' || s.type === 'return') && s.ts >= dayStart(from) && s.ts <= dayEnd(to)).forEach(s => {
    const id = s.seller || s.user; if (uidF && id !== uidF) return;
    const x = g[id] = g[id] || { uid: id, name: s.sellerName || s.userName, n: 0, nr: 0, total: 0, base: 0, comm: 0, list: [] };
    if (s.type === 'sale') x.n++; else x.nr++;
    x.total = r2(x.total + s.total); x.base = r2(x.base + sum(s.lines, l => l.total / (1 + (l.iva || 0) / 100))); x.comm = r2(x.comm + (s.comm || 0)); x.list.push(s);
  });
  const days = attDays(from, to, uidF);
  return Object.values(g).map(x => Object.assign(x, { ms: sum(days.filter(d => d.uid === x.uid), 'ms') })).sort((a, b) => b.total - a.total);
}
function tComm() {
  const rows = commData(TF.from, TF.to, tfUid()), rate = id => { const u = S.users.find(u => u.id === id); return u ? num(u.comm) + '%' : '—'; };
  $('#t-body').innerHTML = rangeBar() + `<div class="card"><div class="row" style="margin-bottom:10px"><span class="grow small muted">${L('Base de cálculo', '提成基数')}: ${S.cfg.comm.basis === 'total' ? L('venta con IVA', '含税销售额') : L('venta sin IVA', '不含税销售额')}. ${L('Las devoluciones restan.', '退货会扣回。')}</span>
    <button onclick="A.commCsv()">⬇ CSV</button><button onclick="A.commPrint()">🖨 ${L('Imprimir', '打印')}</button></div><div class="tablewrap"><table class="t">
    <tr><th>${L('Vendedor', '销售员')}</th><th class="r">${L('Tickets', '单数')}</th><th class="r">${L('Devol.', '退货')}</th><th class="r">${L('Venta (IVA incl.)', '销售额(含税)')}</th><th class="r">${L('Sin IVA', '不含税')}</th>
    <th class="r">${L('Horas', '工时')}</th><th class="r">${L('Venta / hora', '每小时销售')}</th><th class="r">${L('% actual', '当前比例')}</th><th class="r">${L('Comisión', '提成')}</th></tr>
    ${rows.map(x => `<tr class="click" onclick="A.commView('${x.uid}')"><td><b>${esc(x.name)}</b></td><td class="r">${x.n}</td><td class="r">${x.nr}</td><td class="r">${eur(x.total)}</td><td class="r">${eur(x.base)}</td>
    <td class="r">${hm(x.ms)}</td><td class="r">${x.ms > 6e5 ? eur(x.total / (x.ms / 36e5)) : '—'}</td><td class="r small">${rate(x.uid)}</td><td class="r b" style="color:var(--ok)">${eur(x.comm)}</td></tr>`).join('')}
    ${rows.length > 1 ? `<tr><td class="b">TOTAL</td><td class="r">${sum(rows, 'n')}</td><td class="r">${sum(rows, 'nr')}</td><td class="r b">${eur(sum(rows, 'total'))}</td><td class="r">${eur(sum(rows, 'base'))}</td><td class="r">${hm(sum(rows, 'ms'))}</td><td></td><td></td><td class="r b">${eur(sum(rows, 'comm'))}</td></tr>` : ''}</table>
    ${rows.length ? '' : `<div class="empty">${L('No hay ventas en estas fechas', '该日期没有销售')}</div>`}</div></div>`;
}
A.commView = id => {
  const x = commData(TF.from, TF.to, id)[0];
  modal(`<h3>💰 ${esc(x.name)} · ${fd(dayStart(TF.from))} – ${fd(dayStart(TF.to))}</h3><div style="max-height:55vh;overflow:auto"><table class="t">
    <tr><th>Ticket</th><th>${L('Fecha', '时间')}</th><th>${L('Artículos', '商品')}</th><th class="r">${L('Total', '金额')}</th><th class="r">${L('Comisión', '提成')}</th></tr>
    ${x.list.slice().reverse().map(s => `<tr class="click" onclick="A.saleView('${s.id}')"><td>${s.no}</td><td class="small">${fdt(s.ts)}</td><td class="small">${esc(s.lines.map(l => l.name).join(', ').slice(0, 50))}</td><td class="r">${eur(s.total)}</td><td class="r b">${eur(s.comm || 0)}</td></tr>`).join('')}</table></div>
    <p class="r b">${L('Total comisión', '提成合计')}: ${eur(x.comm)}</p>${mfoot(btnClose())}`, true);
};
A.commCsv = () => {
  const c = n => String(r2(n)).replace('.', ',');
  download(`comisiones_${TF.from}_${TF.to}.csv`, csv([['vendedor', 'tickets', 'devoluciones', 'venta_iva_incl', 'venta_sin_iva', 'horas', 'comision'],
    ...commData(TF.from, TF.to, tfUid()).map(x => [x.name, x.n, x.nr, c(x.total), c(x.base), hm(x.ms).replace(':', ','), c(x.comm)])]), 'text/csv');
};
A.commPrint = () => {
  const rows = commData(TF.from, TF.to, tfUid());
  printDoc(`<div class="inv"><h1>Liquidación de comisiones</h1><div>${esc(S.cfg.shop.name)} · Periodo ${fd(dayStart(TF.from))} – ${fd(dayStart(TF.to))} · Base: ${S.cfg.comm.basis === 'total' ? 'venta con IVA' : 'venta sin IVA'}</div>
    <table><tr><th>Vendedor</th><th class="r">Tickets</th><th class="r">Devol.</th><th class="r">Venta IVA incl.</th><th class="r">Venta sin IVA</th><th class="r">Horas</th><th class="r">Comisión</th></tr>
    ${rows.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${x.n}</td><td class="r">${x.nr}</td><td class="r">${eur(x.total)}</td><td class="r">${eur(x.base)}</td><td class="r">${hm(x.ms)}</td><td class="r"><b>${eur(x.comm)}</b></td></tr>`).join('')}
    <tr><td colspan="6"><b>TOTAL</b></td><td class="r"><b>${eur(sum(rows, 'comm'))}</b></td></tr></table></div>`, 'a4');
};

// ───────── Usuarios y permisos ─────────
function tUsers() {
  const c = S.cfg, n = u => u.role === 'admin' ? L('todos', '全部') : PERMS.filter(p => (u.perms || {})[p[0]]).length + '/' + PERMS.length;
  $('#t-body').innerHTML = `<div class="card tablewrap"><table class="t"><tr><th>${L('Nombre', '姓名')}</th><th>PIN (4)</th><th>${L('Rol', '角色')}</th><th>${L('Comisión %', '提成 %')}</th><th>${L('Dto. máx. %', '最大折扣 %')}</th><th></th></tr>
    ${S.users.map((u, i) => `<tr><td><input class="u-n" value="${esc(u.name)}"></td><td style="width:90px"><input class="u-p" value="${esc(u.pin)}" maxlength="4" inputmode="numeric"></td>
    <td><select class="u-r"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${L('Administrador', '管理员')}</option><option value="emp" ${u.role !== 'admin' ? 'selected' : ''}>${L('Empleado', '员工')}</option></select></td>
    <td style="width:100px"><input class="u-c" value="${num(u.comm)}" inputmode="decimal"></td><td style="width:100px"><input class="u-d" value="${u.maxDisc ?? 10}" inputmode="decimal" ${u.role === 'admin' ? 'disabled' : ''}></td>
    <td class="r" style="white-space:nowrap"><button class="sm" onclick="A.permsForm(${i})" ${u.role === 'admin' ? 'disabled' : ''}>🔐 ${L('Permisos', '权限')} (${n(u)})</button> <button class="sm bad" onclick="A.userDel(${i})">✕</button></td></tr>`).join('')}</table>
    <div class="row" style="margin-top:10px"><button onclick="A.usersSave(1)">＋ ${L('Usuario', '添加员工')}</button><button class="pri" onclick="A.usersSave()">💾 ${L('Guardar usuarios', '保存员工')}</button></div>
    <p class="small muted">${L('El administrador puede hacerlo todo. Comisión 0 % = no cobra comisión.', '管理员拥有全部权限。提成 0% = 不拿提成。')}</p></div>
    <div class="card"><h3>💰 ${L('Comisiones', '提成规则')}</h3><div style="max-width:320px">${sel(L('Calcular sobre', '提成基数'), 'cm-b', [['base', L('Venta sin IVA', '不含税销售额')], ['total', L('Venta con IVA', '含税销售额')]], c.comm.basis)}</div>
    <p class="small muted">${L('Cada ticket se asigna al vendedor que se elige en la venta (por defecto, quien cobra). Las devoluciones descuentan la comisión al vendedor del ticket original. En Productos → Categorías se puede poner un % distinto por categoría.', '每张单的提成算给收银时选择的销售员(默认是收银的人)。退货会从原销售员扣回提成。在 商品 → 分类 里可以给某个分类单独设置提成比例。')}</p>
    <h3>⏱ ${L('Fichajes', '考勤')}</h3>${chk(L('Al iniciar sesión, proponer fichar la entrada si no lo ha hecho', '登录时如果还没打卡,提醒上班打卡'), 'cm-a', c.askClock)}
    <button class="pri" onclick="S.cfg.comm.basis=fv('cm-b');S.cfg.askClock=fv('cm-a');dirty('cfg');toast(L('Guardado','已保存'))">${L('Guardar', '保存')}</button></div>`;
}
A.usersSave = add => {
  const g = c => $$('.' + c).map(e => e.value.trim()), ns = g('u-n').map(s => s.toUpperCase()), ps = g('u-p'), rs = g('u-r'), cs = g('u-c'), ds = g('u-d');
  if (ps.some(p => !/^\d{4}$/.test(p)) || new Set(ps).size !== ps.length) return toast(L('Cada PIN debe tener 4 cifras y ser distinto', '每个 PIN 必须是 4 位数字且不能重复'), true);
  if (!rs.includes('admin')) return toast(L('Debe quedar al menos un administrador', '至少保留一个管理员'), true);
  S.users.forEach((u, i) => Object.assign(u, { name: ns[i] || u.name, pin: ps[i], role: rs[i], comm: Math.max(0, num(cs[i])), maxDisc: Math.min(100, Math.max(0, num(ds[i]))) }));
  if (add) { let p; do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (ps.includes(p)); S.users.push({ id: uid(), name: 'NUEVO', pin: p, role: 'emp', perms: defPerms(), maxDisc: 10, comm: 0 }); }
  if (S.cfg.demo && !ps.includes('1111')) { S.cfg.demo = false; dirty('cfg'); }
  dirty('users'); toast(L('Usuarios guardados', '员工已保存')); render();
};
A.userDel = i => {
  if (S.users[i].id === USER.id) return toast(L('No puede eliminarse a sí mismo', '不能删除自己'), true);
  if (!confirm(L('¿Eliminar usuario? Sus ventas y fichajes se conservan.', '删除该员工?销售和考勤记录会保留。'))) return;
  S.users.splice(i, 1); dirty('users'); V.team();
};
A.permsForm = i => {
  const u = S.users[i], p = u.perms || defPerms();
  modal(`<h3>🔐 ${L('Permisos de', '权限:')} ${esc(u.name)}</h3><div class="row" style="margin-bottom:12px"><span class="small muted">${L('Plantillas', '快速设置')}:</span>
    <button class="sm" onclick="A.permsPreset('basic')">${L('Dependiente', '店员')}</button><button class="sm" onclick="A.permsPreset('mgr')">${L('Encargado', '店长')}</button><button class="sm" onclick="A.permsPreset('none')">${L('Ninguno', '全部取消')}</button></div>
    <div class="grid2">${PERMS.map(x => chk(L(x[1], x[2]), 'pm-' + x[0], p[x[0]])).join('')}</div>
    <p class="small muted">${L('Si le falta un permiso, un administrador (o alguien que lo tenga) puede autorizar esa operación con su PIN.', '没有权限时,管理员(或有该权限的人)可以输入 PIN 临时授权这一次操作。')}</p>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.permsSave(${i})">${L('Guardar', '保存')}</button>`)}`, true);
};
A.permsPreset = k => { const p = PRESETS_P[k](); PERMS.forEach(x => { $('#pm-' + x[0]).checked = p[x[0]]; }); };
A.permsSave = i => { S.users[i].perms = Object.fromEntries(PERMS.map(x => [x[0], fv('pm-' + x[0])])); dirty('users'); closeModal(); V.team(); };
