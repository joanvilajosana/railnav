// Lector del Cuadro de Velocidades Máximas (CVM) de ADIF: PDF → cvm (modelos/cvm.py).
// Traducción de parsers/cvm/parser.py y parsers/cvm/geometria.py; las pruebas comparan las
// dos salidas con los CVM del corpus.
//
// Cada hoja del PDF lleva dos páginas del cuadro, una al lado de la otra. Se lee por
// geometría: columnas por los rótulos de la cabecera, filas por los PK de Sit Km, celdas por
// las líneas horizontales que cruzan cada columna, CSV por el relleno gris oscuro, VME por los
// renglones en letra estrecha de la columna de dependencias y la protección por los símbolos
// a la derecha de la tabla. Las páginas de una misma línea y sentido se unen.
//
// Las páginas dibujadas (texto convertido en trazos) no se leen: aviso SIN_TEXTO. En el
// ordenador se pueden leer con el texto reconstruido (`texto`, solo para las pruebas).

import { Caja, leerPagina as leerGeometria } from "./geometria.js";
import { minPor, ordenar, redondear, sha256 } from "./py.js";

export class ErrorCVM extends Error {}

// ---------------------------------------------------------------- geometría de la página

// Alto de la caja de una palabra (tamaños de letra sobre y bajo la línea base), fijo para todas
// las fuentes, como en parsers/cvm/geometria.py.
const ASC = 0.905, DESC = 0.212;

const clara = (w) => {
  const r = w.color >> 16, g = (w.color >> 8) & 255, b = w.color & 255;
  return Math.min(r, g, b) > 200;
};
const negrita = (w) => w.fuente.toLowerCase().includes("bold");
const cursiva = (w) => w.fuente.toLowerCase().includes("italic");
const rgbEntero = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
const palabra = (texto, caja, fuente, tam, color) => ({ texto, caja, fuente, tam, color });

// Trazo que dibuja una letra (páginas con el texto convertido en dibujo).
function esLetra(d) {
  const r = d.caja;
  const tipos = d.items.map((i) => i[0]);
  if (d.tipo !== "f" || r.alto >= 12 || r.ancho >= 40) return false;
  if (tipos.length === 1 && tipos[0] === "re")
    return (r.alto < 1.5 && r.ancho < 6) || (r.ancho < 2.2 && 3 < r.alto && r.alto < 12 && r.alto > 3 * r.ancho);
  return tipos.some((t) => t !== "re");
}

// Cifras con anillo de Wingdings (protección ①, ②). En las fuentes recortadas que llevan los
// CVM cada PDF les da otro código y pdf.js no sabe qué son (PyMuPDF sí: U+F081, U+F082). Se
// reconocen por la forma del glifo en el archivo de la fuente: número de contornos y el último
// punto de cada uno, iguales en todos los CVM del corpus.
const ANILLADAS = { "11,23,29": "", "11,23,49": "" };
const huellas = new WeakMap();

/** Forma de un glifo (`fontChar`) en el archivo de fuente que da pdf.js (TrueType). */
function forma(datos, cp) {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const t = {};
  for (let i = 0; i < v.getUint16(4); i++) {
    const o = 12 + 16 * i;
    t[String.fromCharCode(...datos.subarray(o, o + 4))] = v.getUint32(o + 8);
  }
  if (t.cmap == null || t.glyf == null || t.loca == null || t.head == null) return null;
  // cmap de formato 4: carácter → glifo
  let gid = null;
  for (let i = 0; i < v.getUint16(t.cmap + 2) && gid == null; i++) {
    const st = t.cmap + v.getUint32(t.cmap + 8 + 8 * i);
    if (v.getUint16(st) !== 4) continue;
    const n2 = v.getUint16(st + 6), fins = st + 14, inicios = fins + n2 + 2, deltas = inicios + n2, saltos = deltas + n2;
    for (let k = 0; k < n2 / 2; k++) {
      const b = v.getUint16(inicios + 2 * k);
      if (cp < b || cp > v.getUint16(fins + 2 * k)) continue;
      const ro = v.getUint16(saltos + 2 * k), de = v.getInt16(deltas + 2 * k);
      if (!ro) gid = (cp + de) & 0xffff;
      else {
        const x = v.getUint16(saltos + 2 * k + ro + 2 * (cp - b));
        gid = x ? (x + de) & 0xffff : 0;
      }
      break;
    }
  }
  if (!gid) return null;
  const largo = v.getInt16(t.head + 50);
  const loca = (i) => (largo ? v.getUint32(t.loca + 4 * i) : 2 * v.getUint16(t.loca + 2 * i));
  if (loca(gid + 1) <= loca(gid)) return null;
  const g = t.glyf + loca(gid);
  const n = v.getInt16(g);
  if (n <= 0) return null;
  return Array.from({ length: n }, (_, i) => v.getUint16(g + 10 + 2 * i)).join(",");
}

