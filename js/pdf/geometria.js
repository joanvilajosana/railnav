// Geometría de una página PDF leída con pdf.js: textos, rellenos, rectángulos trazados y
// líneas horizontales. Reproduce lo que el lector de Python obtiene con PyMuPDF
// (parsers/hoja/geometria.py), que es lo que necesitan los lectores de hoja y de DLTV.
//
// Se recorre la lista de operaciones de la página (getOperatorList) como lo haría quien la
// pinta: así se conocen las órdenes de texto tal como vienen en el PDF (PyMuPDF agrupa el
// texto igual: un «span» por orden de texto) y los trazados con su color.
//
// Coordenadas como PyMuPDF: origen arriba a la izquierda, y hacia abajo, en puntos PDF.
// Sin DOM: funciona en el navegador, en un Web Worker y en node (pruebas).

// Azul de ADIF en las hojas PLANIF/MALLAS: cabecera de la tabla y celdas CSV.
export const AZUL_ADIF = [0x28 / 255, 0xa0 / 255, 0xff / 255];
const FUENTES_SIMBOLO = ["Wingdings"];

// Altura de la caja de texto por encima y por debajo de la línea base, en tamaños de letra,
// tal como la calcula PyMuPDF (ascendente y descendente de la fuente).
const METRICAS = [
  [/^Helvetica-Bold/, 1.07, 0.307],
  [/^Helvetica/, 1.074, 0.299],
  [/^Arial/, 1.07, 0.307],
  [/^Times-Bold/, 1.044, 0.341],
  [/^Times/, 1.052, 0.281],
  [/^Courier-Bold/, 1.007, 0.393],
  [/^Courier/, 0.932, 0.317],
];

export class Caja {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
  }
  get cx() {
    return (this.x0 + this.x1) / 2;
  }
  get cy() {
    return (this.y0 + this.y1) / 2;
  }
  get alto() {
    return this.y1 - this.y0;
  }
  get ancho() {
    return this.x1 - this.x0;
  }
  contiene(x, y, tol = 0) {
    return this.x0 - tol <= x && x <= this.x1 + tol && this.y0 - tol <= y && y <= this.y1 + tol;
  }
  tupla() {
    return [r2(this.x0), r2(this.y0), r2(this.x1), r2(this.y1)];
  }
}

export const r2 = (v) => Math.round(v * 100) / 100 + 0;

export const esSimbolo = (t) => FUENTES_SIMBOLO.some((f) => t.fuente.startsWith(f));
export const esAzulAdif = (f) => f.rgb.every((c, i) => Math.abs(c - AZUL_ADIF[i]) < 0.03);
export const esDeColor = (f) => Math.max(...f.rgb) - Math.min(...f.rgb) > 0.05;

const nombreFuente = (n) => (n || "").replace(/^[A-Z]{6}\+/, "");

const mult = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];
const IDENT = [1, 0, 0, 1, 0, 0];

// Distancias (en tamaños de letra) entre un carácter y el final del anterior: por debajo de
// ESPACIO van pegados; hasta MAX_ESPACIO se separan con un espacio; más allá, otro span.
const ESPACIO = 0.15;
const MAX_ESPACIO = 0.8;

/**
 * Lee una página de pdf.js. `OPS` es pdfjsLib.OPS.
 * @returns {{ancho, alto, textos: {texto, caja, fuente, color}[], rellenos: {caja, rgb}[],
 *            trazos: Caja[], lineas: [y, x0, x1][], dibujos}}
 */
