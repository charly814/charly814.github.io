// Back-office de Platet (admin.html): productos con foto, categorías,
// modificadores, usuarios, horario QR, datos del negocio, voz/IA, copias de
// seguridad e informes de ventas. Usa el mismo Store que el TPV, así que los
// cambios se ven al momento en el TPV y en la carta QR.
(function () {
  'use strict';

  var P = window.Platet;
  var fmt = P.fmt, esc = P.esc, round2 = P.round2;
  var I = I18N.init('platet-lang-pos');
  var t = function (k, v) { return I.t(k, v); };

  var A = {
    user: null,
    sec: 'panel',
    menu: P.DEFAULT_MENU,
    mods: P.DEFAULT_MODS,
    users: P.DEFAULT_USERS,
    settings: P.DEFAULT_SETTINGS,
    qr: P.DEFAULT_QR,
    layout: P.LAYOUT,
    temp: {},
    sales: {},
    archive: null,
    q: '',
    catF: '',
    range: 'today',
    from: '',
    to: ''
  };
  try { A.sec = sessionStorage.getItem('platet-adm-sec') || 'panel'; } catch (e) { /* ignorar */ }

  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');

  // ---------------------------------------------------------------- datos

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function saveMenu(menu) { A.menu = menu; return Store.set('menu', menu); }
  function saveMods(mods) { A.mods = mods; return Store.set('mods', mods); }
  function saveUsers(users) {
    if (!users.some(function (u) { return u.admin; })) { toast(t('msg.needAdmin')); render(); return; }
    A.users = users;
    return Store.set('users', users);
  }
  function locate(pid) {
    for (var ci = 0; ci < A.menu.length; ci++) {
      var items = A.menu[ci].items || [];
      for (var ii = 0; ii < items.length; ii++) if (items[ii].id === pid) return { ci: ci, ii: ii };
    }
    return null;
  }

  // ---------------------------------------------------------------- render

  var raf = 0;
  function later() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }

  function render() {
    // no repintar mientras se escribe en un campo editable en línea
    var a = document.activeElement;
    if (a && app.contains(a) && a.dataset && a.dataset.edit && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox') {
      A.dirty = true;
      return;
    }
    A.dirty = false;
    var fid = a && a.id && app.contains(a) ? a.id : null;
    var sel = fid && a.selectionStart;
    if (Store.mode === 'cloud' && !Store.hasAuth) app.innerHTML = viewNoAuth();
    else if (!A.user) app.innerHTML = viewLogin();
    else app.innerHTML = shell();
    if (fid) {
      var n = document.getElementById(fid);
      if (n) { n.focus(); try { if (sel != null) n.setSelectionRange(sel, sel); } catch (e) { /* ignorar */ } }
    }
  }
  app.addEventListener('focusout', function () { setTimeout(function () { if (A.dirty) render(); }, 0); });

  function langSwitch() {
    return '<span class="lang">' + Object.keys(I.LANGS).map(function (l) {
      return '<button class="' + (I.lang === l ? 'on' : '') + '" data-act="lang" data-l="' + l + '">' + I.LANGS[l] + '</button>';
    }).join('') + '</span>';
  }

  function viewNoAuth() {
    return '<section class="login-adm card"><h2>' + t('adm.loginTitle') + '</h2><p>' + t('setup.p1') + '</p>' +
      '<a class="btn primary" href="pos.html">' + t('adm.toPos') + '</a></section>';
  }

  function viewLogin() {
    var admins = A.users.map(function (u, i) { return { u: u, i: i }; }).filter(function (x) { return x.u.admin; });
    return '<section class="login-adm card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2>' + t('adm.loginTitle') + '</h2>' + langSwitch() + '</div>' +
      '<p class="muted">' + t('adm.loginHelp') + '</p><div class="user-grid">' +
      admins.map(function (x) { return '<button class="user-tile" data-act="pick-user" data-i="' + x.i + '">' + esc(x.u.name) + '</button>'; }).join('') +
      '</div><p style="margin-top:20px"><a href="pos.html">' + t('adm.toPos') + '</a></p></section>';
  }

  var SECTIONS = [
    ['panel', 'adm.nav.panel', secPanel],
    ['products', 'adm.nav.products', secProducts],
    ['import', 'adm.nav.import', secImport],
    ['cats', 'adm.nav.cats', secCats],
    ['mods', 'adm.nav.mods', secMods],
    ['tables', 'adm.nav.tables', secTables],
    ['hours', 'adm.nav.hours', secHours],
    ['users', 'adm.nav.users', secUsers],
    ['audit', 'adm.nav.audit', secAudit],
    ['devices', 'adm.nav.devices', secDevices],
    ['business', 'adm.nav.business', secBusiness],
    ['ticket', 'adm.nav.ticket', secTicket],
    ['voice', 'adm.nav.voice', secVoice],
    ['backup', 'adm.nav.backup', secBackup]
  ];

  function shell() {
    var sec = SECTIONS.filter(function (s) { return s[0] === A.sec; })[0] || SECTIONS[0];
    var body = sec[2]();
    return '<div class="adm-shell"><nav class="adm-nav"><div class="brand-sm">🍴 Platet<small>' + t('adm.title') + ' · ' + esc(A.user.name) + '</small></div>' +
      SECTIONS.map(function (s) {
        return '<button class="' + (s[0] === sec[0] ? 'on' : '') + '" data-act="sec" data-s="' + s[0] + '">' + t(s[1]) + '</button>';
      }).join('') +
      '<div class="spacer"></div>' + langSwitch() +
      '<a href="pos.html">' + t('adm.toPos') + '</a><button data-act="logout">⎋ ' + t('tb.logout') + '</button></nav>' +
      '<section class="adm-main"><header class="adm-head"><h1>' + t(sec[1]).replace(/^\S+\s/, '') + '</h1>' + (body.head || '') + '</header>' +
      '<div class="adm-body">' + body.html + '</div></section></div>';
  }

  // ---------------------------------------------------------------- imágenes

  function imgTag(key, v, fallback, cls) {
    var url = v ? Store.imageURL(key, v, later) : '';
    return '<div class="' + (cls || 'thumb') + '">' + (url ? '<img src="' + url + '" alt="">' : esc(fallback || '🍽️')) + '</div>';
  }

  // Reduce la foto a 600 px como máximo y la pasa a JPEG (unos 40-80 KB).
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        var g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var q = 0.82, d = c.toDataURL('image/jpeg', q);
        while (d.length > 160000 && q > 0.4) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
        resolve(d);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- productos

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function secProducts() {
    var q = norm(A.q);
    var rows = [];
    A.menu.forEach(function (c) {
      if (A.catF && c.id !== A.catF) return;
      (c.items || []).forEach(function (it, ii) {
        if (q && [it.name, it.en, it.zh].map(norm).join(' ').indexOf(q) < 0) return;
        rows.push({ c: c, it: it, ii: ii, last: ii === c.items.length - 1 });
      });
    });
    var head = '<div class="toolbar"><input id="q" type="search" placeholder="' + t('adm.search') + '" value="' + esc(A.q) + '">' +
      '<select data-act-change="catF">' + '<option value="">' + t('adm.allCats') + '</option>' +
      A.menu.map(function (c) { return '<option value="' + esc(c.id) + '"' + (A.catF === c.id ? ' selected' : '') + '>' + esc(c.icon || '') + ' ' + esc(P.tr(c, I.lang)) + '</option>'; }).join('') +
      '</select><button class="btn primary" data-act="prod-new">' + t('adm.newProduct') + '</button></div>';
    var html = '<div class="card" style="padding:0;overflow:hidden"><div class="scroll-x"><table class="grid"><tr>' +
      '<th>' + t('adm.col.photo') + '</th><th>' + t('adm.col.product') + '</th><th class="hide-sm">' + t('adm.col.cat') + '</th><th class="num">' + t('adm.col.price') + '</th>' +
      '<th>' + t('adm.col.avail') + '</th><th class="hide-sm">' + t('adm.col.allergens') + '</th><th></th></tr>' +
      rows.map(function (r) {
        var it = r.it, id = esc(it.id);
        return '<tr class="' + (it.available === false ? 'off-row' : '') + '">' +
          '<td>' + imgTag('p-' + it.id, it.img, r.c.icon) + '</td>' +
          '<td><b>' + esc(it.name) + '</b>' + ((it.en || it.zh) ? '<small>' + esc([it.en, it.zh].filter(Boolean).join(' · ')) + '</small>' : '') + '</td>' +
          '<td class="hide-sm">' + esc(r.c.icon || '') + ' ' + esc(P.tr(r.c, I.lang)) + '</td>' +
          '<td class="num">' + fmt(it.price) + '</td>' +
          '<td><label class="switch"><input type="checkbox" data-edit="avail" data-pid="' + id + '"' + (it.available !== false ? ' checked' : '') + '><span></span></label></td>' +
          '<td class="hide-sm al">' + (it.allergens || []).map(function (a) {
            var al = P.ALLERGENS.filter(function (x) { return x.id === a; })[0];
            return al ? '<span title="' + esc(P.tr(al, I.lang)) + '">' + al.icon + '</span>' : '';
          }).join('') + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn" title="' + t('adm.edit') + '" data-act="prod-edit" data-pid="' + id + '">✏️</button>' +
          '<button class="icon-btn" title="' + t('adm.duplicate') + '" data-act="prod-dup" data-pid="' + id + '">⧉</button>' +
          (A.catF ? '<button class="icon-btn" title="' + t('adm.up') + '" data-act="prod-move" data-d="-1" data-pid="' + id + '"' + (r.ii === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="icon-btn" title="' + t('adm.down') + '" data-act="prod-move" data-d="1" data-pid="' + id + '"' + (r.last ? ' disabled' : '') + '>↓</button>' : '') +
          '<button class="icon-btn danger" title="' + t('adm.delete') + '" data-act="prod-del" data-pid="' + id + '">🗑️</button>' +
          '</div></td></tr>';
      }).join('') + '</table></div>' +
      (rows.length ? '' : '<p class="muted" style="padding:16px">' + t('adm.noResults') + '</p>') + '</div>' +
      '<p class="muted">' + t('adm.count', { n: rows.length }) + ' · ' + t('admin.soldOutNote') + '</p>';
    return { head: head, html: html };
  }

  function openProduct(pid, catId) {
    var loc = pid ? locate(pid) : null;
    var cur = loc ? A.menu[loc.ci].items[loc.ii] : null;
    var st = cur ? clone(cur) : { name: '', en: '', zh: '', desc: '', desc_en: '', desc_zh: '', price: '', available: true, allergens: [], img: 0 };
    st.cat = loc ? A.menu[loc.ci].id : (catId || A.catF || (A.menu[0] && A.menu[0].id));
    st.allergens = st.allergens || [];
    var photo = { data: null, removed: false };     // foto nueva sin guardar

    function field(k, label, type, extra) {
      var v = st[k] == null ? '' : st[k];
      if (type === 'textarea') return '<div class="field ' + (extra || '') + '"><label>' + label + '</label><textarea data-f="' + k + '" rows="2">' + esc(v) + '</textarea></div>';
      // precio: texto con teclado numérico, para poder escribir "9,50" con coma
      return '<div class="field ' + (extra || '') + '"><label>' + label + '</label><input type="text" data-f="' + k + '" value="' + esc(v) + '"' + (type === 'number' ? ' inputmode="decimal" placeholder="0,00"' : '') + '></div>';
    }
    function draw() {
      var cat = A.menu.filter(function (c) { return c.id === st.cat; })[0] || {};
      var prev = photo.data ? '<img src="' + photo.data + '" alt="">'
        : (!photo.removed && cur && cur.img ? (function () { var u = Store.imageURL('p-' + cur.id, cur.img, draw); return u ? '<img src="' + u + '" alt="">' : esc(cat.icon || '🍽️'); })() : esc(cat.icon || '🍽️'));
      var hasPhoto = photo.data || (!photo.removed && cur && cur.img);
      modalBox.className = 'modal-box wide';
      modalBox.innerHTML = '<h2>' + (cur ? t('adm.editProduct') : t('adm.newProduct').replace(/^\S+\s/, '')) + '</h2>' +
        '<div class="form-grid">' +
        field('name', t('adm.nameEs')) + field('price', t('adm.price'), 'number') +
        field('en', t('adm.nameEn')) + field('zh', t('adm.nameZh')) +
        field('barcode', t('adm.barcode')) + '<div></div>' +
        '<div class="field"><label>' + t('adm.col.cat') + '</label><select data-f="cat">' + A.menu.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === st.cat ? ' selected' : '') + '>' + esc(c.icon || '') + ' ' + esc(c.name) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>' + t('adm.col.avail') + '</label><label class="switch"><input type="checkbox" data-f="available"' + (st.available !== false ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="field full"><label>' + t('adm.photo') + '</label><div class="photo-box"><div class="preview">' + prev + '</div><div>' +
        '<label class="btn primary" style="display:inline-flex;align-items:center;cursor:pointer">' + t('adm.upload') + '<input id="ph-file" type="file" accept="image/*" hidden></label> ' +
        (hasPhoto ? '<button class="btn" data-k="nophoto">' + t('adm.removePhoto') + '</button>' : '') +
        '<p class="muted">' + t('adm.photoHelp') + '</p></div></div></div>' +
        field('desc', t('adm.descEs'), 'textarea', 'full') + field('desc_en', t('adm.descEn'), 'textarea') + field('desc_zh', t('adm.descZh'), 'textarea') +
        '<p class="muted full">' + t('adm.descHelp') + '</p>' +
        '<div class="field full"><label>' + t('adm.col.allergens') + '</label><div class="allergen-pick">' + P.ALLERGENS.map(function (al) {
          return '<button class="' + (st.allergens.indexOf(al.id) >= 0 ? 'on' : '') + '" data-k="al:' + al.id + '">' + al.icon + ' ' + esc(P.tr(al, I.lang)) + '</button>';
        }).join('') + '</div><p class="muted">' + t('adm.allergensHelp') + '</p></div>' +
        '</div><div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('save') + '</button></div>';
      modalBox.querySelectorAll('[data-f]').forEach(function (el) {
        var ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(ev, function () { st[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
      });
      document.getElementById('ph-file').onchange = function (e) {
        var f = e.target.files[0];
        if (!f) return;
        compress(f).then(function (d) { photo.data = d; photo.removed = false; draw(); }).catch(function () { toast(t('adm.photoErr')); });
      };
    }
    openModal('product', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === 'nophoto') { photo.data = null; photo.removed = true; return draw(); }
      if (k.indexOf('al:') === 0) {
        var a = k.slice(3), i = st.allergens.indexOf(a);
        if (i >= 0) st.allergens.splice(i, 1); else st.allergens.push(a);
        return draw();
      }
      if (k !== 'OK') return;
      var price = round2(String(st.price).replace(',', '.'));
      if (!String(st.name).trim() || String(st.price).trim() === '' || isNaN(price)) return toast(t('adm.required'));
      var menu = clone(A.menu);
      var id = cur ? cur.id : st.cat + '-' + Store.newId();
      var item = {
        id: id, name: String(st.name).trim(), en: String(st.en || '').trim(), zh: String(st.zh || '').trim(),
        desc: String(st.desc || '').trim(), desc_en: String(st.desc_en || '').trim(), desc_zh: String(st.desc_zh || '').trim(),
        price: price, available: st.available !== false, allergens: st.allergens.slice(), img: cur && !photo.removed ? (cur.img || 0) : 0,
        barcode: String(st.barcode || '').trim()
      };
      var key = 'p-' + id;
      var p = Promise.resolve();
      if (photo.data) { item.img = Date.now(); p = Store.putImage(key, photo.data, item.img); }
      else if (photo.removed && cur && cur.img) p = Store.removeImage(key);
      var ci = menu.findIndex(function (c) { return c.id === st.cat; });
      if (loc && menu[loc.ci].id === st.cat) menu[loc.ci].items[loc.ii] = item;
      else {
        if (loc) menu[loc.ci].items.splice(loc.ii, 1);
        menu[ci].items = menu[ci].items || [];
        menu[ci].items.push(item);
      }
      p.then(function () {
        saveMenu(menu);
        closeModal();
        toast(t('adm.saved'));
      }).catch(function (e) { toast(t('sync.storageErr', { e: e.message })); });
    });
  }

  // ---------------------------------------------------------------- categorías

  function secCats() {
    var head = '<div class="toolbar"><button class="btn primary" data-act="cat-new">' + t('adm.newCat') + '</button></div>';
    var kc = A.qr.kitchenCats || [];
    var html = '<div class="card" style="padding:0;overflow:hidden"><div class="scroll-x"><table class="grid"><tr><th>' + t('adm.col.photo') + '</th><th>' + t('adm.col.cat') + '</th>' +
      '<th class="num">' + t('adm.col.items') + '</th><th>' + t('adm.col.kitchen') + '</th><th></th></tr>' +
      A.menu.map(function (c, ci) {
        var id = esc(c.id);
        return '<tr><td>' + imgTag('c-' + c.id, c.img, c.icon) + '</td>' +
          '<td><b>' + esc(c.name) + '</b>' + ((c.en || c.zh) ? '<small>' + esc([c.en, c.zh].filter(Boolean).join(' · ')) + '</small>' : '') + '</td>' +
          '<td class="num">' + (c.items || []).length + '</td>' +
          '<td><label class="switch"><input type="checkbox" data-edit="kitchen" data-cid="' + id + '"' + (kc.indexOf(c.id) >= 0 ? ' checked' : '') + '><span></span></label></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn" title="' + t('adm.edit') + '" data-act="cat-edit" data-cid="' + id + '">✏️</button>' +
          '<button class="icon-btn" title="' + t('adm.up') + '" data-act="cat-move" data-d="-1" data-cid="' + id + '"' + (ci === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="icon-btn" title="' + t('adm.down') + '" data-act="cat-move" data-d="1" data-cid="' + id + '"' + (ci === A.menu.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="icon-btn" title="' + t('adm.nav.products') + '" data-act="cat-products" data-cid="' + id + '">🍽️</button>' +
          '<button class="icon-btn danger" title="' + t('adm.delete') + '" data-act="cat-del" data-cid="' + id + '">🗑️</button>' +
          '</div></td></tr>';
      }).join('') + '</table></div></div><p class="muted">' + t('sch.cats') + ': ' + t('sch.help') + '</p>';
    return { head: head, html: html };
  }

  function openCat(cid) {
    var ci = cid ? A.menu.findIndex(function (c) { return c.id === cid; }) : -1;
    var cur = ci >= 0 ? A.menu[ci] : null;
    var st = cur ? { name: cur.name, en: cur.en || '', zh: cur.zh || '', icon: cur.icon || '' } : { name: '', en: '', zh: '', icon: '🍽️' };
    var photo = { data: null, removed: false };
    function draw() {
      var prev = photo.data ? '<img src="' + photo.data + '" alt="">'
        : (!photo.removed && cur && cur.img ? (function () { var u = Store.imageURL('c-' + cur.id, cur.img, draw); return u ? '<img src="' + u + '" alt="">' : esc(st.icon); })() : esc(st.icon || '🍽️'));
      var hasPhoto = photo.data || (!photo.removed && cur && cur.img);
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + (cur ? t('adm.editCat') : t('adm.newCat').replace(/^\S+\s/, '')) + '</h2>' +
        ['name', 'en', 'zh'].map(function (k) {
          return '<div class="field"><label>' + t(k === 'name' ? 'adm.nameEs' : k === 'en' ? 'adm.nameEn' : 'adm.nameZh') + '</label><input type="text" data-f="' + k + '" value="' + esc(st[k]) + '"></div>';
        }).join('') +
        '<div class="field"><label>' + t('adm.icon') + '</label><input type="text" data-f="icon" maxlength="4" value="' + esc(st.icon) + '" style="width:90px;font-size:22px"></div>' +
        '<div class="field"><label>' + t('adm.photo') + '</label><div class="photo-box"><div class="preview">' + prev + '</div><div>' +
        '<label class="btn primary" style="display:inline-flex;align-items:center;cursor:pointer">' + t('adm.upload') + '<input id="ph-file" type="file" accept="image/*" hidden></label> ' +
        (hasPhoto ? '<button class="btn" data-k="nophoto">' + t('adm.removePhoto') + '</button>' : '') + '</div></div></div>' +
        '<div class="btn-row"><button class="btn" data-k="X">' + t('cancel') + '</button><button class="btn ok" data-k="OK" style="flex:1">' + t('save') + '</button></div>';
      modalBox.querySelectorAll('[data-f]').forEach(function (el) { el.addEventListener('input', function () { st[el.dataset.f] = el.value; }); });
      document.getElementById('ph-file').onchange = function (e) {
        var f = e.target.files[0];
        if (f) compress(f).then(function (d) { photo.data = d; photo.removed = false; draw(); }).catch(function () { toast(t('adm.photoErr')); });
      };
    }
    openModal('cat', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === 'nophoto') { photo.data = null; photo.removed = true; return draw(); }
      if (k !== 'OK') return;
      if (!String(st.name).trim()) return toast(t('adm.required'));
      var menu = clone(A.menu);
      var c = cur ? menu[ci] : { id: 'c' + Store.newId(), items: [] };
      c.name = String(st.name).trim(); c.en = String(st.en).trim(); c.zh = String(st.zh).trim(); c.icon = String(st.icon).trim() || '🍽️';
      var key = 'c-' + c.id, p = Promise.resolve();
      if (photo.data) { c.img = Date.now(); p = Store.putImage(key, photo.data, c.img); }
      else if (photo.removed && cur && cur.img) { c.img = 0; p = Store.removeImage(key); }
      if (!cur) menu.push(c);
      p.then(function () { saveMenu(menu); closeModal(); toast(t('adm.saved')); });
    });
  }

  // ---------------------------------------------------------------- modificadores

  function secMods() {
    var html = '<p class="muted">' + t('admin.modsNote') + '</p>' + ['sin', 'extra', 'prep'].map(function (type) {
      return '<div class="card"><h3>' + t('mod.' + type) + '</h3><div class="scroll-x"><table class="grid"><tr><th>' + t('admin.nameEs') + '</th><th>EN</th><th>中文</th>' +
        (type === 'extra' ? '<th class="num">' + t('admin.priceEur') + '</th>' : '') + '<th></th></tr>' +
        A.mods.map(function (m, mi) {
          if (m.type !== type) return '';
          var d = 'data-mi="' + mi + '"';
          return '<tr><td><input type="text" data-edit="mod-name" ' + d + ' value="' + esc(m.name) + '"></td>' +
            '<td><input type="text" data-edit="mod-en" ' + d + ' value="' + esc(m.en || '') + '"></td>' +
            '<td><input type="text" data-edit="mod-zh" ' + d + ' value="' + esc(m.zh || '') + '"></td>' +
            (type === 'extra' ? '<td class="num"><input type="number" step="0.05" min="0" style="width:90px" data-edit="mod-price" ' + d + ' value="' + (m.price || 0) + '"></td>' : '') +
            '<td><button class="icon-btn danger" data-act="mod-del" ' + d + '>🗑️</button></td></tr>';
        }).join('') + '</table></div>' +
        '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="mod-add" data-type="' + type + '">＋ ' + t('add') + '</button></div></div>';
    }).join('') + '<div class="card"><button class="btn danger" data-act="mods-reset">' + t('admin.resetMods') + '</button></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- mesas

  function secTables() {
    var qrUrl = new URL('qr.html', location.href).href;
    var html = '<div class="card"><p>' + t('adm.tablesCount', { n: A.layout.length, t: Object.keys(A.temp).length }) + '</p>' +
      '<p class="muted">' + t('adm.tablesHelp') + '</p>' +
      '<div class="btn-row"><button class="btn primary" data-act="open-plan">' + t('adm.openPlan') + '</button>' +
      '<a class="btn" href="' + esc(qrUrl) + '" target="_blank" rel="noopener">' + t('admin.printQr') + '</a>' +
      '<a class="btn" href="pedir.html?mesa=' + esc((A.layout[0] || {}).id || 'T1') + '" target="_blank" rel="noopener">' + t('admin.testQr') + '</a></div></div>' +
      '<div class="card"><h3>' + t('tb.tables') + '</h3><div class="chips-sel">' + A.layout.map(function (tb) {
        return '<span class="chip">' + esc(tb.id) + '</span>';
      }).join('') + '</div></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- horario QR

  function qrControls() {
    var st = P.qrStatus(A.qr);
    var s = st.reason === 'paused' ? ['off', 'qr.stPaused'] : !st.open ? ['off', 'qr.stClosed'] : !st.kitchen ? ['warn', 'qr.stKitchen'] : ['on', 'qr.stOpen'];
    var kOff = A.qr.kitchenOffUntil && A.qr.kitchenOffUntil > Date.now();
    return '<span class="qr-state ' + s[0] + '">' + t(s[1]) + '</span> ' +
      '<button class="btn" data-act="qr-pause">' + t(A.qr.paused ? 'qr.resume' : 'qr.pause') + '</button> ' +
      '<button class="btn" data-act="kitchen-toggle">' + t(kOff ? 'qr.kitchenOn' : 'qr.kitchenOff') + '</button>';
  }

  function secHours() {
    var q = A.qr, days = t('sch.days');
    var html = '<div class="card"><p class="btn-row" style="align-items:center">' + qrControls() + '</p>' +
      '<label style="display:block;margin:10px 0"><input type="checkbox" data-edit="sch-use" ' + (q.useSchedule ? 'checked' : '') + '> ' + t('sch.use') + '</label>' +
      '<div class="scroll-x"><table class="grid sch"><tr><th>' + t('sch.day') + '</th><th>' + t('sch.qr') + '</th><th>' + t('sch.kitchen') + '</th></tr>' +
      [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        var d = (q.days && q.days[i]) || {};
        return '<tr><td>' + days[i] + '</td>' +
          '<td><input type="text" value="' + esc(d.qr || '') + '" data-edit="sch-day" data-i="' + i + '" data-f="qr" placeholder="12:00-16:30, 20:00-23:30"></td>' +
          '<td><input type="text" value="' + esc(d.kitchen || '') + '" data-edit="sch-day" data-i="' + i + '" data-f="kitchen" placeholder="13:00-16:00, 20:00-23:00"></td></tr>';
      }).join('') + '</table></div><p class="muted">' + t('sch.help') + '</p>' +
      '<h4>' + t('sch.cats') + '</h4><div class="chips-sel">' + A.menu.map(function (c) {
        return '<label class="chk"><input type="checkbox" data-edit="kitchen" data-cid="' + esc(c.id) + '" ' + ((q.kitchenCats || []).indexOf(c.id) >= 0 ? 'checked' : '') + '> ' + esc(c.icon || '') + ' ' + esc(P.tr(c, I.lang)) + '</label>';
      }).join('') + '</div></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- usuarios

  function secUsers() {
    var html = '<div class="card"><div class="scroll-x"><table class="grid"><tr><th>' + t('admin.name') + '</th><th>PIN</th><th>' + t('admin.admin') + '</th><th></th></tr>' +
      A.users.map(function (u, i) {
        return '<tr><td><input type="text" value="' + esc(u.name) + '" data-edit="u-name" data-i="' + i + '"></td>' +
          '<td><input type="text" inputmode="numeric" maxlength="6" style="width:100px" value="' + esc(u.pin) + '" data-edit="u-pin" data-i="' + i + '"></td>' +
          '<td><label class="switch"><input type="checkbox" ' + (u.admin ? 'checked' : '') + ' data-edit="u-admin" data-i="' + i + '"><span></span></label></td>' +
          '<td><button class="icon-btn danger" data-act="u-del" data-i="' + i + '">🗑️</button></td></tr>';
      }).join('') + '</table></div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="u-add">' + t('admin.addUser') + '</button></div>' +
      '<p class="muted">' + t('admin.adminNote') + '</p></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- permisos y registro

  function secAudit() {
    var staff = A.users.map(function (u, i) { return { u: u, i: i }; });
    var html = '<div class="card"><h3>' + t('adm.perms') + '</h3><p class="muted">' + t('adm.permsHelp') + '</p><div class="scroll-x"><table class="grid perms"><tr><th></th>' +
      staff.map(function (x) { return '<th class="c">' + esc(x.u.name) + (x.u.admin ? '<small>' + t('admin.admin') + '</small>' : '') + '</th>'; }).join('') + '</tr>' +
      P.PERMS.map(function (pm) {
        return '<tr><td>' + t('perm.' + pm[0]) + '</td>' + staff.map(function (x) {
          if (x.u.admin) return '<td class="c muted">✓</td>';
          return '<td class="c"><input type="checkbox" data-edit="perm" data-i="' + x.i + '" data-p="' + pm[0] + '"' + (P.can(x.u, pm[0]) ? ' checked' : '') + '></td>';
        }).join('') + '</tr>';
      }).join('') + '</table></div></div>';
    var log = Object.keys(A.audit || {}).map(function (k) { return A.audit[k]; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 200);
    html += '<div class="card"><h3>' + t('adm.log') + '</h3>' + (log.length ? '<div class="scroll-x"><table class="grid"><tr><th>' + t('adm.log.when') + '</th><th>' + t('adm.log.who') + '</th><th>' + t('adm.log.auth') + '</th><th>' + t('adm.log.what') + '</th><th>' + t('adm.log.detail') + '</th></tr>' +
      log.map(function (r) {
        return '<tr><td>' + new Date(r.at).toLocaleString('es-ES') + '</td><td>' + esc(r.user) + '</td><td>' + esc(r.by || '—') + '</td><td>' + t('audit.' + r.action) + '</td><td>' + esc(r.detail) + '</td></tr>';
      }).join('') + '</table></div>' : '<p class="muted">' + t('adm.logNone') + '</p>') + '</div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- impresoras y cajón

  function secDevices() {
    var c = Devices.cfg();
    function block(which) {
      var d = c[which];
      var modes = (which === 'kitchen' ? ['same'] : []).concat(['browser', 'epos', 'serial']);
      return '<div class="card"><h3>' + t('dev.' + which) + '</h3>' +
        '<div class="field"><label>' + t('dev.mode') + '</label><select data-dev="' + which + '.mode">' + modes.map(function (m) {
          return '<option value="' + m + '"' + (d.mode === m ? ' selected' : '') + '>' + t('dev.m.' + m) + '</option>';
        }).join('') + '</select></div>' +
        (d.mode === 'epos' ? '<div class="form-grid"><div class="field"><label>' + t('dev.ip') + '</label><input type="text" data-dev="' + which + '.ip" value="' + esc(d.ip) + '" placeholder="192.168.1.50"></div>' +
          '<div class="field"><label>' + t('dev.width') + '</label><select data-dev="' + which + '.width"><option value="48"' + (+d.width === 48 ? ' selected' : '') + '>80 mm</option><option value="32"' + (+d.width === 32 ? ' selected' : '') + '>58 mm</option></select></div></div>' +
          '<label><input type="checkbox" data-dev="' + which + '.https"' + (d.https ? ' checked' : '') + '> ' + t('dev.https') + '</label>' : '') +
        (d.mode === 'serial' ? '<div class="form-grid"><div class="field"><label>' + t('dev.width') + '</label><select data-dev="' + which + '.width"><option value="48"' + (+d.width === 48 ? ' selected' : '') + '>80 mm</option><option value="32"' + (+d.width === 32 ? ' selected' : '') + '>58 mm</option></select></div></div>' +
          (Devices.hasSerial ? '<button class="btn" data-act="dev-connect">' + t('dev.connect') + '</button>' : '<p class="warn">' + t('dev.noSerial') + '</p>') : '') +
        '</div>';
    }
    var html = '<p class="muted">' + t('dev.help') + '</p>' + block('receipt') + block('kitchen') +
      '<div class="card"><label><input type="checkbox" data-dev="drawerOnCash"' + (c.drawerOnCash ? ' checked' : '') + '> ' + t('dev.drawerOnCash') + '</label>' +
      (c.receipt.mode === 'browser' ? '<p class="muted">' + t('dev.drawerBrowser') + '</p>' : '') +
      '<div class="btn-row" style="margin-top:12px"><button class="btn" data-act="dev-test" data-w="receipt">' + t('dev.testReceipt') + '</button>' +
      '<button class="btn" data-act="dev-test" data-w="kitchen">' + t('dev.testKitchen') + '</button>' +
      '<button class="btn" data-act="dev-drawer">' + t('dev.testDrawer') + '</button></div></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- importar productos
  // Lee un Excel/CSV exportado de otro TPV, reconoce las columnas y crea o
  // actualiza los productos. Se puede deshacer mientras no se salga de la página.

  var IMP_FIELDS = ['name', 'price', 'cat', 'barcode', 'en', 'zh'];
  var IMP_HINTS = {
    name: ['nombre', 'descripcion', 'articulo', 'producto', 'denominacion', 'name', 'item', 'product', 'description', 'plato'],
    price: ['pvp', 'precio', 'price', 'importe', 'tarifa', 'venta'],
    cat: ['familia', 'categoria', 'grupo', 'seccion', 'category', 'family', 'tipo'],
    barcode: ['barras', 'ean', 'barcode', 'upc'],
    en: ['ingles', 'english'],
    zh: ['chino', 'chinese', '中文']
  };

  function parseNum(v) {
    if (typeof v === 'number') return v;
    var x = String(v || '').replace(/[^\d,.\-]/g, '');
    if (!x) return NaN;
    if (x.indexOf(',') >= 0 && x.indexOf('.') >= 0) {
      x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
    } else if (x.indexOf(',') >= 0) x = x.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
    return parseFloat(x);
  }

  function parseCsv(text) {
    text = String(text).replace(/^\ufeff/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var sep = ['\t', ';', ',', '|'].map(function (c) { return [c, first.split(c).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = function () { resolve(window.XLSX); };
      sc.onerror = function () { reject(new Error('sin conexión')); };
      document.head.appendChild(sc);
    });
  }

  // Reconoce la fila de títulos y qué columna es cada dato.
  function autoMap(rows) {
    var hi = 0, best = -1;
    rows.slice(0, 10).forEach(function (r, i) {
      var sc = r.reduce(function (n, c) {
        var h = norm(c);
        return n + (Object.keys(IMP_HINTS).some(function (f) { return IMP_HINTS[f].some(function (w) { return h.indexOf(w) >= 0; }); }) ? 1 : 0);
      }, 0);
      if (sc > best) { best = sc; hi = i; }
    });
    var header = best > 0 ? rows[hi] : null;
    var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([1]));
    var map = {};
    if (header) {
      IMP_FIELDS.forEach(function (f) {
        var idx = -1;
        IMP_HINTS[f].some(function (w) {
          idx = header.findIndex(function (c, i) { return norm(c).indexOf(w) >= 0 && !Object.keys(map).some(function (k) { return map[k] === i; }); });
          return idx >= 0;
        });
        if (idx >= 0) map[f] = idx;
      });
    }
    var data = rows.slice(header ? hi + 1 : 0);
    // sin títulos reconocibles: precio = columna casi siempre numérica; nombre = la de textos más largos
    if (map.price == null || map.name == null) {
      var stats = [];
      for (var c = 0; c < cols; c++) {
        var nums = 0, len = 0;
        data.slice(0, 50).forEach(function (r) { var v = r[c]; if (!isNaN(parseNum(v)) && String(v).trim()) nums++; len += String(v || '').length; });
        stats.push({ c: c, nums: nums, len: len });
      }
      var n = Math.min(50, data.length) || 1;
      if (map.price == null) {
        var pc = stats.filter(function (x) { return x.nums / n > 0.8 && x.c !== map.name; }).pop();
        if (pc) map.price = pc.c;
      }
      if (map.name == null) {
        var nc = stats.filter(function (x) { return x.c !== map.price && x.nums / n < 0.5; }).sort(function (a, b) { return b.len - a.len; })[0];
        if (nc) map.name = nc.c;
      }
    }
    return { header: header, data: data, cols: cols, map: map };
  }

  // Calcula qué pasará (sin guardar nada todavía).
  function planImport() {
    var I2 = A.imp, m = I2.map, vat = Number(A.settings.vat) || 0;
    var menu = I2.mode === 'replace' ? [] : clone(A.menu);
    var stats = { a: 0, u: 0, c: 0, s: 0 }, rows = [];
    function findCat(name) {
      var n = norm(name);
      return menu.filter(function (c) { return [c.name, c.en, c.zh].some(function (x) { return x && norm(x) === n; }); })[0];
    }
    I2.data.forEach(function (r) {
      var name = String(r[m.name] == null ? '' : r[m.name]).trim();
      var price = parseNum(r[m.price]);
      if (!name || isNaN(price)) { stats.s++; rows.push({ name: name, price: r[m.price], st: 'skip' }); return; }
      if (!I2.vatIncl) price = price * (1 + vat / 100);
      price = round2(price);
      var catName = m.cat != null && String(r[m.cat] || '').trim() ? String(r[m.cat]).trim() : t('imp.fallbackCat');
      var existing = null;
      menu.some(function (c) { return (c.items || []).some(function (it) { if (norm(it.name) === norm(name)) { existing = it; return true; } return false; }); });
      var extra = {};
      if (m.barcode != null && String(r[m.barcode] || '').trim()) extra.barcode = String(r[m.barcode]).trim();
      if (m.en != null && String(r[m.en] || '').trim()) extra.en = String(r[m.en]).trim();
      if (m.zh != null && String(r[m.zh] || '').trim()) extra.zh = String(r[m.zh]).trim();
      if (existing) {
        var changed = existing.price !== price;
        existing.price = price;
        Object.assign(existing, extra);
        if (changed) stats.u++;
        rows.push({ name: name, price: price, cat: catName, st: changed ? 'upd' : 'same' });
      } else {
        // la categoría solo se crea si de verdad entra un producto nuevo en ella
        var cat = findCat(catName);
        if (!cat) {
          cat = { id: 'c' + Store.newId(), name: catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase(), icon: '🍽️', items: [] };
          menu.push(cat); stats.c++;
        }
        cat.items = cat.items || [];
        cat.items.push(Object.assign({ id: cat.id + '-' + Store.newId(), name: name, price: price, available: true }, extra));
        stats.a++;
        rows.push({ name: name, price: price, cat: catName, st: 'new' });
      }
    });
    return { menu: menu, stats: stats, rows: rows };
  }

  function secImport() {
    var I2 = A.imp;
    var html = '<div class="card"><p>' + t('imp.help') + '</p><p class="muted">' + t('imp.tip') + '</p>' +
      '<div class="btn-row"><label class="btn primary" style="display:inline-flex;align-items:center;cursor:pointer">' + t('imp.file') +
      '<input id="imp-file" type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,text/csv" hidden></label>' +
      (A.impUndo ? '<button class="btn" data-act="imp-undo">' + t('imp.undo') + '</button>' : '') + '</div>' +
      '<div class="field" style="margin-top:12px"><label>' + t('imp.paste') + '</label><textarea id="imp-paste" rows="4" placeholder="Nombre&#9;Familia&#9;PVP&#10;Caña&#9;Cervezas&#9;1,50"></textarea></div>' +
      '<button class="btn" data-act="imp-paste">' + t('imp.read') + '</button></div>';
    if (I2) {
      var opts = function (f) {
        return '<option value="">' + t('imp.none') + '</option>' + Array.apply(null, Array(I2.cols)).map(function (_, c) {
          var label = I2.header ? String(I2.header[c] || '').trim() : '';
          return '<option value="' + c + '"' + (I2.map[f] === c ? ' selected' : '') + '>' + String.fromCharCode(65 + (c % 26)) + (label ? ' · ' + esc(label) : '') + '</option>';
        }).join('');
      };
      var plan = planImport();
      I2.plan = plan;
      html += '<div class="card"><h3>' + t('imp.map') + '</h3><p class="muted">' + t('imp.rows', { n: I2.data.length, f: esc(I2.file) }) + '</p><div class="form-grid">' +
        IMP_FIELDS.map(function (f) { return '<div class="field"><label>' + t('imp.f.' + f) + '</label><select data-imp="' + f + '">' + opts(f) + '</select></div>'; }).join('') +
        '</div><label style="display:block;margin:6px 0"><input type="checkbox" data-imp="vatIncl"' + (I2.vatIncl ? ' checked' : '') + '> ' + t('imp.vatIncl') + '</label>' +
        '<label style="display:block;margin:6px 0"><input type="radio" name="impmode" data-imp="mode" value="merge"' + (I2.mode !== 'replace' ? ' checked' : '') + '> ' + t('imp.mode.merge') + '</label>' +
        '<label style="display:block;margin:6px 0"><input type="radio" name="impmode" data-imp="mode" value="replace"' + (I2.mode === 'replace' ? ' checked' : '') + '> ' + t('imp.mode.replace') + '</label></div>' +
        '<div class="card"><h3>' + t('imp.preview') + '</h3><p><b>' + t('imp.summary', plan.stats) + '</b></p><div class="scroll-x"><table class="grid"><tr><th>' + t('adm.col.product') + '</th><th>' + t('adm.col.cat') + '</th><th class="num">' + t('adm.col.price') + '</th><th></th></tr>' +
        plan.rows.slice(0, 40).map(function (r) {
          return '<tr class="' + (r.st === 'skip' ? 'off-row' : '') + '"><td>' + esc(r.name || '—') + '</td><td>' + esc(r.cat || '') + '</td><td class="num">' + (typeof r.price === 'number' ? fmt(r.price) : esc(r.price || '')) + '</td><td><small>' + t('imp.status.' + r.st) + '</small></td></tr>';
        }).join('') + '</table></div>' + (plan.rows.length > 40 ? '<p class="muted">… +' + (plan.rows.length - 40) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:12px"><button class="btn ok" data-act="imp-apply"' + (plan.stats.a + plan.stats.u ? '' : ' disabled') + '>' + t('imp.apply') + '</button></div></div>';
    }
    return { html: html };
  }

  function startImport(rows, file) {
    if (!rows.length) return toast(t('imp.needCols'));
    var r = autoMap(rows);
    A.imp = { file: file, header: r.header, data: r.data, cols: r.cols, map: r.map, vatIncl: true, mode: 'merge' };
    render();
  }

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'imp-file') {
      var f = el.files[0];
      if (!f) return;
      if (/\.(xlsx|xls|ods)$/i.test(f.name)) {
        Promise.all([loadXlsx(), f.arrayBuffer()]).then(function (r) {
          var wb = r[0].read(r[1], { type: 'array' });
          var rows = r[0].utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
          startImport(rows.filter(function (x) { return x.some(function (c) { return String(c).trim(); }); }), f.name);
        }).catch(function (err) { toast(t('imp.xlsxErr', { e: err.message })); });
      } else {
        // Los programas de Windows suelen exportar en Windows-1252 (ñ, á, €): si no es UTF-8 válido, se lee así
        f.arrayBuffer().then(function (buf) {
          var txt;
          try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (err) { txt = new TextDecoder('windows-1252').decode(buf); }
          startImport(parseCsv(txt), f.name);
        });
      }
      return;
    }
    if (el.dataset && el.dataset.imp && A.imp) {
      var k = el.dataset.imp;
      if (k === 'vatIncl') A.imp.vatIncl = el.checked;
      else if (k === 'mode') A.imp.mode = el.value;
      else A.imp.map[k] = el.value === '' ? null : Number(el.value);
      return render();
    }
    if (el.dataset && el.dataset.dev) {
      var c = Devices.cfg(), path = el.dataset.dev.split('.');
      var v = el.type === 'checkbox' ? el.checked : el.value;
      if (path.length === 1) c[path[0]] = v; else c[path[0]][path[1]] = path[1] === 'width' ? Number(v) : v;
      Devices.save(c);
      render();
    }
  });

  // ---------------------------------------------------------------- diseño del ticket

  function sampleTicket() {
    var lines = [
      { qty: 2, name: 'Caña', price: 1.5, mods: [] },
      { qty: 1, name: 'Hamburguesa Supersónica', price: 6.8, mods: [{ type: 'extra', name: 'Bacon', price: 1 }, { type: 'sin', name: 'Cebolla' }] },
      { qty: 1, name: 'Patatas bravas', price: 4.5, mods: [] }
    ];
    var tk = { table: 'T5', lines: lines };
    var total = P.ticketTotals(tk).total;
    var sale = { id: 'x', invoice: (A.settings.series || 'T') + '-000123', cashier: A.user ? A.user.name : 'ANA', closedAt: Date.now(),
      method: 'efectivo', given: 20, change: round2(20 - total), vatRate: Number(A.settings.vat) || 0 };
    return { tk: tk, sale: sale };
  }

  // Logo tal como lo imprime una térmica (1 bit), para "ver como impresora térmica"
  function thermalLogo(src, pct, wide) {
    var key = src.length + '|' + pct + '|' + wide;
    if (A.thermal && A.thermal.key === key) return A.thermal.url;
    var dots = Math.round((wide ? 576 : 384) * pct / 100 / 8) * 8;
    Devices.rasterize(src, dots).then(function (r) {
      var c = document.createElement('canvas');
      c.width = r.w; c.height = r.h;
      var g = c.getContext('2d'), im = g.createImageData(r.w, r.h);
      for (var i = 0; i < r.w * r.h; i++) {
        var on = r.bytes[(i / r.w | 0) * r.w / 8 + ((i % r.w) >> 3)] & (0x80 >> (i % r.w & 7));
        im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = on ? 0 : 255;
        im.data[i * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      A.thermal = { key: key, url: c.toDataURL() };
      later();
    });
    return null;
  }

  function secTicket() {
    var st = A.settings, T = Object.assign({}, P.DEFAULT_TICKET, st.ticket || {});
    var wide = Number(Devices.cfg().receipt.width) !== 32;
    var logo = st.logoImg ? Store.imageURL('logo', st.logoImg, later) : '';
    // la vista previa usa el logo en data URL (como al imprimir)
    if (st.logoImg && !A.logoData) Store.getImage('logo', st.logoImg).then(function (d) { A.logoData = d; later(); });
    var src = A.logoData;
    if (src && A.showThermal) src = thermalLogo(src, T.logoWidth, wide) || src;
    var sm = sampleTicket();
    var doc = P.receiptDoc(sm.tk, sm.sale, st, { table: 'Mesa T5', user: sm.sale.cashier, logo: src });
    var chk = function (k) { return '<label style="display:block;margin:4px 0"><input type="checkbox" data-edit="tk" data-k="' + k + '"' + (T[k] ? ' checked' : '') + '> ' + t('tk.' + k) + '</label>'; };
    var form = '<div class="card"><h3>' + t('tk.logo') + '</h3><div class="photo-box"><div class="preview contain">' + (logo ? '<img src="' + logo + '" alt="">' : '🍴') + '</div><div>' +
      '<label class="btn primary" style="display:inline-flex;align-items:center;cursor:pointer">' + t('tk.upload') + '<input id="logo-file" type="file" accept="image/*" hidden></label> ' +
      (st.logoImg ? '<button class="btn" data-act="logo-del">' + t('tk.remove') + '</button>' : '') +
      '<p class="muted">' + t('tk.logoHelp') + '</p></div></div>' +
      (st.logoImg ? '<label style="display:block;margin:8px 0"><input type="checkbox" data-edit="tk" data-k="logo"' + (T.logo ? ' checked' : '') + '> ' + t('tk.useLogo') + '</label>' +
        '<div class="field"><label>' + t('tk.logoWidth', { n: T.logoWidth }) + '</label><input type="range" min="20" max="100" step="5" value="' + T.logoWidth + '" data-edit="tk" data-k="logoWidth"></div>' : '') +
      '</div><div class="card">' + chk('showName') +
      '<div class="field" style="margin-top:8px"><label>' + t('tk.headerExtra') + '</label><textarea rows="3" data-edit="tk" data-k="headerExtra" placeholder="Tel. 965 00 00 00&#10;www.restauranteplatet.es">' + esc(T.headerExtra) + '</textarea><small class="muted">' + t('tk.headerHelp') + '</small></div>' +
      '<div class="field"><label>' + t('tk.footer') + '</label><textarea rows="3" data-edit="footer" placeholder="¡Gracias por su visita!">' + esc(st.footer || '') + '</textarea><small class="muted">' + t('tk.footerHelp') + '</small></div></div>' +
      '<div class="card"><h3>' + t('tk.show') + '</h3>' + ['showTable', 'showWaiter', 'showDate', 'showMods', 'showVat', 'showPayment', 'big'].map(chk).join('') + '</div>';
    var prev = '<div class="card ticket-prev"><h3>' + t('tk.preview') + '</h3>' +
      (!st.nif ? '<p class="warn">' + t('tk.noNif') + '</p>' : '') +
      '<label style="display:block;margin-bottom:10px"><input type="checkbox" data-act-change="thermal"' + (A.showThermal ? ' checked' : '') + '> ' + t('tk.thermal') + '</label>' +
      '<div class="paper' + (wide ? '' : ' w58') + (T.big ? ' bigtext' : '') + (A.showThermal ? ' thermal' : '') + '">' + Devices.toHtml(doc) + '</div>' +
      '<p class="muted" style="text-align:center">' + t('tk.paperNote') + '</p>' +
      '<div class="btn-row" style="justify-content:center"><button class="btn primary" data-act="tk-test">' + t('tk.printTest') + '</button></div></div>';
    return { html: '<div class="two-col ticket-design"><div>' + form + '</div><div>' + prev + '</div></div>' };
  }

  app.addEventListener('change', function (e) {
    if (e.target.id !== 'logo-file') return;
    var f = e.target.files[0];
    if (!f) return;
    compress(f).then(function (d) {
      var v = Date.now();
      A.logoData = d; A.thermal = null;
      return Store.putImage('logo', d, v).then(function () {
        var tk = Object.assign({}, P.DEFAULT_TICKET, A.settings.ticket || {}, { logo: true });
        return Store.update('settings', { logoImg: v, ticket: tk });
      });
    }).catch(function () { toast(t('adm.photoErr')); });
  });

  // ---------------------------------------------------------------- negocio

  function secBusiness() {
    var st = A.settings;
    var f = function (k) {
      return '<div class="field"><label>' + t('admin.f.' + k) + '</label><input type="text" value="' + esc(st[k]) + '" data-edit="set" data-k="' + k + '"></div>';
    };
    var html = '<div class="card"><h3>' + t('admin.ticketData') + '</h3><div class="form-grid">' + f('name') + f('address') + f('nif') + f('vat') + f('series') + '</div>' +
      '<label style="display:block;margin:8px 0"><input type="checkbox" data-edit="set" data-k="askGuests"' + (st.askGuests !== false ? ' checked' : '') + '> ' + t('admin.f.askGuests') + '</label>' +
      '<p class="muted">' + t('admin.seriesNote') + '</p></div>' +
      '<div class="card"><h3>' + t('admin.qr') + '</h3><p>' + t('admin.mode', { m: '<b>' + t(Store.mode === 'local' ? 'admin.local' : 'admin.cloud') + '</b>' }) + '</p>' +
      (Store.mode === 'local' ? '<p class="warn">' + t('admin.localWarn') + '</p>'
        : '<p class="muted">' + t('admin.cloudOk') + '</p><p><button class="btn" data-act="reset-auth">' + t('admin.changeKey') + '</button></p>') + '</div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- voz e IA

  function aiAuto() { try { return localStorage.getItem('platet-ai-auto') !== '0'; } catch (e) { return true; } }

  function secVoice() {
    var st = Voice.stats(), key = Voice.aiKey();
    var html = '<div class="card"><h3>' + t('admin.v.memTitle') + '</h3><p class="muted">' + t('admin.v.memNote') + '</p>' +
      '<p>' + t('v.stats', { a: st.aliases, u: st.utter, c: st.ai }) + '</p>' +
      '<div class="btn-row"><button class="btn" data-act="vmem-export">' + t('admin.v.export') + '</button>' +
      '<button class="btn" data-act="vmem-import">' + t('admin.v.import') + '</button>' +
      '<button class="btn danger" data-act="vmem-clear">' + t('admin.v.clear') + '</button></div></div>' +
      '<div class="card"><h3>' + t('admin.v.aiTitle') + '</h3><p class="muted">' + t('admin.v.aiNote') + '</p>' +
      (key ? '<p>' + t('admin.v.keySet') + ' <code>…' + esc(key.slice(-4)) + '</code> <button class="btn" data-act="ai-key-remove">' + t('admin.v.keyRemove') + '</button></p>'
        : '<div class="field"><label>' + t('admin.v.key') + '</label><input id="ai-key" type="password" autocomplete="off" placeholder="sk-ant-..."></div>' +
        '<button class="btn primary" data-act="ai-key-save">' + t('save') + '</button>') +
      '<label style="display:block;margin-top:12px"><input type="checkbox" data-act-change="ai-auto" ' + (aiAuto() ? 'checked' : '') + '> ' + t('admin.v.auto') + '</label></div>';
    return { html: html };
  }

  // ---------------------------------------------------------------- copias de seguridad

  var BACKUP_PATHS = ['menu', 'mods', 'users', 'settings', 'public/qr', 'layout'];

  function secBackup() {
    var html = '<div class="card"><h3>' + t('adm.backupTitle') + '</h3><p class="muted">' + t('adm.backupHelp') + '</p>' +
      '<div class="btn-row"><button class="btn primary" data-act="backup-dl">' + t('adm.backupDl') + '</button>' +
      '<button class="btn" data-act="backup-up">' + t('adm.backupUp') + '</button></div></div>';
    return { html: html };
  }

  function imageKeys(menu) {
    var keys = [];
    (menu || []).forEach(function (c) {
      if (c.img) keys.push(['c-' + c.id, c.img]);
      (c.items || []).forEach(function (it) { if (it.img) keys.push(['p-' + it.id, it.img]); });
    });
    return keys;
  }

  function backupDownload() {
    var data = {};
    Promise.all(BACKUP_PATHS.map(function (p) { return Store.get(p).then(function (v) { data[p] = v; }); })).then(function () {
      var images = {};
      var keys = imageKeys(data.menu || A.menu);
      if (data.settings && data.settings.logoImg) keys.push(['logo', data.settings.logoImg]);
      return Promise.all(keys.map(function (k) {
        return Store.getImage(k[0], k[1]).then(function (d) { if (d) images[k[0]] = { v: k[1], data: d }; });
      })).then(function () { return images; });
    }).then(function (images) {
      download('platet-config-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify({ app: 'platet', version: 1, at: Date.now(), data: data, images: images }), 'application/json');
    });
  }

  function backupUpload() {
    pickFile('application/json,.json', function (txt) {
      var b;
      try { b = JSON.parse(txt); } catch (e) { return toast(t('adm.backupBad')); }
      if (!b || b.app !== 'platet' || !b.data) return toast(t('adm.backupBad'));
      if (!confirm(t('adm.backupConfirm', { d: new Date(b.at).toLocaleString('es-ES') }))) return;
      var upd = {};
      BACKUP_PATHS.forEach(function (p) { upd[p] = b.data[p] == null ? null : b.data[p]; });
      Promise.all(Object.keys(b.images || {}).map(function (k) { return Store.putImage(k, b.images[k].data, b.images[k].v); }))
        .then(function () { return Store.update('', upd); })
        .then(function () { toast(t('adm.backupDone')); });
    });
  }

  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function pickFile(accept, cb) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = function () { var f = inp.files[0]; if (f) f.text().then(cb); };
    inp.click();
  }

  // ---------------------------------------------------------------- informes

  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function rangeBounds() {
    var now = new Date(), today = dayStart(now), DAY = 86400000;
    switch (A.range) {
      case 'yesterday': return [today - DAY, today];
      case '7': return [today - 6 * DAY, today + DAY];
      case '30': return [today - 29 * DAY, today + DAY];
      case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today + DAY];
      case 'custom':
        var f = A.from ? new Date(A.from + 'T00:00').getTime() : today;
        var to = A.to ? new Date(A.to + 'T00:00').getTime() + DAY : today + DAY;
        return [f, Math.max(to, f + DAY)];
      default: return [today, today + DAY];
    }
  }

  function allSales() {
    var byId = {};
    (A.archive || []).forEach(function (a) { Object.keys((a && a.sales) || {}).forEach(function (k) { byId[k] = a.sales[k]; }); });
    Object.keys(A.sales).forEach(function (k) { byId[k] = A.sales[k]; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function report() {
    var b = rangeBounds();
    var sales = allSales().filter(function (s) { return s.closedAt >= b[0] && s.closedAt < b[1]; });
    var r = { from: b[0], to: b[1], total: 0, count: sales.length, units: 0, discounts: 0, guests: 0, guestTotal: 0, byMethod: {}, byWaiter: {}, products: {}, cats: {}, series: [] };
    var days = Math.round((b[1] - b[0]) / 86400000);
    var hourly = days <= 1;
    var buckets = {}, visits = {};
    sales.forEach(function (s) {
      r.total += s.total;
      r.discounts += s.discount || 0;
      // una mesa dividida en varios tickets es una sola visita (mismos comensales)
      var vk = (s.table || '') + '@' + (s.openedAt || s.id);
      var vis = visits[vk] = visits[vk] || { total: 0, guests: 0 };
      vis.total += s.total; vis.guests = Math.max(vis.guests, s.guests || 0);
      P.salePayments(s).forEach(function (p) { r.byMethod[p.method] = (r.byMethod[p.method] || 0) + p.amount; });
      var w = r.byWaiter[s.cashier] = r.byWaiter[s.cashier] || { n: 0, total: 0 };
      w.n++; w.total += s.total;
      var d = new Date(s.closedAt);
      var bk = hourly ? d.getHours() : dayStart(d);
      buckets[bk] = (buckets[bk] || 0) + s.total;
      // reparte el descuento del ticket entre sus líneas para que los importes cuadren
      var k = s.subtotal ? s.total / s.subtotal : 1;
      (Array.isArray(s.lines) ? s.lines : Object.keys(s.lines || {}).map(function (x) { return s.lines[x]; })).forEach(function (l) {
        if (!l || !l.qty) return;
        r.units += l.qty;
        var it = l.pid && P.findItem(A.menu, l.pid);
        var key = it ? it.id : 'n:' + l.name;
        var p = r.products[key] = r.products[key] || { name: it ? P.tr(it, I.lang) : l.name + (l.free ? ' ' + t('adm.rep.free') : ''), qty: 0, amount: 0 };
        var amount = l.price * l.qty * k;
        p.qty += l.qty; p.amount += amount;
        var cid = it ? P.catOfItem(A.menu, it.id) : null;
        var cat = cid && A.menu.filter(function (c) { return c.id === cid; })[0];
        var cname = cat ? (cat.icon || '') + ' ' + P.tr(cat, I.lang) : t('adm.rep.other');
        r.cats[cname] = (r.cats[cname] || 0) + amount;
      });
    });
    if (hourly) {
      var hs = Object.keys(buckets).map(Number);
      // horario de bar por defecto (8-23 h), ampliado si hay ventas fuera de él
      var h0 = Math.min.apply(null, hs.concat([8])), h1 = Math.max.apply(null, hs.concat([23]));
      for (var h = h0; h <= h1; h++) r.series.push({ label: String(h).padStart(2, '0') + 'h', tip: String(h).padStart(2, '0') + ':00–' + String(h + 1).padStart(2, '0') + ':00', v: buckets[h] || 0 });
    } else {
      for (var x = b[0]; x < b[1] && r.series.length < 93; x = dayStart(new Date(x + 36 * 3600000))) {
        var dd = new Date(x);
        r.series.push({ label: dd.getDate() + '/' + (dd.getMonth() + 1), tip: dd.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }), v: buckets[x] || 0 });
      }
    }
    Object.keys(visits).forEach(function (k) { if (visits[k].guests) { r.guests += visits[k].guests; r.guestTotal += visits[k].total; } });
    r.hourly = hourly;
    r.total = round2(r.total); r.discounts = round2(r.discounts);
    return r;
  }

  function kpi(label, val) { return '<div class="kpi"><small>' + label + '</small><b>' + val + '</b></div>'; }

  // Barras de una sola serie (un color): sin leyenda, valor solo en la barra máxima,
  // detalle al pasar el ratón y tabla con todos los valores.
  function barChart(series) {
    var max = Math.max.apply(null, series.map(function (s) { return s.v; }).concat([0]));
    var maxI = series.findIndex(function (s) { return s.v === max && max > 0; });
    var step = Math.ceil(series.length / 16);
    return '<div class="chart" role="img">' + series.map(function (s, i) {
      var h = max ? Math.max(s.v ? 2 : 0, s.v / max * 100) : 0;
      return '<div class="bar" style="height:' + h + '%" data-tip="' + esc(s.tip + ' · ' + fmt(s.v)) + '" aria-label="' + esc(s.tip + ': ' + fmt(s.v)) + '">' +
        (i === maxI ? '<span class="v">' + fmt(s.v) + '</span>' : '') + '</div>';
    }).join('') + '</div>' +
      '<div class="chart-axis">' + series.map(function (s, i) { return '<span>' + (i % step === 0 ? esc(s.label) : '') + '</span>'; }).join('') + '</div>' +
      '<details class="chart-table"><summary>' + t('adm.rep.table') + '</summary><table class="grid">' + series.map(function (s) {
        return '<tr><td>' + esc(s.tip) + '</td><td class="num">' + fmt(s.v) + '</td></tr>';
      }).join('') + '</table></details>';
  }

  function rankTable(rows, cols) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.amount; }).concat([0]));
    return '<table class="grid"><tr><th>#</th><th>' + cols[0] + '</th>' + (cols[1] ? '<th class="num">' + cols[1] + '</th>' : '') +
      '<th class="num">' + t('adm.rep.amount') + '</th><th style="width:30%"></th></tr>' +
      rows.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td>' + (cols[1] ? '<td class="num">' + r.qty + '</td>' : '') +
          '<td class="num">' + fmt(r.amount) + '</td><td><div class="hbar" style="width:' + (max ? r.amount / max * 100 : 0) + '%" data-tip="' + esc(r.name + ' · ' + fmt(r.amount)) + '"></div></td></tr>';
      }).join('') + '</table>';
  }

  function secPanel() {
    if (A.archive === null) {
      A.archive = [];
      A.archiveLoading = true;
      Store.readArchive().then(function (arr) { A.archive = arr || []; A.archiveLoading = false; render(); });
    }
    var r = report();
    var head = '<div class="toolbar"><span class="seg">' + [['today', 'adm.rep.today'], ['yesterday', 'adm.rep.yesterday'], ['7', 'adm.rep.7'], ['30', 'adm.rep.30'], ['month', 'adm.rep.month']].map(function (x) {
      return '<button class="' + (A.range === x[0] ? 'on' : '') + '" data-act="range" data-r="' + x[0] + '">' + t(x[1]) + '</button>';
    }).join('') + '</span>' +
      '<label class="muted">' + t('adm.rep.from') + ' <input type="date" data-act-change="from" value="' + esc(A.from) + '"></label>' +
      '<label class="muted">' + t('adm.rep.to') + ' <input type="date" data-act-change="to" value="' + esc(A.to) + '"></label>' +
      '<button class="btn" data-act="rep-csv">' + t('adm.rep.csv') + '</button></div>';
    var products = Object.keys(r.products).map(function (k) { return r.products[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    var html = (A.archiveLoading ? '<p class="muted">' + t('adm.rep.loading') + '</p>' : '') +
      '<div class="kpis big">' + kpi(t('adm.rep.sales'), fmt(r.total)) + kpi(t('adm.rep.tickets'), r.count) +
      kpi(t('adm.rep.avg'), fmt(r.count ? r.total / r.count : 0)) + kpi(t('adm.rep.units'), String(round2(r.units)).replace('.', ',')) +
      kpi(t('adm.rep.discounts'), fmt(r.discounts)) +
      (r.guests ? kpi(t('adm.rep.guests'), r.guests) + kpi(t('adm.rep.perGuest'), fmt(r.guestTotal / r.guests)) : '') + '</div>' +
      (r.count ? '<div class="card"><h3>' + t(r.hourly ? 'adm.rep.byHour' : 'adm.rep.byDay') + '</h3>' + barChart(r.series) + '</div>' +
        '<div class="card"><h3>' + t('adm.rep.top') + '</h3><div class="scroll-x">' + rankTable(products.slice(0, 15), [t('adm.col.product'), t('adm.rep.units1')]) + '</div></div>' +
        '<div class="two-col"><div class="card"><h3>' + t('adm.rep.byCat') + '</h3>' +
        rankTable(Object.keys(r.cats).map(function (k) { return { name: k, amount: r.cats[k] }; }).sort(function (a, b) { return b.amount - a.amount; }), [t('adm.col.cat')]) + '</div>' +
        '<div class="card"><h3>' + t('adm.rep.byMethod') + '</h3><table class="grid">' + ['efectivo', 'tarjeta', 'bizum'].concat(Object.keys(r.byMethod).filter(function (m) { return ['efectivo', 'tarjeta', 'bizum'].indexOf(m) < 0; })).map(function (m) {
          return '<tr><td>' + t('m.' + m) + '</td><td class="num">' + fmt(r.byMethod[m] || 0) + '</td><td class="num muted">' + (r.total ? Math.round((r.byMethod[m] || 0) / r.total * 100) : 0) + '%</td></tr>';
        }).join('') + '</table><h3 style="margin-top:16px">' + t('adm.rep.byWaiter') + '</h3><table class="grid">' + Object.keys(r.byWaiter).map(function (w) {
          return '<tr><td>' + esc(w) + '</td><td class="num">' + r.byWaiter[w].n + ' tickets</td><td class="num">' + fmt(r.byWaiter[w].total) + '</td></tr>';
        }).join('') + '</table></div></div>'
        : '<div class="card"><p class="muted">' + t('adm.rep.none') + '</p></div>') + closuresCard(r.from, r.to);
    A.lastProducts = products;
    return { head: head, html: html };
  }

  // Cierres Z del periodo con su arqueo, y las entradas/salidas de dinero
  function closuresCard(from, to) {
    var cl = Object.keys(A.closures || {}).map(function (k) { return A.closures[k]; })
      .filter(function (c) { return c.closedAt >= from && c.closedAt < to; }).sort(function (a, b) { return b.closedAt - a.closedAt; });
    var moves = [];
    cl.forEach(function (c) { ((c.cash && c.cash.moves) || []).forEach(function (m) { moves.push(m); }); });
    Object.keys((A.cash && A.cash.moves) || {}).forEach(function (k) { var m = A.cash.moves[k]; if (m.at >= from && m.at < to) moves.push(m); });
    moves.sort(function (a, b) { return b.at - a.at; });
    if (!cl.length && !moves.length) return '';
    var diffCell = function (d) {
      if (d == null) return '—';
      return '<span class="' + (d === 0 ? 'ok-t' : d < 0 ? 'bad-t' : 'warn-t') + '">' + (d === 0 ? t('arq.ok') : d < 0 ? t('arq.short', { n: fmt(-d) }) : t('arq.over', { n: fmt(d) })) + '</span>';
    };
    return '<div class="card"><h3>' + t('adm.rep.closures') + '</h3><div class="scroll-x"><table class="grid"><tr><th>' + t('caja.date') + '</th><th>' + t('caja.by') + '</th>' +
      '<th class="num">' + t('adm.rep.sales') + '</th><th class="num">' + t('adm.rep.expectedCash') + '</th><th class="num">' + t('adm.rep.countedCash') + '</th><th>' + t('arq.diff') + '</th></tr>' +
      cl.map(function (c) {
        var x = c.cash || {};
        return '<tr><td>' + new Date(c.closedAt).toLocaleString('es-ES') + '</td><td>' + esc(c.user) + '</td><td class="num">' + fmt(c.summary.total) + '</td>' +
          '<td class="num">' + (x.expected != null ? fmt(x.expected) : '—') + '</td><td class="num">' + (x.counted != null ? fmt(x.counted) : '—') + '</td><td>' + diffCell(x.diff) + '</td></tr>';
      }).join('') + '</table></div>' +
      (moves.length ? '<h3 style="margin-top:16px">' + t('adm.rep.cashMoves') + '</h3><table class="grid">' + moves.map(function (m) {
        return '<tr><td>' + new Date(m.at).toLocaleString('es-ES') + '</td><td>' + esc(m.user) + (m.by ? ' (' + esc(m.by) + ')' : '') + '</td><td>' + (m.type === 'in' ? '➕' : '➖') + ' ' + esc(m.reason || '') + '</td><td class="num">' + (m.type === 'in' ? '' : '−') + fmt(m.amount) + '</td></tr>';
      }).join('') + '</table>' : '') + '</div>';
  }

  function repCsv() {
    var rows = [['Producto', 'Unidades', 'Importe']].concat((A.lastProducts || []).map(function (p) {
      return [p.name, String(round2(p.qty)).replace('.', ','), round2(p.amount).toFixed(2).replace('.', ',')];
    }));
    var b = rangeBounds();
    download('productos-' + new Date(b[0]).toISOString().slice(0, 10) + '.csv', '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ---------------------------------------------------------------- eventos

  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var fn = ACTIONS[b.dataset.act];
    if (fn) fn(b.dataset, b);
  });

  app.addEventListener('input', function (e) {
    if (e.target.id === 'q') { A.q = e.target.value; render(); }
  });

  // controles de la barra (filtro, fechas, opciones) que no son datos del Store
  app.addEventListener('change', function (e) {
    var el = e.target;
    var ac = el.dataset && el.dataset.actChange;
    if (ac === 'catF') { A.catF = el.value; return render(); }
    if (ac === 'from' || ac === 'to') { A[ac] = el.value; A.range = 'custom'; return render(); }
    if (ac === 'thermal') { A.showThermal = el.checked; return render(); }
    if (ac === 'ai-auto') { try { localStorage.setItem('platet-ai-auto', el.checked ? '1' : '0'); } catch (err) { /* ignorar */ } return; }
    if (!el.dataset || !el.dataset.edit) return;
    var d = el.dataset;
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var menu, mods = clone(A.mods), users = clone(A.users);
    switch (d.edit) {
      case 'avail':
        menu = clone(A.menu);
        var loc = locate(d.pid);
        if (loc) { menu[loc.ci].items[loc.ii].available = val; saveMenu(menu); }
        return;
      case 'kitchen':
        var cats = (A.qr.kitchenCats || []).filter(function (c) { return c !== d.cid; });
        if (val) cats.push(d.cid);
        return Store.update('public/qr', { kitchenCats: cats });
      case 'mod-name': case 'mod-en': case 'mod-zh':
        mods[d.mi][d.edit.slice(4)] = String(val).trim(); return saveMods(mods);
      case 'mod-price': mods[d.mi].price = round2(String(val).replace(',', '.')); return saveMods(mods);
      case 'u-name': users[d.i].name = String(val).trim().toUpperCase() || users[d.i].name; return saveUsers(users);
      case 'u-pin':
        if (!/^\d{4,6}$/.test(val)) { toast(t('msg.pinFormat')); el.value = A.users[d.i].pin; return; }
        users[d.i].pin = val; return saveUsers(users);
      case 'u-admin': users[d.i].admin = val; return saveUsers(users);
      case 'perm':
        users[d.i].perms = Object.assign({}, users[d.i].perms);
        users[d.i].perms[d.p] = !!val;
        return saveUsers(users);
      case 'sch-use': return Store.update('public/qr', { useSchedule: !!val });
      case 'sch-day':
        if (!P.validRanges(val)) { toast(t('sch.bad', { v: val })); el.value = ((A.qr.days || [])[d.i] || {})[d.f] || ''; return; }
        var days = clone(A.qr.days || P.DEFAULT_QR.days);
        days[d.i] = Object.assign({}, days[d.i]);
        days[d.i][d.f] = String(val).trim();
        return Store.update('public/qr', { days: days });
      case 'tk':
        var tk = Object.assign({}, P.DEFAULT_TICKET, A.settings.ticket || {});
        tk[d.k] = el.type === 'checkbox' ? !!val : d.k === 'logoWidth' ? Number(val) : String(val);
        A.thermal = null;
        return Store.update('settings', { ticket: tk });
      case 'footer': return Store.update('settings', { footer: String(val) });
      case 'set':
        var st = Object.assign({}, A.settings);
        if (d.k === 'vat') st.vat = Number(String(val).replace(',', '.')) || 0;
        else if (d.k === 'series') st.series = String(val).toUpperCase().replace(/[^A-Z0-9_-]/g, '') || P.DEFAULT_SETTINGS.series;
        else st[d.k] = val;
        return Store.set('settings', st);
    }
  });

  // detalle al pasar el ratón por las barras
  var tip = document.getElementById('tip');
  app.addEventListener('mousemove', function (e) {
    var el = e.target.closest('[data-tip]');
    if (!el) { tip.classList.add('hidden'); return; }
    tip.textContent = el.dataset.tip;
    tip.classList.remove('hidden');
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (e.clientY - 36) + 'px';
  });
  app.addEventListener('mouseleave', function () { tip.classList.add('hidden'); });

  var ACTIONS = {
    lang: function (d) { I.set(d.l); render(); },
    sec: function (d) {
      A.sec = d.s;
      try { sessionStorage.setItem('platet-adm-sec', d.s); } catch (e) { /* ignorar */ }
      if (d.s === 'panel') A.archive = null;          // recargar ventas archivadas
      render();
      window.scrollTo(0, 0);
    },
    logout: function () {
      try { sessionStorage.removeItem('platet-session'); } catch (e) { /* ignorar */ }
      A.user = null; render();
    },
    'pick-user': function (d) { askPin(A.users[d.i]); },
    'reset-auth': function () {
      if (!confirm(t('setup.resetConfirm'))) return;
      Store.setAuth(''); location.href = 'pos.html';
    },

    'prod-new': function () { openProduct(null); },
    'prod-edit': function (d) { openProduct(d.pid); },
    'prod-dup': function (d) {
      var loc = locate(d.pid);
      if (!loc) return;
      var menu = clone(A.menu);
      var src = menu[loc.ci].items[loc.ii];
      var copy = Object.assign(clone(src), { id: menu[loc.ci].id + '-' + Store.newId(), name: src.name + ' ' + t('adm.copy'), img: 0 });
      menu[loc.ci].items.splice(loc.ii + 1, 0, copy);
      var p = Promise.resolve();
      if (src.img) {
        p = Store.getImage('p-' + src.id, src.img).then(function (data) {
          if (data) { copy.img = Date.now(); return Store.putImage('p-' + copy.id, data, copy.img); }
        });
      }
      p.then(function () { saveMenu(menu); openProduct(copy.id); });
    },
    'prod-move': function (d) {
      var loc = locate(d.pid);
      if (!loc) return;
      var menu = clone(A.menu), items = menu[loc.ci].items, j = loc.ii + Number(d.d);
      if (j < 0 || j >= items.length) return;
      items.splice(j, 0, items.splice(loc.ii, 1)[0]);
      saveMenu(menu);
    },
    'prod-del': function (d) {
      var loc = locate(d.pid);
      if (!loc) return;
      var menu = clone(A.menu), it = menu[loc.ci].items[loc.ii];
      if (!confirm(t('admin.delConfirm', { n: it.name }))) return;
      menu[loc.ci].items.splice(loc.ii, 1);
      if (it.img) Store.removeImage('p-' + it.id);
      saveMenu(menu);
      toast(t('adm.deleted'));
    },

    'cat-new': function () { openCat(null); },
    'cat-edit': function (d) { openCat(d.cid); },
    'cat-products': function (d) { A.catF = d.cid; A.sec = 'products'; render(); },
    'cat-move': function (d) {
      var menu = clone(A.menu), i = menu.findIndex(function (c) { return c.id === d.cid; }), j = i + Number(d.d);
      if (i < 0 || j < 0 || j >= menu.length) return;
      menu.splice(j, 0, menu.splice(i, 1)[0]);
      saveMenu(menu);
    },
    'cat-del': function (d) {
      var menu = clone(A.menu), i = menu.findIndex(function (c) { return c.id === d.cid; });
      if (i < 0) return;
      var c = menu[i], n = (c.items || []).length;
      if (!confirm(n ? t('adm.catNotEmpty', { n: n }) : t('admin.delConfirm', { n: c.name }))) return;
      (c.items || []).forEach(function (it) { if (it.img) Store.removeImage('p-' + it.id); });
      if (c.img) Store.removeImage('c-' + c.id);
      menu.splice(i, 1);
      if (A.catF === c.id) A.catF = '';
      saveMenu(menu);
    },

    'mod-add': function (d) {
      var mods = clone(A.mods);
      mods.push({ id: d.type.charAt(0) + Store.newId(), type: d.type, name: '…', price: 0 });
      saveMods(mods);
    },
    'mod-del': function (d) {
      var mods = clone(A.mods);
      if (!confirm(t('admin.delConfirm', { n: mods[d.mi].name }))) return;
      mods.splice(+d.mi, 1); saveMods(mods);
    },
    'mods-reset': function () {
      if (!confirm(t('admin.resetMods') + '?')) return;
      saveMods(clone(P.DEFAULT_MODS));
    },

    'u-add': function () {
      var users = clone(A.users);
      users.push({ name: 'NUEVO', pin: '0000', admin: false });
      saveUsers(users);
    },
    'u-del': function (d) {
      var users = clone(A.users);
      if (users[d.i].name === A.user.name) return toast(t('msg.selfDel'));
      if (!confirm(t('admin.delUser', { n: users[d.i].name }))) return;
      users.splice(+d.i, 1); saveUsers(users);
    },

    'open-plan': function () {
      try { sessionStorage.setItem('platet-open-layout', '1'); sessionStorage.setItem('platet-session', A.user.name); } catch (e) { /* ignorar */ }
      location.href = 'pos.html';
    },
    'qr-pause': function () { Store.update('public/qr', { paused: !A.qr.paused }); },
    'kitchen-toggle': function () {
      var off = A.qr.kitchenOffUntil && A.qr.kitchenOffUntil > Date.now();
      Store.update('public/qr', { kitchenOffUntil: off ? 0 : P.endOfService() });
    },

    'ai-key-save': function () {
      var k = document.getElementById('ai-key').value.trim();
      if (k) { Voice.setAiKey(k); render(); }
    },
    'ai-key-remove': function () { Voice.setAiKey(''); render(); },
    'vmem-export': function () { download('memoria-voz-platet.json', Voice.exportMem(), 'application/json'); },
    'vmem-import': function () {
      pickFile('application/json,.json', function (txt) {
        try { Voice.importMem(txt, true); toast(t('admin.v.imported')); render(); } catch (e) { toast('JSON ✗'); }
      });
    },
    'vmem-clear': function () {
      if (!confirm(t('admin.v.clearConfirm'))) return;
      Voice.clear(); render();
    },

    'backup-dl': backupDownload,
    'logo-del': function () {
      Store.removeImage('logo');
      A.logoData = null; A.thermal = null;
      Store.update('settings', { logoImg: 0 });
    },
    'tk-test': function () {
      var sm = sampleTicket(), T = Object.assign({}, P.DEFAULT_TICKET, A.settings.ticket || {});
      var doc = P.receiptDoc(sm.tk, sm.sale, A.settings, { table: 'Mesa T5', user: sm.sale.cashier, logo: A.logoData });
      Devices.print(doc, 'receipt', { big: T.big }).then(function () { toast(t('dev.sent')); }).catch(function (e) { toast(t('dev.err', { e: e.message })); });
    },
    'imp-paste': function () {
      var txt = document.getElementById('imp-paste').value;
      if (txt.trim()) startImport(parseCsv(txt), 'Excel');
    },
    'imp-apply': function () {
      var I2 = A.imp;
      if (!I2 || I2.map.name == null || I2.map.price == null) return toast(t('imp.needCols'));
      if (I2.mode === 'replace' && !confirm(t('imp.replaceConfirm'))) return;
      A.impUndo = clone(A.menu);
      saveMenu(I2.plan.menu);
      A.imp = null;
      toast(t('imp.done'));
    },
    'imp-undo': function () {
      if (!A.impUndo) return;
      saveMenu(A.impUndo);
      A.impUndo = null;
      toast(t('imp.undone'));
    },
    'dev-connect': function () {
      Devices.connectSerial().then(function () { toast(t('dev.connected')); }).catch(function (e) { if (e.name !== 'NotFoundError') toast(t('dev.err', { e: e.message })); });
    },
    'dev-test': function (d) {
      var doc = d.w === 'kitchen'
        ? [['h1', 'COMANDA #0'], ['cb', 'PRUEBA'], ['hr'], ['kitem', '2 x', 'Caña', []], ['kitem', '1 x', 'Hamburguesa Básica', ['SIN Cebolla · EXTRA Bacon', 'Al punto']]]
        : [['h1', A.settings.name], ['c', A.settings.address], ['hr'], ['b', 'PRUEBA DE IMPRESIÓN · ñ á é í ó ú €'], ['item', '2', 'Caña', [], '3,00 €'], ['hr'], ['lrb', 'TOTAL', '3,00 €']];
      Devices.print(doc, d.w).then(function () { toast(t('dev.sent')); }).catch(function (e) { toast(t('dev.err', { e: e.message })); });
    },
    'dev-drawer': function () {
      Devices.openDrawer().then(function () { toast(t('dev.sent')); }).catch(function (e) { toast(e.message === 'browser' ? t('dev.drawerBrowser') : t('dev.err', { e: e.message })); });
    },
    'backup-up': backupUpload,

    range: function (d) { A.range = d.r; A.from = ''; A.to = ''; render(); },
    'rep-csv': repCsv
  };

  // ---------------------------------------------------------------- PIN, modal, avisos

  function askPin(user) {
    var pin = '';
    function draw() {
      modalBox.className = 'modal-box';
      modalBox.innerHTML = '<h2>' + esc(user.name) + '</h2><p class="muted" style="text-align:center">' + t('pin.enter') + '</p>' +
        '<div class="pin-dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) {
          return '<button data-k="' + k + '" class="' + (k === 'OK' ? 'ok' : '') + '">' + k + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:12px"><button class="btn" data-k="X">' + t('cancel') + '</button></div>';
    }
    function tryLogin() {
      if (pin === String(user.pin) && user.admin) {
        A.user = user;
        try { sessionStorage.setItem('platet-session', user.name); } catch (e) { /* ignorar */ }
        closeModal(); render();
      } else { pin = ''; draw(); toast(t('pin.wrong')); }
    }
    openModal('pin', draw, function (k) {
      if (k === 'X') return closeModal();
      if (k === '⌫') pin = pin.slice(0, -1);
      else if (k === 'OK') return tryLogin();
      else if (pin.length < 6) pin += k;
      draw();
      if (pin.length === String(user.pin).length && pin.length >= 4) tryLogin();
    });
  }

  var modalHandler = null;
  function openModal(kind, draw, handler) {
    modal.dataset.kind = kind;
    modalHandler = handler;
    draw();
    modal.classList.remove('hidden');
  }
  function closeModal() { modal.classList.add('hidden'); modal.dataset.kind = ''; modalHandler = null; }
  modalBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]');
    if (b && modalHandler) modalHandler(b.dataset.k);
  });
  document.addEventListener('keydown', function (e) {
    if (modal.dataset.kind === 'pin' && /^[0-9]$/.test(e.key)) modalHandler(e.key);
    else if (modal.dataset.kind === 'pin' && e.key === 'Backspace') modalHandler('⌫');
    else if (e.key === 'Escape' && modalHandler) closeModal();
  });

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  // Suscripciones al final: en modo local responden al instante y repintan, así
  // que todo lo anterior (secciones, acciones…) tiene que estar ya definido.
  function subscribe() {
    Store.on('menu', function (v) { A.menu = v || P.DEFAULT_MENU; render(); });
    Store.on('mods', function (v) { A.mods = v || P.DEFAULT_MODS; render(); });
    Store.on('settings', function (v) { A.settings = Object.assign({}, P.DEFAULT_SETTINGS, v || {}); render(); });
    Store.on('public/qr', function (v) { A.qr = Object.assign({}, P.DEFAULT_QR, v || {}); render(); });
    Store.on('layout', function (v) { A.layout = (v && v.length) ? v : P.LAYOUT; render(); });
    Store.on('temp', function (v) { A.temp = v || {}; render(); });
    Store.on('sales', function (v) { A.sales = v || {}; render(); });
    Store.on('audit', function (v) { A.audit = v || {}; render(); });
    Store.on('closures', function (v) { A.closures = v || {}; render(); });
    Store.on('cash', function (v) { A.cash = v || {}; render(); });
    Store.on('users', function (v) {
      A.users = v || P.DEFAULT_USERS;
      if (!A.user) {
        // sesión abierta en el TPV (misma pestaña)
        var name = null;
        try { name = sessionStorage.getItem('platet-session'); } catch (e) { /* ignorar */ }
        var u = name && A.users.filter(function (x) { return x.name === name && x.admin; })[0];
        if (u) A.user = u;
      } else {
        A.user = A.users.filter(function (x) { return x.name === A.user.name && x.admin; })[0] || null;
      }
      render();
    });
  }

  subscribe();
  render();
})();