function cifraAnillada(fuente, glifo) {
  if (!fuente?.data || !/^Wingdings/.test(fuente.name?.replace(/^[A-Z]{6}\+/, "") ?? "") || !glifo.fontChar) return null;
  let cache = huellas.get(fuente);
  if (!cache) huellas.set(fuente, (cache = new Map()));
  const cp = glifo.fontChar.codePointAt(0);
  if (!cache.has(cp)) {
    let f = null;
    try {
      f = forma(fuente.data, cp);
    } catch {
      f = null;
    }
    cache.set(cp, ANILLADAS[f] ?? null);
  }
  return cache.get(cp);
}

/** Una página del PDF: palabras, dibujos y líneas horizontales y verticales. */
export async function leerPagina(page, OPS, numero, texto = null) {
  const g = await leerGeometria(page, OPS, { metricas: [ASC, DESC], simbolo: cifraAnillada });
  const palabras = (texto || []).map((w) => palabra(w.t, new Caja(...w.caja), w.fuente, w.tam, w.color));
  if (texto == null)
    for (const s of g.spansTodos) {
      // El texto invisible (la capa de un OCR) no se lee: en el CVM confunde cifras y no trae
      // cursivas, negritas ni colores, con los que se reconocen las columnas.
      if (s.invisible) continue;
      // Las letras del span, partidas en palabras por los espacios.
      const trozos = [[]];
      for (const c of s.chars) {
        if (/\s/.test(c.c)) trozos.push([]);
        else trozos.at(-1).push(c);
      }
      for (const t of trozos) {
        if (!t.length) continue;
        const a = t[0].caja, b = t.at(-1).caja;
        palabras.push(
          palabra(
            t.map((c) => c.c).join(""),
            new Caja(Math.min(a.x0, b.x0), Math.min(a.y0, b.y0), Math.max(a.x1, b.x1), Math.max(a.y1, b.y1)),
            s.fuente,
            s.tam,
            rgbEntero(s.color),
          ),
        );
      }
    }
  const dibujos = [];
  const lineas = [];
  // Un mismo trazado rellenado y luego trazado es un solo dibujo, como en PyMuPDF (●).
  const juntos = [];
  for (const d0 of g.dibujos) {
    const d = { ...d0, formas: d0.items.map((i) => i[0]).join(" ") };
    const u = juntos.at(-1);
    if (u?.tipo === "f" && d.tipo === "s" && u.formas === d.formas && u.caja.tupla().join() === d.caja.tupla().join()) {
      u.tipo = "fs";
      u.trazo = d.trazo;
    } else juntos.push(d);
  }
  for (const d of juntos) {
    if (texto != null && esLetra(d)) continue;
    dibujos.push({ caja: d.caja, relleno: d.relleno, trazo: d.trazo, formas: d.formas });
    for (const it of d.items) {
      if (it[0] === "l") {
        const [p, q] = [it[1], it[2]];
        if (Math.abs(p[1] - q[1]) < 0.6) lineas.push({ horizontal: true, pos: (p[1] + q[1]) / 2, a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) });
        else if (Math.abs(p[0] - q[0]) < 0.6) lineas.push({ horizontal: false, pos: (p[0] + q[0]) / 2, a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) });
      } else if (it[0] === "re") {
        const r = it[1];
        if (r.alto < 1.2 && r.ancho > 2) lineas.push({ horizontal: true, pos: r.cy, a: r.x0, b: r.x1 });
        else if (r.ancho < 1.2 && r.alto > 2) lineas.push({ horizontal: false, pos: r.cx, a: r.y0, b: r.y1 });
        else if (d.trazo != null)
          lineas.push(
            { horizontal: true, pos: r.y0, a: r.x0, b: r.x1 },
            { horizontal: true, pos: r.y1, a: r.x0, b: r.x1 },
            { horizontal: false, pos: r.x0, a: r.y0, b: r.y1 },
            { horizontal: false, pos: r.x1, a: r.y0, b: r.y1 },
          );
      }
    }
  }
  return { numero, ancho: g.ancho, alto: g.alto, palabras, dibujos, lineas, spans: g.spansTodos };
}

// ---------------------------------------------------------------- símbolos y utilidades

// Leyenda de la protección (CVM, aportada por Joan el 05-11-2026). Un anillo alrededor del
// símbolo es ASFA-AV; sin anillo, ASFA-CONV.
const SISTEMA = { "●": "", o: "LZB", 1: "ERTMS NIVEL 1", 2: "ERTMS NIVEL 2", "½": "ERTMS NIVELES 1 y 2" };

// Cifras con anillo de la fuente Wingdings (0x81 = ①, 0x82 = ②): PyMuPDF las da en la zona
// privada (U+F081) y pdf.js con el código de la fuente.
const ANILLADOS = { "": "(1)", "": "(2)", "\x81": "(1)", "\x82": "(2)" };

