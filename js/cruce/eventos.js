// Generador de eventos y Vmax efectiva (SPEC §6.4 y §7; traducción de cruce/eventos.py).
//
// Un evento por cosa que el maquinista debe ver, en su `pk_acum`, con el pictograma que lo
// representa y la distancia de aviso de ese pictograma.
// Vmax efectiva en cada tramo = mín(V Max de la hoja, LTV que APLICA). Una LTV INCIERTA no la
// cambia, pero marca el tramo con `revisar` y su evento sale con estado «revisar».
// Con el cotejo del CVM (C2), donde la hoja da más rige el CVM y donde no coinciden queda «a
// revisar»; el cambio de velocidad por el CVM tiene su aviso (estado «revisar», datos.cvm).

import { segmentoDePunto, segmentos } from "./lineas.js";
import { textoViaCorto } from "./vias.js";
import { fmtG, palabras, redondear } from "../pdf/py.js";

// Orden de los eventos que caen en el mismo punto.
const ORDEN = [
  "ltv_fin",
  "cambio_linea",
  "cambio_bloqueo",
  "cambio_radio",
  "bifurcacion",
  "estacion",
  "apeadero",
  "parada_comercial",
  "parada_tecnica",
  "cambio_vmax_sube",
  "cambio_vmax_baja",
  "csv",
  "curva_nota",
  "ltv_inicio",
];
const RE_NOTA_V = /^\[(\d+)\]/;
const RE_NOTA_KM = /\bKM\.?\s*(\d+(?:[.,]\d+)?)/;

const conArchivo = (o, archivo) => (o.archivo ? o : { ...o, archivo });

/** Repositorio de pictogramas: {version, pictogramas}. */
export const porId = (repo, id) => repo.pictogramas.find((p) => p.id === id) ?? null;
export const paraTipo = (repo, tipo) => repo.pictogramas.find((p) => p.tipos.includes(tipo)) ?? null;

