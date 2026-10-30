// Datos por defecto (carta, modificadores, plano de mesas, usuarios) y utilidades comunes.
// La carta, los modificadores y los usuarios se pueden editar desde el TPV
// (Ajustes); estos valores solo se usan mientras no se haya guardado nada.
(function () {
  'use strict';

  // [id, [es, en, zh], icono, [[es, precio, en, zh], ...]]
  // Las categorías marcadas con * (bebidas, montaditos, snacks, postres...) no
  // aparecen en la carta web: sus precios son de ejemplo, cámbialos en Ajustes.
  var CATS = [
    ['cafe', ['Café *', 'Coffee', '咖啡'], '☕', [
      ['Café solo', 1.2, 'Espresso', '浓缩咖啡'], ['Cortado', 1.3, 'Cortado (espresso with a dash of milk)', '可塔朵（少奶咖啡）'],
      ['Café con leche', 1.5, 'White coffee', '牛奶咖啡'], ['Carajillo', 1.8, 'Carajillo (coffee with liqueur)', '酒咖啡 Carajillo'],
      ['Bombón', 1.5, 'Coffee with condensed milk', '炼乳咖啡'], ['Infusión', 1.3, 'Herbal tea', '花草茶'], ['Colacao', 1.6, 'Hot chocolate milk', '可可牛奶']]],
    ['refresco', ['Refrescos *', 'Soft drinks', '饮料'], '🥤', [
      ['Coca-Cola', 2, 'Coca-Cola', '可口可乐'], ['Coca-Cola Zero', 2, 'Coca-Cola Zero', '零度可乐'], ['Fanta naranja', 2, 'Fanta orange', '橙味芬达'],
      ['Fanta limón', 2, 'Fanta lemon', '柠檬味芬达'], ['Nestea', 2.2, 'Nestea iced tea', '雀巢冰茶'], ['Aquarius', 2.2, 'Aquarius', 'Aquarius 运动饮料'],
      ['Zumo', 2, 'Juice', '果汁'], ['Agua 0,5 L', 1.5, 'Water 0.5 L', '矿泉水 0.5 升'], ['Agua con gas', 1.8, 'Sparkling water', '气泡水']]],
    ['cerveza', ['Cerveza *', 'Beer', '啤酒'], '🍺', [
      ['Caña', 1.5, 'Small draught beer', '小杯生啤'], ['Tercio', 2.2, 'Bottled beer (33 cl)', '瓶装啤酒 33cl'], ['Jarra', 2.8, 'Pint of beer', '大杯生啤'],
      ['Clara', 1.8, 'Shandy (beer with lemonade)', '柠檬啤酒'], ['Cerveza sin alcohol', 2.2, 'Alcohol-free beer', '无醇啤酒']]],
    ['licor', ['Licores y vinos *', 'Wine & spirits', '酒类'], '🥃', [
      ['Copa de vino', 2.2, 'Glass of wine', '一杯葡萄酒'], ['Mistela', 2, 'Mistela (sweet wine)', '甜酒 Mistela'], ['Chupito', 2, 'Shot', '小杯烈酒'],
      ['Copa ron', 6, 'Rum', '朗姆酒'], ['Copa whisky', 6, 'Whisky', '威士忌'], ['Gin tonic', 7, 'Gin & tonic', '金汤力']]],
    ['granizado', ['Granizados *', 'Slushies', '冰沙'], '🧊', [
      ['Granizado de limón', 2.5, 'Lemon slushie', '柠檬冰沙'], ['Granizado de café', 2.5, 'Coffee slushie', '咖啡冰沙'], ['Horchata', 2.5, 'Horchata (tiger nut drink)', '油莎豆饮 Horchata']]],
    ['menu', ['Menú del día *', 'Set menu of the day', '今日套餐'], '📋', [
      ['Menú del día', 12, 'Set menu of the day', '今日套餐'], ['Medio menú', 8, 'Half set menu', '半份套餐']]],
    ['ent-frias', ['Entradas frías', 'Cold starters', '冷盘'], '🥶', [
      ['Pan con ajo y tomate', 1.8, 'Bread with garlic and tomato', '蒜香番茄面包'], ['Tabla de jamón y queso', 10, 'Ham and cheese board', '火腿奶酪拼盘'],
      ['Ensaladilla rusa', 2, 'Russian potato salad', '俄式土豆沙拉'], ['Jamón', 8, 'Cured ham', '西班牙火腿'], ['Queso', 4, 'Cheese', '奶酪'],
      ['Boquerones en vinagre y patatas', 4.3, 'Anchovies in vinegar with crisps', '醋腌鳀鱼配薯片']]],
    ['ensalada', ['Ensaladas', 'Salads', '沙拉'], '🥗', [
      ['Ensalada mixta', 4.5, 'Mixed salad', '什锦沙拉'], ['Ensalada capellán', 7, 'Salt cod salad (capellán)', '鳕鱼干沙拉'], ['Ensalada murciana', 4.5, 'Murcian tomato salad', '穆尔西亚番茄沙拉']]],
    ['ent-calientes', ['Entradas calientes', 'Hot starters', '热菜小吃'], '🔥', [
      ['Camillona', 4.5, 'Camillona (local sandwich)', 'Camillona 本地三明治'], ['Queso frito', 4.5, 'Fried cheese', '炸奶酪'], ['Queso plancha', 4.5, 'Grilled cheese', '铁板奶酪'],
      ['Habas con jamón', 3.8, 'Broad beans with ham', '火腿炒蚕豆'], ['Croqueta de jamón (ud, mín. 3)', 0.8, 'Ham croquette (each, min. 3)', '火腿可乐饼（每个，至少3个）'],
      ['Muslito de mar (ud, mín. 3)', 0.8, 'Crab stick croquette (each, min. 3)', '蟹棒炸球（每个，至少3个）'], ['Alita de pollo (ud, mín. 3)', 1.3, 'Chicken wing (each, min. 3)', '鸡翅（每个，至少3个）'],
      ['Tigre (ud, mín. 3)', 1, 'Stuffed mussel "tigre" (each, min. 3)', '酿青口 Tigre（每个，至少3个）'], ['Brocheta de pollo', 2.2, 'Chicken skewer', '鸡肉串'],
      ['Magra con tomate', 4.5, 'Pork in tomato sauce', '番茄炖猪肉'], ['Parrillada de carne', 18, 'Mixed meat grill', '烤肉拼盘'], ['Huevos rotos con jamón', 7, 'Fried eggs on chips with ham', '火腿碎蛋薯条'],
      ['Rabo de toro', 14, 'Oxtail stew', '炖牛尾'], ['Mejillones al vapor', 5, 'Steamed mussels', '清蒸青口'], ['Patatas bravas', 4.5, 'Patatas bravas (spicy potatoes)', '辣酱土豆'],
      ['Patatas con allioli', 4.5, 'Potatoes with garlic mayo', '蒜蓉蛋黄酱土豆'], ['Patatas cheddar con bacon', 5.8, 'Cheddar and bacon fries', '芝士培根薯条'], ['Gambas al ajillo', 9, 'Garlic prawns', '蒜香虾'],
      ['Calamares a la romana', 9, 'Fried squid rings', '炸鱿鱼圈'], ['Sepia rebozada', 7.5, 'Battered cuttlefish', '炸墨鱼'], ['Almejas marineras', 5.5, 'Clams in marinara sauce', '水手酱蛤蜊']]],
    ['pescado', ['Pescados', 'Fish', '鱼类'], '🐟', [
      ['Merluza plancha o romana', 8, 'Hake, grilled or battered (with chips)', '鳕鱼（铁板或炸，配薯条）'], ['Lenguado a la romana', 8, 'Battered sole (with chips)', '炸比目鱼（配薯条）']]],
    ['carne', ['Carnes', 'Meat', '肉类'], '🍖', [
      ['Pechuga de pollo plancha/romana', 7, 'Chicken breast, grilled or battered (with chips)', '鸡胸肉（铁板或炸，配薯条）'], ['Pechuga rellena (york + queso)', 8, 'Chicken breast stuffed with ham and cheese', '火腿奶酪酿鸡胸'],
      ['Lomo plancha/romana', 7, 'Pork loin, grilled or battered (with chips)', '猪里脊（铁板或炸，配薯条）'], ['Filete de ternera', 8, 'Beef steak (with chips)', '牛排（配薯条）'], ['Chuleta de cordero', 12, 'Lamb chops (with chips)', '羊排（配薯条）']]],
    ['tostada', ['Tostadas', 'Toasts', '烤面包'], '🍞', [
      ['1/2 Con tomate', 1.2, '1/2 toast with tomato', '半份番茄烤面包'], ['1/2 Jamón serrano', 2.5, '1/2 toast with serrano ham', '半份火腿烤面包'], ['1/2 Sobrasada y queso', 3.8, '1/2 toast with sobrasada and cheese', '半份辣肠奶酪烤面包']]],
    ['montadito', ['Montaditos *', 'Mini sandwiches', '迷你三明治'], '🥖', [
      ['Montadito de lomo', 2.2, 'Pork loin mini sandwich', '里脊迷你三明治'], ['Montadito de pollo', 2.2, 'Chicken mini sandwich', '鸡肉迷你三明治'], ['Montadito de jamón', 2.5, 'Ham mini sandwich', '火腿迷你三明治']]],
    ['bocadillo', ['Bocadillos', 'Sandwiches', '三明治'], '🥪', [
      ['Pechuga de pollo', 3.8, 'Chicken breast sandwich', '鸡胸肉三明治'], ['Calamares a la romana', 4, 'Fried squid sandwich', '炸鱿鱼三明治'], ['Jamón serrano y queso fresco', 5, 'Serrano ham and fresh cheese sandwich', '火腿鲜奶酪三明治']]],
    ['hamburguesa', ['Hamburguesas', 'Burgers', '汉堡'], '🍔', [
      ['Hamburguesa Básica', 4.8, 'Basic burger (lettuce, tomato, cheese, chips)', '基础汉堡（生菜、番茄、奶酪、薯条）'],
      ['Hamburguesa Supersónica', 5.8, 'Supersonic burger (+ bacon and egg)', '超级汉堡（加培根和鸡蛋）']]],
    ['snack', ['Snacks *', 'Snacks', '小食'], '🍟', [
      ['Patatas fritas', 3, 'Chips / fries', '薯条'], ['Aceitunas', 1.5, 'Olives', '橄榄'], ['Nachos', 5, 'Nachos', '玉米片']]],
    ['postre', ['Postres *', 'Desserts', '甜品'], '🍰', [
      ['Flan', 3, 'Crème caramel', '焦糖布丁'], ['Tarta de queso', 4, 'Cheesecake', '芝士蛋糕'], ['Helado', 3, 'Ice cream', '冰淇淋'], ['Fruta del tiempo', 2.5, 'Seasonal fruit', '时令水果']]],
    ['varios', ['Varios', 'Other', '其他'], '➕', [
      ['Pan', 0.5, 'Bread', '面包'], ['Suplemento', 1, 'Supplement', '附加费']]]
  ];

  var DEFAULT_MENU = CATS.map(function (c) {
    return {
      id: c[0],
      name: c[1][0].replace(' *', ''),
      en: c[1][1],
      zh: c[1][2],
      icon: c[2],
      items: c[3].map(function (it, i) {
        return { id: c[0] + '-' + (i + 1), name: it[0], price: it[1], en: it[2], zh: it[3], available: true };
      })
    };
  });

  // Modificadores rápidos: sin = quitar, extra = añadir con precio, prep = cómo prepararlo.
  function mods(prefix, type, rows) {
    return rows.map(function (r, i) {
      return { id: prefix + (i + 1), type: type, name: r[0], en: r[1], zh: r[2], price: r[3] || 0 };
    });
  }
  var DEFAULT_MODS = [].concat(
    mods('s', 'sin', [
      ['Cebolla', 'Onion', '洋葱'], ['Tomate', 'Tomato', '番茄'], ['Lechuga', 'Lettuce', '生菜'], ['Queso', 'Cheese', '奶酪'],
      ['Ajo', 'Garlic', '蒜'], ['Salsa', 'Sauce', '酱汁'], ['Mayonesa', 'Mayonnaise', '蛋黄酱'], ['Picante', 'Spicy', '辣'],
      ['Sal', 'Salt', '盐'], ['Pan', 'Bread', '面包'], ['Patatas', 'Chips', '薯条'], ['Gluten', 'Gluten', '麸质'],
      ['Lactosa', 'Lactose', '乳糖'], ['Huevo', 'Egg', '鸡蛋'], ['Bacon', 'Bacon', '培根'], ['Hielo', 'Ice', '冰'], ['Azúcar', 'Sugar', '糖']
    ]),
    mods('e', 'extra', [
      ['Queso', 'Cheese', '奶酪', 0.5], ['Bacon', 'Bacon', '培根', 1], ['Huevo', 'Egg', '鸡蛋', 1], ['Jamón', 'Ham', '火腿', 1.5],
      ['Patatas', 'Chips', '薯条', 1.5], ['Ensalada', 'Salad', '沙拉', 1.5], ['Doble carne', 'Double meat', '双份肉', 2],
      ['Salsa brava', 'Brava sauce', '辣酱', 0.5], ['Allioli', 'Garlic mayo', '蒜蓉蛋黄酱', 0.5], ['Pan', 'Bread', '面包', 0.5],
      ['Leche de avena', 'Oat milk', '燕麦奶', 0.3], ['Limón', 'Lemon', '柠檬', 0]
    ]),
    mods('p', 'prep', [
      ['Poco hecho', 'Rare', '三分熟'], ['Al punto', 'Medium', '五分熟'], ['Muy hecho', 'Well done', '全熟'],
      ['Salsa aparte', 'Sauce on the side', '酱汁分开放'], ['Para compartir', 'To share', '分享'], ['Sale primero', 'Serve first', '先上'],
      ['Sale después', 'Serve later', '后上'], ['Para llevar', 'Take away', '打包'], ['Templado', 'Lukewarm', '温的'],
      ['Leche fría', 'Cold milk', '冷牛奶'], ['Descafeinado', 'Decaf', '低咖啡因'], ['Con hielo', 'With ice', '加冰']
    ])
  );

  // Plano copiado del TPV actual. x/y = centro en % del plano.
  // shape: round (mesa redonda), square (mesa cuadrada), stool (taburete barra)
  function row(ids, xs, y, shape) {
    return ids.map(function (id, i) { return { id: id, x: xs[i], y: y, shape: shape }; });
  }
  var LAYOUT = [].concat(
    row(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'], [13, 23, 31, 39, 48, 56], 8, 'round'),
    row(['T12', 'T11', 'T10', 'T9', 'T8', 'T7'], [14, 23, 32, 40, 48, 56], 21, 'round'),
    row(['T13', 'T14'], [13, 23], 35, 'round'),
    row(['T15', 'T17', 'T18', 'T19', 'T20'], [33, 70, 78, 86, 94], 35, 'square'),
    [{ id: 'T16', x: 70, y: 21, shape: 'square' }],
    row(['S2', 'S3', 'S4', 'S5'], [51, 65, 78, 91], 53, 'square'),
    [{ id: 'S1', x: 51, y: 71, shape: 'square' }, { id: 'S6', x: 91, y: 73, shape: 'square' }],
    row(['S8', 'S7'], [73, 81], 88, 'square'),
    row(['B1', 'B2'], [30, 36], 61, 'stool'),
    [3, 4, 5, 6, 7, 8].map(function (n, i) { return { id: 'B' + n, x: 41, y: 67 + i * 5.4, shape: 'stool' }; })
  );

  // Cambia los PIN en Ajustes > Usuarios.
  var DEFAULT_USERS = [
    { name: 'CHARLY', pin: '1111', admin: true },
    { name: 'ANA', pin: '2222', admin: false },
    { name: 'KELLY', pin: '3333', admin: false },
    { name: 'EMPLEADO', pin: '0000', admin: false }
  ];

  var DEFAULT_SETTINGS = {
    name: 'Restaurante Platet',
    address: 'C/ José García Ferrández, 2 · Elx',
    nif: '',
    vat: 10,
    footer: '¡Gracias por su visita!',
    series: 'T' + new Date().getFullYear()
  };

  // ---------------------------------------------------------------- horario QR
  // public/qr (lo lee también la carta del cliente):
  //   useSchedule: si es false, se puede pedir siempre
  //   days[0..6] (lunes..domingo): { qr: '12:00-16:30, 20:00-23:30', kitchen: '13:00-16:00' }
  //     vacío = cerrado ese día; un tramo que acaba antes de empezar cruza la medianoche
  //   kitchenCats: categorías que prepara la cocina (fuera de su horario no se pueden pedir)
  //   paused: pedidos QR pausados a mano · kitchenOffUntil: cocina cerrada a mano hasta esa hora
  var DEFAULT_QR = {
    useSchedule: false,
    paused: false,
    kitchenOffUntil: 0,
    days: [0, 1, 2, 3, 4, 5, 6].map(function () { return { qr: '12:00-16:30, 19:30-23:30', kitchen: '13:00-16:00, 20:00-23:00' }; }),
    kitchenCats: ['menu', 'ent-frias', 'ensalada', 'ent-calientes', 'pescado', 'carne', 'tostada', 'montadito', 'bocadillo', 'hamburguesa', 'snack']
  };

  var RANGE_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;
  function parseRanges(str) {
    return String(str || '').split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
      var m = x.match(RANGE_RE);
      if (!m) return null;
      var a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
      if (a > 1440 || b > 1440) return null;
      if (b <= a) b += 1440;
      return [a, b];
    });
  }
  function validRanges(str) { return parseRanges(str).every(Boolean); }
  function hhmm(min) { min = min % 1440; return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }

  // ¿Abierto en la fecha d? Devuelve {open, next} (next = próxima apertura hoy, 'HH:MM' o null)
  function inRanges(days, field, d) {
    var dow = (d.getDay() + 6) % 7;             // 0 = lunes
    var min = d.getHours() * 60 + d.getMinutes();
    var today = parseRanges(days[dow] && days[dow][field]).filter(Boolean);
    var yday = parseRanges(days[(dow + 6) % 7] && days[(dow + 6) % 7][field]).filter(Boolean);
    var open = today.some(function (r) { return min >= r[0] && min < r[1]; }) ||
      yday.some(function (r) { return r[1] > 1440 && min + 1440 < r[1]; });
    var next = today.map(function (r) { return r[0]; }).filter(function (a) { return a > min; }).sort(function (a, b) { return a - b; })[0];
    return { open: open, next: next == null ? null : hhmm(next) };
  }

  function qrStatus(cfg, d) {
    cfg = Object.assign({}, DEFAULT_QR, cfg || {});
    d = d || new Date();
    if (cfg.paused) return { open: false, kitchen: false, reason: 'paused', next: null, kitchenNext: null, kitchenCats: cfg.kitchenCats || [] };
    var q = cfg.useSchedule ? inRanges(cfg.days || [], 'qr', d) : { open: true, next: null };
    var k = cfg.useSchedule ? inRanges(cfg.days || [], 'kitchen', d) : { open: true, next: null };
    var kOpen = k.open && !(cfg.kitchenOffUntil && d.getTime() < cfg.kitchenOffUntil);
    return {
      open: q.open, kitchen: q.open && kOpen, reason: q.open ? null : 'hours', next: q.next,
      kitchenNext: kOpen ? null : (cfg.kitchenOffUntil && d.getTime() < cfg.kitchenOffUntil ? null : k.next),
      kitchenCats: cfg.kitchenCats || []
    };
  }

  // Siguiente 06:00 (fin de la "jornada" para "cerrar cocina hoy")
  function endOfService(d) {
    d = new Date(d || Date.now());
    var e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0);
    if (e <= d) e.setDate(e.getDate() + 1);
    return e.getTime();
  }

  function catOfItem(menu, pid) {
    for (var i = 0; i < (menu || []).length; i++) {
      if ((menu[i].items || []).some(function (it) { return it.id === pid; })) return menu[i].id;
    }
    return null;
  }

  var TABLE_ID_RE = /^[A-Z0-9][A-Z0-9-]{0,9}$/;

  // Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011)
  var ALLERGENS = [
    ['gluten', '🌾', 'Gluten', 'Gluten', '麸质'],
    ['crustaceos', '🦐', 'Crustáceos', 'Crustaceans', '甲壳类'],
    ['huevo', '🥚', 'Huevo', 'Egg', '鸡蛋'],
    ['pescado', '🐟', 'Pescado', 'Fish', '鱼'],
    ['cacahuetes', '🥜', 'Cacahuetes', 'Peanuts', '花生'],
    ['soja', '🫘', 'Soja', 'Soy', '大豆'],
    ['lacteos', '🥛', 'Lácteos', 'Milk', '乳制品'],
    ['frutos', '🌰', 'Frutos de cáscara', 'Tree nuts', '坚果'],
    ['apio', '🥬', 'Apio', 'Celery', '芹菜'],
    ['mostaza', '🟡', 'Mostaza', 'Mustard', '芥末'],
    ['sesamo', '⚪', 'Sésamo', 'Sesame', '芝麻'],
    ['sulfitos', '🍷', 'Sulfitos', 'Sulphites', '亚硫酸盐'],
    ['altramuces', '🫛', 'Altramuces', 'Lupin', '羽扇豆'],
    ['moluscos', '🦪', 'Moluscos', 'Molluscs', '软体动物']
  ].map(function (a) { return { id: a[0], icon: a[1], name: a[2], en: a[3], zh: a[4] }; });

  // Permisos de los empleados. El administrador lo puede todo; para los demás,
  // el valor guardado en user.perms o, si no hay, el de esta lista.
  var PERMS = [
    ['pay', true], ['caja', true], ['reprint', true], ['drawer', true], ['free', true],
    ['qrOrders', true], ['qrControl', true], ['tables', true],
    ['discount', false], ['price', false], ['delSent', false], ['cancel', false], ['closeZ', false]
  ];
  function can(user, perm) {
    if (!user) return false;
    if (user.admin) return true;
    var p = user.perms || {};
    if (Object.prototype.hasOwnProperty.call(p, perm)) return !!p[perm];
    var d = PERMS.filter(function (x) { return x[0] === perm; })[0];
    return d ? d[1] : false;
  }

  // Descripción de un producto en el idioma pedido (desc, desc_en, desc_zh)
  function trDesc(it, lang) {
    if (!it) return '';
    return (lang && lang !== 'es' && it['desc_' + lang]) || it.desc || '';
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function fmt(n) {
    return round2(n).toFixed(2).replace('.', ',') + ' €';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Nombre de un producto, categoría o modificador en el idioma pedido
  // (si no hay traducción, en español).
  function tr(obj, lang) {
    if (!obj) return '';
    return (lang && lang !== 'es' && obj[lang]) || obj.name;
  }

  function findItem(menu, pid) {
    for (var i = 0; i < (menu || []).length; i++) {
      var items = menu[i].items || [];
      for (var j = 0; j < items.length; j++) if (items[j].id === pid) return items[j];
    }
    return null;
  }

  function findMod(list, id) {
    return (list || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  // Texto corto de los modificadores de una línea, p. ej. "SIN Cebolla · EXTRA Queso · Al punto"
  var MOD_PREFIX = { sin: { es: 'SIN', en: 'NO', zh: '不要' }, extra: { es: 'EXTRA', en: 'EXTRA', zh: '加' }, prep: { es: '', en: '', zh: '' } };
  function modsText(lineMods, lang) {
    lang = lang || 'es';
    return (lineMods || []).map(function (m) {
      var p = (MOD_PREFIX[m.type] || MOD_PREFIX.prep)[lang];
      return (p ? p + ' ' : '') + tr(m, lang);
    }).join(' · ');
  }

  function ticketTotals(t) {
    var sub = 0;
    ((t && t.lines) || []).forEach(function (l) { sub += l.price * l.qty; });
    sub = round2(sub);
    var disc = round2(sub * ((t && t.discountPct) || 0) / 100 + ((t && t.discountEur) || 0));
    if (disc > sub) disc = sub;
    return { subtotal: sub, discount: disc, total: round2(sub - disc) };
  }

  window.Platet = {
    DEFAULT_MENU: DEFAULT_MENU,
    DEFAULT_MODS: DEFAULT_MODS,
    LAYOUT: LAYOUT,
    DEFAULT_USERS: DEFAULT_USERS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    round2: round2,
    fmt: fmt,
    esc: esc,
    tr: tr,
    findItem: findItem,
    findMod: findMod,
    modsText: modsText,
    ticketTotals: ticketTotals,
    DEFAULT_QR: DEFAULT_QR,
    validRanges: validRanges,
    qrStatus: qrStatus,
    endOfService: endOfService,
    catOfItem: catOfItem,
    TABLE_ID_RE: TABLE_ID_RE,
    ALLERGENS: ALLERGENS,
    PERMS: PERMS,
    can: can,
    trDesc: trDesc
  };
})();
