// Lector del documento semanal de LTV de ADIF (DLTV, PDF) → ltv (SPEC §6.2).
// Traducción de parsers/ltv/parser.py; las pruebas comparan las dos salidas en el corpus.
//
// - La tabla se lee como page.find_tables() de PyMuPDF (tablas.js); las columnas se
//   identifican por el texto de su cabecera, no por posición.
// - Las filas «LÍNEA nnn …» fijan la línea de las restricciones que las siguen.
// - Los PK se guardan en el orden del documento, aunque decrezcan.
// - La leyenda de vías se lee de la tabla de dos columnas del propio PDF.
// - Sin fechas propias, una restricción tiene la vigencia de la semana del documento.

import { leerPagina } from "./geometria.js";
import { buscarTablas, caracteres, extraer } from "./tablas.js";
import { palabras, redondear, sha256 } from "./py.js";

const CABECERAS = {
  codigoltv: "codigo",
  trayectoestacion: "trayecto",
  via: "via",
  kmini: "pk_ini",
  kmfin: "pk_fin",
  veloc: "velocidad",
  motivo: "motivo",
  establecimiento: "establecimiento",
  finalizacionprevista: "finalizacion",
  horarioltv: "horario",
  desplazahacia: "desplaza_hacia",
  solovehiccabeza: "solo_cabeza",
  csv: "csv",
  observaciones: "observaciones",
};
const OBLIGATORIAS = ["codigo", "trayecto", "via", "pk_ini", "pk_fin", "velocidad"];

const RE_LINEA = /^L.NEA\s+(\d+)\b/i;
const RE_CODIGO = /^\((\d{4,})\)$/;
const RE_NUMERO = /^\d+(?:[.,]\d+)?$/;
const RE_PARTE = /(\d{1,3})\s*([A-Z*])/g;
const RE_FECHA = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_VIGOR = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/;
const RE_NUMERO_DOC = /^N.\s*(\d+)$/;

export class ErrorLTV extends Error {}