/** «(●)» → «ASFA-AV», «1» → «ASFA-CONV y ERTMS NIVEL 1», «-» → «Sin sistema». */
export function sistemaProteccion(simbolo) {
  if (simbolo === "-") return "Sin sistema";
  const anillo = simbolo.startsWith("(") && simbolo.endsWith(")");
  const dentro = anillo ? simbolo.slice(1, -1) : simbolo;
  if (!Object.hasOwn(SISTEMA, dentro)) return null;
  const asfa = anillo ? "ASFA-AV" : "ASFA-CONV";
  return SISTEMA[dentro] ? `${asfa} y ${SISTEMA[dentro]}` : asfa;
}

// Flechas de la fuente Symbol (bloqueo «↓BAB ctc↓», distancias «3.5↓»).
const SIMBOLOS = { "": "←", "": "↑", "": "→", "": "↓" };
const RE_KM = /^-?\d+(?:\.\d+)?$/;
const RE_ANEJO = /An\.?\s*(?:nº\s*)?([0-9A-Za-z]+)/;
const RE_PAG = /Pág\.?\s*(\d+)\s*de\s*(\d+)/;
const RE_DIGITOS = /^\d+$/;

const limpia = (t) => t.replace(/[-]/g, (c) => SIMBOLOS[c]);
const gris = (rgb) => (rgb == null || Math.max(...rgb) - Math.min(...rgb) > 0.05 ? null : (rgb[0] + rgb[1] + rgb[2]) / 3);
const entero = (t) => (t && RE_DIGITOS.test(t) ? Number(t) : null);
const texto = (ws) => limpia(ws.map((w) => w.texto).join(" ")).trim();
const tupla = (c) => [c.x0, c.y0, c.x1, c.y1].map((v) => redondear(v, 2));
const dentro = (w, banda) => banda[0] <= w.caja.cx && w.caja.cx <= banda[1];
const mover = (w, dx) => ({ ...w, caja: new Caja(w.caja.x0 + dx, w.caja.y0, w.caja.x1 + dx, w.caja.y1) });
const moverCaja = (c, dx) => new Caja(c.x0 + dx, c.y0, c.x1 + dx, c.y1);
const union = (cs) => new Caja(Math.min(...cs.map((c) => c.x0)), Math.min(...cs.map((c) => c.y0)), Math.max(...cs.map((c) => c.x1)), Math.max(...cs.map((c) => c.y1)));
const origen = ({ pagina, fila = null, bbox = null, texto = null }) => ({ archivo: null, pagina, fila, bbox, texto });
const fmt = (v, n) => redondear(v, n).toFixed(n);

/** Agrupa palabras por renglón (centro vertical parecido) y ordena cada uno por x. */
function renglones(ps, tol = 2.5) {
  const filas = [];
  for (const w of ordenar(ps, (w) => [w.caja.cy])) {
    if (filas.length && Math.abs(filas.at(-1).at(-1).caja.cy - w.caja.cy) <= tol) filas.at(-1).push(w);
    else filas.push([w]);
  }
  return filas.map((f) => ordenar(f, (w) => [w.caja.x0]));
}

// ---------------------------------------------------------------- página lógica

/** [línea, sentido, de, a] si la media hoja es una página del cuadro. */
function cabecera(pal) {
  const arriba = pal.filter((w) => w.caja.y1 < 42);
  const sentido = arriba.find((w) => /^(par\)|impar\))/.test(w.texto.toLowerCase()));
  if (!sentido) return null;
  const numero = arriba.find((w) => /^\d{3}$/.test(w.texto) && w.tam >= 12);
  if (!numero) return null;
  const de = arriba.find((w) => w.texto === "De");
  const a = arriba.find((w) => w.texto === "a" && de && w.caja.y0 > de.caja.y0 + 5);
  if (!de || !a) return null;
  const xs = arriba.filter((w) => (w.texto === "Línea" || w.texto === "(sentido") && w.caja.x0 > de.caja.x1).map((w) => w.caja.x0);
  const xDer = xs.length ? Math.min(...xs) : 1e9;
  const nombre = (ref) =>
    texto(arriba.filter((w) => Math.abs(w.caja.cy - ref.caja.cy) < 3 && ref.caja.x1 + 5 < w.caja.x0 && w.caja.x0 < xDer - 2 && w.texto !== ":"));
  return [numero.texto, sentido.texto.toLowerCase().replace(/\)+$/, ""), nombre(de), nombre(a)];
}

