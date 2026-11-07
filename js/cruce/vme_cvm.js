// VME del CVM en la ruta (C3; traducción de cruce/vme_cvm.py y de la zona de una VME de
// modelos/cvm.py). Sin DOM.
//
// Criterio de Joan (06-11-2026): siempre predomina la más restrictiva; una VME sin vía o de la
// vía del tren (I impar, II par) rige; la de otra vía solo se avisa (al tren le pueden cambiar de
// vía). En vía única (BAU, BLAU) la vía I rige para todos fuera de las estaciones. Las vías de
// estación sin PK rigen en el eje de su estación ± 500 m.

import { tramosMarcha } from "./cotejo_cvm.js";
import { redondear, W } from "../pdf/py.js";

export const MARGEN_ESTACION_KM = 0.5;
export const PREVALECE = ["restrictiva", "hoja", "cvm"];

// Límites de palabra como los de Python (con letras acentuadas).
const re = (patron, flags = "") => new RegExp(patron.replaceAll("\\b", `(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`), "u" + flags);

// --- Dónde rige una VME (modelos/cvm.py) -----------------------------------------------------

const VACIAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "AL", "POR", "PASO", "VIA", "VIAS", "ENTRADA", "ENT", "SALIDA", "EST", "KM", "APD", "CURVA", "DESDE"]);
const NO_ESTACION = re("\\b(AG|AGUJA|BIF|L[IÍ]MITE|CAMB|CAMBIADOR|KM)\\b");

const palabrasVme = (t) =>
  t
    .toUpperCase()
    .replace(/[.,\-()*]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !VACIAS.has(w) && [...w].length > 2 && !/\d/.test(w));

function abrevia(corta, larga) {
  if (larga.startsWith(corta)) return true;
  if ([...corta].length < 3 || corta[0] !== larga[0]) return false;
  let j = 0;
  for (const c of corta) {
    j = larga.indexOf(c, j);
    if (j < 0) return false;
    j += c.length;
  }
  return true;
}

function nombra(texto, dependencia) {
  const dep = palabrasVme(dependencia), pal = palabrasVme(texto);
  if (!dep.length) return false;
  let j = 0;
  for (const w of pal) if (j < dep.length && (abrevia(w, dep[j]) || abrevia(dep[j], w))) j++;
  return j === dep.length;
}

export const esEstacion = (f) => !!f.dependencia && !NO_ESTACION.test(f.dependencia.toUpperCase());

function creciente(filas, i) {
  const f = filas[i];
  const sig = i + 1 < filas.length ? filas[i + 1].km ?? null : null;
  const ant = i > 0 ? filas[i - 1] : null;
  const sal = f.km_salida ?? f.km ?? null;
  if (sig !== null && sal !== null && sig !== sal) return sig > sal;
  if (ant && (ant.km_salida ?? null) === null && (ant.km ?? null) !== null && (f.km ?? null) !== null) return f.km > ant.km;
  return null;
}

/** Fila de la estación de una VME sin PK (como `estacion_vme` de Python), o null. */
export function estacionVme(ln, v) {
  const filas = ln.filas;
  const nombradas = [];
  filas.forEach((f, i) => {
    if (f.dependencia && nombra(v.texto, f.dependencia)) nombradas.push([Math.abs(i - (v.tras_fila + 0.5)), i]);
  });
  if (nombradas.length) {
    nombradas.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const [d, i] = nombradas[0];
    return d <= 3 ? i : null;
  }
  const lados = [];
  for (const [paso, inicio] of [[-1, v.tras_fila], [1, v.tras_fila + 1]]) {
    let i = inicio;
    while (i >= 0 && i < filas.length) {
      const dep = (filas[i].dependencia || "").toUpperCase();
      if (dep.startsWith("KM")) {
        i += paso;
        continue;
      }
      if (esEstacion(filas[i])) lados.push(i);
      break;
    }
  }
  return lados.length === 1 ? lados[0] : null;
}

/** [inicio, fin] de una VME en el sentido de la marcha (como `zona_vme`), o null. */
export function zonaVme(ln, v) {
  if ((v.pk_desde ?? null) !== null) return [v.pk_desde, v.pk_hasta ?? v.pk_desde];
  const fila = (v.fila ?? null) !== null ? v.fila : estacionVme(ln, v);
  if (fila === null) return null;
  const f = ln.filas[fila];
  if ((f.km ?? null) === null) return null;
  const sal = f.km_salida ?? f.km;
  const c = creciente(ln.filas, fila);
  if (c === null) return null;
  const m = c ? MARGEN_ESTACION_KM : -MARGEN_ESTACION_KM;
  return [redondear(f.km - m, 3), redondear(sal + m, 3)];
}

// --- Las VME de la ruta (cruce/vme_cvm.py) ----------------------------------------------------

