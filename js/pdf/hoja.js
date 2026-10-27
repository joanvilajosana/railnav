// Lector de la hoja de ruta de ADIF (PLANIF/MALLAS, PDF con texto) → ruta (SPEC §6.1).
// Traducción de parsers/hoja/parser.py; las pruebas comparan las dos salidas en el corpus.
//
// Cómo se lee la tabla:
// - Las columnas salen de las celdas de la cabecera («Dependencia», «V Max»…), no de
//   coordenadas fijas: así sirve para los dos formatos.
// - Las filas son las líneas de texto de las columnas de fila (Sit Km, Dependencia, Hora…).
// - V Max, Bloqueo y Radio son celdas combinadas de varias filas: se leen de los rectángulos
//   trazados y cada fila toma el valor de la celda que la contiene.
// - CSV: ADIF marca la celda de V Max (o la fila de nota) con relleno azul y texto blanco. Se
//   detecta ese relleno; nunca se calcula.

import { Caja, esAzulAdif, esDeColor, esSimbolo, leerPagina } from "./geometria.js";
import { W, minPor, normalizar, numero, ordenar, palabras, redondear, sha256 } from "./py.js";

export const AVISO_SIN_COLOR = "SIN_COLOR";

const COLUMNAS = {
  bloqueo: "bloqueo",
  vmax: "vmax",
  sitkm: "km",
  dependencia: "dependencia",
  tcop: "tc_op",
  hora: "hora",
  tecn: "tecn",
  conc: "conc",
  radio: "radio",
};
const COMBINADAS = ["vmax", "bloqueo", "radio"];
const DE_FILA = ["km", "dependencia", "tc_op", "hora", "tecn", "conc"];
const OBLIGATORIAS = ["vmax", "km", "dependencia"];
const MESES = Object.fromEntries(
  ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map((m, i) => [m, i + 1]),
);
const TOL = 1.5;
const TOL_FILA = 3.5;

const RE_PK = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/;
const RE_HORA = /^(\d{1,2}):(\d{2})(½)?$/;
const RE_MINUTOS = /^(\d+(?:[.,]\d+)?)?(½)?$/;
const RE_RADIO = new RegExp(`^\\((${W}+)\\)$`, "u");
const RE_NOTA = /^\[(\d+)\]/;
const RE_KM_NOTA = /\bKM\.?\s*(\d+(?:[.,]\d+)?)/;
const RE_AL_PASO = /AL PASO POR\s+(.+?)\s*$/;
const RE_FECHA = new RegExp(`^(\\d{1,2})\\s+([A-Za-z]{3})${W}*\\s+(\\d{2,4})$`, "u");

export class ErrorHoja extends Error {}

const aviso = (codigo, mensaje, origen = null) => ({ codigo, mensaje, origen });
const origen = ({ pagina, fila = null, bbox = null, texto = null }) => ({ archivo: null, pagina, fila, bbox, texto });
const unirStrip = (ts) => ts.map((t) => t.texto.trim()).join(" ");

// ---------------------------------------------------------------- estructura de página

const esNota = (fila) => RE_NOTA.test(fila.textos.dependencia ?? "") && !("km" in fila.textos);
const literal = (fila) =>
  DE_FILA.map((c) => fila.textos[c])
    .filter((p) => p)
    .join(" | ");

function cabecera(numero, txt, fills, trazos) {
  const dep = txt.filter((t) => normalizar(t.texto) === "dependencia");
  if (!dep.length) throw new ErrorHoja(`página ${numero}: no se encuentra la cabecera «Dependencia»`);
  const ref = minPor(dep, (t) => t.caja.y0);
  const enRef = fills.filter((f) => f.caja.contiene(ref.caja.cx, ref.caja.cy));
  let candidatas = enRef.map((f) => f.caja);
  const color = enRef.some(esDeColor);
  if (!candidatas.length) candidatas = trazos.filter((c) => c.contiene(ref.caja.cx, ref.caja.cy) && c.alto < 80);
  if (!candidatas.length) throw new ErrorHoja(`página ${numero}: no se encuentra la celda de cabecera`);
  const banda = minPor(candidatas, (c) => c.alto);
  // Python usa un set de Caja (dataclass congelada): se quitan las repetidas por valor.
  const vistas = new Set();
  const celdas = [];
  for (const c of [...fills.map((f) => f.caja), ...trazos]) {
    if (!(Math.abs(c.y0 - banda.y0) <= TOL && Math.abs(c.y1 - banda.y1) <= TOL && c.x1 - c.x0 < 300)) continue;
    const k = [c.x0, c.y0, c.x1, c.y1].join(",");
    if (vistas.has(k)) continue;
    vistas.add(k);
    celdas.push(c);
  }
  const columnas = {};
  for (const c of ordenar(celdas, (c) => [c.x0])) {
    const dentro = ordenar(
      txt.filter((t) => c.contiene(t.caja.cx, t.caja.cy)),
      (t) => [redondear(t.caja.y0), t.caja.x0],
    );
    const clave = COLUMNAS[normalizar(dentro.map((t) => t.texto).join(""))];
    if (clave && !(clave in columnas)) columnas[clave] = [c.x0, c.x1];
  }
  const faltan = OBLIGATORIAS.filter((c) => !(c in columnas));
  if (faltan.length) throw new ErrorHoja(`página ${numero}: faltan columnas en la cabecera: ${faltan.join(", ")}`);
  return { columnas, banda, color };
}

