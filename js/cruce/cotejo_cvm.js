// Cotejo hoja de ruta ↔ CVM (C2; traducción de cruce/cotejo_cvm.py). Sin DOM.
//
// Tramo a tramo, ¿coincide la V Max de la hoja con la del CVM? Emparejamiento por línea (tabla
// de tramos), PK y nombre, nunca por proximidad; las filas emparejadas van en orden y seguidas.
// Columna: la letra del tipo del tren («160A» → A); sin letra, siempre N (RCF). El número es el
// tope del tren. Donde no coinciden rige la más restrictiva; lo que no se puede cotejar vale
// como dice la hoja.

import { segmentos } from "./lineas.js";
import { lineaNormalizada, mismaDependencia, palabras } from "./nombres.js";

const COLUMNAS = ["n", "a", "b"];
const RE_TIPO = /^\s*(\d{2,3})?\s*([NAB])?\s*$/i;

/** [columna, tope] del tipo de la hoja: «160A» → ["a", 160]; «100» → ["n", 100]. */
export function tipoTren(tipo) {
  const m = RE_TIPO.exec(tipo || "");
  if (!m) return ["n", null];
  return [m[2] ? m[2].toLowerCase() : "n", m[1] ? Number(m[1]) : null];
}

const subsecuencia = (corta, larga) => {
  let j = 0;
  for (const ch of corta) {
    j = larga.indexOf(ch, j);
    if (j < 0) return false;
    j++;
  }
  return true;
};

/** Misma dependencia, o abreviatura palabra a palabra («S.CRISTOBAL INDT» = «SAN CRISTOBAL INDUSTRIAL»). */
export function mismoNombre(a, b) {
  if (mismaDependencia(a, b)) return true;
  const pa = palabras(a), pb = palabras(b);
  if (!pa.length || pa.length !== pb.length) return false;
  for (let k = 0; k < pa.length; k++) {
    const [corta, larga] = pa[k].length <= pb[k].length ? [pa[k], pb[k]] : [pb[k], pa[k]];
    if (larga.startsWith(corta)) continue;
    if (corta.length < 3 || corta[0] !== larga[0] || !subsecuencia(corta, larga)) return false;
  }
  return true;
}

function pkEnSegmento(ruta, seg, i) {
  const p = ruta.puntos[i];
  if (i === seg.iFin && i !== seg.iIni && p.pk_linea_anterior !== null && p.pk_linea_anterior !== undefined) return p.pk_linea_anterior;
  return p.pk;
}

function salida(ln, k) {
  const f = ln.filas[k];
  return f.km_salida !== null && f.km_salida !== undefined ? f.km_salida : f.km;
}

/** true: misma fila; false: mismo PK y otro nombre; null: otro PK. */
function casa(ruta, i, pk, ln, k) {
  const f = ln.filas[k];
  if (pk !== f.km && pk !== (f.km_salida ?? undefined)) return null;
  const nombre = ruta.puntos[i].nombre;
  return !(nombre && f.dependencia && !mismoNombre(nombre, f.dependencia));
}

function cadena(ruta, seg, ln, i0, k0) {
  const filas = new Map([[i0, k0]]);
  let k = k0, p = salida(ln, k0);
  for (let i = i0 + 1; i <= seg.iFin; i++) {
    const q = pkEnSegmento(ruta, seg, i);
    if (q === null || q === undefined || p === null || p === undefined) continue;
    const lo = Math.min(p, q), hi = Math.max(p, q);
    for (let kk = k + 1; kk < ln.filas.length; kk++) {
      const c = casa(ruta, i, q, ln, kk);
      if (c) {
        filas.set(i, kk);
        k = kk;
        p = salida(ln, kk);
        break;
      }
      if (c === false) continue;
      const km = ln.filas[kk].km;
      if (km !== null && km !== undefined && !(lo - 1e-9 <= km && km <= hi + 1e-9)) break;
    }
  }
  return filas;
}

