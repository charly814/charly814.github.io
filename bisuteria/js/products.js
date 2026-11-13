'use strict';
// ───────── Productos, stock, etiquetas, promociones ─────────
let PF = { q: '', cat: '', low: false, tab: 'list', sel: {} };
const lowStock = p => p.active !== false && p.stock <= (p.min || 0);

V.products = () => {
  const adm = can('prodEdit');
  $('#main').innerHTML = `<div class="page"><div class="tabs"><button class="${PF.tab === 'list' ? 'on' : ''}" onclick="PF.tab='list';V.products()">💍 ${L('Productos', '商品')}</button>
    ${adm ? `<button class="${PF.tab === 'cats' ? 'on' : ''}" onclick="PF.tab='cats';V.products()">🗂 ${L('Categorías', '分类')}</button><button class="${PF.tab === 'promos' ? 'on' : ''}" onclick="PF.tab='promos';V.products()">🏷️ ${L('Promociones', '促销')}</button>
    ` : ''}${can('stock') ? `<button class="${PF.tab === 'in' ? 'on' : ''}" onclick="PF.tab='in';V.products()">📥 ${L('Entrada por escáner', '扫码入库')}</button><button class="${PF.tab === 'count' ? 'on' : ''}" onclick="PF.tab='count';V.products()">📋 ${L('Inventario por escáner', '扫码盘点')}</button>
    <button class="${PF.tab === 'log' ? 'on' : ''}" onclick="PF.tab='log';V.products()">📦 ${L('Movimientos de stock', '库存记录')}</button>` : ''}</div><div id="p-body"></div></div>`;
  const ok = { list: 1, cats: adm, promos: adm, log: can('stock'), in: can('stock'), count: can('stock') };
  if (!ok[PF.tab]) PF.tab = 'list';
  ({ list: pList, cats: pCats, promos: pPromos, log: pLog, in: pIn, count: pCount })[PF.tab]();
};
function pList() {
  const adm = can('prodEdit'), cv = can('cost'), act = S.products.filter(p => p.active !== false);
  $('#p-body').innerHTML = `<div class="stats"><div class="stat"><div class="k">${L('Productos activos', '在售商品')}</div><div class="v">${act.length}</div></div>
    <div class="stat"><div class="k">${L('Unidades en stock', '库存件数')}</div><div class="v">${sum(act, p => Math.max(p.stock, 0))}</div></div>
    ${cv ? `<div class="stat"><div class="k">${L('Valor stock (coste)', '库存成本')}</div><div class="v">${eur(sum(act, p => Math.max(p.stock, 0) * (p.cost || 0)))}</div></div>
    <div class="stat"><div class="k">${L('Valor stock (PVP)', '库存售价')}</div><div class="v">${eur(sum(act, p => Math.max(p.stock, 0) * p.price))}</div></div>` : ''}
    <div class="stat"><div class="k">⚠️ ${L('Stock bajo', '库存不足')}</div><div class="v" style="color:var(--bad)">${act.filter(lowStock).length}</div></div></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><input class="grow" style="min-width:160px" placeholder="${L('Buscar nombre, referencia o código de barras', '搜索名称、货号或条码')}" value="${esc(PF.q)}" data-scan oninput="PF.q=this.value;A.pRows()" onkeydown="if(event.key==='Enter'){const p=findByCode(this.value);if(p){beep();this.value='';PF.q='';A.pRows();${adm ? 'A.prodEdit(p.id)' : can('stock') ? 'A.stockForm(p.id)' : ''}}}">
    <select style="width:150px" onchange="PF.cat=this.value;A.pRows()"><option value="">${L('Todas las categorías', '全部分类')}</option>${S.cats.map(c => `<option value="${c.id}" ${PF.cat === c.id ? 'selected' : ''}>${esc(catName(c.id))}</option>`).join('')}</select>
    <label class="ck" style="margin:0"><input type="checkbox" ${PF.low ? 'checked' : ''} onchange="PF.low=this.checked;A.pRows()"> ${L('Stock bajo', '只看库存不足')}</label>
    ${adm ? `<button class="pri" onclick="A.prodEdit('')">＋ ${L('Nuevo', '新商品')}</button>` : ''}<button onclick="A.labels()">🏷 ${L('Etiquetas', '打印标签')}</button>
    ${adm ? `<button onclick="A.prodCsv()">⬇ CSV</button><button onclick="$('#p-imp').click()">⬆ ${L('Importar', '导入')}</button><input type="file" id="p-imp" accept=".csv,.txt" class="hidden" onchange="A.prodImport(this)">` : ''}</div>
    <div class="tablewrap" id="p-rows"></div></div>`;
  A.pRows();
}
A.pRows = () => {
  const q = PF.q.toLowerCase().trim(), adm = can('prodEdit'), cv = can('cost'), st = can('stock');
  const list = S.products.filter(p => (!PF.cat || p.cat === PF.cat) && (!PF.low || lowStock(p)) && (!q || (p.name + ' ' + (p.zh || '') + ' ' + p.sku + ' ' + (p.barcode || '') + ' ' + (p.supplier || '')).toLowerCase().includes(q))).slice(0, 400);
  $('#p-rows').innerHTML = `<table class="t"><tr><th><input type="checkbox" onchange="A.pSelAll(this.checked)"></th><th>${L('Ref.', '货号')}</th><th>${L('Producto', '商品')}</th><th>${L('Categoría', '分类')}</th><th class="r">${L('PVP', '售价')}</th>${cv ? `<th class="r">${L('Coste', '成本')}</th>` : ''}<th class="r">${L('Stock', '库存')}</th><th></th></tr>
    ${list.map(p => `<tr><td><input type="checkbox" class="p-sel" value="${p.id}" ${PF.sel[p.id] ? 'checked' : ''} onchange="PF.sel['${p.id}']=this.checked"></td><td class="small">${esc(p.sku)}<br><span class="muted">${esc(p.barcode || '')}</span></td>
    <td class="${adm ? 'click' : ''}" ${adm ? `onclick="A.prodEdit('${p.id}')" style="cursor:pointer"` : ''}><b>${esc(p.name)}</b>${p.zh ? '<br><span class="small muted">' + esc(p.zh) + '</span>' : ''} ${p.active === false ? `<span class="tag bad">${L('Inactivo', '停售')}</span>` : ''}</td>
    <td class="small">${esc(catName(p.cat))}</td><td class="r b">${eur(p.price)}</td>${cv ? `<td class="r small">${eur(p.cost)}</td>` : ''}
    <td class="r"><span class="tag ${lowStock(p) ? 'bad' : 'ok'}">${p.stock}</span></td><td class="r">${st ? `<button class="sm" onclick="A.stockForm('${p.id}')">📦 ±</button>` : ''}</td></tr>`).join('')}</table>
    ${list.length ? '' : `<div class="empty">${L('Sin productos', '没有商品')}</div>`}`;
};
A.pSelAll = on => $$('.p-sel').forEach(c => { c.checked = on; PF.sel[c.value] = on; });
let pImg = '';
A.prodEdit = id => {
  const p = id ? prod(id) : { sku: '', barcode: '', name: '', zh: '', cat: PF.cat || (S.cats[0] || {}).id, price: '', cost: '', stock: 0, min: 3, iva: S.cfg.iva, img: '', active: true, noDisc: false, supplier: '' };
  pImg = p.img || '';
  modal(`<h3>${id ? L('Editar producto', '编辑商品') : L('Nuevo producto', '新商品')}</h3><div class="grid2">${fld(L('Nombre (ticket) *', '西语名称(小票)*'), 'p-n', p.name, 'autofocus')}${fld(L('Nombre en chino', '中文名称'), 'p-z', p.zh)}</div>
    <div class="grid3">${fld(L('Referencia', '货号'), 'p-s', p.sku, `placeholder="${L('automática', '自动生成')}"`)}${fld(L('Código de barras', '条码'), 'p-b', p.barcode, `placeholder="${L('escanear o automático', '扫码或自动生成')}" data-next="p-p"`)}
    ${sel(L('Categoría', '分类'), 'p-c', S.cats.map(c => [c.id, catName(c.id)]), p.cat)}
    ${fld(L('PVP (IVA incl.) *', '售价(含税)*'), 'p-p', p.price, 'inputmode="decimal"')}${fld(L('Coste', '成本'), 'p-o', p.cost, 'inputmode="decimal"')}${fld('IVA %', 'p-i', p.iva, 'inputmode="decimal"')}
    ${id ? '' : fld(L('Stock inicial', '初始库存'), 'p-k', p.stock, 'inputmode="numeric"')}${fld(L('Aviso stock mínimo', '最低库存提醒'), 'p-m', p.min, 'inputmode="numeric"')}${fld(L('Proveedor', '供应商'), 'p-v', p.supplier)}</div>
    <div class="row" style="margin-bottom:10px"><div id="p-im" style="width:64px;height:64px;border-radius:8px;background:var(--pri-soft) center/cover no-repeat;${pImg ? `background-image:url(${pImg})` : ''}"></div>
    <button onclick="$('#p-f').click()">📷 ${L('Foto', '照片')}</button><button class="sm" onclick="pImg='';$('#p-im').style.backgroundImage=''">✕</button><input type="file" id="p-f" accept="image/*" capture="environment" class="hidden" onchange="A.prodImg(this)"></div>
    ${chk(L('Activo (se puede vender)', '在售'), 'p-a', p.active !== false)}${chk(L('Botón rápido en la venta (para artículos sin código, ej. bolsa de regalo)', '收银界面快捷按钮(用于没有条码的商品,如礼品袋)'), 'p-fv', p.fav)}${chk(L('Excluir de descuentos y promociones', '不参加折扣和促销'), 'p-x', p.noDisc)}
    ${mfoot(id ? `<button class="bad" onclick="A.prodDel('${id}')">${L('Eliminar', '删除')}</button><button onclick="A.prodDup('${id}')">${L('Duplicar', '复制')}</button>` : '', btnClose(), `<button class="pri" data-enter onclick="A.prodSave('${id}')">${L('Guardar', '保存')}</button>`)}`, true);
};
A.prodImg = inp => {
  const f = inp.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => { const k = Math.min(1, 260 / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = img.width * k; cv.height = img.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); pImg = cv.toDataURL('image/jpeg', 0.72); $('#p-im').style.backgroundImage = `url(${pImg})`; URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(f);
};
function newCodes() { S.cfg.seq.prod = (S.cfg.seq.prod || 0) + 1; dirty('cfg'); const n = S.cfg.seq.prod; return { sku: 'A' + pad(n, 4), barcode: ean13('20' + pad(n, 10)) }; }
A.prodSave = id => {
  const name = fv('p-n'), price = r2(num(fv('p-p'))); if (!name || price <= 0) return toast(L('Nombre y precio son obligatorios', '名称和售价必填'), true);
  let sku = fv('p-s'), bc = fv('p-b');
  if (!sku || !bc) { let nc; do { nc = newCodes(); } while (S.products.some(x => x.sku === nc.sku || x.barcode === nc.barcode)); sku = sku || nc.sku; bc = bc || nc.barcode; }
  if (S.products.some(x => x.id !== id && (x.sku.toLowerCase() === sku.toLowerCase() || (x.barcode && x.barcode === bc)))) return toast(L('Referencia o código de barras repetido', '货号或条码重复'), true);
  let p = id && prod(id);
  if (!p) { p = { id: uid(), stock: 0 }; S.products.push(p); }
  Object.assign(p, { name, zh: fv('p-z'), sku, barcode: bc, cat: fv('p-c'), price, cost: r2(num(fv('p-o'))), iva: num(fv('p-i')), min: num(fv('p-m')), supplier: fv('p-v'), img: pImg, active: fv('p-a'), noDisc: fv('p-x'), fav: fv('p-fv') });
  dirty('products');
  if (!id) { const k = num(fv('p-k')); if (k) stockMove(p, k, 'in', 'Stock inicial'); }
  closeModal(); V.products();
};
A.prodDup = id => { const p = prod(id), nc = newCodes(); S.products.push({ ...p, id: uid(), ...nc, name: p.name + ' (copia)', stock: 0 }); dirty('products'); closeModal(); V.products(); };
A.prodDel = id => { if (!confirm(L('¿Eliminar el producto? Los tickets antiguos se conservan.', '确定删除该商品?历史单据会保留。'))) return; S.products = S.products.filter(p => p.id !== id); dirty('products'); closeModal(); V.products(); };
A.stockForm = id => {
  const p = prod(id);
  modal(`<h3>📦 ${esc(p.name)}</h3><p>${L('Stock actual', '当前库存')}: <b>${p.stock}</b></p>
    ${sel(L('Operación', '操作'), 's-t', [['in', L('Entrada de mercancía (+)', '进货入库 (+)')], ['out', L('Salida / rotura / pérdida (−)', '损耗 / 丢失 (−)')], ['set', L('Inventario: fijar stock real', '盘点:直接设为实际库存')]], 'in')}
    <div class="grid2">${fld(L('Cantidad', '数量'), 's-q', '', 'inputmode="numeric" autofocus')}${fld(L('Nota', '备注'), 's-n', '')}</div>
    ${mfoot(btnClose(), `<button class="pri" data-enter onclick="A.stockSave('${id}')">${L('Guardar', '保存')}</button>`)}`);
};
A.stockSave = id => {
  const p = prod(id), t = fv('s-t'), q = num(fv('s-q')); if (q < 0 || (!q && t !== 'set')) return;
  stockMove(p, t === 'in' ? q : t === 'out' ? -q : q - p.stock, t === 'set' ? 'inventory' : t, fv('s-n')); closeModal(); V.products();
};
A.prodCsv = () => download('productos.csv', csv([['referencia', 'codigo_barras', 'nombre', 'nombre_chino', 'categoria', 'pvp', 'coste', 'stock', 'minimo', 'iva', 'proveedor'],
  ...S.products.map(p => [p.sku, p.barcode, p.name, p.zh, (S.cats.find(c => c.id === p.cat) || {}).name, String(p.price).replace('.', ','), String(p.cost).replace('.', ','), p.stock, p.min, p.iva, p.supplier])]), 'text/csv');
function parseCsv(text) {
  text = text.replace(/^﻿/, ''); const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
// Importa el mismo formato que exporta. Si la referencia ya existe se actualiza.
A.prodImport = inp => {
  const f = inp.files[0]; if (!f) return;
  f.text().then(txt => {
    const rows = parseCsv(txt); if (rows.length < 2) return toast(L('Archivo vacío', '文件是空的'), true);
    const hd = rows[0].map(h => h.trim().toLowerCase()), col = n => hd.indexOf(n);
    if (col('nombre') < 0 || col('pvp') < 0) return toast(L('Faltan las columnas "nombre" y "pvp". Exporte primero un CSV como plantilla.', '缺少 nombre 和 pvp 列。请先导出 CSV 当模板。'), true);
    let add = 0, upd = 0;
    rows.slice(1).forEach(r => {
      const g = n => col(n) >= 0 ? (r[col(n)] || '').trim() : '', name = g('nombre'), price = r2(num(g('pvp'))); if (!name || price <= 0) return;
      let cat = S.cats.find(c => c.name.toLowerCase() === g('categoria').toLowerCase());
      if (!cat && g('categoria')) { cat = { id: uid(), name: g('categoria'), zh: '' }; S.cats.push(cat); dirty('cats'); }
      let p = g('referencia') && S.products.find(x => x.sku.toLowerCase() === g('referencia').toLowerCase());
      if (p) upd++; else { const nc = newCodes(); p = { id: uid(), sku: g('referencia') || nc.sku, barcode: nc.barcode, stock: 0, active: true, img: '', noDisc: false }; S.products.push(p); add++; }
      Object.assign(p, { name, zh: g('nombre_chino') || p.zh || '', barcode: g('codigo_barras') || p.barcode, cat: cat ? cat.id : p.cat || (S.cats[0] || {}).id, price, cost: r2(num(g('coste'))), min: num(g('minimo')), iva: g('iva') ? num(g('iva')) : S.cfg.iva, supplier: g('proveedor') });
      if (g('stock') !== '' && num(g('stock')) !== p.stock) stockMove(p, num(g('stock')) - p.stock, 'inventory', 'Importación CSV');
    });
    dirty('products'); toast(L(`Importados: ${add} nuevos, ${upd} actualizados`, `导入完成:新增 ${add},更新 ${upd}`)); V.products();
  });
  inp.value = '';
};
A.labels = () => {
  const ids = Object.keys(PF.sel).filter(k => PF.sel[k] && prod(k));
  if (!ids.length) return toast(L('Marque primero los productos en la lista', '请先在列表里勾选商品'));
  const lb = S.cfg.label;
  modal(`<h3>🏷 ${L('Imprimir etiquetas', '打印价格标签')}</h3><div class="grid2">${sel(L('Formato', '格式'), 'l-m', [['a4', L('Hoja A4 de etiquetas', 'A4 标签纸')], ['roll', L('Impresora de etiquetas (rollo)', '标签打印机(卷纸)')]], lb.mode)}
    ${fld(L('Columnas (A4)', '每行个数 (A4)'), 'l-c', lb.cols, 'inputmode="numeric"')}${fld(L('Ancho mm (rollo)', '宽 mm(卷纸)'), 'l-w', lb.w, 'inputmode="numeric"')}${fld(L('Alto mm', '高 mm'), 'l-h', lb.h, 'inputmode="numeric"')}</div>
    <div style="max-height:36vh;overflow:auto"><table class="t">${ids.map(id => { const p = prod(id); return `<tr><td>${esc(p.name)}</td><td class="r">${eur(p.price)}</td><td style="width:80px"><input id="l-n-${id}" value="${Math.max(1, Math.min(p.stock, 200))}" inputmode="numeric"></td></tr>`; }).join('')}</table></div>
    <div class="row" style="margin-top:8px"><button class="sm" onclick="$$('[id^=l-n-]').forEach(e=>e.value=1)">${L('1 de cada', '每个 1 张')}</button></div>
    ${mfoot(btnClose(), `<button class="pri" onclick="A.labelsPrint()">🖨 ${L('Imprimir', '打印')}</button>`)}`);
};
A.labelsPrint = () => {
  Object.assign(S.cfg.label, { mode: fv('l-m'), cols: Math.max(1, num(fv('l-c'))), w: num(fv('l-w')) || 40, h: num(fv('l-h')) || 30 }); dirty('cfg');
  const items = $$('[id^=l-n-]').map(e => ({ p: prod(e.id.slice(4)), n: Math.max(0, Math.floor(num(e.value))) }));
  printDoc(labelsHtml(items), S.cfg.label.mode === 'roll' ? 'roll' : 'sheet');
};

// Categorías
function pCats() {
  $('#p-body').innerHTML = `<div class="card"><table class="t"><tr><th>${L('Nombre', '西语名称')}</th><th>${L('Chino', '中文名称')}</th><th title="vacío = la del vendedor">${L('Comisión % (vacío = la del vendedor)', '提成 %(留空 = 按员工比例)')}</th><th class="r">${L('Productos', '商品数')}</th><th></th></tr>
    ${S.cats.map((c, i) => `<tr><td><input value="${esc(c.name)}" onchange="S.cats[${i}].name=this.value;dirty('cats')"></td><td><input value="${esc(c.zh || '')}" onchange="S.cats[${i}].zh=this.value;dirty('cats')"></td><td style="width:120px"><input value="${c.comm ?? ''}" inputmode="decimal" onchange="S.cats[${i}].comm=this.value.trim()===''?'':num(this.value);dirty('cats')"></td>
    <td class="r">${S.products.filter(p => p.cat === c.id).length}</td><td class="r"><button class="sm" onclick="A.catMove(${i},-1)">↑</button> <button class="sm" onclick="A.catMove(${i},1)">↓</button> <button class="sm bad" onclick="A.catDel(${i})">✕</button></td></tr>`).join('')}</table>
    <button class="pri" style="margin-top:10px" onclick="S.cats.push({id:uid(),name:'Nueva',zh:''});dirty('cats');V.products()">＋ ${L('Añadir categoría', '添加分类')}</button></div>`;
}
A.catMove = (i, d) => { const j = i + d; if (j < 0 || j >= S.cats.length) return;[S.cats[i], S.cats[j]] = [S.cats[j], S.cats[i]]; dirty('cats'); V.products(); };
A.catDel = i => { if (S.products.some(p => p.cat === S.cats[i].id)) return toast(L('Tiene productos: muévalos antes', '该分类下还有商品,请先移走'), true); S.cats.splice(i, 1); dirty('cats'); V.products(); };

// Promociones
function pPromos() {
  const today = dstr(Date.now());
  const desc = p => (p.type === 'pct' ? '-' + p.pct + '%' : p.n + 'x' + p.m) + ' · ' + (p.scope === 'all' ? L('Toda la tienda', '全场') : p.scope === 'cat' ? catName(p.target) : (prod(p.target) || {}).name || '?');
  $('#p-body').innerHTML = `<div class="card"><div class="row between" style="margin-bottom:10px"><span class="muted small">${L('Se aplican solas al vender. No se suman al descuento de socio.', '收银时自动生效,不与会员折扣叠加。')}</span><button class="pri" onclick="A.promoEdit('')">＋ ${L('Nueva promoción', '新促销')}</button></div>
    <table class="t">${S.promos.map(p => `<tr class="click" onclick="A.promoEdit('${p.id}')"><td><b>${esc(p.name)}</b></td><td>${esc(desc(p))}</td><td class="small">${p.from || '…'} → ${p.to || '…'}</td>
    <td><span class="tag ${p.active && (!p.to || p.to >= today) ? 'ok' : 'bad'}">${p.active && (!p.to || p.to >= today) ? L('Activa', '生效中') : L('Inactiva', '未生效')}</span></td></tr>`).join('')}</table>
    ${S.promos.length ? '' : `<div class="empty">${L('Ejemplos: «3x2 en pendientes», «-20% en collares», «Rebajas -30% toda la tienda».', '例如:「耳环 3x2(买三付二)」「项链 -20%」「全场 -30%」。')}</div>`}</div>`;
}
A.promoEdit = id => {
  const p = id ? S.promos.find(x => x.id === id) : { name: '', type: 'nxm', pct: 20, n: 3, m: 2, scope: 'cat', target: (S.cats[0] || {}).id, from: '', to: '', active: true };
  const targets = [...S.cats.map(c => ['cat:' + c.id, '🗂 ' + catName(c.id)]), ...S.products.map(x => ['prod:' + x.id, x.sku + ' ' + x.name])];
  modal(`<h3>🏷️ ${L('Promoción', '促销')}</h3>${fld(L('Nombre (sale en el ticket) *', '名称(显示在小票上)*'), 'r-n', p.name, 'autofocus placeholder="3x2 Pendientes"')}
    <div class="grid3">${sel(L('Tipo', '类型'), 'r-t', [['nxm', L('Lleva N paga M', '买 N 付 M')], ['pct', L('% de descuento', '百分比折扣')]], p.type)}${fld(L('Lleva (N)', '买 N'), 'r-a', p.n, 'inputmode="numeric"')}${fld(L('Paga (M)', '付 M'), 'r-b', p.m, 'inputmode="numeric"')}
    ${fld(L('% descuento', '折扣 %'), 'r-p', p.pct, 'inputmode="decimal"')}${fld(L('Desde', '开始'), 'r-f', p.from, 'type="date"')}${fld(L('Hasta', '结束'), 'r-u', p.to, 'type="date"')}</div>
    ${sel(L('Se aplica a', '适用范围'), 'r-s', [['all:', L('Toda la tienda', '全场')], ...targets], p.scope + ':' + (p.target || ''))}${chk(L('Activa', '启用'), 'r-x', p.active)}
    ${mfoot(id ? `<button class="bad" onclick="S.promos=S.promos.filter(x=>x.id!=='${id}');dirty('promos');closeModal();V.products()">${L('Eliminar', '删除')}</button>` : '', btnClose(), `<button class="pri" data-enter onclick="A.promoSave('${id}')">${L('Guardar', '保存')}</button>`)}`);
};
A.promoSave = id => {
  const [scope, target] = fv('r-s').split(':'), o = { name: fv('r-n'), type: fv('r-t'), n: Math.floor(num(fv('r-a'))), m: Math.floor(num(fv('r-b'))), pct: num(fv('r-p')), from: fv('r-f'), to: fv('r-u'), scope, target, active: fv('r-x') };
  if (!o.name) return toast(L('Ponga un nombre', '请填写名称'), true);
  if (o.type === 'nxm' ? !(o.n > o.m && o.m >= 1) : !(o.pct > 0 && o.pct <= 100)) return toast(L('Valores no válidos', '数值不正确'), true);
  let p = id && S.promos.find(x => x.id === id); if (!p) { p = { id: uid() }; S.promos.push(p); }
  Object.assign(p, o); dirty('promos'); closeModal(); V.products();
};
function pLog() {
  const T = { sale: ['Venta', '销售'], return: ['Devolución', '退货'], in: ['Entrada', '入库'], out: ['Salida', '损耗'], inventory: ['Inventario', '盘点'] };
  $('#p-body').innerHTML = `<div class="card tablewrap"><table class="t"><tr><th>${L('Fecha', '时间')}</th><th>${L('Producto', '商品')}</th><th>${L('Tipo', '类型')}</th><th class="r">${L('Cant.', '数量')}</th><th class="r">${L('Stock', '结存')}</th><th>${L('Nota', '备注')}</th><th>${L('Usuario', '员工')}</th></tr>
    ${S.stocklog.slice(-300).reverse().map(l => `<tr><td class="small">${fdt(l.ts)}</td><td>${esc((prod(l.pid) || {}).name || '—')}</td><td>${L(...(T[l.type] || [l.type, l.type]))}</td><td class="r b">${l.qty > 0 ? '+' : ''}${l.qty}</td><td class="r">${l.after}</td><td class="small">${esc(l.note)}</td><td class="small">${esc(l.user)}</td></tr>`).join('')}</table></div>`;
}