function fondoTabla(txt, trazos, cab, altoPagina) {
  const marcos = trazos.filter((c) => c.y0 <= cab.y0 + TOL && c.y1 > cab.y1 + 50 && c.x1 - c.x0 > 300);
  if (marcos.length) {
    let m = marcos[0];
    for (const c of marcos) if (c.alto > m.alto) m = c; // max(): el primero de los mayores
    return m.y1;
  }
  const pies = txt.filter((t) => normalizar(t.texto).startsWith("pagina")).map((t) => t.caja.y0);
  return pies.length ? Math.min(...pies) - 2 : altoPagina;
}

function enColumna(x, columnas) {
  for (const [clave, [x0, x1]] of Object.entries(columnas)) if (x0 - TOL <= x && x <= x1 + TOL) return clave;
  return null;
}

function leerTabla(geo, numero) {
  const { textos: txt, rellenos: fills, trazos, lineas } = geo;
  const { columnas, banda: cab, color } = cabecera(numero, txt, fills, trazos);
  const fondo = fondoTabla(txt, trazos, cab, geo.alto);
  const avisos = [];
  const enTabla = (c) => c.cy > cab.y1 + TOL && c.cy < fondo;

  // Filas: textos de las columnas de fila agrupados por altura.
  const deFila = [];
  for (const t of txt) {
    if (esSimbolo(t) || !enTabla(t.caja)) continue;
    const col = enColumna(t.caja.cx, columnas);
    if (DE_FILA.includes(col)) deFila.push([t, col]);
  }
  const grupos = [];
  for (const [t, col] of ordenar(deFila, (p) => [p[0].caja.cy, p[0].caja.x0])) {
    if (grupos.length && Math.abs(t.caja.cy - grupos.at(-1)[0][0].caja.cy) <= TOL_FILA) grupos.at(-1).push([t, col]);
    else grupos.push([[t, col]]);
  }
  const xs = Object.values(columnas);
  const xIni = Math.min(...xs.map((c) => c[0])), xFin = Math.max(...xs.map((c) => c[1]));
  const filas = grupos.map((grupo, i) => {
    const porCol = {};
    for (const [t, col] of grupo) (porCol[col] ??= []).push(t);
    const valores = {};
    for (const [col, ts] of Object.entries(porCol)) valores[col] = unirStrip(ordenar(ts, (t) => [t.caja.x0]));
    const y0 = Math.min(...grupo.map(([t]) => t.caja.y0));
    const y1 = Math.max(...grupo.map(([t]) => t.caja.y1));
    return { pagina: numero, indice: i + 1, caja: new Caja(xIni, y0, xFin, y1), textos: valores, celdas: {}, csvNota: null };
  });

  // Celdas combinadas: la columna se corta por los bordes horizontales dibujados en ella.
  for (const col of COMBINADAS) {
    if (!(col in columnas)) continue;
    const [x0, x1] = columnas[col];
    const bordes = [cab.y1, fondo];
    for (const c of trazos) if (Math.abs(c.x0 - x0) <= TOL && Math.abs(c.x1 - x1) <= TOL) bordes.push(c.y0, c.y1);
    for (const [y, a, b] of lineas) if (a <= x0 + TOL && b >= x1 - TOL) bordes.push(y);
    const cortes = [];
    for (const y of bordes.filter((y) => cab.y1 - TOL <= y && y <= fondo + TOL).sort((p, q) => p - q))
      if (!cortes.length || y - cortes.at(-1) > 1.0) cortes.push(y);
    for (let k = 0; k + 1 < cortes.length; k++) {
      const [y0, y1] = [cortes[k], cortes[k + 1]];
      if (y1 - y0 < 2) continue;
      const caja = new Caja(x0, y0, x1, y1);
      const dentro = ordenar(
        txt.filter((t) => !esSimbolo(t) && caja.contiene(t.caja.cx, t.caja.cy)),
        (t) => [redondear(t.caja.y0), t.caja.x0],
      );
      const celda = { columna: col, caja, texto: unirStrip(dentro).trim(), pagina: numero, csv: null, heredada: false };
      for (const fila of filas) if (caja.y0 <= fila.caja.cy && fila.caja.cy <= caja.y1) fila.celdas[col] = celda;
    }
  }

  // CSV: rellenos azules de una sola fila dentro de la tabla.
  for (const f of fills) {
    if (!(esAzulAdif(f) && enTabla(f.caja) && f.caja.alto < 30)) continue;
    const col = enColumna(f.caja.cx, columnas);
    if (col === "vmax") {
      const celdas = [...new Set(filas.map((fl) => fl.celdas.vmax).filter(Boolean))];
      const celda = celdas.find((c) => c.caja.contiene(f.caja.cx, f.caja.cy));
      if (celda) {
        celda.csv = f;
        continue;
      }
    } else if (col === "dependencia") {
      const nota = filas.find((fl) => f.caja.contiene(fl.caja.cx, fl.caja.cy));
      if (nota) {
        nota.csvNota = f;
        continue;
      }
    }
    avisos.push(
      aviso(
        "CSV_SIN_ASIGNAR",
        `página ${numero}: marca azul en la columna ${col === null ? "None" : col} sin celda asociada`,
        origen({ pagina: numero, bbox: f.caja.tupla() }),
      ),
    );
  }
  return { numero, columnas, cabecera: cab, color, filas, avisos };
}

