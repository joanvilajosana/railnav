// Service worker: guarda la app en el dispositivo para que funcione sin conexión (túneles,
// zonas sin cobertura). Las rutas no pasan por aquí: están en IndexedDB.
// Al publicar una versión nueva hay que cambiar VERSION (y la de js/version.js).

const VERSION = "0.9.1";
const CACHE = "railnav-" + VERSION;
const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/main.js",
  "js/version.js",
  "js/util.js",
  "js/ruta.js",
  "js/posicion.js",
  "js/almacen.js",
  "js/pictos.js",
  "js/marcha.js",
  "js/datos.js",
  "js/editor.js",
  "js/iconos.js",
  "js/avisos.js",
  "js/despierto.js",
  "js/compartir.js",
  "js/geo/osm.js",
  "js/geo/trazado.js",
  "js/geo/firma.js",
  "js/geo/preparar.js",
  "js/geo/seguimiento.js",
  "js/geo/ubicacion.js",
  "js/geo/grabar.js",
  "js/geo/simulado.js",
  "media/despierto.mp4",
  "js/sonido.js",
  "js/generador.js",
  "js/pdf/geometria.js",
  "js/pdf/py.js",
  "js/pdf/hoja.js",
  "js/pdf/tablas.js",
  "js/pdf/ltv.js",
  "js/cruce/nombres.js",
  "js/cruce/vias.js",
  "js/cruce/lineas.js",
  "js/cruce/cruce.js",
  "js/cruce/eventos.js",
  "js/cruce/paquete.js",
  "js/cruce/proponer.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "datos/pictogramas.json",
  "datos/demo.railnav.json",
  "datos/tramos.json",
  "datos/estaciones.json",
  "datos/trazados.json",
  "datos/pruebas/indice.json",
  "datos/pruebas/reus-tarragona.railnav.json",
  "datos/pruebas/tarragona-reus.railnav.json",
  "datos/pruebas/tarragona-barcelona-sants.railnav.json",
  "datos/pruebas/barcelona-sants-tarragona.railnav.json",
  "datos/pruebas/reus-lleida-pirineus.railnav.json",
  "datos/pruebas/lleida-pirineus-reus.railnav.json",
  "datos/pruebas/reus-mora-la-nova.railnav.json",
  "datos/pruebas/mora-la-nova-reus.railnav.json",
  "datos/pruebas/tarragona-tortosa.railnav.json",
  "datos/pruebas/tortosa-tarragona.railnav.json",
  "img/logo_horizontal_dia.png",
  "img/logo_horizontal_noche.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("railnav-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero lo guardado (funciona sin red); si no está, la red.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
