// Tablas de una página a partir de sus líneas dibujadas, como page.find_tables() de PyMuPDF
// 1.28 (estrategia «lines», que viene de pdfplumber): bordes → se ajustan y se unen → cruces
// → celdas → tablas → filas → texto de cada celda (Table.extract, con extract_text de
// pdfplumber). Se reproducen también sus peculiaridades, porque el lector de Python es la
// referencia: p. ej. la comprobación de «hay texto» de clean_graphics usa la y invertida.

import { Caja } from "./geometria.js";

const SNAP = 3, JOIN = 3, MIN_BORDE = 3, CRUCE = 3;

// ---------------------------------------------------------------- bordes

function bordesDe(dibujos, ancho, alto, chars) {
  const bordes = [];
  const linea = (p1, p2) => {
    if (Math.abs(p1[0] - p2[0]) > SNAP && Math.abs(p1[1] - p2[1]) > SNAP) return; // oblicua
    let x0 = Math.min(p1[0], p2[0]), x1 = Math.max(p1[0], p2[0]);
    let y0 = Math.min(p1[1], p2[1]), y1 = Math.max(p1[1], p2[1]);
    if (x0 > ancho || x1 < 0 || y0 > alto || y1 < 0) return;
    x0 = Math.max(x0, 0);
    y0 = Math.max(y0, 0);
    x1 = Math.min(x1, ancho);
    y1 = Math.min(y1, alto);
    if (x1 - x0 === 0 && y1 - y0 === 0) return;
    const o = y0 === y1 ? "h" : "v";
    bordes.push({ o, x0, x1, top: y0, bottom: y1 });
  };
  for (const d of dibujos) {
    for (const it of d.items) {
      if (it[0] === "l") linea(it[1], it[2]);
      else if (it[0] === "re") {
        const r = it[1];
        linea([r.x0, r.y0], [r.x1, r.y0]);
        linea([r.x0, r.y1], [r.x1, r.y1]);
        linea([r.x0, r.y0], [r.x0, r.y1]);
        linea([r.x1, r.y0], [r.x1, r.y1]);
      }
    }
  }
  // PyMuPDF añade además el contorno de cada grupo de dibujos que se tocan (clean_graphics):
  // así una tabla sin marco exterior completo también se cierra.
  for (const r of grupos(dibujos, chars, alto)) {
    linea([r.x0, r.y0], [r.x1, r.y0]);
    linea([r.x0, r.y1], [r.x1, r.y1]);
    linea([r.x0, r.y0], [r.x0, r.y1]);
    linea([r.x1, r.y0], [r.x1, r.y1]);
  }
  return bordes;
}

// Une los rectángulos de los dibujos que se tocan (a SNAP o menos), como clean_graphics, y
// se queda con los grupos que «contienen texto» según chars_in_rect de PyMuPDF, que compara
// la caja del grupo (y hacia abajo) con la del carácter en coordenadas PDF (y hacia arriba).
function grupos(dibujos, chars, alto) {
  const conTexto = (r) =>
    chars.some((c) => r.x0 <= c.x0 && c.x1 <= r.x1 && r.y0 <= alto - c.bottom && r.y1 >= alto - c.top);
  const vecinos = (a, b) =>
    ((b.x0 - SNAP <= a.x0 && a.x0 <= b.x1 + SNAP) || (b.x0 - SNAP <= a.x1 && a.x1 <= b.x1 + SNAP)) &&
    ((b.y0 - SNAP <= a.y0 && a.y0 <= b.y1 + SNAP) || (b.y0 - SNAP <= a.y1 && a.y1 <= b.y1 + SNAP));
  const vistos = new Set();
  let rs = [];
  for (const d of dibujos) {
    const k = [d.caja.x0, d.caja.y0, d.caja.x1, d.caja.y1].join(",");
    if (!vistos.has(k)) {
      vistos.add(k);
      rs.push({ x0: d.caja.x0, y0: d.caja.y0, x1: d.caja.x1, y1: d.caja.y1 });
    }
  }
  rs.sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const nuevos = [];
  while (rs.length) {
    const r = { ...rs[0] };
    let otra = true;
    while (otra) {
      otra = false;
      for (let i = rs.length - 1; i > 0; i--) {
        if (vecinos(r, rs[i]) || vecinos(rs[i], r)) {
          r.x0 = Math.min(r.x0, rs[i].x0);
          r.y0 = Math.min(r.y0, rs[i].y0);
          r.x1 = Math.max(r.x1, rs[i].x1);
          r.y1 = Math.max(r.y1, rs[i].y1);
          rs.splice(i, 1);
          otra = true;
        }
      }
    }
    if (conTexto(r)) nuevos.push(r);
    rs.shift();
  }
  return nuevos;
}

