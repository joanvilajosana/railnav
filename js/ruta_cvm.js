// Ruta de prueba desde el CVM (sin hoja de ruta). Sin DOM.
//
// Con el CVM que el maquinista ha cargado en el dispositivo se arma una ruta como la que sale de
// una hoja (modelos/ruta.py): las filas del cuadro entre dos dependencias de una línea, en el
// sentido de la marcha, con sus PK, la V Max de la columna del tipo de tren, los CSV, el bloqueo y
// el canal de radio. Luego sigue el camino de siempre (cruce con el DLTV, VME del CVM, paquete).
// Solo para pruebas (Joan, 08-11-2026): no hay horario ni paradas, y la ruta lo dice.
//
// Las celdas del CVM van de una fila a otra; en la hoja, la V Max de una fila rige en el tramo
// que llega a ella. Por eso el punto j toma la velocidad del tramo (j-1, j). Bloqueo y radio,
// en cambio, valen desde su fila: el punto j toma los del tramo (j, j+1).

import { normalizar } from "./pdf/py.js";

const COLUMNA = { n: "vn", a: "va", b: "vb" };
const RE_RADIO = /^\w+$/;
// El CVM pone flechas en el bloqueo («↓ BAB ctc ↓»: sigue en la fila de abajo); la hoja, no.
const bloqueoDe = (t) => (t ? t.replace(/[←↑→↓]/g, " ").replace(/\s+/g, " ").trim() || null : null);

/** La celda de una columna que cubre el trayecto entre las filas a y b (a < b). */
const celda = (ts, a, b) => (ts || []).find((t) => t.desde <= a && t.hasta >= b) ?? null;

/** ¿Trae el CVM guardado lo que hace falta? (los cargados antes de la v0.21.1, no) */
export const cvmCompleto = (doc) => doc.lineas.every((ln) => Array.isArray(ln.radio) && ln.filas.every((f) => "pag" in f));

/** Líneas de los CVM guardados, para elegir: [{clave, archivo, linea, de, a}]. */
export function lineasCvm(cvms) {
  const out = [];
  for (const { doc, archivo } of cvms)
    for (const ln of doc.lineas) {
      if (out.some((x) => x.archivo === archivo && x.linea === ln.linea)) continue;
      const par = doc.lineas.find((l) => l.linea === ln.linea && l.sentido === "par") ?? ln;
      out.push({ clave: `${archivo}|${ln.linea}`, archivo, linea: ln.linea, de: par.de, a: par.a });
    }
  return out.sort((x, y) => (x.linea < y.linea ? -1 : x.linea > y.linea ? 1 : 0));
}

/** Dependencias de una línea con nombre, en el orden del sentido par (para elegir). */
export function dependenciasCvm(doc, linea) {
  const ln = doc.lineas.find((l) => l.linea === linea && l.sentido === "par") ?? doc.lineas.find((l) => l.linea === linea);
  if (!ln) return [];
  const vistos = new Set();
  return ln.filas
    .map((f) => f.dependencia)
    .filter((d) => d && !vistos.has(normalizar(d)) && vistos.add(normalizar(d)));
}

function tipoPunto(nombre) {
  if (!nombre) return "otro";
  if (nombre.includes("(APD)")) return "apeadero";
  if (/^BIF/.test(nombre)) return "bifurcacion";
  return "estacion";
}

/** El tramo del cuadro: el sentido en que `desde` va antes que `hasta`. */
function tramoCvm(doc, linea, desde, hasta) {
  const a = normalizar(desde), b = normalizar(hasta);
  for (const ln of doc.lineas.filter((l) => l.linea === linea)) {
    const i0 = ln.filas.findIndex((f) => normalizar(f.dependencia || "") === a);
    if (i0 < 0) continue;
    const i1 = ln.filas.findIndex((f, i) => i > i0 && normalizar(f.dependencia || "") === b);
    if (i1 > i0) return { ln, i0, i1 };
  }
  return null;
}

/**
 * Ruta de prueba entre dos dependencias de una línea del CVM.
 * @param doc      CVM guardado (versión reducida)
 * @param archivo  su nombre (el PDF)
 * @param opciones {columna: "n"|"a"|"b", tope: velocidad máxima del tren o null, fecha: AAAA-MM-DD}
 * @returns {{ruta, tabla, avisos: string[]}}
 */