export function generar(ruta, ltv, cruce, tramos, pictos, cvm = null) {
  const [segs] = segmentos(ruta, tramos);
  const archivo = ruta.fuente.archivo;
  const crudos = []; // [pk_acum, tipo, datos, origen, estado, pictograma forzado]
  const add = (acum, tipo, datos, origen, estado = "ok", picto = null) => {
    if (acum !== null && acum !== undefined) crudos.push([redondear(acum, 3), tipo, datos, origen, estado, picto]);
  };
  const puntos = ruta.puntos;
  const marcasVmax = new Map(ruta.csv.filter((m) => m.columna === "vmax").map((m) => [m.punto, m]));
  let prev = null;
  puntos.forEach((p, i) => {
    if (p.pk_acum === null) return;
    const o = conArchivo(p.origen, archivo);
    const base = { nombre: p.nombre, hora: p.hora };
    if (p.tipo === "cambio_linea") {
      const seg = segmentoDePunto(segs, i);
      add(p.pk_acum, "cambio_linea", { nombre: p.nombre, pk: fmtG(p.pk), linea: seg ? seg.linea : null }, o);
    }
    if (p.tipo === "bifurcacion") add(p.pk_acum, "bifurcacion", base, o);
    else if (p.tipo === "apeadero") add(p.pk_acum, "apeadero", base, o);
    else if (p.nombre && i > 0) add(p.pk_acum, "estacion", base, o);
    if (p.tecn_min) add(p.pk_acum, "parada_tecnica", { min: fmtG(p.tecn_min), nombre: p.nombre }, o);
    if (p.tc_op) add(p.pk_acum, "parada_comercial", { min: p.tc_op, nombre: p.nombre }, o);
    if (prev !== null) {
      if (p.radio && prev.radio && p.radio !== prev.radio) add(p.pk_acum, "cambio_radio", { canal: p.radio, nombre: p.nombre }, o);
      if (p.bloqueo && prev.bloqueo && p.bloqueo !== prev.bloqueo) add(p.pk_acum, "cambio_bloqueo", { de: prev.bloqueo, a: p.bloqueo }, o);
      // La V Max de una fila rige en el tramo que llega a ella: el cambio está en la fila anterior.
      const marca = marcasVmax.get(i);
      if (marca)
        add(
          prev.pk_acum,
          "csv",
          { de: marca.v_anterior, a: marca.v_nueva, sin_cambio: !marca.cambia_vmax_tren, nombre: prev.nombre },
          conArchivo(marca.origen, archivo),
        );
      else if (p.vmax && prev.vmax && p.vmax !== prev.vmax)
        add(prev.pk_acum, p.vmax < prev.vmax ? "cambio_vmax_baja" : "cambio_vmax_sube", { de: prev.vmax, a: p.vmax }, o);
    }
    for (const nota of p.notas) {
      const mV = RE_NOTA_V.exec(nota), mKm = RE_NOTA_KM.exec(nota);
      let acum = p.pk_acum;
      if (mKm) {
        const seg = segmentoDePunto(segs, i);
        const pk = Number(mKm[1].replace(",", "."));
        acum = seg ? seg.acum(pk) : null;
        acum = acum !== null ? acum : p.pk_acum;
      }
      add(acum, "curva_nota", { nota, v: mV ? mV[1] : null, nombre: p.nombre }, o);
    }
    prev = p;
  });
  // Marcas CSV de nota (curvas marcadas en azul)
  for (const m of ruta.csv) {
    if (m.columna !== "nota") continue;
    const p = puntos[m.punto];
    const seg = segmentoDePunto(segs, m.punto);
    const acum = seg && m.pk !== null ? seg.acum(m.pk) : null;
    add(
      acum !== null ? acum : p.pk_acum,
      "csv",
      { de: m.v_anterior, a: m.v_nueva, sin_cambio: !m.cambia_vmax_tren, nota: m.texto, nombre: p.nombre },
      conArchivo(m.origen, archivo),
    );
  }
  // LTV
  const tramosLtv = [];
  if (ltv && cruce) {
    const porIdLtv = new Map(ltv.registros.map((r) => [r.id, r]));
    for (const res of cruce.resultados) {
      if (res.resultado === "NO_APLICA" || res.pk_acum_ini === null) continue;
      const r = porIdLtv.get(res.ltv);
      const estado = res.resultado === "APLICA" ? "ok" : "revisar";
      const textoV = palabras(r.velocidad.texto).join(" ");
      const datos = {
        v: res.velocidad !== null ? res.velocidad : textoV,
        de: vmaxEn(puntos, res.pk_acum_ini),
        motivo: r.motivo,
        nombre: r.trayecto.join(" – "),
        ltv: r.id,
        csv: r.csv,
        via: res.via_afectada ? textoViaCorto(r.via, res.via_afectada) : null,
        via_leyenda: res.via_afectada,
      };
      add(res.pk_acum_ini, "ltv_inicio", datos, r.origen, estado, r.csv ? "ltv_csv" : null);
      add(
        res.pk_acum_fin,
        "ltv_fin",
        { motivo: r.motivo, nombre: datos.nombre, v: datos.v, ltv: r.id, solo_cabeza: r.solo_cabeza, via: datos.via },
        r.origen,
        estado,
      );
      tramosLtv.push([res.pk_acum_ini, res.pk_acum_fin, res.velocidad, r.id, estado]);
    }
  }
  // CVM: dónde rige porque la hoja da más (aviso al empezar y al acabar).
  for (const t of cvm || []) {
    if (t.v === null) continue;
    const o = { archivo: t.archivo, pagina: t.pagina || 1, fila: null, bbox: null, texto: `línea ${t.linea} ${t.sentido}` };
    const datos = { cvm: true, linea: t.linea, pk_ini: t.pkIni, pk_fin: t.pkFin };
    add(t.ini, "cambio_vmax_baja", { ...datos, de: vmaxEn(puntos, t.ini), a: t.v, hoja: t.hoja }, o, "revisar");
    add(t.fin, "cambio_vmax_sube", { ...datos, de: t.v, a: vmaxTras(puntos, t.fin) }, o, "revisar");
  }
  // Dentro de una zona donde rige el CVM, un cambio de la hoja que no baja de la V Max del CVM no
  // cambia la velocidad que rige: no se avisa.
  const zonas = (cvm || []).filter((t) => t.v !== null).map((t) => [t.ini, t.fin, t.v]);
  if (zonas.length) {
    const tapado = ([acum, tipo, datos]) => {
      if ((tipo !== "cambio_vmax_baja" && tipo !== "cambio_vmax_sube") || datos.cvm) return false;
      const de = datos.de ?? null, a = datos.a ?? null;
      if (de === null || a === null) return false;
      return zonas.some(([i, f, v]) => i < acum && acum < f && Math.min(de, a) >= v);
    };
    for (let k = crudos.length - 1; k >= 0; k--) if (tapado(crudos[k])) crudos.splice(k, 1);
  }
  const idx = (t) => (ORDEN.includes(t) ? ORDEN.indexOf(t) : 99);
  crudos.sort((x, y) => x[0] - y[0] || idx(x[1]) - idx(y[1]) || x[3].pagina - y[3].pagina || (x[3].fila || 0) - (y[3].fila || 0));
  const eventos = crudos.map(([acum, tipo, datos, origen, estado, forzado], k) => {
    const picto = (forzado ? porId(pictos, forzado) : null) || paraTipo(pictos, tipo);
    return {
      id: `ev-${String(k + 1).padStart(4, "0")}`,
      tipo,
      pk_acum: acum,
      datos: Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== undefined)),
      pictograma: picto.id,
      aviso_km: picto.aviso,
      estado,
      fase: { ltv_inicio: "accion", ltv_fin: "restablecer" }[tipo] ?? null,
      origen,
    };
  });
  return {
    ruta: archivo,
    fuentes: [archivo, ...(ltv ? [ltv.fuente.archivo] : [])],
    vmax_efectiva: vmaxEfectiva(puntos, tramosLtv, cvm || []),
    eventos,
  };
}