const largo = (e) => (e.o === "h" ? e.x1 - e.x0 : e.bottom - e.top);

// cluster_list de pdfplumber: valores ordenados, se encadenan los que distan ≤ tol.
function agrupar(valores, tol) {
  const xs = [...valores].sort((a, b) => a - b);
  if (!xs.length) return [];
  const grupos = [];
  let actual = [xs[0]], ultimo = xs[0];
  for (const x of xs.slice(1)) {
    if (x <= ultimo + tol) actual.push(x);
    else {
      grupos.push(actual);
      actual = [x];
    }
    ultimo = x;
  }
  grupos.push(actual);
  return grupos;
}

// snap_objects: cada borde se mueve a la media de su grupo.
function ajustar(bordes, attr, tol) {
  const unicos = [...new Set(bordes.map((e) => e[attr]))];
  const grupo = new Map();
  agrupar(unicos, tol).forEach((g, i) => g.forEach((v) => grupo.set(v, i)));
  const porGrupo = new Map();
  for (const e of [...bordes].map((e, i) => [e, i]).sort((a, b) => grupo.get(a[0][attr]) - grupo.get(b[0][attr]) || a[1] - b[1])) {
    const k = grupo.get(e[0][attr]);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k).push(e[0]);
  }
  const salida = [];
  for (const g of porGrupo.values()) {
    let suma = 0;
    for (const e of g) suma += e[attr];
    const media = suma / g.length;
    for (const e of g) {
      const v = media - e[attr];
      salida.push(attr === "x0" ? { ...e, x0: e.x0 + v, x1: e.x1 + v } : { ...e, top: e.top + v, bottom: e.bottom + v });
    }
  }
  return salida;
}

function unirGrupo(bordes, o, tol) {
  const [mn, mx] = o === "h" ? ["x0", "x1"] : ["top", "bottom"];
  const orden = [...bordes].map((e, i) => [e, i]).sort((a, b) => a[0][mn] - b[0][mn] || a[1] - b[1]).map((p) => p[0]);
  const unidos = [orden[0]];
  for (const e of orden.slice(1)) {
    const u = unidos.at(-1);
    if (e[mn] <= u[mx] + tol) {
      if (e[mx] > u[mx]) unidos[unidos.length - 1] = { ...u, [mx]: e[mx] };
    } else unidos.push(e);
  }
  return unidos;
}

function fundir(bordes) {
  const v = ajustar(bordes.filter((e) => e.o === "v"), "x0", SNAP);
  const h = ajustar(bordes.filter((e) => e.o === "h"), "top", SNAP);
  const todos = [...v, ...h];
  // sorted(key=(orientación, posición)) y groupby
  const clave = (e) => (e.o === "h" ? ["h", e.top] : ["v", e.x0]);
  const orden = todos
    .map((e, i) => [e, i])
    .sort((a, b) => {
      const ka = clave(a[0]), kb = clave(b[0]);
      return ka[0] < kb[0] ? -1 : ka[0] > kb[0] ? 1 : ka[1] - kb[1] || a[1] - b[1];
    })
    .map((p) => p[0]);
  const salida = [];
  let grupo = [];
  for (const e of orden) {
    if (grupo.length && (grupo[0].o !== e.o || clave(grupo[0])[1] !== clave(e)[1])) {
      salida.push(...unirGrupo(grupo, grupo[0].o, JOIN));
      grupo = [];
    }
    grupo.push(e);
  }
  if (grupo.length) salida.push(...unirGrupo(grupo, grupo[0].o, JOIN));
  return salida;
}

// ---------------------------------------------------------------- cruces y celdas

const clavePunto = (x, y) => x + "," + y;
const claveBorde = (e) => [e.x0, e.top, e.x1, e.bottom].join(",");

function cruces(bordes) {
  const v = bordes.filter((e) => e.o === "v").sort((a, b) => a.x0 - b.x0 || a.top - b.top);
  const h = bordes.filter((e) => e.o === "h").sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const res = new Map();
  for (const a of v)
    for (const b of h) {
      if (a.top <= b.top + CRUCE && a.bottom >= b.top - CRUCE && a.x0 >= b.x0 - CRUCE && a.x0 <= b.x1 + CRUCE) {
        const k = clavePunto(a.x0, b.top);
        if (!res.has(k)) res.set(k, { x: a.x0, y: b.top, v: new Set(), h: new Set() });
        res.get(k).v.add(claveBorde(a));
        res.get(k).h.add(claveBorde(b));
      }
    }
  return res;
}