function columnas(pal) {
  const cab = pal.filter((w) => 40 < w.caja.cy && w.caja.cy < 66 && clara(w));
  const x = (t) => cab.find((w) => w.texto === t)?.caja ?? null;
  const [b, n, a, km, dep, dist, rad, rampa, bloq] = ["B", "N", "A", "Km", "Dependencias", "Dist", "Rad", "Rampa", "Bloqueo"].map(x);
  if ([b, n, a, km, dep, dist, rad, rampa, bloq].includes(null)) return null;
  // Bandas: los rótulos N, A y B están centrados en sus columnas, que miden lo mismo.
  const medio = (b.cx - n.cx) / 4;
  const finKm = km.x1 + 10;
  return {
    bloqueo: [bloq.cx - 20, n.cx - medio],
    n: [n.cx - medio, n.cx + medio],
    a: [a.cx - medio, a.cx + medio],
    b: [b.cx - medio, b.cx + medio],
    km: [b.cx + medio, finKm],
    dep: [finKm, dist.x0 - 3],
    dist: [dist.x0 - 3, rad.x0 - 3],
    rad: [rad.x0 - 3, (rad.x1 + rampa.x0) / 2],
    rampa: [(rad.x1 + rampa.x0) / 2, rampa.x1 + 1.5],
  };
}

