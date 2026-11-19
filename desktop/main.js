// App de Windows del TPV Platet.
//
// Arranca el servidor del local (server.js: datos en el disco de este ordenador, y los
// móviles de los camareros se conectan por la WiFi) y abre el TPV a pantalla completa.
// Además: imprime sin diálogo, manda ESC/POS directo a la impresora de tickets (cajón),
// arranca con Windows y se actualiza sola desde GitHub.
'use strict';

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { createServer } = require('./server');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* sin actualizaciones (desarrollo) */ }

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const userDir = app.getPath('userData');
const cfgFile = path.join(userDir, 'desktop.json');
const logFile = path.join(userDir, 'platet.log');
function log(msg) {
  try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n'); } catch (e) { /* sin log */ }
}
function readCfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (e) { /* primera vez */ }
  return Object.assign({
    port: 8077,
    autostart: true,
    fullscreen: false,
    backupDir: path.join(app.getPath('documents'), 'Platet-copias')
  }, c);
}
function saveCfg() { try { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)); } catch (e) { log('cfg: ' + e.message); } }

let cfg = readCfg();
let srv = null, win = null, tray = null, quitting = false;
const ICON = path.join(__dirname, 'app', 'icon.png');

function appURL(page) { return 'http://127.0.0.1:' + srv.port + '/' + (page || 'pos.html'); }
function isOurs(url) { try { const u = new URL(url); return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && Number(u.port) === srv.port; } catch (e) { return false; } }

function webPrefs() { return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }; }

function createWindow() {
  win = new BrowserWindow({ width: 1366, height: 820, show: false, autoHideMenuBar: true, title: 'Platet TPV', icon: ICON, backgroundColor: '#eef1f5', webPreferences: webPrefs() });
  win.maximize();
  if (cfg.fullscreen) win.setFullScreen(true);
  win.loadURL(appURL('pos.html#k=' + srv.key));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON, webPreferences: webPrefs() } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!isOurs(url)) { e.preventDefault(); shell.openExternal(url); } });
  // cerrar sin querer deja a los camareros sin conexión: se pregunta
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['关闭 / Cerrar', '取消 / Cancelar'], defaultId: 1, cancelId: 1, title: 'Platet TPV',
      message: '确定要关闭收银吗？\n¿Cerrar el TPV?',
      detail: '关闭后，服务员的手机也连不上收银电脑。\nSi se cierra, los móviles de los camareros se desconectan.'
    });
    if (r === 0) { quitting = true; app.quit(); }
  });
  win.on('closed', () => { win = null; });
}

function show(page) {
  if (!win) createWindow();
  if (page) win.loadURL(appURL(page));
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

// Ventana con el código QR para emparejar los móviles de los camareros
let pairWin = null;
function showPair() {
  if (pairWin) { pairWin.focus(); return; }
  pairWin = new BrowserWindow({ width: 760, height: 820, autoHideMenuBar: true, title: 'Conectar móviles · 连接手机', icon: ICON, parent: win || undefined, webPreferences: webPrefs() });
  pairWin.loadURL(appURL('__platet/pair'));
  pairWin.on('closed', () => { pairWin = null; });
}

// ------------------------------------------------------------ impresión
function printers(wc) {
  return wc.getPrintersAsync().then((l) => l.map((p) => ({ name: p.name, isDefault: !!p.isDefault, status: p.status })));
}
// ESC/POS directo a una impresora de Windows (spooler en modo RAW)
const PS1 = `param([string]$printer, [string]$file, [string]$dll)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $dll)) {
$src = @"
using System; using System.Runtime.InteropServices;
public class PlatetRaw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static int Send(string printer, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    try {
      var di = new DOCINFO(); di.pDocName = "Platet TPV"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) return Marshal.GetLastWin32Error();
      StartPagePrinter(h); int w; bool ok = WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
      return ok ? 0 : Marshal.GetLastWin32Error();
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $src -OutputAssembly $dll
}
Add-Type -Path $dll
$r = [PlatetRaw]::Send($printer, [IO.File]::ReadAllBytes($file))
if ($r -ne 0) { [Console]::Error.WriteLine("Windows error $r"); exit 1 }
`;
function rawPrint(printer, bytes) {
  if (process.platform !== 'win32') return Promise.reject(new Error('solo-windows'));
  const dir = path.join(userDir, 'print');
  fs.mkdirSync(dir, { recursive: true });
  const ps1 = path.join(dir, 'raw-print.ps1');
  if (!fs.existsSync(ps1) || fs.readFileSync(ps1, 'utf8') !== PS1) fs.writeFileSync(ps1, PS1);
  const file = path.join(dir, 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.bin');
  fs.writeFileSync(file, Buffer.from(bytes));
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-printer', printer, '-file', file, '-dll', path.join(dir, 'PlatetRaw.dll')],
      { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
        fs.unlink(file, () => {});
        if (err) { log('raw ' + printer + ': ' + (stderr || err.message)); return reject(new Error(String(stderr || err.message).trim().split('\n')[0])); }
        resolve(true);
      });
  });
}

