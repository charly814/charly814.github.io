// Datos por defecto (carta, plano de mesas, usuarios) y utilidades comunes.
// La carta y los usuarios se pueden editar desde el TPV (Ajustes); estos
// valores solo se usan mientras no se haya guardado nada.
(function () {
  'use strict';

  // [id, nombre, icono, [[nombre, precio], ...]]
  // Las categorías marcadas con * (bebidas, montaditos, snacks, postres...) no
  // aparecen en la carta web: sus precios son de ejemplo, cámbialos en Ajustes.
  var CATS = [
    ['cafe', 'Café *', '☕', [['Café solo', 1.2], ['Cortado', 1.3], ['Café con leche', 1.5], ['Carajillo', 1.8], ['Bombón', 1.5], ['Infusión', 1.3], ['Colacao', 1.6]]],
    ['refresco', 'Refrescos *', '🥤', [['Coca-Cola', 2], ['Coca-Cola Zero', 2], ['Fanta naranja', 2], ['Fanta limón', 2], ['Nestea', 2.2], ['Aquarius', 2.2], ['Zumo', 2], ['Agua 0,5 L', 1.5], ['Agua con gas', 1.8]]],
    ['cerveza', 'Cerveza *', '🍺', [['Caña', 1.5], ['Tercio', 2.2], ['Jarra', 2.8], ['Clara', 1.8], ['Cerveza sin alcohol', 2.2]]],
    ['licor', 'Licores y vinos *', '🥃', [['Copa de vino', 2.2], ['Mistela', 2], ['Chupito', 2], ['Copa ron', 6], ['Copa whisky', 6], ['Gin tonic', 7]]],
    ['granizado', 'Granizados *', '🧊', [['Granizado de limón', 2.5], ['Granizado de café', 2.5], ['Horchata', 2.5]]],
    ['menu', 'Menú del día *', '📋', [['Menú del día', 12], ['Medio menú', 8]]],
    ['ent-frias', 'Entradas frías', '🥶', [['Pan con ajo y tomate', 1.8], ['Tabla de jamón y queso', 10], ['Ensaladilla rusa', 2], ['Jamón', 8], ['Queso', 4], ['Boquerones en vinagre y patatas', 4.3]]],
    ['ensalada', 'Ensaladas', '🥗', [['Ensalada mixta', 4.5], ['Ensalada capellán', 7], ['Ensalada murciana', 4.5]]],
    ['ent-calientes', 'Entradas calientes', '🔥', [['Camillona', 4.5], ['Queso frito', 4.5], ['Queso plancha', 4.5], ['Habas con jamón', 3.8], ['Croqueta de jamón (ud, mín. 3)', 0.8], ['Muslito de mar (ud, mín. 3)', 0.8], ['Alita de pollo (ud, mín. 3)', 1.3], ['Tigre (ud, mín. 3)', 1], ['Brocheta de pollo', 2.2], ['Magra con tomate', 4.5], ['Parrillada de carne', 18], ['Huevos rotos con jamón', 7], ['Rabo de toro', 14], ['Mejillones al vapor', 5], ['Patatas bravas', 4.5], ['Patatas con allioli', 4.5], ['Patatas cheddar con bacon', 5.8], ['Gambas al ajillo', 9], ['Calamares a la romana', 9], ['Sepia rebozada', 7.5], ['Almejas marineras', 5.5]]],
    ['pescado', 'Pescados', '🐟', [['Merluza plancha o romana', 8], ['Lenguado a la romana', 8]]],
    ['carne', 'Carnes', '🍖', [['Pechuga de pollo plancha/romana', 7], ['Pechuga rellena (york + queso)', 8], ['Lomo plancha/romana', 7], ['Filete de ternera', 8], ['Chuleta de cordero', 12]]],
    ['tostada', 'Tostadas', '🍞', [['1/2 Con tomate', 1.2], ['1/2 Jamón serrano', 2.5], ['1/2 Sobrasada y queso', 3.8]]],
    ['montadito', 'Montaditos *', '🥖', [['Montadito de lomo', 2.2], ['Montadito de pollo', 2.2], ['Montadito de jamón', 2.5]]],
    ['bocadillo', 'Bocadillos', '🥪', [['Pechuga de pollo', 3.8], ['Calamares a la romana', 4], ['Jamón serrano y queso fresco', 5]]],
    ['hamburguesa', 'Hamburguesas', '🍔', [['Hamburguesa Básica', 4.8], ['Hamburguesa Supersónica', 5.8]]],
    ['snack', 'Snacks *', '🍟', [['Patatas fritas', 3], ['Aceitunas', 1.5], ['Nachos', 5]]],
    ['postre', 'Postres *', '🍰', [['Flan', 3], ['Tarta de queso', 4], ['Helado', 3], ['Fruta del tiempo', 2.5]]],
    ['varios', 'Varios', '➕', [['Pan', 0.5], ['Suplemento', 1]]]
  ];

  var DEFAULT_MENU = CATS.map(function (c) {
    return {
      id: c[0],
      name: c[1].replace(' *', ''),
      icon: c[2],
      items: c[3].map(function (it, i) {
        return { id: c[0] + '-' + (i + 1), name: it[0], price: it[1], available: true };
      })
    };
  });

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
    footer: '¡Gracias por su visita!'
  };

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function fmt(n) {
    return round2(n).toFixed(2).replace('.', ',') + ' €';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function findItem(menu, pid) {
    for (var i = 0; i < (menu || []).length; i++) {
      var items = menu[i].items || [];
      for (var j = 0; j < items.length; j++) if (items[j].id === pid) return items[j];
    }
    return null;
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
    LAYOUT: LAYOUT,
    DEFAULT_USERS: DEFAULT_USERS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    round2: round2,
    fmt: fmt,
    esc: esc,
    findItem: findItem,
    ticketTotals: ticketTotals
  };
})();