function celdas(inter) {
  const conecta = (p, q) => {
    if (p.x === q.x) for (const e of p.v) if (q.v.has(e)) return true;
    if (p.y === q.y) for (const e of p.h) if (q.h.has(e)) return true;
    return false;
  };
  const puntos = [...inter.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  const res = [];
  // Índices por columna y por fila para no recorrer todos los puntos.
  const porX = new Map(), porY = new Map();
  puntos.forEach((p, i) => {
    if (!porX.has(p.x)) porX.set(p.x, []);
    porX.get(p.x).push(i);
    if (!porY.has(p.y)) porY.set(p.y, []);
    porY.get(p.y).push(i);
  });
  for (let i = 0; i < puntos.length - 1; i++) {
    const pt = puntos[i];
    const abajo = porX.get(pt.x).filter((j) => j > i).map((j) => puntos[j]);
    const derecha = porY.get(pt.y).filter((j) => j > i).map((j) => puntos[j]);
    let hecho = false;
    for (const b of abajo) {
      if (!conecta(pt, b)) continue;
      for (const r of derecha) {
        if (!conecta(pt, r)) continue;
        const br = inter.get(clavePunto(r.x, b.y));
        if (br && conecta(br, r) && conecta(br, b)) {
          res.push([pt.x, pt.y, r.x, b.y]);
          hecho = true;
          break;
        }
      }
      if (hecho) break;
    }
  }
  return res;
}

function tablasDe(cs, chars) {
  const esquinas = (c) => [clavePunto(c[0], c[1]), clavePunto(c[0], c[3]), clavePunto(c[2], c[1]), clavePunto(c[2], c[3])];
  let quedan = [...cs];
  const actuales = new Set();
  let actual = [];
  const tablas = [];
  while (quedan.length) {
    const antes = actual.length;
    for (const c of [...quedan]) {
      const es = esquinas(c);
      if (!actual.length || es.some((e) => actuales.has(e))) {
        es.forEach((e) => actuales.add(e));
        actual.push(c);
        quedan.splice(quedan.indexOf(c), 1);
      }
    }
    if (actual.length === antes) {
      tablas.push(actual);
      actuales.clear();
      actual = [];
    }
  }
  if (actual.length) tablas.push(actual);
  const min = (t) => t.reduce((m, c) => (c[1] < m[0] || (c[1] === m[0] && c[0] < m[1]) ? [c[1], c[0]] : m), [Infinity, Infinity]);
  return tablas
    .map((t, i) => [t, min(t), i])
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[2] - b[2])
    .map((p) => p[0])
    .filter((t) => {
      // PyMuPDF: fuera las tablas de una sola columna o sin texto
      const x0s = new Set(t.map((c) => c[0])), x1s = new Set(t.map((c) => c[2]));
      if (x0s.size < 2 || x1s.size < 2) return false;
      const r = [Math.min(...t.map((c) => c[0])), Math.min(...t.map((c) => c[1])), Math.max(...t.map((c) => c[2])), Math.max(...t.map((c) => c[3]))];
      return chars.some((c) => !/^\s$/.test(c.text) && c.x0 < r[2] && c.x1 > r[0] && c.top < r[3] && c.bottom > r[1]);
    });
}

// Filas: celdas con el mismo borde superior; una posición por cada x0 distinto de la tabla.
function filasDe(cs) {
  const xs = [...new Set(cs.map((c) => c[0]))].sort((a, b) => a - b);
  const orden = [...cs].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const filas = [];
  let grupo = [];
  const cerrar = () => {
    const porX = new Map(grupo.map((c) => [c[0], c]));
    const celdas = xs.map((x) => (porX.has(x) ? new Caja(...porX.get(x)) : null));
    const ps = celdas.filter(Boolean);
    const bbox = new Caja(Math.min(...ps.map((c) => c.x0)), Math.min(...ps.map((c) => c.y0)), Math.max(...ps.map((c) => c.x1)), Math.max(...ps.map((c) => c.y1)));
    filas.push({ bbox, celdas });
  };
  for (const c of orden) {
    if (grupo.length && grupo[0][1] !== c[1]) {
      cerrar();
      grupo = [];
    }
    grupo.push(c);
  }
  if (grupo.length) cerrar();
  return filas;
}