export function rutaDesdeCvm(doc, archivo, linea, desde, hasta, { columna = "n", tope = null, fecha = null } = {}) {
  if (!cvmCompleto(doc)) throw new Error("este CVM se cargó con una versión anterior: quítalo y vuelve a cargarlo en Ajustes");
  const t = tramoCvm(doc, linea, desde, hasta);
  if (!t) throw new Error(`en la línea ${linea} no hay un sentido que vaya de ${desde} a ${hasta}`);
  const { ln, i0, i1 } = t;
  const col = ln[COLUMNA[columna]] || [];
  const tipo = `${tope ?? ""}${columna.toUpperCase()}`;
  const conTope = (v) => (v == null ? null : tope ? Math.min(v, tope) : v);
  const pag = (f) => f.pag ?? ln.paginas[0] ?? 1;
  const avisos = [];
  const puntos = [], csv = [];
  let acum = null, pkPrev = null;
  for (let g = i0; g <= i1; g++) {
    const j = g - i0, f = ln.filas[g];
    const ultima = g === i1;
    const cambio = f.km_salida != null && j > 0 && !ultima;
    // PK: en un cambio de kilometración se sigue con el de salida (el doble PK de la hoja).
    const pk = f.km == null ? null : f.km_salida != null && !ultima ? f.km_salida : f.km;
    if (pk != null) {
      acum = acum == null ? 0 : acum + (pkPrev != null ? Math.abs(f.km - pkPrev) : 0);
      pkPrev = pk;
    }
    const vel = j > 0 ? celda(col, g - 1, g) : celda(col, g, g + 1);
    const sig = (ts) => (ultima ? celda(ts, g - 1, g) : celda(ts, g, g + 1));
    const radio = sig(ln.radio)?.texto?.replace(/\s+/g, "") ?? null;
    const nombre = f.dependencia || null;
    puntos.push({
      pk,
      pk_acum: pk == null ? null : Math.round(acum * 1000) / 1000,
      pk_linea_anterior: cambio ? f.km : null,
      linea,
      nombre,
      tipo: cambio ? "cambio_linea" : tipoPunto(nombre),
      hora: null,
      vmax: conTope(vel?.valor ?? null),
      tecn_min: null,
      conc_min: null,
      tc_op: null,
      radio: radio && RE_RADIO.test(radio) ? radio : null,
      bloqueo: bloqueoDe(sig(ln.bloqueo)?.texto),
      notas: [],
      csv: false,
      origen: { archivo, pagina: pag(f), fila: null, bbox: null, texto: `CVM línea ${linea} ${ln.sentido}: ${nombre ?? "PK " + f.km}` },
    });
    // CSV: celda en gris oscuro que empieza en la fila anterior (el cambio está allí).
    if (j > 0 && vel?.csv && vel.desde === g - 1) {
      const antes = j > 1 ? conTope(celda(col, g - 2, g - 1)?.valor ?? null) : null;
      const ahora = conTope(vel.valor ?? null);
      puntos[j].csv = true;
      csv.push({
        punto: j,
        columna: "vmax",
        texto: vel.valor != null ? String(vel.valor) : null,
        cambia_vmax_tren: antes == null || antes !== ahora,
        pk,
        v_anterior: antes,
        v_nueva: ahora,
        origen: { archivo, pagina: vel.origen?.pagina ?? pag(f), fila: null, bbox: null, texto: vel.valor != null ? String(vel.valor) : null },
      });
    }
  }
  if (puntos.some((p, i) => i > 0 && p.vmax == null)) avisos.push(`El CVM no da velocidad para el tipo ${columna.toUpperCase()} en algún tramo.`);
  const ruta = {
    tren: { numero: "PRUEBA", tipo, clase: null, masa_t: null, locomotora: null, origen: desde, destino: hasta, fecha },
    fuente: { archivo, paginas: Math.max(...ln.paginas, 1), sha256: null },
    color_disponible: true,
    puntos,
    csv,
    avisos: [],
  };
  // Tabla de tramos: toda la ruta es de la misma línea; se parte en cada cambio de
  // kilometración con nombre (así cada parte tiene su PK continuo).
  const cortes = [0, ...puntos.flatMap((p, i) => (p.tipo === "cambio_linea" && p.nombre ? [i] : [])), puntos.length - 1];
  const tramos = [];
  for (let k = 0; k + 1 < cortes.length; k++) tramos.push({ desde: puntos[cortes[k]].nombre, hasta: puntos[cortes[k + 1]].nombre, linea, verificado: true, nota: "ruta de prueba desde el CVM" });
  const tabla = { ruta: `${desde}–${hasta}`, tramos };
  return { ruta, tabla, avisos };
}
