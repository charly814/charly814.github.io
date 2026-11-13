'use strict';
// ───────── Alta rápida, entrada de mercancía e inventario con el lector ─────────

// Alta rápida de un código desconocido. then(p) recibe el producto creado.
let QP_THEN = null;
A.quickProd = (code, then) => {
  if (!needPerm('prodEdit', () => A.quickProd(code, then))) return;
  QP_THEN = then;
  const last = S.products[S.products.length - 1] || {};
  modal(`<h3>＋ ${L('Nuevo producto', '新建商品')}</h3><div class="grid2">${fld(L('Código de barras', '条码'), 'qp-b', code, 'data-next="qp-n"')}
    ${sel(L('Categoría', '分类'), 'qp-c', S.cats.map(c => [c.id, catName(c.id)]), PF.cat || last.cat)}</div>
    <div class="grid2">${fld(L('Nombre (ticket) *', '西语名称(小票)*'), 'qp-n', '', 'autofocus data-next="qp-p"')}${fld(L('Nombre en chino', '中文名称'), 'qp-z', '')}</div>
    <div class="grid3">${fld(L('PVP (IVA incl.) *', '售价(含税)*'), 'qp-p', '', 'inputmode="decimal" data-next="qp-o"')}${fld(L('Coste', '成本'), 'qp-o', '', 'inputmode="decimal"')}${fld(L('Proveedor', '供应商'), 'qp-v', REC.supplier || last.supplier || '')}</div>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.quickSave()">${L('Guardar', '保存')}</button>`)}`);
};
A.quickSave = () => {
  const name = fv('qp-n'), price = r2(num(fv('qp-p'))), bc = fv('qp-b');
  if (!name || price <= 0) return toast(L('Nombre y precio son obligatorios', '名称和售价必填'), true);
  if (bc && findByCode(bc)) return toast(L('Ese código ya existe', '该条码已存在'), true);
  let nc; do { nc = newCodes(); } while (S.products.some(x => x.sku === nc.sku || x.barcode === nc.barcode));
  const p = { id: uid(), sku: nc.sku, barcode: bc || nc.barcode, name, zh: fv('qp-z'), cat: fv('qp-c'), price, cost: r2(num(fv('qp-o'))), stock: 0, min: 3, iva: S.cfg.iva, img: '', active: true, noDisc: false, supplier: fv('qp-v') };
  S.products.push(p); dirty('products'); closeModal(); beep(); toast(L('Producto creado: ', '已新建:') + name);
  const t = QP_THEN; QP_THEN = null; if (t) t(p);
};

// Lee "3*codigo" o el multiplicador escrito antes; devuelve [cantidad, código].
const splitMult = (raw, m) => { const x = String(raw).trim().match(/^(\d{1,4})[*xX](.*)$/); return x ? [Number(x[1]), x[2].trim()] : [m || 1, String(raw).trim()]; };
const scanBox = (id, ph, onEnter) => `<div class="scanwrap"><span class="mult hidden" id="${id}-m"></span><input id="${id}" data-scan class="scan" placeholder="${ph}" autocomplete="off" spellcheck="false"
  oninput="const x=this.value.match(/^(\\d{1,4})[*xX]$/);if(x){this.dataset.mult=x[1];this.value='';const m=$('#${id}-m');m.textContent='×'+x[1];m.classList.remove('hidden')}"
  onkeydown="if(event.key==='Enter'){event.preventDefault();event.stopPropagation();const r=splitMult(this.value,Number(this.dataset.mult||1));this.value='';this.dataset.mult='';$('#${id}-m').classList.add('hidden');if(r[1])${onEnter}(r[1],r[0])}"></div>`;

// ── Entrada de mercancía (albarán) ──
let REC = { supplier: '', note: '', lines: [] };
try { const r = JSON.parse(localStorage.getItem('bis-rec')); if (r && r.lines) REC = r; } catch (e) {}
const saveRec = () => localStorage.setItem('bis-rec', JSON.stringify(REC));
let RHL = '';
function pIn() {
  const ed = can('prodEdit'), cv = can('cost');
  const ls = REC.lines.filter(l => prod(l.pid));
  $('#p-body').innerHTML = `<div class="card"><div class="grid2">${fld(L('Proveedor', '供应商'), 'rc-s', REC.supplier, `onchange="REC.supplier=this.value;saveRec()"`)}${fld(L('Nº albarán / nota', '送货单号 / 备注'), 'rc-n', REC.note, `onchange="REC.note=this.value;saveRec()"`)}</div>
    ${scanBox('rq', L('Escanee cada artículo que entra  ·  12* + escanear = 12 unidades', '逐件扫描入库的商品 · 先输 12* 再扫 = 12 件'), 'A.recScan')}
    <p class="small muted" style="margin:6px 0 0">${L('Código desconocido → se abre el alta rápida. Nada cambia en el stock hasta pulsar «Confirmar entrada».', '扫到没有的条码会弹出新建商品。点「确认入库」之前库存不会变化。')}</p></div>
    <div class="card tablewrap">${ls.length ? `<table class="t"><tr><th>${L('Artículo', '商品')}</th><th>${L('Código', '条码')}</th><th class="r">${L('Stock actual', '现有库存')}</th><th style="width:90px">${L('Entra', '入库数量')}</th>
      ${cv ? `<th style="width:100px">${L('Coste', '成本')}</th>` : ''}<th style="width:100px">PVP</th><th></th></tr>
      ${ls.map(l => { const p = prod(l.pid); return `<tr class="${l.pid === RHL ? 'hl' : ''}"><td><b>${esc(p.name)}</b>${p.zh ? '<br><span class="small muted">' + esc(p.zh) + '</span>' : ''}</td><td class="small">${esc(p.barcode || p.sku)}</td><td class="r">${p.stock}</td>
      <td><input value="${l.qty}" inputmode="numeric" onchange="A.recSet('${l.pid}','qty',this.value)"></td>
      ${cv ? `<td><input value="${l.cost ?? p.cost}" inputmode="decimal" onchange="A.recSet('${l.pid}','cost',this.value)"></td>` : ''}
      <td><input value="${l.price ?? p.price}" inputmode="decimal" ${ed ? '' : 'disabled'} onchange="A.recSet('${l.pid}','price',this.value)"></td>
      <td class="r"><button class="sm bad" onclick="A.recDel('${l.pid}')">✕</button></td></tr>`; }).join('')}</table>
      <div class="row" style="margin-top:12px"><b>${sum(ls, 'qty')} ${L('unidades', '件')} · ${ls.length} ${L('artículos', '种')}</b>${cv ? `<span class="muted">${L('Coste total', '成本合计')}: ${eur(sum(ls, l => l.qty * num(l.cost ?? prod(l.pid).cost)))}</span>` : ''}
      <span class="grow"></span><button class="bad" onclick="if(confirm(L('¿Vaciar la lista?','清空列表?'))){REC.lines=[];saveRec();pIn()}">🗑 ${L('Vaciar', '清空')}</button>
      <button class="ok big" onclick="A.recConfirm()">✅ ${L('Confirmar entrada', '确认入库')}</button></div>`
    : `<div class="empty"><div style="font-size:42px">📥</div>${L('Escanee el primer artículo del pedido', '请扫描到货的第一件商品')}</div>`}</div>
    ${S.receipts.length ? `<div class="card tablewrap"><h3>${L('Entradas anteriores', '历史入库单')}</h3><table class="t">${S.receipts.slice(-30).reverse().map(r => `<tr class="click" onclick="A.recView('${r.id}')"><td>${r.no}</td><td>${fdt(r.ts)}</td><td>${esc(r.supplier)}</td><td class="small">${esc(r.note)}</td><td class="r">${sum(r.lines, 'qty')} ${L('ud.', '件')}</td>${cv ? `<td class="r">${eur(sum(r.lines, l => l.qty * l.cost))}</td>` : ''}<td class="small">${esc(r.user)}</td></tr>`).join('')}</table></div>` : ''}`;
  focusScan();
}
A.recScan = (code, qty) => {
  const p = findByCode(code);
  if (!p) { beep(false); return A.quickProd(code, np => A.recAdd(np, qty)); }
  A.recAdd(p, qty); beep();
};
A.recAdd = (p, qty) => {
  let l = REC.lines.find(x => x.pid === p.id);
  if (l) { l.qty += qty; REC.lines = [l, ...REC.lines.filter(x => x !== l)]; } else REC.lines.unshift({ pid: p.id, qty });
  RHL = p.id; saveRec(); pIn();
};
A.recSet = (pid, k, v) => { const l = REC.lines.find(x => x.pid === pid); l[k] = k === 'qty' ? Math.max(0, Math.round(num(v))) : r2(num(v)); saveRec(); pIn(); };
A.recDel = pid => { REC.lines = REC.lines.filter(x => x.pid !== pid); saveRec(); pIn(); };
A.recConfirm = () => {
  const ls = REC.lines.filter(l => prod(l.pid) && l.qty > 0); if (!ls.length) return;
  if (!confirm(L(`¿Dar entrada a ${sum(ls, 'qty')} unidades?`, `确认入库 ${sum(ls, 'qty')} 件?`))) return;
  const r = { id: uid(), no: nextNo('E', 4), ts: Date.now(), supplier: REC.supplier, note: REC.note, user: USER.name, lines: [] };
  ls.forEach(l => {
    const p = prod(l.pid);
    if (l.cost != null && can('cost')) p.cost = r2(l.cost);
    if (l.price != null && l.price > 0 && can('prodEdit')) p.price = r2(l.price);
    if (REC.supplier && !p.supplier) p.supplier = REC.supplier;
    stockMove(p, l.qty, 'in', r.no + (REC.supplier ? ' · ' + REC.supplier : ''));
    r.lines.push({ pid: p.id, name: p.name, qty: l.qty, cost: p.cost || 0 });
  });
  S.receipts.push(r); dirty('receipts'); dirty('products');
  REC = { supplier: REC.supplier, note: '', lines: [] }; saveRec(); pIn(); A.recView(r.id, true);
};
A.recView = (id, fresh) => {
  const r = S.receipts.find(x => x.id === id);
  modal(`<h3>${fresh ? '✅ ' + L('Entrada registrada', '入库完成') + ' · ' : '📥 '}${r.no}</h3><p class="muted">${fdt(r.ts)} · ${esc(r.supplier)} ${esc(r.note)} · ${esc(r.user)}</p>
    <div style="max-height:40vh;overflow:auto"><table class="t">${r.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="r b">+${l.qty}</td></tr>`).join('')}</table></div>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.recLabels('${id}')">🏷 ${L('Imprimir etiquetas', '打印价格标签')} (${sum(r.lines, 'qty')})</button>`)}`);
};
A.recLabels = id => {
  const r = S.receipts.find(x => x.id === id);
  printDoc(labelsHtml(r.lines.filter(l => prod(l.pid)).map(l => ({ p: prod(l.pid), n: l.qty }))), S.cfg.label.mode === 'roll' ? 'roll' : 'sheet');
};

// ── Inventario por escáner ──
let CNT = { cat: '', counts: {}, ts: 0 };
try { const c = JSON.parse(localStorage.getItem('bis-cnt')); if (c && c.counts) CNT = c; } catch (e) {}
const saveCnt = () => localStorage.setItem('bis-cnt', JSON.stringify(CNT));
let CHL = '';
function pCount() {
  const scope = S.products.filter(p => p.active !== false && (!CNT.cat || p.cat === CNT.cat));
  const ids = Object.keys(CNT.counts).filter(id => prod(id)), missing = scope.filter(p => !(p.id in CNT.counts) && p.stock !== 0);
  const order = [CHL, ...ids.filter(i => i !== CHL)].filter(i => ids.includes(i));
  $('#p-body').innerHTML = `<div class="card"><div class="row" style="margin-bottom:10px"><div style="width:240px">${sel(L('Qué se cuenta', '盘点范围'), 'cn-c', [['', L('Toda la tienda', '全店')], ...S.cats.map(c => [c.id, catName(c.id)])], CNT.cat)}</div>
    <span class="small muted grow">${CNT.ts ? L('Empezado ', '开始于 ') + fdt(CNT.ts) + '. ' : ''}${L('Escanee todas las unidades de la tienda una a una (o 5* + escanear). El conteo se guarda aunque cierre el programa.', '把店里的商品逐件扫描(或 5* 再扫)。关掉程序再打开,已扫的数量还在。')}</span></div>
    ${scanBox('cq', L('Escanee cada unidad que cuente', '逐件扫描盘点'), 'A.cntScan')}</div>
    <div class="stats"><div class="stat"><div class="k">${L('Artículos contados', '已盘商品')}</div><div class="v">${ids.length}</div></div><div class="stat"><div class="k">${L('Unidades contadas', '已盘件数')}</div><div class="v">${sum(ids, id => CNT.counts[id])}</div></div>
    <div class="stat"><div class="k">${L('Con stock y sin contar', '有库存但没盘到')}</div><div class="v" style="color:${missing.length ? 'var(--bad)' : 'var(--ok)'}">${missing.length}</div></div></div>
    <div class="card tablewrap">${ids.length ? `<table class="t"><tr><th>${L('Artículo', '商品')}</th><th class="r">${L('Sistema', '系统库存')}</th><th style="width:100px">${L('Contado', '实盘')}</th><th class="r">${L('Diferencia', '差异')}</th><th></th></tr>
      ${order.map(id => { const p = prod(id), d = CNT.counts[id] - p.stock; return `<tr class="${id === CHL ? 'hl' : ''}"><td><b>${esc(p.name)}</b> <span class="small muted">${esc(p.barcode || p.sku)}</span></td><td class="r">${p.stock}</td>
      <td><input value="${CNT.counts[id]}" inputmode="numeric" onchange="CNT.counts['${id}']=Math.max(0,Math.round(num(this.value)));saveCnt();pCount()"></td>
      <td class="r b" style="color:${d ? 'var(--bad)' : 'var(--ok)'}">${d > 0 ? '+' : ''}${d}</td><td class="r"><button class="sm bad" onclick="delete CNT.counts['${id}'];saveCnt();pCount()">✕</button></td></tr>`; }).join('')}</table>` : `<div class="empty"><div style="font-size:42px">📋</div>${L('Escanee la primera unidad', '请扫描第一件')}</div>`}
    ${missing.length ? `<details style="margin-top:12px"><summary class="small">${L('Ver los que tienen stock y no se han contado', '查看有库存但没盘到的商品')} (${missing.length})</summary><table class="t">${missing.slice(0, 300).map(p => `<tr><td>${esc(p.name)}</td><td class="small muted">${esc(p.barcode || p.sku)}</td><td class="r">${p.stock}</td></tr>`).join('')}</table></details>` : ''}
    ${ids.length ? `<div class="row" style="margin-top:12px">${chk(L('Los no contados pasan a stock 0', '没盘到的商品库存设为 0'), 'cn-z', false)}<span class="grow"></span>
      <button class="bad" onclick="if(confirm(L('¿Borrar el conteo?','清除本次盘点?'))){CNT={cat:CNT.cat,counts:{},ts:0};saveCnt();pCount()}">🗑 ${L('Empezar de nuevo', '重新开始')}</button>
      <button class="ok big" onclick="A.cntConfirm()">✅ ${L('Aplicar inventario', '确认盘点')}</button></div>` : ''}</div>`;
  $('#cn-c').onchange = e => { CNT.cat = e.target.value; saveCnt(); pCount(); };
  focusScan();
}
A.cntScan = (code, qty) => {
  const p = findByCode(code);
  if (!p) { beep(false); return toast(L('Código no encontrado: ', '找不到条码:') + code, true); }
  if (CNT.cat && p.cat !== CNT.cat) toast(L('⚠️ Este artículo es de otra categoría', '⚠️ 这件商品不属于本次盘点的分类'));
  if (!CNT.ts) CNT.ts = Date.now();
  CNT.counts[p.id] = (CNT.counts[p.id] || 0) + qty; CHL = p.id; saveCnt(); beep(); pCount();
};
A.cntConfirm = () => {
  const zero = fv('cn-z'), ids = Object.keys(CNT.counts).filter(id => prod(id));
  const rest = zero ? S.products.filter(p => p.active !== false && (!CNT.cat || p.cat === CNT.cat) && !(p.id in CNT.counts) && p.stock !== 0) : [];
  const ch = ids.filter(id => CNT.counts[id] !== prod(id).stock);
  if (!confirm(L(`Se ajustarán ${ch.length + rest.length} artículos. ¿Continuar?`, `将调整 ${ch.length + rest.length} 种商品的库存,确定?`))) return;
  ch.forEach(id => { const p = prod(id); stockMove(p, CNT.counts[id] - p.stock, 'inventory', 'Inventario'); });
  rest.forEach(p => stockMove(p, -p.stock, 'inventory', 'Inventario (no contado)'));
  CNT = { cat: CNT.cat, counts: {}, ts: 0 }; saveCnt(); toast(L('Inventario aplicado', '盘点已完成')); pCount();
};