ipcMain.handle('printers', (e) => printers(e.sender));
ipcMain.handle('print-page', (e, o) => new Promise((resolve, reject) => {
  const opt = { silent: true, printBackground: true, margins: { marginType: 'none' } };
  if (o && o.printer) opt.deviceName = o.printer;
  e.sender.print(opt, (ok, why) => (ok ? resolve(true) : reject(new Error(why || 'print'))));
}));
ipcMain.handle('raw', (e, printer, bytes) => rawPrint(String(printer || ''), bytes || []));
ipcMain.handle('show-pair', () => { showPair(); return true; });
ipcMain.handle('info', () => ({ version: app.getVersion(), port: srv.port, urls: srv.urls(), dataDir: srv.dataDir, backupDir: cfg.backupDir }));

// ------------------------------------------------------------ actualizaciones
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => log('update: ' + (e && e.message)));
  autoUpdater.on('update-downloaded', (info) => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'info', buttons: ['现在更新 / Actualizar ahora', '稍后 / Más tarde'], defaultId: 1, cancelId: 1, title: 'Platet TPV',
      message: '新版本 ' + info.version + ' 已下载好。\nNueva versión ' + info.version + ' lista.',
      detail: '现在更新：收银会关闭几秒钟再自动打开。选「稍后」就在下次关闭软件时自动更新。\nAhora: el TPV se cierra unos segundos y se vuelve a abrir. «Más tarde»: se instala al cerrar el programa.'
    });
    if (r === 0) { quitting = true; autoUpdater.quitAndInstall(true, true); }
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => log('update: ' + e.message));
  setTimeout(check, 15000);
  setInterval(check, 4 * 60 * 60 * 1000);
}
function checkNow() {
  if (!autoUpdater || !app.isPackaged) return dialog.showMessageBox({ message: 'Versión ' + app.getVersion() });
  autoUpdater.checkForUpdates().then((r) => {
    const v = r && r.updateInfo && r.updateInfo.version;
    if (!v || v === app.getVersion()) dialog.showMessageBox({ message: '已经是最新版本 ' + app.getVersion() + '\nYa tienes la última versión.' });
  }).catch((e) => dialog.showMessageBox({ type: 'warning', message: '检查更新失败 / No se pudo comprobar\n' + e.message }));
}

// ------------------------------------------------------------ menú (bandeja y Alt)
function menuTemplate() {
  return [
    { label: '🧾 收银 TPV', click: () => show('pos.html') },
    { label: '⚙️ 后台 Gestión', click: () => show('admin.html') },
    { label: '📱 连接服务员手机 · Conectar móviles', click: showPair },
    { type: 'separator' },
    { label: '🖥️ 全屏 · Pantalla completa', type: 'checkbox', checked: !!cfg.fullscreen, click: (i) => { cfg.fullscreen = i.checked; saveCfg(); if (win) win.setFullScreen(i.checked); } },
    { label: '🚀 开机自动启动 · Arrancar con Windows', type: 'checkbox', checked: !!cfg.autostart, click: (i) => { cfg.autostart = i.checked; saveCfg(); app.setLoginItemSettings({ openAtLogin: i.checked }); } },
    { type: 'separator' },
    { label: '💾 立即备份 · Copia ahora', click: () => { srv.backup(); shell.openPath(cfg.backupDir); } },
    { label: '📂 数据文件夹 · Carpeta de datos', click: () => shell.openPath(srv.dataDir) },
    { label: '🔄 检查更新 · Buscar actualización (v' + app.getVersion() + ')', click: checkNow },
    { label: '🛠️ 开发者工具 · Herramientas', click: () => win && win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: '⏻ 退出 · Salir', click: () => { if (win) win.close(); else { quitting = true; app.quit(); } } }
  ];
}

app.on('second-instance', () => show());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
app.on('will-quit', (e) => {
  if (!srv) return;
  e.preventDefault();
  const s = srv; srv = null;
  s.stop().finally(() => app.exit(0));
});

app.whenReady().then(async () => {
  srv = createServer({ appDir: path.join(__dirname, 'app'), dataDir: path.join(userDir, 'data'), port: cfg.port, backupDir: cfg.backupDir, log: log });
  try {
    await srv.start();
  } catch (e) {
    dialog.showErrorBox('Platet TPV', '端口 ' + cfg.port + ' 被占用，可能另一个收银程序已经打开。\nEl puerto ' + cfg.port + ' está ocupado: ¿hay otro TPV abierto?\n\n' + e.message);
    quitting = true; app.quit(); return;
  }
  log('Inicio v' + app.getVersion() + ' · puerto ' + srv.port + ' · ' + srv.urls().join(' '));
  app.setLoginItemSettings({ openAtLogin: !!cfg.autostart });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Platet', submenu: menuTemplate() }]));
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip('Platet TPV · ' + srv.urls().map((u) => u.replace('http://', '')).join(' '));
    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
    tray.on('click', () => show());
  } catch (e) { log('tray: ' + e.message); }
  createWindow();
  setupUpdates();
});