const RE_VIAS = re("\\bV[IÍ]AS?\\b\\s*(.*)");
const RE_ETIQUETA = /^(?:[IVX]+|\d+[A-Z]?|V\d+|[A-Z]{2}|PAR|IMPAR)$/;
const NO_ETIQUETA = new Set(["DE", "AL", "EN", "KM", "Y", "LA", "EL", "LOS", "LAS"]);
const PARIDAD = { PAR: "II", IMPAR: "I" };
const RE_EST = re("\\b(EST|ESTACION|ESTACIÓN)\\b|\\bAL PASO POR\\b|\\bSALIDA\\b|\\bENTRADA\\b");
const RE_BAU = re("\\bBL?AU\\b");

const quitarPuntos = (w) => w.replace(/^\.+|\.+$/g, "");

/** Vías que nombra el texto de una VME («VIA I, II» → ["I", "II"]); null: todas. */
export function vias(texto) {
  const m = RE_VIAS.exec(texto.toUpperCase());
  if (!m) return null;
  const pal = m[1].split(/[\s,]+/).map(quitarPuntos).filter(Boolean);
  const res = [];
  for (const w of pal) {
    if (w === "Y" && res.length) continue;
    if (NO_ETIQUETA.has(w) || !RE_ETIQUETA.test(w)) break;
    res.push(w);
  }
  return res.length ? res : pal.length ? pal.slice(0, 1) : ["?"];
}

export const viaDelTren = (paridad) => ({ impar: "I", par: "II" })[paridad || ""] ?? null;

function vmaxHoja(ruta, acum) {
  for (const p of ruta.puntos) if (p.pk_acum !== null && p.pk_acum >= acum) return p.vmax;
  return null;
}

function rigeYa(ruta, cvmC2, a, b) {
  const cortes = new Set([a, b]);
  for (const p of ruta.puntos) if (p.pk_acum !== null && a < p.pk_acum && p.pk_acum < b) cortes.add(p.pk_acum);
  for (const t of cvmC2) for (const x of [t.ini, t.fin]) if (a < x && x < b) cortes.add(x);
  const cs = [...cortes].sort((x, y) => x - y);
  const medios = [];
  for (let k = 0; k + 1 < cs.length; k++) medios.push((cs[k] + cs[k + 1]) / 2);
  if (!medios.length) medios.push(a);
  const vs = [];
  for (const m of medios) {
    let v = vmaxHoja(ruta, m);
    for (const t of cvmC2) if (t.v !== null && t.ini <= m && m <= t.fin) v = v === null ? t.v : Math.min(v, t.v);
    if (v !== null && v !== undefined) vs.push(v);
  }
  return vs.length ? Math.max(...vs) : null;
}

function velocidad(v, columna, tope) {
  let x = v[columna] ?? null;
  if (x === null && (v.a ?? null) === null && (v.b ?? null) === null) x = v.n ?? null;
  if (x === null) return null;
  return tope ? Math.min(x, tope) : x;
}

/** ¿Es de vía única la celda de bloqueo que abarca las dos filas entre las que aparece la VME? */
export function viaUnica(ln, v) {
  const k = Math.max(v.tras_fila, 0);
  return (ln.bloqueo || []).some((t) => t.desde <= k && k < t.hasta && t.texto && RE_BAU.test(t.texto));
}

export function enEstacion(ln, v, zona) {
  if ((v.fila ?? null) !== null || RE_EST.test(v.texto.toUpperCase())) return true;
  if ((v.pk_desde ?? null) === null) return true;
  const lo = Math.min(...zona), hi = Math.max(...zona);
  for (let k = Math.max(0, v.tras_fila - 3); k < Math.min(ln.filas.length, v.tras_fila + 4); k++) {
    const f = ln.filas[k];
    if (esEstacion(f) && (f.km ?? null) !== null && lo - MARGEN_ESTACION_KM <= f.km && f.km <= hi + MARGEN_ESTACION_KM) return true;
  }
  return false;
}

