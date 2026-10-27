// Preparar el GPS de una ruta: anclas + vías de OpenStreetMap → trazado calibrado que se guarda
// en el paquete (`paquete.geo`). Necesita conexión solo aquí; luego todo funciona sin red.

import { deLista, estaciones, vias } from "./osm.js";
import { anclar, caja, claves, Red, trazar } from "./trazado.js";

export const VERSION_GEO = 1;
// Las vías se piden por trozos de ruta: consultas pequeñas, que los servidores públicos de
// Overpass sí atienden (con trozos de 45 km la zona de Madrid daba error 504).
const TROZO_KM = 15;
const MARGEN_KM = 3;

/** Filas de la hoja del paquete con nombre y pk_acum (el paquete omite los pka = 0). */
export function filasConNombre(paquete) {
  return paquete.hoja
    .map((f, i) => ({ nom: f.nom, pka: f.pka ?? (i === 0 || f.pk != null ? 0 : null) }))
    .filter((f) => f.nom && f.pka != null);
}

/**
 * @param {object} paquete  paquete de ruta
 * @param {(texto) => void} progreso
 * @param {object} [opciones]  {lista}: contenido de datos/estaciones.json (sin él, se buscan
 *                             las estaciones en OpenStreetMap, que es más lento y frágil);
 *                             {vias}: otra fuente de vías (caja) => [...] (en el ordenador, la red
 *                             local de app/tests/red_local.mjs en vez de Overpass)
 * @returns geo para `paquete.geo`
 */
export async function preparar(paquete, progreso = () => {}, { lista = null, vias: fuenteVias = vias } = {}) {
  const filas = filasConNombre(paquete);
  let osm;
  if (lista) osm = deLista(lista);
  else {
    progreso("Buscando las estaciones en OpenStreetMap…");
    osm = await estaciones(claves(filas));
  }
  const anclas = anclar(filas, osm);
  if (anclas.length < 2) throw new Error("no se han encontrado en OpenStreetMap suficientes estaciones de la hoja");
  // Vías por trozos de la ruta
  const trozos = [];
  let ini = 0;
  for (let i = 1; i < anclas.length; i++)
    if (anclas[i].pka - anclas[ini].pka > TROZO_KM || i === anclas.length - 1) {
      trozos.push(anclas.slice(ini, i + 1));
      ini = i;
    }
  const todas = new Map();
  for (const [k, t] of trozos.entries()) {
    progreso(`Descargando las vías (${k + 1} de ${trozos.length})…`);
    for (const w of await fuenteVias(caja(t, MARGEN_KM))) todas.set(w.id, w);
  }
  progreso("Calculando el trazado…");
  await new Promise((r) => setTimeout(r, 0));
  const red = new Red([...todas.values()]);
  const t = trazar(red, anclas);
  if (t.puntos.length < 2) throw new Error("no se ha podido seguir la vía entre las estaciones");
  const r6 = (v) => Math.round(v * 1e6) / 1e6, r4 = (v) => Math.round(v * 1e4) / 1e4;
  return {
    version: VERSION_GEO,
    fuente: "© colaboradores de OpenStreetMap (ODbL)",
    fecha: new Date().toISOString().slice(0, 10),
    puntos: t.puntos.map(([la, lo, p]) => [r6(la), r6(lo), r4(p)]),
    anclas: t.anclas.map((a) => [a.nom, r4(a.pka), r6(a.lat), r6(a.lon), a.osm]),
    dudosos: t.dudosos.map(([a, b, m]) => [r4(a), r4(b), m]),
    estaciones: filas.length,
  };
}