// ---------------------------------------------------------------- cabecera del tren

function leerTren(txt, avisos) {
  const etiqueta = (...nombres) => {
    const hits = txt.filter((t) => nombres.includes(normalizar(t.texto)));
    return hits.length ? minPor(hits, (t) => t.caja.y0) : null;
  };
  const aLaDerecha = (e, hasta = null) =>
    e
      ? ordenar(
          txt.filter(
            (t) =>
              t !== e &&
              Math.abs(t.caja.cy - e.caja.cy) <= 4 &&
              t.caja.x0 >= e.caja.x1 - 1 &&
              (hasta === null || t.caja.x1 <= hasta.caja.x0 + 1),
          ),
          (t) => [t.caja.x0],
        )
      : [];
  const debajo = (e) => {
    if (!e) return null;
    const cand = txt.filter(
      (t) => e.caja.y1 < t.caja.y0 && t.caja.y0 < e.caja.y1 + 16 && e.caja.x0 - 25 <= t.caja.cx && t.caja.cx <= e.caja.x1 + 25,
    );
    if (!cand.length) return null;
    return minPor(cand, (t) => Math.abs(t.caja.cx - e.caja.cx)).texto.trim() || null;
  };

  const trenE = etiqueta("tren"), origenE = etiqueta("origen"), destinoE = etiqueta("destino");
  const trasTren = aLaDerecha(trenE, origenE)
    .map((t) => t.texto.trim())
    .filter(Boolean);
  if (!trasTren.length) throw new ErrorHoja("no se encuentra el número de tren");
  const numeroTren = trasTren[0], resto = trasTren.slice(1).join(" ");
  let clase = null;
  if (normalizar(resto).includes("mercancia")) clase = "mercancias";
  else if (normalizar(resto).includes("viajero")) clase = "viajeros";
  else avisos.push(aviso("CLASE_DESCONOCIDA", `clase de tren no reconocida: «${resto}»`));

  let fecha = null;
  const diaE = txt.find((t) => normalizar(t.texto).startsWith("documentovalido")) ?? null;
  const lit = aLaDerecha(diaE)
    .map((t) => t.texto.trim())
    .join(" ");
  const m = RE_FECHA.exec(lit);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    const anyo = Number(m[3]) + (m[3].length === 2 ? 2000 : 0);
    if (mes) {
      const d = new Date(Date.UTC(anyo, mes - 1, Number(m[1])));
      if (d.getUTCDate() !== Number(m[1])) throw new ErrorHoja(`fecha imposible: «${lit}»`);
      fecha = `${String(anyo).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
    }
  }
  if (fecha === null) avisos.push(aviso("FECHA_ILEGIBLE", `fecha no reconocida: «${lit}»`));

  const peso = debajo(etiqueta("peso"));
  let masa = null;
  if (peso) {
    try {
      masa = numero(peso);
    } catch {
      avisos.push(aviso("PESO_ILEGIBLE", `peso no reconocido: «${peso}»`));
    }
  }
  const unir = (ts) => ts.map((t) => t.texto.trim()).join(" ").trim() || null;
  return {
    numero: numeroTren,
    tipo: debajo(etiqueta("tipo")),
    clase,
    masa_t: masa && masa > 0 ? masa : null,
    locomotora: debajo(etiqueta("locomotora")),
    origen: unir(aLaDerecha(origenE, destinoE)),
    destino: unir(aLaDerecha(destinoE)),
    fecha,
  };
}

// ---------------------------------------------------------------- de filas a puntos

function minutos(texto) {
  if (!texto) return null;
  const m = RE_MINUTOS.exec(texto.trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (m[1] !== undefined ? numero(m[1]) : 0) + (m[2] ? 0.5 : 0);
}

function hora(texto) {
  if (!texto) return null;
  const m = RE_HORA.exec(texto.trim());
  if (!m || Number(m[1]) > 23) return null;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}` + (m[3] ? ":30" : "");
}

function nombre(texto) {
  if (!texto) return null;
  return palabras(texto.replace(/\.{2,}\s*$/, "")).join(" ") || null;
}

const palabrasN = (texto) =>
  texto
    .split(new RegExp(`(?:(?!${W}).)+`, "su"))
    .map(normalizar)
    .filter(Boolean);

// ¿La dependencia `nom` es la que cita una nota? (ver parser.py, _mismo_nombre)
function mismoNombre(nom, objetivo) {
  if (!nom) return false;
  const propio = normalizar(nom), citado = normalizar(objetivo);
  if (propio.length >= 4 && citado.length >= 4 && (propio.startsWith(citado) || citado.startsWith(propio))) return true;
  const a = palabrasN(nom), b = palabrasN(objetivo);
  return a.length === b.length && a.length >= 2 && a.every((x, i) => b[i].startsWith(x));
}

const vmaxDe = (t) => (/^\d{1,3}$/.test(t) && Number(t) > 0 && Number(t) <= 400 ? Number(t) : null);
const cambia = (anterior, nueva) => !(anterior !== null && anterior === nueva);

/**
 * Lee la hoja de ruta.
 * @param {Uint8Array} datos  el PDF
 * @param {string} archivo    nombre del archivo (va a `fuente.archivo`)
 * @param {object} pdfjs      la biblioteca pdf.js (getDocument, OPS)
 */
export async function leerHoja(datos, archivo, pdfjs) {
  const sha = await sha256(datos);
  const doc = await pdfjs.getDocument({ data: datos.slice(), verbosity: 0 }).promise;
  const avisos = [];
  let tren, paginas;
  try {
    const geos = [];
    for (let n = 1; n <= doc.numPages; n++) geos.push(await leerPagina(await doc.getPage(n), pdfjs.OPS));
    tren = leerTren(geos[0].textos, avisos);
    paginas = geos.map((g, i) => leerTabla(g, i + 1));
  } finally {
    await doc.destroy();
  }
  const nPaginas = paginas.length;
  for (const p of paginas) avisos.push(...p.avisos);

  // Una celda combinada que sigue de la página anterior puede no repetir su valor.
  for (let k = 0; k + 1 < paginas.length; k++) {
    const previa = paginas[k], pagina = paginas[k + 1];
    if (!previa.filas.length || !pagina.filas.length) continue;
    for (const col of COMBINADAS) {
      const ultima = previa.filas.at(-1).celdas[col], primera = pagina.filas[0].celdas[col];
      if (ultima && primera && !primera.texto && ultima.texto) {
        primera.texto = ultima.texto;
        primera.heredada = true;
      }
    }
  }
  const color = paginas.every((p) => p.color);
  if (!color) avisos.push(aviso(AVISO_SIN_COLOR, "La hoja no trae colores: no se pueden leer los CSV marcados en azul."));

  // Filas en orden documental; la primera fila de una página que repite la última de la
  // anterior es una continuación y no crea otro punto ni otra nota.
  const filas = [];
  const alias = new Map(); // fila repetida → índice en `filas`
  for (const p of paginas) {
    p.filas.forEach((fila, i) => {
      const ultima = filas.length ? filas.at(-1) : null;
      if (
        i === 0 &&
        esNota(fila) &&
        ultima &&
        esNota(ultima) &&
        ultima.pagina === p.numero - 1 &&
        fila.textos.dependencia === ultima.textos.dependencia
      ) {
        alias.set(fila, filas.length - 1);
        if (fila.csvNota && !ultima.csvNota) ultima.csvNota = fila.csvNota;
        return;
      }
      const previa = [...filas].reverse().find((f) => !esNota(f)) ?? null;
      if (
        i === 0 &&
        previa &&
        previa.pagina === p.numero - 1 &&
        !esNota(fila) &&
        fila.textos.km === previa.textos.km &&
        fila.textos.dependencia === previa.textos.dependencia
      ) {
        alias.set(fila, filas.indexOf(previa));
        for (const col of COMBINADAS) {
          const cAnt = previa.celdas[col], cNue = fila.celdas[col];
          if (cAnt && cNue && cAnt.texto !== cNue.texto)
            avisos.push(
              aviso(
                "CONTINUACION_DIFIERE",
                `página ${p.numero}: la fila repetida del PK ${fila.textos.km ?? "None"} trae ${col} «${cNue.texto}» y la anterior «${cAnt.texto}»`,
                origen({ pagina: p.numero, fila: fila.indice }),
              ),
            );
        }
        return;
      }
      filas.push(fila);
    });
  }

  const puntos = [];
  const puntoDeFila = new Map();
  const notasDoc = []; // [fila de nota, índice del punto anterior o -1]
  let pkPrev = null, acum = null;

  for (const fila of filas) {
    if (esNota(fila)) {
      notasDoc.push([fila, puntos.length - 1]);
      continue;
    }
    const km = fila.textos.km;
    let pk = null, pkAnt = null;
    if (km) {
      const m = RE_PK.exec(km);
      if (m) {
        if (m[2] !== undefined) [pkAnt, pk] = [numero(m[1]), numero(m[2])];
        else pk = numero(m[1]);
      } else avisos.push(aviso("PK_ILEGIBLE", `PK no reconocido: «${km}»`, origen({ pagina: fila.pagina, fila: fila.indice })));
    }
    if (pk !== null) {
      if (acum === null) acum = 0.0;
      else acum += pkPrev !== null ? Math.abs((pkAnt !== null ? pkAnt : pk) - pkPrev) : 0.0;
      pkPrev = pk;
    }
    const nom = nombre(fila.textos.dependencia);
    let tipo;
    if (pkAnt !== null) tipo = "cambio_linea";
    else if (nom && nom.includes("(APD)")) tipo = "apeadero";
    else if (nom && nom.startsWith("BIF")) tipo = "bifurcacion";
    else if (nom) tipo = "estacion";
    else tipo = "otro";

    const celda = (col) => {
      const c = fila.celdas[col];
      return c && c.texto ? c.texto : null;
    };
    const vmaxTxt = celda("vmax"), radioTxt = celda("radio");
    const vmax = vmaxTxt ? vmaxDe(vmaxTxt) : null;
    if (vmaxTxt && vmax === null)
      avisos.push(aviso("VMAX_ILEGIBLE", `V Max no reconocida: «${vmaxTxt}»`, origen({ pagina: fila.pagina, fila: fila.indice })));
    let radio = null;
    if (radioTxt) {
      const m = RE_RADIO.exec(radioTxt.replaceAll(" ", ""));
      if (m) radio = m[1];
      else
        avisos.push(
          aviso("RADIO_ILEGIBLE", `canal de radio no reconocido: «${radioTxt}»`, origen({ pagina: fila.pagina, fila: fila.indice })),
        );
    }
    const horaTxt = fila.textos.hora;
    const h = hora(horaTxt);
    if (horaTxt && h === null)
      avisos.push(aviso("HORA_ILEGIBLE", `hora no reconocida: «${horaTxt}»`, origen({ pagina: fila.pagina, fila: fila.indice })));
    puntoDeFila.set(fila, puntos.length);
    puntos.push({
      pk,
      pk_acum: pk !== null && acum !== null ? redondear(acum, 3) : null,
      pk_linea_anterior: pkAnt,
      linea: null,
      nombre: nom,
      tipo,
      hora: h,
      vmax,
      tecn_min: minutos(fila.textos.tecn),
      conc_min: minutos(fila.textos.conc),
      tc_op: fila.textos.tc_op ?? null,
      radio,
      bloqueo: celda("bloqueo"),
      notas: [],
      csv: false,
      origen: origen({ pagina: fila.pagina, fila: fila.indice, bbox: fila.caja.tupla(), texto: literal(fila) }),
    });
  }

  // Notas: van con el punto anterior, salvo «AL PASO POR <dependencia>», que va con ella.
  for (const [fila, previo] of notasDoc) {
    const texto = fila.textos.dependencia;
    let destino = previo >= 0 ? previo : puntos.length ? 0 : null;
    const m = RE_AL_PASO.exec(texto);
    if (m) {
      const objetivo = m[1];
      const cercanos = [];
      for (let i = previo + 1; i < Math.min(previo + 6, puntos.length); i++) cercanos.push(i);
      if (previo >= 0) cercanos.push(previo);
      const hit = cercanos.find((i) => mismoNombre(puntos[i].nombre, objetivo));
      if (hit !== undefined) destino = hit;
      else
        avisos.push(
          aviso("NOTA_SIN_DEPENDENCIA", `no se encuentra la dependencia de la nota «${texto}»`, origen({ pagina: fila.pagina, fila: fila.indice })),
        );
    }
    if (destino === null) {
      avisos.push(aviso("NOTA_SIN_PUNTO", texto));
      continue;
    }
    puntos[destino].notas.push(texto);
    puntoDeFila.set(fila, destino);
  }
  for (const [filaRep, idx] of alias) puntoDeFila.set(filaRep, puntoDeFila.get(filas[idx]));

  // Marcas CSV
  const marcas = [];
  const vistas = new Set();
  const todas = paginas.flatMap((p) => p.filas);
  for (const fila of todas) {
    const c = fila.celdas.vmax;
    if (c && c.csv && !vistas.has(c)) {
      vistas.add(c);
      const cubiertas = todas.filter((f) => f.celdas.vmax === c && !esNota(f));
      if (cubiertas.length && puntoDeFila.has(cubiertas[0])) {
        const i = puntoDeFila.get(cubiertas[0]);
        const anterior = puntos.slice(0, i).reverse().find((p) => p.vmax !== null)?.vmax ?? null;
        marcas.push({
          punto: i,
          columna: "vmax",
          texto: c.texto,
          cambia_vmax_tren: cambia(anterior, vmaxDe(c.texto)),
          pk: puntos[i].pk,
          v_anterior: anterior,
          v_nueva: vmaxDe(c.texto),
          origen: origen({ pagina: c.pagina, bbox: c.csv.caja.tupla(), texto: c.texto }),
        });
      }
    }
    if (fila.csvNota && puntoDeFila.has(fila) && !alias.has(fila)) {
      const i = puntoDeFila.get(fila);
      const texto = fila.textos.dependencia;
      const v = RE_NOTA.exec(texto);
      const km = RE_KM_NOTA.exec(texto);
      const vNota = v && Number(v[1]) > 0 && Number(v[1]) <= 400 ? Number(v[1]) : null;
      marcas.push({
        punto: i,
        columna: "nota",
        texto,
        cambia_vmax_tren: cambia(puntos[i].vmax, vNota),
        pk: km ? numero(km[1]) : puntos[i].pk,
        v_anterior: puntos[i].vmax,
        v_nueva: vNota,
        origen: origen({ pagina: fila.pagina, fila: fila.indice, bbox: fila.csvNota.caja.tupla(), texto }),
      });
    }
  }
  marcas.sort((a, b) => a.punto - b.punto || (a.columna < b.columna ? -1 : a.columna > b.columna ? 1 : 0));
  for (const m of marcas) puntos[m.punto].csv = true;

  const ruta = {
    tren,
    fuente: { archivo, paginas: nPaginas, sha256: sha },
    color_disponible: color,
    puntos,
    csv: marcas,
    avisos,
  };
  if (!puntos.length) throw new ErrorHoja("la hoja no tiene puntos");
  return ruta;
}