function leerMedia(p, x0, x1) {
  const pal = p.palabras.filter((w) => x0 <= w.caja.cx && w.caja.cx < x1);
  // Coordenadas relativas a la media hoja (las dos medias tienen la misma maqueta).
  const rel = pal.map((w) => mover(w, -x0));
  const cab = cabecera(rel);
  if (!cab) return null;
  const col = columnas(rel);
  if (!col) return null;
  const [linea, sentido, de, a] = cab;

  // Pie: «CVM GRUPO 1º - Ed. 11/10/16 - An. 37 … Pág 1 de 1»
  const pie = rel.filter((w) => w.caja.cy > 500);
  const pieTxt = ordenar(pie, (w) => [redondear(w.caja.cy), w.caja.x0]).map((w) => w.texto).join(" ");
  const mPag = RE_PAG.exec(pieTxt);
  const mAn = RE_ANEJO.exec(pieTxt);
  const ysPie = pie.filter((w) => w.texto.startsWith("Pág")).map((w) => w.caja.y0);
  if (!ysPie.length) return null;
  const yPie = Math.min(...ysPie);

  // Líneas horizontales de la media hoja
  const hs = p.lineas.filter((l) => l.horizontal && x0 - 1 <= l.a && l.b <= x1 + 1).map((l) => [l.pos, l.a - x0, l.b - x0]);
  const cruzaN = ([, a_, b_]) => a_ <= col.n[0] + 2 && b_ >= col.n[1] - 2;
  const topes = hs.filter((h) => h[0] > 64 && cruzaN(h)).map((h) => h[0]);
  const tope = topes.length ? Math.min(...topes) : 74.9;
  const fondos = hs.filter((h) => h[0] < yPie - 8 && cruzaN(h)).map((h) => h[0]);
  if (!fondos.length) return null;
  const fondo = Math.max(...fondos);
  if (fondo <= tope) return null;
  const cuerpo = rel.filter((w) => tope - 8 < w.caja.cy && w.caja.cy < fondo + 2);

  // ---- filas (Sit Km)
  const kms = cuerpo.filter((w) => dentro(w, col.km) && cursiva(w));
  const filasKm = renglones(kms, 2.0).map((r) => {
    const caja = union(r.map((w) => w.caja));
    return [caja.cy, r.map((w) => w.texto).join("").replaceAll(" ", ""), caja, r.every(negrita)];
  });
  const filas = [];
  let negritaPrev = false;
  for (const [y, t, caja, neg] of filasKm) {
    const km = RE_KM.test(t) ? Number(t) : null;
    // Cambio de kilometración: dos PK en negrita, uno justo debajo del otro (llegada / salida).
    const u = filas.at(-1);
    const junto = u && u.km_salida == null && !u.km_texto.includes("/") && ((neg && negritaPrev && y - u.y < 12) || y - u.y < 6);
    negritaPrev = neg;
    if (junto) {
      u.km_salida = km;
      u.km_texto = `${u.km_texto}/${t}`;
      u.y = (u.y + y) / 2;
      u.caja = new Caja(Math.min(u.caja.x0, caja.x0), u.caja.y0, Math.max(u.caja.x1, caja.x1), caja.y1);
      continue;
    }
    filas.push({ y, km, km_salida: null, km_texto: t, dependencia: null, dist: null, caja });
  }
  if (!filas.length) return null;
  const pasos = filas.slice(1).map((f, i) => f.y - filas[i].y);
  const paso = pasos.length ? Math.min(...pasos) : 20.0;
  const tolFila = Math.max(2.5, Math.min(6.0, paso * 0.3));
  const filaDe = (y) => {
    const i = minPor([...filas.keys()], (i) => Math.abs(filas[i].y - y));
    return Math.abs(filas[i].y - y) <= tolFila + 1.5 ? i : null;
  };

  // ---- dependencias, distancias y VME
  const deps = cuerpo.filter((w) => dentro(w, col.dep));
  const usados = new Set();
  for (const f of filas) {
    const en = deps.filter((w) => Math.abs(w.caja.cy - f.y) <= 3.2 && !w.fuente.toLowerCase().includes("narrow"));
    if (en.length) {
      const nom = texto(en).replace(/[. ]+$/, "").trim();
      f.dependencia = nom.replace(/\.{3,}.*$/, "").trim() || null;
      for (const w of en) usados.add(w);
    }
    const dist = cuerpo.filter((w) => dentro(w, col.dist) && Math.abs(w.caja.cy - f.y) <= 3.5 && /^\d+(\.\d+)?$/.test(w.texto));
    if (dist.length) f.dist = Number(dist[0].texto);
  }
  const resto = deps.filter((w) => !usados.has(w));
  const pag = {
    pagina: p.numero,
    linea,
    sentido,
    de,
    a,
    anejo: mAn ? mAn[1] : null,
    n: mPag ? Number(mPag[1]) : 1,
    total: mPag ? Number(mPag[2]) : 1,
    filas,
    celdas: [],
    vme: [],
    marcas: [],
    notas: [],
    avisos: [],
  };
  const rellenos = p.dibujos.filter((d) => d.relleno != null && x0 <= d.caja.cx && d.caja.cx < x1);
  for (const r of renglones(resto)) {
    const y = r.reduce((s, w) => s + w.caja.cy, 0) / r.length;
    let tras = -1;
    filas.forEach((f, i) => {
      if (f.y < y) tras = Math.max(tras, i);
    });
    const oscuro =
      rellenos.some((d) => {
        const g = gris(d.relleno);
        return g != null && g < 0.85 && d.caja.x0 - x0 <= r[0].caja.cx && r[0].caja.cx <= d.caja.x1 - x0 && d.caja.y0 <= y && y <= d.caja.y1;
      }) || r.some(clara);
    pag.vme.push([tras, r, oscuro]);
  }

  // ---- celdas de cada columna
  const bordes = (banda) => {
    const ancho = banda[1] - banda[0];
    const ys = hs
      .filter(([y, a_, b_]) => tope - 1.5 <= y && y <= fondo + 1.5 && Math.min(b_, banda[1]) - Math.max(a_, banda[0]) >= ancho * 0.6)
      .map((h) => h[0])
      .sort((u, v) => u - v);
    const out = [];
    for (const y of ys) if (!out.length || y - out.at(-1) > 1.5) out.push(y);
    if (!out.length || out[0] > tope + 1.5) out.unshift(tope);
    if (out.at(-1) < fondo - 1.5) out.push(fondo);
    return out;
  };
  for (const nombre of ["bloqueo", "n", "a", "b", "rad", "rampa"]) {
    const banda = col[nombre];
    const bs = bordes(banda);
    for (let k = 0; k + 1 < bs.length; k++) {
      const ya = bs[k], yb = bs[k + 1];
      if (yb - ya < 3) continue;
      let fa = filaDe(ya), fb = filaDe(yb);
      if (ya <= tope + 1.5) fa = 0;
      if (yb >= fondo - 1.5) fb = filas.length - 1;
      const ws = cuerpo.filter((w) => dentro(w, banda) && ya < w.caja.cy && w.caja.cy < yb && !usados.has(w));
      const t = texto(ws) || null;
      if (fa == null || fb == null) {
        if (t) pag.avisos.push(`${nombre}: celda «${t}» con un borde que no cae en ninguna fila (y=${fmt(ya, 1)}–${fmt(yb, 1)})`);
        continue;
      }
      if (fb <= fa) continue;
      let csv = false;
      if (nombre === "n" || nombre === "a" || nombre === "b")
        csv =
          rellenos.some((d) => {
            const g = gris(d.relleno);
            const cx = d.caja.cx - x0;
            return g != null && g < 0.85 && banda[0] - 1 <= cx && cx <= banda[1] + 1 && ya - 1 <= d.caja.cy && d.caja.cy <= yb + 1 && d.caja.alto < yb - ya + 3;
          }) || ws.some(clara);
      pag.celdas.push({ columna: nombre, desde: fa, hasta: fb, texto: t, csv, caja: new Caja(banda[0] + x0, ya, banda[1] + x0, yb) });
    }
  }

  // ---- marcas fuera de la tabla: protección (derecha) y catenaria (izquierda)
  const hueco = (y) => {
    for (let i = 0; i < filas.length - 1; i++) if (filas[i].y < y && y < filas[i + 1].y) return i;
    return null;
  };
  const der = col.rampa[1] + 1;
  for (const w of cuerpo)
    if (w.caja.cx > der && w.texto.trim()) {
      const h = hueco(w.caja.cy);
      if (h != null) {
        const t = limpia(w.texto);
        pag.marcas.push(["proteccion", h, ANILLADOS[t] ?? t, moverCaja(w.caja, x0)]);
      }
    }
  for (const d of p.dibujos) {
    const cx = d.caja.cx - x0;
    if (!(x0 <= d.caja.cx && d.caja.cx < x1) || !(tope < d.caja.cy && d.caja.cy < fondo) || d.caja.ancho > 12) continue;
    if (cx > der && d.formas.split(" ").includes("c")) {
      const h = hueco(d.caja.cy);
      if (h != null) {
        const g = gris(d.relleno);
        const simbolo = d.relleno == null ? "○" : g != null && g < 0.2 ? "●" : g != null ? `●${fmt(g, 2)}` : "●color";
        pag.marcas.push(["proteccion", h, simbolo, d.caja]);
      }
    } else if (cx < col.bloqueo[0] - 1 && d.caja.ancho > 2) {
      const h = hueco(d.caja.cy);
      if (h != null) pag.marcas.push(["catenaria", h, "▲", d.caja]);
    }
  }

  // Protección: lo que hay en cada hueco forma un solo símbolo de la leyenda. El círculo
  // grande (≥ 5 pt) es el anillo de ASFA-AV; uno pequeño sin relleno es la «o» de LZB.
  const prot = new Map();
  const otras = [];
  for (const m of pag.marcas) {
    if (m[0] === "proteccion") {
      if (!prot.has(m[1])) prot.set(m[1], []);
      prot.get(m[1]).push([m[2], m[3]]);
    } else otras.push(m);
  }
  pag.marcas = otras;
  for (const [h, items] of prot) {
    const grande = ([s, c]) => s === "○" && c.ancho >= 5;
    const anillo = items.some(grande);
    const dentroTxt = items.filter((it) => !grande(it)).map(([s]) => (s === "○" ? "o" : s)).join("");
    const simbolo = anillo ? `(${dentroTxt || "?"})` : dentroTxt;
    pag.marcas.push(["proteccion", h, simbolo, union(items.map((it) => it[1]))]);
    if (sistemaProteccion(simbolo) == null) pag.avisos.push(`protección: símbolo «${simbolo}» que no está en la leyenda`);
  }

  // ---- notas al pie (debajo de la tabla, fuera del recuadro del pie)
  const notas = rel.filter((w) => fondo + 2 < w.caja.cy && !(yPie - 4 < w.caja.cy && w.caja.cy < yPie + 14) && w.caja.cy < 575);
  for (const r of renglones(notas)) {
    const t = texto(r);
    if (t && !/^\d{3}$/.test(t) && !t.startsWith("CVM") && !t.startsWith("C.V.M")) pag.notas.push(t);
  }
  return pag;
}

