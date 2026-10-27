// Grabar recorrido: guarda cada lectura de posición del iPad con su precisión y la posición
// que tenía la app en ese momento, para medir en un viaje real si la posición Wi-Fi basta.
// Se exporta en GPX (para verlo en un mapa) y en JSON (para analizarlo).

import { escuchar } from "./ubicacion.js";
import { recorridos } from "../almacen.js";

let actual = null, quitar = null, alCambiar = () => {};
const r6 = (v) => Math.round(v * 1e6) / 1e6;

export const enCurso = () => actual;

/** @param meta {ruta, tren, posicion: () => km, modo: () => texto} */
export function empezar(meta, cb = () => {}) {
  if (actual) return actual;
  alCambiar = cb;
  actual = { id: new Date().toISOString(), ruta: meta.ruta, tren: meta.tren, puntos: [], errores: 0 };
  quitar = escuchar((p, e) => {
    if (!p) {
      actual.errores++;
      alCambiar(actual, e);
      return;
    }
    const d = meta.posicion();
    actual.puntos.push([p.t, r6(p.lat), r6(p.lon), Math.round(p.precision), p.velocidad, p.rumbo, d == null ? null : Math.round(d * 1000) / 1000, meta.modo()]);
    if (actual.puntos.length % 10 === 1) recorridos.guardar(actual);
    alCambiar(actual, null);
  });
  recorridos.guardar(actual);
  return actual;
}

export async function terminar() {
  if (!actual) return null;
  quitar?.();
  quitar = null;
  const r = actual;
  actual = null;
  await recorridos.guardar(r);
  return r;
}

const fechaHora = (t) => new Date(t).toISOString();

export function gpx(r) {
  const pts = r.puntos
    .map(([t, lat, lon, prec, v]) => `<trkpt lat="${lat}" lon="${lon}"><time>${fechaHora(t)}</time><hdop>${(prec / 5).toFixed(1)}</hdop>${v != null ? `<extensions><speed>${v}</speed></extensions>` : ""}</trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RailNav" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>RailNav ${r.tren ?? ""} ${r.id}</name><trkseg>
${pts}
</trkseg></trk></gpx>
`;
}

export const json = (r) =>
  JSON.stringify({ ...r, columnas: ["t_ms", "lat", "lon", "precision_m", "velocidad_ms", "rumbo", "pk_acum_app", "modo"] });

/** Resumen: puntos, duración, precisión mediana y peor. */
export function resumen(r) {
  const p = r.puntos.map((x) => x[3]).sort((a, b) => a - b);
  return {
    puntos: r.puntos.length,
    minutos: r.puntos.length > 1 ? (r.puntos.at(-1)[0] - r.puntos[0][0]) / 60000 : 0,
    mediana: p.length ? p[Math.floor(p.length / 2)] : null,
    peor: p.length ? p.at(-1) : null,
  };
}
