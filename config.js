// Configuración de sincronización del TPV y los pedidos QR.
//
// firebaseUrl vacío  -> MODO LOCAL: todo se guarda en este navegador.
//                       Sirve para probar, pero los pedidos QR hechos desde
//                       el móvil de un cliente NO llegarán al TPV.
// firebaseUrl con URL -> MODO NUBE: TPV y móviles comparten los datos en una
//                       Firebase Realtime Database (ver TPV-LEEME.md).
//                       Ej.: 'https://platet-tpv-default-rtdb.europe-west1.firebasedatabase.app'
window.PLATET_CONFIG = {
  firebaseUrl: '',
  rootPath: 'platet'
};