// ---------------------------------------------------------------- unir páginas de una línea

function vmeDe(tras, ws, oscuro, pagina) {
  const t = texto(ws);
  if (!t) return null;
  const nums = [];
  for (const w of ws) {
    if (RE_DIGITOS.test(w.texto) && nums.length < 3 && Number(w.texto) <= 400) nums.push(Number(w.texto));
    else break;
  }
  let n = null, a = null, b = null;
  if (nums.length === 3) [n, a, b] = nums;
  else if (nums.length === 1) n = nums[0]; // cuadros con un solo tipo (RAM): la velocidad va en la columna N
  return {
    tras_fila: tras,
    n,
    a,
    b,
    texto: t,
    csv: oscuro,
    pk_desde: null,
    pk_hasta: null,
    fila: null,
    nota: null,
    origen: origen({ pagina, bbox: tupla(union(ws.map((w) => w.caja))), texto: t }),
  };
}

const COLUMNA = { n: "vn", a: "va", b: "vb", bloqueo: "bloqueo", rad: "radio", rampa: "rampa" };
const RE_KM_VME = /\bKM\.?\s*(\d+(?:,\d+)?)(?:\s+AL\s+(\d+(?:,\d+)?))?/;
const VACIAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "(APD)", "-", "VIA", "VIAS", "AL", "POR", "PASO", "SALIDA", "ENT", "ENTRADA", "EST.", "KM", "KM."]);

function palabrasDe(t) {
  t = t.toUpperCase().replace(/[.,\-()]/g, " ");
  return new Set(t.split(/\s+/).filter((w) => w && !VACIAS.has(w) && !/\d/.test(w) && w.length > 1));
}
const incluido = (a, b) => [...a].every((x) => b.has(x));

/** Dónde rige una VME según su texto: PK escritos («KM x AL y») o la dependencia que nombra. */
function situar(v, filas, notas) {
  const m = RE_KM_VME.exec(v.texto);
  if (m) {
    v.pk_desde = Number(m[1].replace(",", "."));
    if (m[2]) v.pk_hasta = Number(m[2].replace(",", "."));
  } else {
    const pal = palabrasDe(v.texto.replace(/^(\d+\s+){1,3}/, ""));
    const candidatas = [];
    filas.forEach((f, i) => {
      const dep = palabrasDe(f.dependencia || "");
      if (dep.size && pal.size && (incluido(dep, pal) || incluido(pal, dep)))
        // Primero el nombre exacto («LA ENCINA» antes que «LA ENCINA AGUJA…»).
        candidatas.push([dep.size === pal.size && incluido(dep, pal) ? 0 : 1, Math.abs(i - (v.tras_fila + 0.5)), i]);
    });
    if (candidatas.length) v.fila = ordenar(candidatas, (c) => c)[0][2];
  }
  const llamada = /\(\*+\)/.exec(v.texto);
  if (llamada) {
    const nota = notas.find((n) => n.startsWith(llamada[0]));
    if (nota) v.nota = nota.slice(llamada[0].length).trim();
  }
  return v;
}