export async function leerPagina(page, OPS) {
  // Coordenadas de la página tal como se ve (con su giro, como PyMuPDF): las DLTV vienen
  // giradas 90° (apaisadas).
  const vp = page.getViewport({ scale: 1 });
  const vt = vp.transform;
  const ancho = vp.width, alto = vp.height;
  const ol = await page.getOperatorList();
  const P = (m, x, y) => {
    const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    return [vt[0] * X + vt[2] * Y + vt[4], vt[1] * X + vt[3] * Y + vt[5]];
  };

  // ---- fuentes
  const fuentes = new Map();
  const fuente = (id) => {
    if (!fuentes.has(id)) {
      let f = null;
      try {
        f = page.commonObjs.get(id);
      } catch {
        f = null;
      }
      const nombre = nombreFuente(f?.name || id);
      let met = METRICAS.find(([re]) => re.test(nombre))?.slice(1);
      if (!met) met = f && f.ascent ? [f.ascent, -f.descent] : [1, 0.25];
      fuentes.set(id, { nombre, fm: f?.fontMatrix || [0.001, 0, 0, 0.001, 0, 0], met, simbolo: FUENTES_SIMBOLO.some((s) => nombre.startsWith(s)) });
    }
    return fuentes.get(id);
  };

  // ---- estado gráfico
  let g = { ctm: IDENT, fill: [0, 0, 0], stroke: [0, 0, 0], font: null, size: 0, cs: 0, ws: 0, hs: 1, lead: 0, rise: 0 };
  const pila = [];
  let tm = IDENT, tlm = IDENT;
  let nuevoObjeto = true; // PyMuPDF empieza otro span en cada objeto de texto (BT … ET)

  // ---- textos
  // Como el extractor de MuPDF: los caracteres forman líneas (misma línea base, sin saltos
  // grandes) y, dentro de cada línea, spans (misma fuente, tamaño y color, y mismo objeto de
  // texto). Un hueco mediano entre caracteres se lee como un espacio.
  const spans = [];
  let s = null; // span en curso
  let linea = -1; // número de la línea en curso
  let pluma = null; // final del último carácter
  const cerrar = () => {
    if (s && s.texto) spans.push(s);
    s = null;
  };
  const caracter = (ch, o, fin, tam, fu, nuevaOrden) => {
    // o, fin: origen y final del carácter en coordenadas de página (y hacia abajo)
    const estilo = fu.nombre + "|" + tam.toFixed(2) + "|" + g.fill.join(",");
    let enLinea = false, espacio = false;
    if (pluma && Math.abs(o[1] - pluma.y) < 0.1 * tam) {
      const d = (o[0] - pluma.x) / tam;
      if (Math.abs(d) < MAX_ESPACIO) {
        enLinea = true;
        espacio = d >= ESPACIO && ch !== " " && !pluma.blanco;
      }
    }
    if (!enLinea) linea++;
    if (!(s && enLinea && !nuevaOrden && s.estilo === estilo)) {
      espacio = false; // el espacio solo se añade dentro de un mismo span
      cerrar();
      s = { texto: "", chars: [], x0: o[0], x1: fin[0], base: o[1], tam, fuente: fu.nombre, met: fu.met, color: g.fill, estilo, linea };
    }
    if (espacio) {
      s.texto += " ";
      s.chars.push({ c: " ", x0: pluma.x, x1: o[0] });
    }
    s.texto += ch;
    s.chars.push({ c: ch, x0: o[0], x1: fin[0] });
    s.x0 = Math.min(s.x0, o[0], espacio ? pluma.x : Infinity);
    s.x1 = Math.max(s.x1, fin[0]);
    pluma = { x: fin[0], y: o[1], blanco: /\s/.test(ch) };
  };
  const mostrar = (glifos) => {
    if (!g.font) return;
    const fu = fuente(g.font);
    const m = mult(tm, g.ctm);
    const tam = Math.hypot(m[2], m[3]) * Math.abs(g.size); // tamaño de letra en la página
    const escala = g.size * fu.fm[0];
    let x = 0;
    for (const gl of glifos) {
      if (typeof gl === "number") {
        x -= (gl * g.size) / 1000;
        continue;
      }
      if (!gl) continue;
      const avance = gl.width * escala + g.cs + (gl.isSpace ? g.ws : 0);
      const o = P(m, x * g.hs, g.rise), fin = P(m, (x + gl.width * escala) * g.hs, g.rise);
      let ch = gl.unicode ?? "";
      if (fu.simbolo || !ch || ch === "\u0000") ch = String.fromCharCode(gl.originalCharCode ?? 32);
      for (const c of ch) {
        caracter(c, o, fin, tam, fu, nuevoObjeto);
        nuevoObjeto = false;
      }
      x += avance;
    }
    tm = mult([1, 0, 0, 1, x * g.hs, 0], tm);
  };
  const moverLinea = (tx, ty) => {
    tlm = mult([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  // ---- dibujos
  let camino = [];
  let actual = null, inicio = null; // punto actual del trazado (sigue entre operaciones)
  const dibujos = [];
  const PINTA = new Map([
    [OPS.stroke, "s"],
    [OPS.closeStroke, "s"],
    [OPS.fill, "f"],
    [OPS.eoFill, "f"],
    [OPS.fillStroke, "fs"],
    [OPS.eoFillStroke, "fs"],
    [OPS.closeFillStroke, "fs"],
    [OPS.closeEOFillStroke, "fs"],
  ]);
  const rgb = (a) => {
    if (typeof a[0] === "string") {
      const h = a[0].replace("#", "");
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    }
    return [a[0] / 255, a[1] / 255, a[2] / 255];
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    switch (fn) {
      case OPS.save:
        pila.push({ ...g });
        break;
      case OPS.restore:
        if (pila.length) g = pila.pop();
        break;
      case OPS.transform:
        g = { ...g, ctm: mult(args, g.ctm) };
        break;
      case OPS.paintFormXObjectBegin:
        pila.push({ ...g });
        if (args[0]) g = { ...g, ctm: mult(args[0], g.ctm) };
        break;
      case OPS.paintFormXObjectEnd:
        if (pila.length) g = pila.pop();
        break;
      case OPS.setFillRGBColor:
        g = { ...g, fill: rgb(args) };
        break;
      case OPS.setStrokeRGBColor:
        g = { ...g, stroke: rgb(args) };
        break;
      // texto
      case OPS.beginText:
        tm = tlm = IDENT;
        nuevoObjeto = true;
        break;
      case OPS.setFont:
        g = { ...g, font: args[0], size: args[1] };
        break;
      case OPS.setTextMatrix:
        tm = tlm = Array.isArray(args[0]) || ArrayBuffer.isView(args[0]) ? [...args[0]] : [...args];
        break;
      case OPS.moveText:
        moverLinea(args[0], args[1]);
        break;
      case OPS.setLeadingMoveText:
        g = { ...g, lead: -args[1] };
        moverLinea(args[0], args[1]);
        break;
      case OPS.nextLine:
        moverLinea(0, -g.lead);
        break;
      case OPS.setLeading:
        g = { ...g, lead: args[0] };
        break;
      case OPS.setCharSpacing:
        g = { ...g, cs: args[0] };
        break;
      case OPS.setWordSpacing:
        g = { ...g, ws: args[0] };
        break;
      case OPS.setHScale:
        g = { ...g, hs: args[0] / 100 };
        break;
      case OPS.setTextRise:
        g = { ...g, rise: args[0] };
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        mostrar(args[0]);
        break;
      case OPS.nextLineShowText:
        moverLinea(0, -g.lead);
        mostrar(args[0]);
        break;
      case OPS.nextLineSetSpacingShowText:
        g = { ...g, ws: args[0], cs: args[1] };
        moverLinea(0, -g.lead);
        mostrar(args[2]);
        break;
      // trazados
      case OPS.constructPath: {
        const [ops, c] = args;
        let k = 0;
        for (const op of ops) {
          if (op === OPS.rectangle) {
            const [x, y, w, h] = [c[k], c[k + 1], c[k + 2], c[k + 3]];
            k += 4;
            const esq = [P(g.ctm, x, y), P(g.ctm, x + w, y), P(g.ctm, x + w, y + h), P(g.ctm, x, y + h)];
            const xs = esq.map((p) => p[0]), ys = esq.map((p) => p[1]);
            camino.push(["re", new Caja(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))]);
            actual = inicio = esq[0];
          } else if (op === OPS.moveTo) {
            actual = inicio = P(g.ctm, c[k], c[k + 1]);
            k += 2;
          } else if (op === OPS.lineTo) {
            const p = P(g.ctm, c[k], c[k + 1]);
            k += 2;
            if (actual) camino.push(["l", actual, p]);
            actual = p;
          } else if (op === OPS.curveTo) {
            const p = P(g.ctm, c[k + 4], c[k + 5]);
            camino.push(["c", actual, P(g.ctm, c[k], c[k + 1]), P(g.ctm, c[k + 2], c[k + 3]), p]);
            k += 6;
            actual = p;
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            const p = P(g.ctm, c[k + 2], c[k + 3]);
            camino.push(["c", actual, P(g.ctm, c[k], c[k + 1]), p, p]);
            k += 4;
            actual = p;
          } else if (op === OPS.closePath) {
            if (actual && inicio && (actual[0] !== inicio[0] || actual[1] !== inicio[1])) camino.push(["l", actual, inicio]);
            actual = inicio;
          }
        }
        break;
      }
      case OPS.endPath:
        camino = [];
        actual = inicio = null;
        break;
      default:
        if (PINTA.has(fn)) {
          if (camino.length) dibujos.push(dibujo(PINTA.get(fn), camino, g));
          camino = [];
          actual = inicio = null;
        }
    }
  }
  cerrar();

  // Todos los spans (también los de solo espacios: cuentan como caracteres en las tablas);
  // `textos` son los que tienen algo escrito, como en el lector de Python.
  const spansTodos = spans.map((sp) => {
    const y0 = sp.base - sp.met[0] * sp.tam, y1 = sp.base + sp.met[1] * sp.tam;
    return {
      texto: sp.texto,
      caja: new Caja(sp.x0, y0, sp.x1, y1),
      fuente: sp.fuente,
      color: sp.color,
      linea: sp.linea,
      base: sp.base,
      tam: sp.tam,
      // descendente relativo: con él se calcula la caja «compacta» (alto = tamaño de letra)
      desc: sp.met[1] / (sp.met[0] + sp.met[1]),
      chars: sp.chars.map((c) => ({ c: c.c, caja: new Caja(c.x0, y0, c.x1, y1) })),
    };
  });
  const textos = spansTodos.filter((t) => t.texto.trim());
  const rellenos = dibujos.filter((d) => d.tipo.includes("f")).map((d) => ({ caja: d.caja, rgb: d.relleno }));
  const trazos = [];
  const lineas = [];
  for (const d of dibujos) {
    if (d.tipo.includes("s")) {
      for (const it of d.items) {
        if (it[0] === "re") trazos.push(it[1]);
        else if (it[0] === "l" && Math.abs(it[1][1] - it[2][1]) < 0.5) {
          const [a, b] = [it[1][0], it[2][0]].sort((p, q) => p - q);
          lineas.push([it[1][1], a, b]);
        }
      }
    }
    const r = d.caja;
    if (d.tipo.includes("f") && d.relleno.every((c) => c === 0) && r.alto < 1.5 && r.ancho > 5)
      lineas.push([(r.y0 + r.y1) / 2, r.x0, r.x1]);
  }
  return { ancho, alto, textos, spansTodos, rellenos, trazos, lineas, dibujos };
}

function dibujo(tipo, items, g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ver = (p) => {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  };
  for (const it of items) {
    if (it[0] === "re") {
      ver([it[1].x0, it[1].y0]);
      ver([it[1].x1, it[1].y1]);
    } else for (const p of it.slice(1)) if (p) ver(p);
  }
  return { tipo, relleno: tipo.includes("f") ? g.fill : null, items, caja: new Caja(x0, y0, x1, y1) };
}