/** Las VME del CVM que caen en la ruta, en el orden de la marcha (como `vme_de_la_ruta`). */
export function vmeDeLaRuta(ruta, cot) {
  const numero = String(ruta.tren.numero || "").replace(/\D/g, "");
  const paridad = numero ? (Number(numero.at(-1)) % 2 === 0 ? "par" : "impar") : null;
  const cvmC2 = tramosMarcha(cot).filter((t) => t.v !== null);
  const res = [];
  const vistas = new Set();
  for (const sc of cot.segmentos) {
    const ln = sc.cvm, seg = sc.segmento;
    if (!ln || !sc.filas.size || seg.rangoPk === null) continue;
    const [lo, hi] = seg.rangoPk;
    const ks = [...sc.filas.values()];
    const k0 = Math.min(...ks), k1 = Math.max(...ks);
    const miVia = viaDelTren(paridad || ln.sentido);
    (ln.vme || []).forEach((v, j) => {
      if (!(k0 - 1 <= v.tras_fila && v.tras_fila <= k1)) return;
      const clave = JSON.stringify([sc.archivo, ln.linea, ln.sentido, j]);
      if (vistas.has(clave)) return;
      const vel = velocidad(v, cot.columna, cot.tope), vs = vias(v.texto);
      const z = zonaVme(ln, v);
      const x = { vme: v, linea: ln.linea, sentido: ln.sentido, archivo: sc.archivo, v: vel, vias: vs, pkIni: null, pkFin: null, ini: null, fin: null, rigeYa: null, efecto: "SIN_ZONA", motivo: "el texto no dice dónde rige" };
      if (z === null) {
        if (k0 <= v.tras_fila && v.tras_fila < k1) {
          vistas.add(clave);
          res.push(x);
        }
        return;
      }
      const z0 = Math.min(...z), z1 = Math.max(...z);
      if (z1 < lo - 1e-9 || z0 > hi + 1e-9) return;
      vistas.add(clave);
      [x.pkIni, x.pkFin] = z;
      const a = seg.acumRecortado(z[0]), b = seg.acumRecortado(z[1]);
      if (a === null || b === null) {
        x.motivo = "no se puede situar en la ruta";
        res.push(x);
        return;
      }
      [x.ini, x.fin] = [Math.min(a, b), Math.max(a, b)];
      x.rigeYa = rigeYa(ruta, cvmC2, x.ini, x.fin);
      if (vel === null) [x.efecto, x.motivo] = ["SIN_VELOCIDAD", `la VME no da velocidad para la columna ${cot.columna.toUpperCase()}`];
      else if (x.rigeYa !== null && vel >= x.rigeYa) [x.efecto, x.motivo] = ["SIN_EFECTO", `ya rige ${x.rigeYa} o menos`];
      else if (vs === null) [x.efecto, x.motivo] = ["RIGE", "vale para todas las vías"];
      else if (viaUnica(ln, v)) {
        if (vs.length === 1 && vs[0] === "I" && !enEstacion(ln, v, z)) [x.efecto, x.motivo] = ["RIGE", "vía única: la vía I, fuera de estación, es de todos"];
        else [x.efecto, x.motivo] = ["AVISO_VIA", `vía única, vía ${vs.join(", ")} de una estación: solo se avisa`];
      } else if (miVia && vs.map((w) => PARIDAD[w] ?? w).includes(miVia)) [x.efecto, x.motivo] = ["RIGE", `es de la vía ${miVia}, la del tren`];
      else [x.efecto, x.motivo] = ["AVISO_VIA", `es de la vía ${vs.join(", ")}; el tren ${paridad || ln.sentido} va por la ${miVia || "?"}: solo se avisa`];
      res.push(x);
    });
  }
  // Orden estable como el de Python: primero las que tienen zona.
  return res.map((x, n) => [x, n]).sort(([a, n], [b, m]) => (a.ini === null) - (b.ini === null) || (a.ini ?? 0) - (b.ini ?? 0) || n - m).map(([x]) => x);
}

/**
 * Límites del CVM para la Vmax efectiva y avisos que no la cambian, según qué prevalece
 * («restrictiva», «hoja» o «cvm»; como `para_marcha` de Python).
 */
export function paraMarcha(cot, vmes, prevalece = "restrictiva") {
  if (!PREVALECE.includes(prevalece)) throw new Error(`prevalece: «${prevalece}»`);
  const limites = [], avisos = [];
  const aviso = (acum, v, texto, motivo, t) => ({ acum, v, texto, motivo, linea: t.linea, sentido: t.sentido, pk: t.pk, pagina: t.pagina, archivo: t.archivo });
  for (const t of tramosMarcha(cot)) {
    if (prevalece === "hoja") {
      if (t.resultado === "HOJA_MAYOR") avisos.push(aviso(t.ini, t.cvm, `la hoja da ${t.hoja}`, "prevalece la hoja", { ...t, pk: t.pkIni }));
      limites.push({ ...t, v: null });
    } else if (prevalece === "cvm" && t.resultado === "HOJA_MENOR") limites.push({ ...t, v: t.cvm, sustituye: true });
    else limites.push(t);
  }
  for (const x of vmes) {
    if (x.ini === null || x.fin === null || (x.efecto !== "RIGE" && x.efecto !== "AVISO_VIA")) continue;
    const pagina = x.vme.origen.pagina;
    if (x.efecto === "RIGE" && prevalece !== "hoja" && x.fin - x.ini > 1e-6) {
      limites.push({ ini: x.ini, fin: x.fin, resultado: "HOJA_MAYOR", v: x.v, hoja: x.rigeYa || x.v, cvm: x.v, linea: x.linea, sentido: x.sentido, pkIni: x.pkIni, pkFin: x.pkFin, pagina, archivo: x.archivo, vme: x.vme.texto });
      continue;
    }
    let motivo = x.motivo;
    if (x.efecto === "RIGE") motivo = prevalece === "hoja" ? "prevalece la hoja" : "en un solo punto";
    avisos.push(aviso(x.ini, x.v, x.vme.texto, motivo, { ...x, pk: x.pkIni, pagina }));
  }
  const orden = (xs, clave) => xs.map((x, n) => [x, n]).sort(([a, n], [b, m]) => clave(a, b) || n - m).map(([x]) => x);
  return [orden(limites, (a, b) => a.ini - b.ini || a.fin - b.fin), orden(avisos, (a, b) => a.acum - b.acum)];
}
