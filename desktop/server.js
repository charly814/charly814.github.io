// Servidor del local: corre dentro del ordenador de caja (la app de Windows lo arranca).
//
//  - Sirve la aplicación (TPV, gestión, comanderos de los camareros, carta QR) a los
//    móviles y tablets de la misma WiFi: http://<ip-del-ordenador>:8077/pos.html
//  - Guarda los datos en el disco duro de este ordenador (no en el navegador):
//      <datos>/db.json       foto completa
//      <datos>/journal.log   cada cambio, escrito y sincronizado a disco antes de responder
//      <datos>/backups/      una copia por día (se guardan 60)
//  - Habla el mismo «idioma» que Firebase Realtime Database (REST + EventSource), así que
//    js/store.js funciona igual que en la nube: el TPV no cambia nada.
//  - Las mismas reglas que en Firebase: sin la clave del local solo se puede leer la carta y
//    crear pedidos nuevos (clientes); con la clave, todo.
//
// Sin dependencias: solo Node.js.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

function parts(p) { return String(p || '').split('/').filter(Boolean); }
function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
function getAt(obj, ps) {
  for (let i = 0; i < ps.length; i++) {
    if (obj == null || typeof obj !== 'object') return null;
    obj = obj[ps[i]];
  }
  return obj === undefined ? null : obj;
}
// null borra; los objetos que se quedan vacíos desaparecen (como en Firebase)
function setAt(obj, ps, val) {
  if (!ps.length) return val == null ? null : val;
  if (obj == null || typeof obj !== 'object') obj = {};
  const k = ps[0];
  const child = setAt(obj[k], ps.slice(1), val);
  if (child == null) delete obj[k]; else obj[k] = child;
  return Object.keys(obj).length ? obj : null;
}
function startsWith(a, b) { return b.length <= a.length && b.every((x, i) => a[i] === x); }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach((n) => (ifs[n] || []).forEach((a) => {
    if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }));
  return out;
}

