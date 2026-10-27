// Propone la tabla de tramos de una ruta a partir de los documentos de LTV
// (traducción de cruce/proponer_tramos.py).
//
// La hoja no dice por qué línea va cada parte del recorrido. Las LTV sí: cada restricción está
// bajo su «LÍNEA nnn» y nombra las dependencias de su trayecto. La propuesta parte la ruta donde
// la hoja reinicia el PK y, para cada parte, busca la línea cuyas LTV nombran más dependencias de
// esa parte y tienen PK dentro de su rango. Es una propuesta: queda con `verificado: false`
// hasta que el maquinista la confirme.

import { lineaNormalizada, mismaDependencia } from "./nombres.js";
import { fmtG, strFloat } from "../pdf/py.js";

function partes(ruta) {
  const cortes = new Set([0, ...ruta.puntos.flatMap((p, i) => (p.tipo === "cambio_linea" ? [i] : [])), ruta.puntos.length - 1]);
  const orden = [...cortes].sort((a, b) => a - b);
  return orden.slice(0, -1).map((a, k) => [a, orden[k + 1]]);
}

const cmpTexto = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** @returns {[{ruta, tramos}, string[]]} tabla propuesta e informe */
export function proponer(ruta, docs) {
  const nombres = new Map(), pks = new Map(), cabeceras = new Map();
  for (const d of docs)
    for (const r of d.registros) {
      const linea = lineaNormalizada(r.linea);
      if (linea === null) continue;
      if (!nombres.has(linea)) {
        nombres.set(linea, new Set());
        pks.set(linea, []);
      }
      r.trayecto.forEach((t) => nombres.get(linea).add(t));
      pks.get(linea).push(...[r.pk_ini, r.pk_fin].filter((v) => v !== null));
      if (r.linea_texto) cabeceras.set(linea, r.linea_texto);
    }
  const informe = [], tramos = [];
  for (const [a, b] of partes(ruta)) {
    const puntos = ruta.puntos.slice(a, b + 1);
    const conNombre = puntos.filter((p) => p.nombre).map((p) => p.nombre);
    const pkIni = puntos[0].pk;
    const ult = puntos.at(-1);
    const pkFin = ult.tipo === "cambio_linea" ? ult.pk_linea_anterior : ult.pk;
    const [lo, hi] = pkIni !== null && pkFin !== null ? [Math.min(pkIni, pkFin), Math.max(pkIni, pkFin)] : [null, null];
    const punt = [];
    for (const [linea, conocidos] of nombres) {
      const coinciden = [...new Set(conNombre.filter((n) => [...conocidos].some((c) => mismaDependencia(n, c))))].sort(cmpTexto);
      if (!coinciden.length) continue;
      const enRango = lo !== null && pks.get(linea).some((v) => lo <= v && v <= hi);
      punt.push([coinciden.length + (enRango ? 2 : 0), linea, coinciden, enRango]);
    }
    punt.sort((x, y) => y[0] - x[0] || cmpTexto(x[1], y[1]));
    const desde = puntos[0].nombre || `PK ${pkIni === null ? "None" : strFloat(pkIni)}`;
    const hasta = ult.nombre || `PK ${pkFin === null ? "None" : strFloat(pkFin)}`;
    const rango = pkIni !== null && pkFin !== null ? `PK ${fmtG(pkIni)}→${fmtG(pkFin)}` : "PK ?";
    let linea, nota;
    if (punt.length && (punt.length === 1 || punt[0][0] > punt[1][0])) {
      const [, l, coinciden, enRango] = punt[0];
      linea = l;
      nota = `LTV de la línea ${l} (${cabeceras.get(l) ?? ""}) nombran ${coinciden.join(", ")}` + (enRango ? "; sus PK caen en el rango" : "");
    } else {
      linea = "?";
      nota = punt.length
        ? "sin línea clara: " + punt.slice(0, 3).map(([, l, c]) => `${l} (${c.join(", ")})`).join("; ")
        : "ninguna LTV nombra estas dependencias";
    }
    informe.push(`${desde} → ${hasta} (${rango}): línea ${linea} · ${nota}`);
    tramos.push({ desde, hasta, linea, verificado: false, nota });
  }
  return [{ ruta: `${ruta.tren.origen || "?"}–${ruta.tren.destino || "?"}`, tramos }, informe];
}