function emparejar(ruta, seg, ln) {
  let mejor = new Map(), clave = null;
  for (let i = seg.iIni; i <= seg.iFin; i++) {
    const pk = pkEnSegmento(ruta, seg, i);
    if (pk === null || pk === undefined) continue;
    for (let k = 0; k < ln.filas.length; k++) {
      if (!casa(ruta, i, pk, ln, k)) continue;
      const filas = cadena(ruta, seg, ln, i, k);
      const c = [filas.size, -i, -(Math.max(...filas.values()) - k)];
      const mayor = !clave || c[0] > clave[0] || (c[0] === clave[0] && (c[1] > clave[1] || (c[1] === clave[1] && c[2] > clave[2])));
      if (mayor) [mejor, clave] = [filas, c];
    }
  }
  return mejor;
}

const celda = (col, k) => col.find((t) => t.desde <= k && t.hasta >= k + 1) ?? null;

function comparar(ruta, sc, i0, i1, columna, tope) {
  const ln = sc.cvm, seg = sc.segmento;
  const a = pkEnSegmento(ruta, seg, i0), b = pkEnSegmento(ruta, seg, i1);
  const c = { iIni: i0, iFin: i1, pkIni: a, pkFin: b, hoja: ruta.puntos[i1].vmax ?? null, partes: [], esperadas: [], resultado: "SIN_COTEJO" };
  if (c.hoja === null || a === null || a === undefined || b === null || b === undefined || a === b) return c;
  const antes = [], despues = [];
  for (let i = seg.iIni; i <= i0; i++) if (sc.filas.has(i)) antes.push(sc.filas.get(i));
  for (let i = i1; i <= seg.iFin; i++) if (sc.filas.has(i)) despues.push(sc.filas.get(i));
  if (!antes.length || !despues.length) return c;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (let k = antes.at(-1); k < despues[0]; k++) {
    const x = salida(ln, k), y = ln.filas[k + 1].km;
    if (x === null || x === undefined || y === null || y === undefined) continue;
    if (Math.min(hi, Math.max(x, y)) - Math.max(lo, Math.min(x, y)) > 1e-6) {
      const celdas = Object.fromEntries(COLUMNAS.map((col) => [col, celda(ln["v" + col] || [], k)]));
      c.partes.push({ fila: k, pkIni: x, pkFin: y, celdas });
    }
  }
  if (!c.partes.length) return c;
  const vs = [];
  for (const p of c.partes) {
    const t = p.celdas[columna];
    if (!t || t.valor === null || t.valor === undefined) return c;
    vs.push(tope ? Math.min(t.valor, tope) : t.valor);
  }
  c.esperadas = vs;
  if (vs.every((v) => v === c.hoja)) c.resultado = "COINCIDE";
  else if (vs.some((v) => v < c.hoja)) c.resultado = "HOJA_MAYOR";
  else c.resultado = "HOJA_MENOR";
  return c;
}

/**
 * Cotejo de la ruta con los CVM. `cvms`: [{doc, archivo}] en orden de preferencia; `doc` es un
 * cvm.json (o su versión reducida, ver `reducirCvm`).
 */