export function normalizar(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Texto de celda en una línea: los saltos de línea del PDF pasan a espacios.
const limpio = (t) => (t == null ? null : palabras(t).join(" ") || null);

function numero(t) {
  const s = (t || "").trim();
  return RE_NUMERO.test(s) ? Number(s.replace(",", ".")) : null;
}

// Fechas como texto ISO (AAAA-MM-DD), que es como van en el JSON.
function fechaISO(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}
function fecha(t) {
  const m = RE_FECHA.exec(t || "");
  return m ? fechaISO(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}
const masDias = (iso, n) => {
  const f = new Date(iso + "T00:00:00Z");
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
};

/** `160` → simple. `110V`, `65*`, `160* 120M` → partes con su marca, sin interpretar. */
export function velocidad(texto) {
  const bruto = (texto || "").trim();
  const compacto = palabras(bruto).join(" ");
  if (/^\d{1,3}$/.test(compacto) && Number(compacto) > 0 && Number(compacto) <= 400)
    return { texto: bruto, valor: Number(compacto), compuesta: null };
  const partes = [...compacto.matchAll(RE_PARTE)].map((m) => [m[1], m[2]]);
  const resto = compacto.replace(RE_PARTE, "").replaceAll("/", "").trim();
  if (partes.length && !resto && partes.every(([v]) => Number(v) > 0 && Number(v) <= 400))
    return { texto: bruto, valor: null, compuesta: partes.map(([v, s]) => ({ valor: Number(v), sufijo: s })) };
  return { texto: bruto, valor: null, compuesta: null };
}

/** `IRUN-\nSAN SEBASTIAN-DONOSTIA` → dos dependencias (guion al final de línea). */
export function trayecto(texto) {
  if (!texto || !texto.trim()) return [];
  return texto
    .trim()
    .split(/-\s*\n/)
    .filter((p) => p.trim())
    .map((p) => palabras(p).join(" "));
}

const marcada = (t) => !!(t && t.trim());

function cabecera(nombres) {
  const cols = {};
  nombres.forEach((n, i) => {
    const clave = CABECERAS[normalizar(n)];
    if (clave && !(clave in cols)) cols[clave] = i;
  });
  return cols;
}

function cajaDe(celdas) {
  const ps = celdas.filter(Boolean);
  if (!ps.length) return null;
  return [
    redondear(Math.min(...ps.map((c) => c.x0)), 2),
    redondear(Math.min(...ps.map((c) => c.y0)), 2),
    redondear(Math.max(...ps.map((c) => c.x1)), 2),
    redondear(Math.max(...ps.map((c) => c.y1)), 2),
  ];
}
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

function vigencia(celdas, cols, semana) {
  const fechaDe = (nombre) => {
    const i = cols[nombre];
    if (i === undefined) return null;
    // La cabecera ocupa dos columnas (fecha y hora); la fecha puede estar en cualquiera.
    return fecha(celdas[i]) || (i + 1 < celdas.length ? fecha(celdas[i + 1]) : null);
  };
  const desde = fechaDe("establecimiento"), hasta = fechaDe("finalizacion");
  if (desde || hasta) {
    if (desde && hasta && desde > hasta) return { tipo: "desconocida", desde: null, hasta: null };
    return { tipo: "declarada", desde, hasta };
  }
  if (semana) return { ...semana };
  return { tipo: "desconocida", desde: null, hasta: null };
}

// Texto de la página como page.get_text("text"): una línea por línea de texto.
function textoPagina(geo) {
  const lineas = new Map();
  for (const t of geo.spansTodos) lineas.set(t.linea, (lineas.get(t.linea) ?? "") + t.texto);
  return [...lineas.values()].map((l) => l + "\n").join("");
}

/**
 * Lee el DLTV.
 * @param {Uint8Array} datos  el PDF
 * @param {string} archivo    nombre del archivo
 * @param {object} pdfjs      la biblioteca pdf.js (getDocument, OPS)
 * @param {(hecho: number, total: number) => void} [progreso]
 */
export async function leerLtv(datos, archivo, pdfjs, progreso = () => {}) {
  const sha = await sha256(datos);
  const doc = await pdfjs.getDocument({ data: datos.slice(), verbosity: 0 }).promise;
  const avisos = [];
  const registros = [];
  const leyenda = new Map();
  const vistos = new Set();
  const origen = (b, celdas) => ({
    archivo,
    pagina: b.pagina,
    fila: b.fila,
    bbox: b.caja,
    texto: celdas.map((c) => limpio(c) ?? "").join(" | "),
  });
  let nPaginas, numeroDoc = null, semana = null;
  const brutas = [];
  try {
    nPaginas = doc.numPages;
    let columnas = null, linea = null, lineaTexto = null;
    for (let n = 1; n <= nPaginas; n++) {
      const geo = await leerPagina(await doc.getPage(n), pdfjs.OPS);
      if (n === 1) {
        const texto = textoPagina(geo);
        const vigor = RE_VIGOR.exec(texto);
        const inicio = vigor ? fecha(vigor[1]) : null;
        for (const l of texto.split(/\r\n|\r|\n/)) {
          const m = RE_NUMERO_DOC.exec(l);
          if (m) {
            numeroDoc = m[1];
            break;
          }
        }
        if (inicio) semana = { tipo: "semana_documento", desde: inicio, hasta: masDias(inicio, 6) };
        else avisos.push({ codigo: "SIN_FECHA_VIGOR", mensaje: "no se encuentra la fecha", origen: null });
      }
      // 1) Filas brutas. Una fila sin código que sigue a una restricción es la continuación
      //    de sus celdas (el PDF parte en dos filas las celdas de varias líneas).
      const chars = caracteres(geo, n);
      for (const tabla of buscarTablas(geo, chars)) {
        extraer(tabla, chars).forEach((fila, k) => {
          const i = k + 1;
          const celdas = fila.map((c) => (c === null ? "" : c));
          if (celdas.length === 2) {
            const [cod, desc] = celdas.map(limpio);
            if (cod && desc && normalizar(cod) !== "codigo") leyenda.set(cod, desc);
            return;
          }
          const cab = cabecera(fila);
          if (OBLIGATORIAS.every((c) => c in cab)) {
            columnas = cab;
            return;
          }
          if (columnas === null || celdas.length <= Math.max(...Object.values(columnas))) return;
          const primera = limpio(celdas[columnas.codigo]) || "";
          const caja = cajaDe(tabla.filas[i - 1].celdas);
          let m;
          if ((m = RE_LINEA.exec(primera))) {
            linea = m[1];
            lineaTexto = primera;
            return;
          }
          if ((m = RE_CODIGO.exec(primera))) {
            brutas.push({ codigo: m[1], celdas, columnas, pagina: n, fila: i, caja, linea, lineaTexto });
          } else if (!primera && brutas.length && celdas.some((c) => c.trim())) {
            const previa = brutas.at(-1);
            if (previa.celdas.length !== celdas.length) throw new ErrorLTV(`página ${n}: fila de continuación con otro número de columnas`);
            previa.celdas = previa.celdas.map((a, j) => (a && celdas[j] ? a + "\n" + celdas[j] : a || celdas[j]));
            if (previa.pagina === n && previa.caja && caja) previa.caja = union(previa.caja, caja);
          }
        });
      }
      progreso(n, nPaginas);
    }
  } finally {
    await doc.destroy();
  }

  // 2) Restricciones
  for (const b of brutas) {
    const { codigo, celdas, columnas: cols } = b;
    const col = (nombre) => (cols[nombre] !== undefined ? celdas[cols[nombre]] : null);
    const org = origen(b, celdas);
    const aviso = (c, mensaje) => avisos.push({ codigo: c, mensaje, origen: org });
    if (vistos.has(codigo)) {
      aviso("CODIGO_REPETIDO", `el código LTV ${codigo} aparece más de una vez`);
      continue;
    }
    vistos.add(codigo);
    if (b.linea === null) aviso("SIN_LINEA", `LTV ${codigo} antes de cualquier cabecera de línea`);
    const vel = velocidad(col("velocidad"));
    if (vel.valor === null && vel.compuesta === null) aviso("VELOCIDAD_NO_INTERPRETADA", `LTV ${codigo}: velocidad «${limpio(vel.texto) ?? "None"}»`);
    const tray = trayecto(col("trayecto"));
    if (tray.length > 2) aviso("TRAYECTO_AMBIGUO", `LTV ${codigo}: trayecto en ${tray.length} partes: ${tray.join(" / ")}`);
    if (tray.some((p) => p.endsWith("-"))) aviso("TRAYECTO_INCOMPLETO", `LTV ${codigo}: trayecto «${limpio(col("trayecto")) ?? "None"}»`);
    registros.push({
      id: `ltv-${codigo}`,
      linea: b.linea,
      linea_texto: b.lineaTexto,
      via: limpio(col("via")),
      pk_ini: numero(col("pk_ini")),
      pk_fin: numero(col("pk_fin")),
      velocidad: vel,
      motivo: limpio(col("motivo")),
      trayecto: tray,
      vigencia: vigencia(celdas, cols, semana),
      csv: marcada(col("csv")),
      solo_cabeza: marcada(col("solo_cabeza")),
      horario: limpio(col("horario")),
      desplaza_hacia: limpio(col("desplaza_hacia")),
      observaciones: limpio(col("observaciones")),
      origen: org,
    });
  }
  if (!registros.length) throw new ErrorLTV("no se ha encontrado ninguna restricción en la tabla");
  if (!leyenda.size) avisos.push({ codigo: "SIN_LEYENDA", mensaje: "no se encuentra la leyenda de vías", origen: null });
  for (const r of registros)
    if (r.via && leyenda.size && !leyenda.has(r.via))
      avisos.push({ codigo: "VIA_FUERA_DE_LEYENDA", mensaje: `${r.id}: vía «${r.via}» no está en la leyenda`, origen: r.origen });
  return {
    fuente: { archivo, paginas: nPaginas, sha256: sha },
    numero: numeroDoc,
    semana,
    leyenda_vias: Object.fromEntries(leyenda),
    registros,
    avisos,
  };
}
