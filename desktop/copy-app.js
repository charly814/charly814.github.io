// Copia el TPV (las páginas de la web) a desktop/app antes de empaquetar la app de Windows.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'app');
const FILES = ['pos.html', 'admin.html', 'pedir.html', 'qr.html', 'index.html', 'buffet.html', 'buffet-mesa.html', 'cocina.html',
  'demo-hamburguesa.html', 'manifest.webmanifest', 'icon.svg', 'sw.js', 'TPV-LEEME.md'];
const DIRS = ['css', 'js'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((e) => {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
FILES.forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)));
DIRS.forEach((d) => copyDir(path.join(ROOT, d), path.join(OUT, d)));
fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), path.join(OUT, 'icon.png'));
console.log('App copiada en ' + OUT);