export function cotejar(ruta, tramos, cvms) {
  const [columna, tope] = tipoTren(ruta.tren.tipo);
  const [segs] = segmentos(ruta, tramos);
  const numero = String(ruta.tren.numero || "").replace(/\D/g, "");
  const paridad = numero ? (Number(numero.at(-1)) % 2 === 0 ? "par" : "impar") : null;
  const res = [];
  for (const seg of segs) {
    const sc = { segmento: seg, linea: seg.linea, sentido: null, cvm: null, archivo: null, filas: new Map(), puntos: seg.iFin - seg.iIni + 1, comparaciones: [], motivo: "" };
    res.push(sc);
    if (sc.linea === null) {
      sc.motivo = "tramo sin línea en la tabla de tramos";
      continue;
    }
    let mejor = null;
    for (const { doc, archivo } of cvms)
      for (const ln of doc.lineas) {
        if (lineaNormalizada(ln.linea) !== sc.linea) continue;
        const filas = emparejar(ruta, seg, ln);
        const cand = { n: filas.size, par: ln.sentido === paridad, ln, archivo, filas };
        if (!mejor || cand.n > mejor.n || (cand.n === mejor.n && cand.par && !mejor.par)) mejor = cand;
      }
    if (!mejor) {
      sc.motivo = `la línea ${sc.linea} no está en los CVM dados`;
      continue;
    }
    if (mejor.n < 2) {
      sc.motivo = `la línea ${sc.linea} del CVM no comparte dos filas con la hoja`;
      continue;
    }
    Object.assign(sc, { cvm: mejor.ln, archivo: mejor.archivo, sentido: mejor.ln.sentido, filas: mejor.filas });
    for (let i0 = seg.iIni; i0 < seg.iFin; i0++) sc.comparaciones.push(comparar(ruta, sc, i0, i0 + 1, columna, tope));
  }
  return { columna, tope, segmentos: res };
}

const aRevisar = (c) => c.resultado === "HOJA_MAYOR" || c.resultado === "HOJA_MENOR";

/** Tramos donde la hoja y el CVM no coinciden, en pk_acum (como `tramos_marcha` de Python). */
export function tramosMarcha(cot) {
  const res = [];
  for (const sc of cot.segmentos) {
    const seg = sc.segmento;
    for (const c of sc.comparaciones) {
      if (!aRevisar(c)) continue;
      const lo = Math.min(c.pkIni, c.pkFin), hi = Math.max(c.pkIni, c.pkFin);
      c.partes.forEach((p, n) => {
        const esperada = c.esperadas[n];
        if (esperada === c.hoja) return;
        let a = Math.max(lo, Math.min(p.pkIni, p.pkFin)), b = Math.min(hi, Math.max(p.pkIni, p.pkFin));
        if (c.pkIni > c.pkFin) [a, b] = [b, a];
        let ai = seg.acum(a), bi = seg.acum(b);
        if (ai === null || bi === null || ai === bi) return;
        [ai, bi] = [Math.min(ai, bi), Math.max(ai, bi)];
        const mayor = esperada < c.hoja;
        const cel = p.celdas[cot.columna];
        const tr = {
          ini: ai, fin: bi, resultado: mayor ? "HOJA_MAYOR" : "HOJA_MENOR", v: mayor ? esperada : null,
          hoja: c.hoja, cvm: esperada, linea: sc.linea, sentido: sc.sentido, pkIni: a, pkFin: b,
          pagina: cel ? cel.origen.pagina : null, archivo: sc.archivo,
        };
        const t = res.at(-1);
        if (t && t.fin === tr.ini && t.resultado === tr.resultado && t.cvm === tr.cvm && t.linea === tr.linea) {
          t.fin = tr.fin;
          t.pkFin = tr.pkFin;
        } else res.push(tr);
      });
    }
  }
  return res;
}

/** Lo que la app guarda de un cvm.json: solo lo que usa el cotejo (es mucho más pequeño). */
export function reducirCvm(doc) {
  const celdas = (ts) => (ts || []).map((t) => ({ desde: t.desde, hasta: t.hasta, valor: t.valor ?? null, origen: { pagina: t.origen.pagina } }));
  return {
    formato: doc.formato,
    archivo: doc.fuente?.archivo ?? null,
    titulo: doc.titulo ?? null,
    anejo: doc.anejo ?? null,
    lineas: doc.lineas.map((ln) => ({
      linea: ln.linea,
      sentido: ln.sentido,
      de: ln.de,
      a: ln.a,
      paginas: ln.paginas,
      filas: ln.filas.map((f) => ({ km: f.km ?? null, km_salida: f.km_salida ?? null, dependencia: f.dependencia ?? null })),
      vn: celdas(ln.vn),
      va: celdas(ln.va),
      vb: celdas(ln.vb),
    })),
  };
}