function unir(paginas) {
  paginas = ordenar(paginas, (p) => [p.n, p.pagina]);
  const p0 = paginas[0];
  const filas = [];
  const tramos = { vn: [], va: [], vb: [], bloqueo: [], radio: [], rampa: [] };
  const marcas = { proteccion: [], catenaria: [] };
  let vme = [];
  const notas = [], avisos = [], anejos = [];
  let esperado = 1;
  for (const pg of paginas) {
    if (pg.n !== esperado) avisos.push({ codigo: "PAGINAS", mensaje: `falta la página ${esperado} de ${pg.total} (se pasa a la ${pg.n})`, origen: null });
    esperado = pg.n + 1;
    if (pg === paginas.at(-1) && pg.n < pg.total)
      avisos.push({ codigo: "PAGINAS", mensaje: `falta${pg.total - pg.n > 1 ? "n" : ""} la${pg.total - pg.n > 1 ? "s" : ""} página${pg.total - pg.n > 1 ? "s" : ""} ${pg.n + 1 < pg.total ? `${pg.n + 1}–${pg.total}` : pg.total} de ${pg.total} (al final)`, origen: null });
    if (pg.anejo && !anejos.includes(pg.anejo)) anejos.push(pg.anejo);
    // ¿La primera fila repite la última de la página anterior?
    let base = filas.length, enlazada = false;
    if (filas.length) {
      const u = filas.at(-1), f0 = pg.filas[0];
      if (u.km === f0.km && (u.dependencia || "") === (f0.dependencia || "")) {
        base = filas.length - 1;
        enlazada = true;
      } else avisos.push({ codigo: "SIN_ENLACE", mensaje: `la página ${pg.n} no empieza donde acaba la ${pg.n - 1}`, origen: origen({ pagina: pg.pagina }) });
    }
    pg.filas.forEach((f, i) => {
      if (enlazada && i === 0) return;
      filas.push({
        km: f.km,
        km_salida: f.km_salida,
        dependencia: f.dependencia,
        dist_km: f.dist,
        origen: origen({ pagina: pg.pagina, bbox: f.caja ? tupla(f.caja) : null, texto: f.km_texto }),
      });
    });
    for (const c of pg.celdas) {
      const lista = tramos[COLUMNA[c.columna]];
      const t = {
        desde: base + c.desde,
        hasta: base + c.hasta,
        texto: c.texto,
        valor: entero(c.texto),
        csv: c.csv,
        origen: origen({ pagina: pg.pagina, bbox: tupla(c.caja), texto: c.texto }),
      };
      // Celda partida por el salto de página: misma celda, se une.
      let k = lista.length - 1;
      while (k >= 0 && lista[k].hasta !== t.desde) k--;
      const prev = k >= 0 ? lista[k] : null;
      if (enlazada && c.desde === 0 && prev && prev.texto === t.texto && prev.csv === t.csv) lista[k] = { ...prev, hasta: t.hasta };
      else lista.push(t);
    }
    for (const [tras, ws, oscuro] of pg.vme) {
      const v = vmeDe(tras >= 0 ? base + tras : enlazada ? base - 1 : -1, ws, oscuro, pg.pagina);
      if (v) vme.push(v);
    }
    for (const [tipo, h, simbolo, caja] of ordenar(pg.marcas, (m) => [m[0], m[1]])) {
      const lista = marcas[tipo];
      const d = base + h;
      if (lista.length && lista.at(-1).hasta === d && lista.at(-1).simbolo === simbolo) lista[lista.length - 1] = { ...lista.at(-1), hasta: d + 1 };
      else
        lista.push({
          desde: d,
          hasta: d + 1,
          simbolo,
          sistema: tipo === "proteccion" ? sistemaProteccion(simbolo) : null,
          origen: origen({ pagina: pg.pagina, bbox: tupla(caja) }),
        });
    }
    for (const n of pg.notas) if (!notas.includes(n)) notas.push(n);
    for (const m of pg.avisos) avisos.push({ codigo: "CELDA", mensaje: m, origen: origen({ pagina: pg.pagina }) });
  }
  for (const k in tramos) tramos[k] = ordenar(tramos[k], (t) => [t.desde, t.hasta]);
  vme = vme.map((v) => situar(v, filas, notas));
  // Las velocidades cubren toda la tabla, sin huecos ni solapes: si no, algo se ha leído mal.
  for (const k of ["vn", "va", "vb"]) {
    let fin = 0;
    for (const t of tramos[k]) {
      if (t.desde !== fin) avisos.push({ codigo: "COBERTURA", mensaje: `${k}: ${t.desde > fin ? "hueco" : "solape"} entre las filas ${fin} y ${t.desde}`, origen: t.origen });
      fin = Math.max(fin, t.hasta);
    }
    if (fin !== filas.length - 1) avisos.push({ codigo: "COBERTURA", mensaje: `${k}: acaba en la fila ${fin} de ${filas.length - 1}`, origen: null });
  }
  return {
    linea: p0.linea,
    sentido: p0.sentido,
    de: p0.de,
    a: p0.a,
    paginas: [...new Set(paginas.map((p) => p.pagina))].sort((u, v) => u - v),
    anejos,
    filas,
    ...tramos,
    vme,
    proteccion: marcas.proteccion,
    catenaria: marcas.catenaria,
    notas,
    avisos,
  };
}