function createServer(opts) {
  const appDir = opts.appDir;
  const dataDir = opts.dataDir;
  const root = opts.root || 'platet';
  const log = opts.log || (() => {});
  let port = opts.port || 8077;
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

  // ------------------------------------------------------------ clave del local
  const keyFile = path.join(dataDir, 'key.txt');
  let key = '';
  try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch (e) { /* nueva */ }
  if (!key) { key = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(keyFile, key); }

  // ------------------------------------------------------------ datos en disco
  const snapFile = path.join(dataDir, 'db.json');
  const journalFile = path.join(dataDir, 'journal.log');
  let db = {};
  try { db = JSON.parse(fs.readFileSync(snapFile, 'utf8')) || {}; } catch (e) {
    // foto dañada (corte de luz escribiendo): la copia anterior
    try { db = JSON.parse(fs.readFileSync(snapFile + '.bak', 'utf8')) || {}; log('db.json dañado: se usa db.json.bak'); } catch (e2) { db = {}; }
  }
  let replayed = 0;
  try {
    fs.readFileSync(journalFile, 'utf8').split('\n').forEach((line) => {
      if (!line.trim()) return;
      try { JSON.parse(line).ops.forEach((o) => { db = setAt(db, parts(o[0]), o[1]) || {}; }); replayed++; } catch (e) { /* última línea a medias tras un corte: se ignora */ }
    });
  } catch (e) { /* sin diario */ }

  function writeSnapshot() {
    const tmp = snapFile + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify(db));
    fs.fsyncSync(fd); fs.closeSync(fd);
    try { fs.copyFileSync(snapFile, snapFile + '.bak'); } catch (e) { /* primera vez */ }
    fs.renameSync(tmp, snapFile);
    fs.writeFileSync(journalFile, '');
    sinceSnap = 0;
  }
  let sinceSnap = 0;
  writeSnapshot();
  if (replayed) log('Recuperados ' + replayed + ' cambios del diario');

  let journalFd = fs.openSync(journalFile, 'a');
  function commit(ops) {
    ops.forEach((o) => { db = setAt(db, o[0], clone(o[1])) || {}; });
    const line = JSON.stringify({ t: Date.now(), ops: ops.map((o) => [o[0].join('/'), o[1]]) }) + '\n';
    fs.writeSync(journalFd, line);
    fs.fsyncSync(journalFd);
    if (++sinceSnap >= 400) { fs.closeSync(journalFd); writeSnapshot(); journalFd = fs.openSync(journalFile, 'a'); }
    notify(ops.map((o) => o[0]));
  }

  // copia diaria (y al arrancar), se guardan 60 días; opcionalmente también en otra carpeta (USB, nube…)
  function backup() {
    const name = 'db-' + today() + '.json';
    const dest = path.join(dataDir, 'backups', name);
    try {
      fs.writeFileSync(dest, JSON.stringify(db));
      if (opts.backupDir) { fs.mkdirSync(opts.backupDir, { recursive: true }); fs.copyFileSync(dest, path.join(opts.backupDir, name)); }
      const files = fs.readdirSync(path.join(dataDir, 'backups')).filter((f) => /^db-\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
      files.slice(0, Math.max(0, files.length - 60)).forEach((f) => fs.unlinkSync(path.join(dataDir, 'backups', f)));
    } catch (e) { log('Copia de seguridad: ' + e.message); }
  }
  backup();
  const backupTimer = setInterval(backup, 60 * 60 * 1000);   // cada hora se actualiza la del día

  // ------------------------------------------------------------ reglas (las mismas que en Firebase)
  function canRead(ps, authed) {
    if (authed) return true;
    const a = ps[0];
    if (a === 'menu' || a === 'mods' || a === 'public') return true;
    if (a === 'orders' && ps.length >= 2) return true;
    if (a === 'buffet' && (ps[1] === 'public' || ps[1] === 'orders')) return true;
    return false;
  }
  // escritura sin clave: solo un pedido nuevo de cliente
  function canWrite(method, ps, body, authed) {
    if (authed) return true;
    if (method !== 'PUT' || !body || typeof body !== 'object') return false;
    if (ps[0] === 'orders' && ps.length === 2) {
      return getAt(db, ps) == null && body.status === 'new' && ['id', 'table', 'type', 'status', 'createdAt'].every((k) => body[k] != null);
    }
    if (ps[0] === 'buffet' && ps[1] === 'orders' && ps.length === 3) {
      const sid = getAt(db, ['buffet', 'public', 'sessions', String(body.table), 'id']);
      return getAt(db, ps) == null && body.status === 'new' && sid != null && sid === body.sid &&
        ['id', 'table', 'sid', 'round', 'items', 'status', 'createdAt'].every((k) => body[k] != null);
    }
    return false;
  }

  // ------------------------------------------------------------ tiempo real (EventSource)
  const streams = new Set();
  // s.sub: en la conexión compartida (/__platet/stream) cada ruta suscrita lleva su nombre
  function send(res, event, data, sub) {
    if (sub != null) data.sub = sub;
    res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }
  function notify(changed) {
    streams.forEach((s) => {
      if (changed.some((w) => startsWith(s.ps, w))) return send(s.res, 'put', { path: '/', data: getAt(db, s.ps) }, s.sub);
      const data = {};
      let any = false;
      changed.forEach((w) => { if (startsWith(w, s.ps)) { data[w.slice(s.ps.length).join('/')] = getAt(db, w); any = true; } });
      if (any) send(s.res, 'patch', { path: '/', data: data }, s.sub);
    });
  }
  // Una sola conexión para todas las rutas (el navegador solo abre 6 a la vez con el mismo servidor)
  function multiStream(req, res, url) {
    const authed = url.searchParams.get('auth') === key;
    const subs = url.searchParams.getAll('p');
    if (!subs.length || subs.some((p) => !canRead(parts(p), authed))) return json(res, 401, { error: 'Permission denied' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    const mine = subs.map((p) => ({ ps: parts(p), res: res, sub: p }));
    mine.forEach((s) => { streams.add(s); send(res, 'put', { path: '/', data: getAt(db, s.ps) }, s.sub); });
    req.on('close', () => mine.forEach((s) => streams.delete(s)));
  }
  const keepAlive = setInterval(() => new Set(Array.from(streams).map((s) => s.res)).forEach((r) => r.write('event: keep-alive\ndata: null\n\n')), 25000);

  // ------------------------------------------------------------ HTTP
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 25 * 1024 * 1024) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  function json(res, code, v) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(v === undefined ? null : v));
  }

  async function handleDb(req, res, url, ps) {
    const authed = url.searchParams.get('auth') === key;
    const method = req.method;
    if (method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (method === 'GET') {
      if (!canRead(ps, authed)) return json(res, 401, { error: 'Permission denied' });
      if (/text\/event-stream/.test(req.headers.accept || '')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        const s = { ps: ps, res: res };
        streams.add(s);
        send(res, 'put', { path: '/', data: getAt(db, ps) });
        req.on('close', () => streams.delete(s));
        return;
      }
      return json(res, 200, getAt(db, ps));
    }
    let body = null;
    if (method === 'PUT' || method === 'PATCH') {
      try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, { error: 'Invalid data' }); }
    }
    if (!canWrite(method, ps, body, authed)) return json(res, 401, { error: 'Permission denied' });
    if (method === 'PUT') { commit([[ps, body]]); return json(res, 200, body); }
    if (method === 'DELETE') { commit([[ps, null]]); return json(res, 200, null); }
    if (method === 'PATCH') {
      if (!body || typeof body !== 'object') return json(res, 400, { error: 'Invalid data' });
      commit(Object.keys(body).map((k) => [ps.concat(parts(k)), body[k]]));
      return json(res, 200, body);
    }
    return json(res, 405, { error: 'Method not allowed' });
  }

  function serveFile(req, res, url) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/') { res.writeHead(302, { Location: '/pos.html' }); return res.end(); }
    // configuración: la base de datos es este mismo servidor
    if (p === '/config.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      return res.end("window.PLATET_CONFIG = { firebaseUrl: location.origin, rootPath: '" + root + "', desktop: true };\n");
    }
    const file = path.normalize(path.join(appDir, p));
    if (!file.startsWith(path.normalize(appDir + path.sep))) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
    const prefix = '/' + root;
    if (url.pathname.endsWith('.json') && (url.pathname === prefix + '.json' || url.pathname.startsWith(prefix + '/'))) {
      const rest = url.pathname.slice(prefix.length, -'.json'.length);
      let ps;
      try { ps = parts(rest).map(decodeURIComponent); } catch (e) { return json(res, 400, { error: 'Bad path' }); }
      return handleDb(req, res, url, ps).catch((e) => { log('Error: ' + e.message); json(res, 500, { error: e.message }); });
    }
    if (url.pathname === '/__platet/stream') return multiStream(req, res, url);
    if (url.pathname === '/__platet/info') {
      // solo desde el propio ordenador: lleva la clave
      const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
      return json(res, local ? 200 : 403, local ? { port: port, key: key, ips: lanAddresses(), dataDir: dataDir } : { error: 'local only' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveFile(req, res, url);
  });

  return {
    get port() { return port; },
    key: key,
    dataDir: dataDir,
    ips: lanAddresses,
    urls: () => lanAddresses().map((ip) => 'http://' + ip + ':' + port),
    snapshot: () => clone(db),
    backup: backup,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, opts.host || '0.0.0.0', () => { port = server.address().port; log('Servidor en el puerto ' + port); resolve(port); });
      });
    },
    stop() {
      clearInterval(keepAlive); clearInterval(backupTimer);
      streams.forEach((s) => s.res.end());
      try { fs.closeSync(journalFd); writeSnapshot(); } catch (e) { /* ya cerrado */ }
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

module.exports = { createServer, lanAddresses };

// Arrancar a mano (pruebas o un ordenador sin la app): node desktop/server.js [puerto] [carpeta-datos]
if (require.main === module) {
  const appDir = path.resolve(__dirname, '..');
  const s = createServer({ appDir: appDir, dataDir: path.resolve(process.argv[3] || path.join(appDir, 'desktop', 'data')), port: Number(process.argv[2]) || 8077, log: console.log });
  s.start().then((p) => {
    console.log('TPV:      http://localhost:' + p + '/pos.html#k=' + s.key);
    s.urls().forEach((u) => console.log('Móviles:  ' + u + '/pos.html#k=' + s.key));
  });
  const bye = () => s.stop().then(() => process.exit(0));
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