/** V Max justo antes de `acum`: la de la primera fila en `acum` o después (rige en el tramo que llega a ella). */
function vmaxEn(puntos, acum) {
  for (const p of puntos) if (p.pk_acum !== null && p.pk_acum >= acum) return p.vmax;
  return null;
}

/** V Max de la hoja justo después de `acum`. */
function vmaxTras(puntos, acum) {
  for (const p of puntos) if (p.pk_acum !== null && p.pk_acum > acum) return p.vmax;
  return null;
}

function vmaxEfectiva(puntos, tramosLtv, tramosCvm) {
  const conAcum = puntos.filter((p) => p.pk_acum !== null);
  if (conAcum.length < 2) return [];
  const finRuta = conAcum.at(-1).pk_acum;
  const cortesSet = new Set(conAcum.map((p) => p.pk_acum));
  for (const [ini, fin] of tramosLtv) cortesSet.add(ini).add(fin);
  for (const t of tramosCvm) cortesSet.add(t.ini).add(t.fin);
  const cortes = [...cortesSet].filter((c) => 0 <= c && c <= finRuta).sort((x, y) => x - y);
  const res = [];
  for (let k = 0; k + 1 < cortes.length; k++) {
    const a = cortes[k], b = cortes[k + 1];
    if (b <= a) continue;
    const medio = (a + b) / 2;
    // La fila que cierra el tramo da su velocidad (rige desde la fila anterior).
    const vHoja = conAcum.find((p) => p.pk_acum > medio)?.vmax ?? null;
    const aplican = tramosLtv.filter((t) => t[0] <= medio && medio <= t[1] && t[4] === "ok");
    const dudosas = tramosLtv.filter((t) => t[0] <= medio && medio <= t[1] && t[4] === "revisar");
    const cvm = tramosCvm.filter((t) => t.ini <= medio && medio <= t.fin);
    let v = vHoja, fuente = "hoja", ltvId = null;
    for (const t of cvm) if (t.v !== null && (v === null || t.v < v)) [v, fuente] = [t.v, "cvm"];
    for (const t of aplican)
      if (t[2] !== null && (v === null || t[2] < v)) [v, fuente, ltvId] = [t[2], "ltv", t[3]];
    const tramo = { pk_acum_ini: a, pk_acum_fin: b, v, fuente, ltv: ltvId, revisar: dudosas.length > 0 || cvm.length > 0, cvm: cvm.length > 0 };
    const prev = res.at(-1);
    if (prev && prev.v === tramo.v && prev.fuente === tramo.fuente && prev.ltv === tramo.ltv && prev.revisar === tramo.revisar && prev.cvm === tramo.cvm)
      res[res.length - 1] = { ...prev, pk_acum_fin: b };
    else res.push(tramo);
  }
  return res;
}
