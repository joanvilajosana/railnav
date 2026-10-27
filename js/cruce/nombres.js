// Comparación de nombres de dependencias entre documentos (traducción de cruce/nombres.py).
//
// La hoja de ruta trunca los nombres a 16 caracteres y abrevia («PINAR DE L ROZAS»); la LTV
// los escribe enteros («PINAR DE LAS ROZAS»). Dos nombres son la misma dependencia si:
// - uno empieza por el otro una vez quitados espacios y signos (mín. 4 letras), o
// - tienen las mismas palabras significativas y cada una empieza por la otra, o
// - las palabras significativas del más corto empiezan, en orden, palabras del más largo.
// Nunca se compara por proximidad de PK.

import { W } from "../pdf/py.js";

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "apd"]);
const SEPARADOR = new RegExp(`(?:(?!${W}).)+`, "su");

export function normalizar(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export const palabras = (texto) =>
  (texto || "")
    .split(SEPARADOR)
    .map(normalizar)
    .filter(Boolean);

const significativas = (t) => palabras(t).filter((p) => !VACIAS.has(p));

export function mismaDependencia(a, b) {
  if (!a || !b) return false;
  const na = normalizar(a), nb = normalizar(b);
  if (na.length >= 4 && nb.length >= 4 && (na.startsWith(nb) || nb.startsWith(na))) return true;
  const pa = significativas(a), pb = significativas(b);
  if (!pa.length || !pb.length) return false;
  if (pa.length === pb.length && pa.every((x, i) => x.startsWith(pb[i]) || pb[i].startsWith(x))) return true;
  const [corta, larga] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (corta.length < 2) return false;
  let i = 0;
  for (const p of larga) if (i < corta.length && (p.startsWith(corta[i]) || corta[i].startsWith(p))) i++;
  return i === corta.length;
}

/** «026» y «26» son la misma línea. */
export function lineaNormalizada(linea) {
  if (linea === null || linea === undefined) return null;
  const t = linea.trim();
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
}