// ---------------------------------------------------------------- documento

/** Texto de la portada como PyMuPDF (get_text): un renglón por línea de texto. Los
 * superíndices («3ER») siguen en el mismo renglón: se pegan los textos que continúan hacia la
 * derecha y se solapan en vertical. */
function portadaTexto(p) {
  const out = [];
  let u = null;
  for (const s of p.spans) {
    const c = s.caja;
    const sigue = u && c.x0 >= u.x1 - 1 && c.x0 - u.x1 < 2 * s.tam && Math.min(c.y1, u.y1) - Math.max(c.y0, u.y0) > 0;
    if (!sigue) out.push("");
    out[out.length - 1] += s.texto;
    u = c;
  }
  return out;
}

/**
 * CVM (PDF) → documento CVM.
 * @param {Uint8Array} datos  el PDF
 * @param {string} nombre     nombre del archivo
 * @param pdfjs               pdf.js ({getDocument, OPS})
 * @param progreso            (n, total) => void, opcional
 * @param texto               texto reconstruido de las páginas dibujadas ({sha256, paginas})
 */
export async function leerCvm(datos, nombre, pdfjs, progreso = null, { texto: reconstruido = null } = {}) {
  const sha = await sha256(datos);
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: datos.slice(), verbosity: 0, fontExtraProperties: true }).promise;
  } catch (e) {
    throw new ErrorCVM(`no se puede abrir ${nombre}: ${e.message}`);
  }
  try {
    const textos = reconstruido?.sha256 === sha ? reconstruido.paginas : {};
    const medias = [], avisos = [];
    let titulo = "", anejo = null;
    for (let num = 1; num <= doc.numPages; num++) {
      progreso?.(num, doc.numPages);
      const page = await doc.getPage(num);
      let p = await leerPagina(page, pdfjs.OPS, num);
      if (num === 1) {
        const lineas = portadaTexto(p);
        titulo = lineas.find((l) => /L[ÍI]NEAS|CUADRO/.test(l))?.trim() ?? "";
        anejo = /ANEJO\s+(\S+)/.exec(lineas.join(" "))?.[1] ?? null;
      }
      if (!p.palabras.length && Object.hasOwn(textos, String(num))) {
        p = await leerPagina(page, pdfjs.OPS, num, textos[String(num)]);
        avisos.push({
          codigo: "TEXTO_RECONSTRUIDO",
          mensaje: `la página ${num} está dibujada: su texto se ha reconstruido de las letras dibujadas (revisar)`,
          origen: origen({ pagina: num }),
        });
      }
      page.cleanup();
      if (!p.palabras.length && p.dibujos.length > 300) {
        // Página con el texto convertido en trazos (anejos pegados como dibujo): no se lee.
        avisos.push({ codigo: "SIN_TEXTO", mensaje: `la página ${num} no tiene texto (está dibujada): no se ha leído`, origen: origen({ pagina: num }) });
        continue;
      }
      const inicio = p.palabras.slice(0, 80).map((w) => w.texto).join(" ");
      if (!/\(sentido/.test(inicio) && !p.palabras.some((w) => /^(par\)|impar\))/.test(w.texto.toLowerCase()))) continue;
      const mitad = p.ancho / 2;
      for (const [x0, x1] of [[0, mitad], [mitad, p.ancho]]) {
        const mp = leerMedia(p, x0, x1);
        if (mp) medias.push(mp);
      }
      // Ceder el paso entre página y página: la app sigue respondiendo.
      if (num % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!medias.length) throw new ErrorCVM(`${nombre}: no se ha encontrado ninguna página del cuadro`);
    // Agrupar por línea y sentido, en el orden en que aparecen.
    const grupos = new Map();
    for (const mp of medias) {
      const k = mp.linea + "|" + mp.sentido;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(mp);
    }
    return {
      formato: "railnav-cvm",
      version: 1,
      fuente: { archivo: nombre, paginas: doc.numPages, sha256: sha },
      titulo,
      anejo,
      lineas: [...grupos.values()].map(unir),
      avisos,
    };
  } finally {
    await doc.destroy();
  }
}