/**
 * Caracteres de la página como los ve find_tables (CHARS): por línea, spans y caracteres de
 * izquierda a derecha, con caja «compacta» (alto = tamaño de letra).
 */
export function caracteres(geo, numPagina = 1) {
  const porLinea = new Map();
  for (const t of geo.spansTodos) {
    if (!porLinea.has(t.linea)) porLinea.set(t.linea, []);
    porLinea.get(t.linea).push(t);
  }
  const base = (numPagina - 1) * geo.alto;
  const res = [];
  for (const spans of porLinea.values())
    for (const t of ordenarPor(spans, (s) => s.caja.x0)) {
      const bottom = t.base + t.tam * t.desc, top = bottom - t.tam;
      for (const ch of ordenarPor(t.chars, (c) => c.caja.x0))
        res.push({ text: ch.c, x0: ch.caja.x0, x1: ch.caja.x1, top, bottom, doctop: top + base });
    }
  return res;
}

const ordenarPor = (xs, k) => xs.map((x, i) => [x, i]).sort((a, b) => k(a[0]) - k(b[0]) || a[1] - b[1]).map((p) => p[0]);

/** Tablas de la página: [{bbox: Caja, filas: [{bbox: Caja, celdas: (Caja|null)[]}]}] */
export function buscarTablas(geo, chars = caracteres(geo)) {
  let bordes = bordesDe(geo.dibujos, geo.ancho, geo.alto, chars).filter((e) => largo(e) >= 1);
  bordes = fundir(bordes).filter((e) => largo(e) >= MIN_BORDE);
  return tablasDe(celdas(cruces(bordes)), chars).map((t) => {
    const bbox = new Caja(Math.min(...t.map((c) => c[0])), Math.min(...t.map((c) => c[1])), Math.max(...t.map((c) => c[2])), Math.max(...t.map((c) => c[3])));
    return { bbox, filas: filasDe(t) };
  });
}

// ---------------------------------------------------------------- texto de las celdas

// cluster_objects de pdfplumber: grupos por valor (encadenados a ≤ tol), en orden de valor.
function agruparObjetos(xs, clave, tol) {
  const grupo = new Map();
  agrupar([...new Set(xs.map(clave))], tol).forEach((g, i) => g.forEach((v) => grupo.set(v, i)));
  const orden = xs.map((x, i) => [x, grupo.get(clave(x)), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const res = [];
  let k = null;
  for (const [x, g] of orden) {
    if (g !== k) {
      res.push([]);
      k = g;
    }
    res.at(-1).push(x);
  }
  return res;
}

const TOL_X = 3, TOL_Y = 3;

// extract_text de pdfplumber (sin «layout»): palabras y líneas.
function textoDe(chars) {
  if (!chars.length) return "";
  const ordenados = agruparObjetos(chars, (c) => c.doctop, TOL_Y).flatMap((g) => ordenarPor(g, (c) => c.x0));
  const palabras = [];
  let actual = [];
  const cerrar = () => {
    if (actual.length) {
      palabras.push({
        text: actual.map((c) => c.text).join(""),
        doctop: Math.min(...actual.map((c) => c.top)) + (actual[0].doctop - actual[0].top),
      });
    }
    actual = [];
  };
  for (const c of ordenados) {
    if (/^\s+$/.test(c.text)) cerrar();
    else if (actual.length) {
      const p = actual.at(-1);
      if (c.x0 < p.x0 || c.x0 > p.x1 + TOL_X || c.top > p.top + TOL_Y) {
        cerrar();
        actual = [c];
      } else actual.push(c);
    } else actual.push(c);
  }
  cerrar();
  return agruparObjetos(palabras, (w) => w.doctop, TOL_Y)
    .map((l) => l.map((w) => w.text).join(" "))
    .join("\n");
}

const enCaja = (c, b) => {
  const v = (c.top + c.bottom) / 2, h = (c.x0 + c.x1) / 2;
  return h >= b.x0 && h < b.x1 && v >= b.y0 && v < b.y1;
};

/** Como Table.extract(): textos de cada fila (null donde no hay celda). */
export function extraer(tabla, chars) {
  return tabla.filas.map((f) => {
    const deFila = chars.filter((c) => enCaja(c, f.bbox));
    return f.celdas.map((c) => (c ? textoDe(deFila.filter((ch) => enCaja(ch, c))) : null));
  });
}
