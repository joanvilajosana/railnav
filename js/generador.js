// Genera el paquete de ruta en el propio iPad a partir de los PDF (Fase 7). Sin DOM.
//
//   hoja de ruta (PDF) ─┐
//                        ├─ cruce (tabla de tramos) ─ eventos ─ paquete ─ app
//   DLTV (PDF) ──────────┘
//
// Es el mismo proceso que `python -m cruce.paquete`, traducido a JavaScript; las pruebas
// comparan los dos con el corpus. pdf.js analiza el PDF en su propio Worker; la lectura de
// tablas y el cruce corren aquí, cediendo el paso entre página y página.

import { leerHoja } from "./pdf/hoja.js";
import { leerLtv } from "./pdf/ltv.js";
import { cruzar } from "./cruce/cruce.js";
import { segmentos } from "./cruce/lineas.js";
import { construir } from "./cruce/paquete.js";
import { proponer } from "./cruce/proponer.js";

const fecha = (iso) => String(iso).split("-").reverse().join("/");

let pdfjs = null;

/** pdf.js se carga solo cuando hace falta (y queda en la caché para usarse sin conexión). */
export async function cargarPdfjs() {
  if (pdfjs) return pdfjs;
  const lib = await import("../vendor/pdfjs/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  // Solo se lee el contenido: no hace falta cargar las fuentes en el navegador.
  const getDocument = (opciones) => lib.getDocument({ disableFontFace: true, isEvalSupported: false, ...opciones });
  pdfjs = { ...lib, getDocument, OPS: lib.OPS };
  return pdfjs;
}

const bytes = async (archivo) => new Uint8Array(await archivo.arrayBuffer());

export async function leerHojaPdf(archivo) {
  return leerHoja(await bytes(archivo), archivo.name, await cargarPdfjs());
}

export async function leerDltvPdf(archivo, progreso) {
  return leerLtv(await bytes(archivo), archivo.name, await cargarPdfjs(), progreso);
}

/**
 * La tabla de tramos que corresponde a la hoja: la que tiene todos sus tramos en la hoja y
 * cubre la ruta de principio a fin. Primero las del maquinista (guardadas en el iPad).
 */
export function elegirTabla(ruta, tablas) {
  for (const t of tablas) {
    if (!t?.tramos?.length) continue;
    const [segs, avisos] = segmentos(ruta, t);
    if (avisos.some((a) => a.codigo === "TRAMO_NO_ENCONTRADO" || a.codigo === "SEGMENTO_SIN_LINEA")) continue;
    if (segs.every((s) => s.tramo)) return t;
  }
  return null;
}

/** Propuesta de tabla de tramos a partir del DLTV, para que el maquinista la confirme. */
export const proponerTabla = (ruta, ltv) => proponer(ruta, [ltv]);

/** ¿Cubre la semana del DLTV el día de la hoja? null si falta alguna fecha. */
export function dltvCubre(ruta, ltv) {
  const f = ruta.tren.fecha, s = ltv?.semana;
  if (!f || !s?.desde || !s?.hasta) return null;
  return s.desde <= f && f <= s.hasta;
}

/**
 * Paquete de ruta. Sin DLTV, solo la hoja. Con DLTV hace falta la tabla de tramos.
 * @returns {{paquete, cruce, avisos: string[]}}
 */
export function generarPaquete(ruta, ltv, tabla, pictos) {
  const avisos = [];
  let cruce = null;
  if (ltv) {
    if (!tabla) throw new Error("para cruzar con el DLTV hace falta la tabla de tramos");
    const [c, av] = cruzar(ruta, ltv, tabla);
    cruce = c;
    avisos.push(...av.map((a) => a.mensaje));
    if (dltvCubre(ruta, ltv) === false)
      avisos.push(`El DLTV nº ${ltv.numero ?? "?"} es de la semana del ${fecha(ltv.semana.desde)} al ${fecha(ltv.semana.hasta)} y la hoja es del ${fecha(ruta.tren.fecha)}: sus LTV no se aplican ese día.`);
  }
  for (const a of ruta.avisos) avisos.push(a.mensaje);
  const paquete = construir(ruta, ltv, cruce, tabla, pictos);
  return { paquete, cruce, avisos };
}

/** Recuento para el mensaje final: LTV que aplican y a revisar. */
export function recuento(cruce) {
  const r = { APLICA: 0, INCIERTA: 0, NO_APLICA: 0 };
  for (const x of cruce?.resultados ?? []) r[x.resultado]++;
  return r;
}
