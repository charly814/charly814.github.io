// Puente entre las páginas del TPV y la app de Windows (impresoras, cajón, emparejar móviles).
// Las páginas lo ven como window.platetDesktop; en el navegador normal no existe.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// «Error invoking remote method 'x': Error: no-printer» -> «no-printer»
function call(name, ...args) {
  return ipcRenderer.invoke(name, ...args).catch((e) => {
    throw new Error(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  });
}

contextBridge.exposeInMainWorld('platetDesktop', {
  printers: () => call('printers'),
  // imprime la página actual (solo se ve #print-area) sin diálogo
  printPage: (o) => call('print-page', o || {}),
  // bytes ESC/POS directos a una impresora de Windows
  raw: (printer, bytes) => call('raw', printer, bytes),
  showPair: () => call('show-pair'),
  info: () => call('info')
});
