// Telefonemas: el registro de los que recibe el maquinista (número, hora, emisor, receptor,
// mensaje y firma) y lo que prescriben, para llevarlo a la marcha: una LTV o CSV, una marcha a
// la vista o una incidencia en un punto. Sin DOM: se prueba con node.
//
// Los puntos se escriben como en el telefonema: un PK de la línea («45,3») o el nombre de una
// dependencia de la hoja («Tarragona»). El PK se sitúa en la ruta con los PK de la hoja; una
// estación ocupa su eje ± 500 m (de señal de entrada a señal de entrada, criterio de Joan).

import { codigoDe, textoLiteral } from "./codigos_tf.js";

// Tipos (v0.28.0): cada código de la Consigna C 65/16 de ADIF lleva a uno (codigos_tf.js).
export const TIPOS = {
  ltv: "Establece LTV/CSV", suprime: "Suprime LTV/CSV", vista: "Marcha a la vista", ilt: "Marcha a la vista en un punto",
  ate: "Limitación hasta una estación", com: "Limitación del tren", parada: "Parada", incidencia: "Incidencia", registro: "Otro",
};
export const NUM_MAX = 9999;
export const MARGEN_ESTACION_KM = 0.5;

// Pictogramas propios (no se editan en el editor: van con el evento).
const OJO = '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>';
export const PICTOS = {
  tf_incidencia: {
    id: "tf_incidencia", nombre: "Incidencia (telefonema)", forma: "triangulo", fondo: "#ffd200", borde: "#111111",
    color: "#111111", glifo: "!", svg: "", aviso: 3, accion: "Incidencia · {texto} · TF {tf}", marca: "",
    prioridad: "urgente", tipos: ["tf_incidencia"],
  },
  tf_vista: {
    id: "tf_vista", nombre: "Marcha a la vista", forma: "cuadrado", fondo: "#ffd200", borde: "#111111", color: "#111111",
    glifo: "", svg: OJO, aviso: 3, accion: "Marcha a la vista · {nombre} · TF {tf}", marca: "", prioridad: "urgente",
    tipos: ["tf_vista_inicio"],
  },
  tf_suprimida: {
    id: "tf_suprimida", nombre: "LTV suprimida (telefonema)", forma: "rombo", fondo: "#1c1c1e", borde: "#8e8e93",
    color: "#8e8e93", glifo: "{v}", svg: "",
    aviso: 3, accion: "LTV {v} km/h suprimida · {nombre} · TF {tf}", marca: "", prioridad: "informativo", tipos: ["ltv_suprimida"],
  },
  tf_ilt: {
    id: "tf_ilt", nombre: "Marcha a la vista en un punto", forma: "cuadrado", fondo: "#ffd200", borde: "#111111", color: "#111111",
    glifo: "", svg: OJO, aviso: 3, accion: "Marcha a la vista al paso · {nombre} · TF {tf}", marca: "", prioridad: "urgente", tipos: ["tf_ilt"],
  },
  tf_parada: {
    id: "tf_parada", nombre: "Parada (telefonema)", forma: "cuadrado", fondo: "#1c1c1e", borde: "#ffd200", color: "#ffd200",
    glifo: "P", svg: "", aviso: 3, accion: "Parada · {nombre} · {texto} · TF {tf}", marca: "", prioridad: "urgente", tipos: ["tf_parada"],
  },
  tf_pn: {
    id: "tf_pn", nombre: "Paso a nivel sin protección", forma: "triangulo", fondo: "#ffd200", borde: "#111111", color: "#111111",
    glifo: "PN", svg: "", aviso: 3, accion: "PN sin protección · {nombre} · TF {tf}", marca: "", prioridad: "urgente", tipos: ["tf_pn"],
  },
  tf_vista_fin: {
    id: "tf_vista_fin", nombre: "Fin de marcha a la vista", forma: "cuadrado", fondo: "#1c1c1e", borde: "#ffd200",
    color: "#ffd200", glifo: "", svg: OJO + '<path d="M4 20L20 4" stroke="currentColor" stroke-width="2.4"/>', aviso: 1,
    accion: "Fin de marcha a la vista · TF {tf}", marca: "", prioridad: "informativo", tipos: ["tf_vista_fin"],
  },
};

const norm = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const fmtPk = (x) => (x == null ? "" : String(Math.round(x * 1000) / 1000).replace(".", ","));

/**
 * Filas de la hoja con su distancia en la ruta. El paquete omite los ceros: sin `pka`, la
 * primera fila es 0; sin `pk`, es PK 0 si es un cambio de línea (trae `pkl`) o si cuadra con la
 * distancia a la fila de al lado (si no, no tiene PK).
 */
function filas(p) {
  const fs = (p.hoja || []).map((r, i) => ({ ...r, pka: r.pka ?? (i === 0 ? 0 : null) })).filter((r) => r.pka != null);
  const cuadra = (r, o) => o && o.pk != null && Math.abs(Math.abs(o.pk) - Math.abs(o.pka - r.pka)) <= Math.max(0.3, 0.2 * Math.abs(o.pka - r.pka));
  fs.forEach((r, i) => {
    if (r.pk == null && (r.pkl != null || cuadra(r, fs[i - 1]) || cuadra(r, fs[i + 1]))) r.pk = 0;
  });
  return fs;
}

/** LTV del DLTV de la ruta que se pueden suprimir: [{ id, texto }]. */
export const ltvsDeRuta = (p) =>
  (p.dltv?.ltv || [])
    .filter((l) => l.res === "APLICA" && l.pkai != null)
    .map((l) => ({
      id: "ltv-" + l.cod,
      texto: `LTV ${l.vel ?? l.v} km/h${l.csv ? " CSV" : ""} · ${(l.tray || []).join(" – ")} · PK ${fmtPk(l.pki)}–${fmtPk(l.pkf)}${l.va ? " · " + l.va : ""}`,
    }));

/** Vmax de la hoja sola (sin LTV), en tramos: entre dos filas rige la de la fila que lo cierra. */
export function vmaxHoja(p) {
  const fs = filas(p), out = [];
  for (let i = 0; i + 1 < fs.length; i++) {
    const a = fs[i].pka, b = fs[i + 1].pka;
    if (b > a) out.push({ pk_acum_ini: a, pk_acum_fin: b, v: fs[i + 1].v ?? null, fuente: "hoja", ltv: null, revisar: false });
  }
  return out;
}

/** PK de la línea en un punto de la ruta (km acumulados), con los PK de la hoja; null si no se sabe. */
export function pkEn(p, acum) {
  const fs = filas(p);
  for (let i = 0; i + 1 < fs.length; i++) {
    const a = fs[i], b = fs[i + 1];
    if (acum < a.pka - 1e-6 || acum > b.pka + 1e-6) continue;
    if (Math.abs(acum - a.pka) < 1e-6 && a.pk != null) return a.pk;
    if (Math.abs(acum - b.pka) < 1e-6 && b.pk != null) return b.pk; // tras un cambio de línea, el PK nuevo
    const pa = a.pk, pb = b.pkl ?? b.pk;
    if (pa == null || pb == null || b.pka <= a.pka) return null;
    return pa + ((acum - a.pka) / (b.pka - a.pka)) * (pb - pa);
  }
  const u = fs[fs.length - 1];
  return u && Math.abs(acum - u.pka) < 1e-6 ? (u.pk ?? null) : null;
}

/** Dependencias de la ruta (para la lista de sugerencias). */
export const dependencias = (p) => [...new Set(filas(p).map((r) => r.nom).filter(Boolean))];

/**
 * Sitúa en la ruta un punto escrito en el telefonema. `d`: posición actual (km), para elegir,
 * si el PK se repite (dos líneas), el primero que queda por delante.
 * Devuelve { pka, pk, nombre?, estacion, entre? } o { error }.
 */
export function situar(texto, p, d = 0, limites = null) {
  const t = String(texto || "").trim();
  if (!t) return null;
  const fs = filas(p);
  const num = t.replace(/^(PK|KM)\.?\s*/i, "");
  if (/^\d+([.,]\d+)?$/.test(num)) {
    const x = parseFloat(num.replace(",", "."));
    const cand = [];
    for (let i = 0; i + 1 < fs.length; i++) {
      const a = fs[i], b = fs[i + 1];
      const pa = a.pk, pb = b.pkl ?? b.pk;
      if (pa == null || pb == null) continue;
      if (Math.abs(pa - x) < 1e-6) cand.push({ pka: a.pka, a, b });
      else if (pa !== pb && x > Math.min(pa, pb) && x < Math.max(pa, pb))
        cand.push({ pka: a.pka + ((x - pa) / (pb - pa)) * (b.pka - a.pka), a, b });
    }
    const u = fs[fs.length - 1];
    if (u && u.pk != null && Math.abs(u.pk - x) < 1e-6) cand.push({ pka: u.pka, a: u, b: u });
    if (!cand.length) return { error: `el PK ${fmtPk(x)} no está en esta ruta` };
    // Entre las estaciones del telefonema, si las da (un PK puede repetirse en dos líneas).
    const dentro = limites ? cand.filter((c) => c.pka >= limites.min - 0.6 && c.pka <= limites.max + 0.6) : cand;
    if (limites && !dentro.length) return { error: `el PK ${fmtPk(x)} no está entre esas estaciones` };
    const c = dentro.find((c) => c.pka >= d - 0.05) || dentro[0];
    const entre = [c.a.nom, c.b.nom].filter(Boolean);
    return { pka: Math.round(c.pka * 1000) / 1000, pk: x, estacion: false, entre: [...new Set(entre)] };
  }
  const n = norm(t);
  const con = fs.filter((r) => r.nom);
  const iguales = con.filter((r) => norm(r.nom) === n);
  const parecidas = iguales.length ? iguales : con.filter((r) => norm(r.nom).startsWith(n) || norm(r.nom).includes(n));
  if (!parecidas.length) return { error: `«${t}» no está en esta ruta` };
  const r = parecidas.find((r) => r.pka >= d - 0.6) || parecidas[0];
  return { pka: r.pka, pk: r.pk ?? null, nombre: r.nom, estacion: true };
}

/** Estaciones (dependencias) de la hoja, en el orden de la ruta: [{ nom, pka, pk }]. */
export function estaciones(p) {
  const out = [];
  for (const r of filas(p)) if (r.nom && out[out.length - 1]?.nom !== r.nom) out.push({ nom: r.nom, pka: r.pka, pk: r.pk ?? null });
  return out;
}

/**
 * Dónde rige un telefonema de LTV o de supresión, con sus campos: PK inicio y final (mandan si
 * están) y estación inicio y final (si no hay PK, el tramo es de estación a estación, cada una
 * entera: eje ± 500 m; si hay PK, sirven para situarlos). → { desde, hasta } o { error }.
 */
export function lugar(t, p, d = 0) {
  const est = estaciones(p);
  const ea = t.est_ini ? est.find((e) => e.nom === t.est_ini) : null;
  const eb = t.est_fin ? est.find((e) => e.nom === t.est_fin) : null;
  if (t.est_ini && !ea) return { error: `la estación ${t.est_ini} no está en esta ruta` };
  if (t.est_fin && !eb) return { error: `la estación ${t.est_fin} no está en esta ruta` };
  const pki = String(t.pk_ini ?? "").trim(), pkf = String(t.pk_fin ?? "").trim();
  if (pki || pkf) {
    if (!pki || !pkf) return { error: pki ? "falta el PK final" : "falta el PK inicio" };
    const lim = ea && eb ? { min: Math.min(ea.pka, eb.pka), max: Math.max(ea.pka, eb.pka) } : ea ? { min: ea.pka, max: Infinity } : null;
    const a = situar(pki, p, d, lim), b = situar(pkf, p, d, lim);
    if (a?.error) return { error: a.error };
    if (b?.error) return { error: b.error };
    return { desde: { texto: `PK ${pki}`, ...a }, hasta: { texto: `PK ${pkf}`, ...b } };
  }
  const punto = (e) => ({ texto: e.nom, pka: e.pka, pk: e.pk, nombre: e.nom, estacion: true });
  if (ea) return { desde: punto(ea), hasta: eb ? punto(eb) : null };
  return { error: "falta el PK o la estación" };
}

/**
 * Punto de un telefonema de un solo sitio (ILT5, PAN, EAC14, PN, SAP, ABA): el PK, situado entre
 * las estaciones si se dan; si no hay PK, la estación inicio. → punto, null (nada anotado) o { error }.
 */
export function punto(t, p, d = 0) {
  const est = estaciones(p);
  const ea = t.est_ini ? est.find((e) => e.nom === t.est_ini) : null, eb = t.est_fin ? est.find((e) => e.nom === t.est_fin) : null;
  if (t.est_ini && !ea) return { error: `la estación ${t.est_ini} no está en esta ruta` };
  if (t.est_fin && !eb) return { error: `la estación ${t.est_fin} no está en esta ruta` };
  const pk = String(t.pk_ini ?? "").trim();
  if (pk) {
    const lim = ea && eb ? { min: Math.min(ea.pka, eb.pka), max: Math.max(ea.pka, eb.pka) } : ea ? { min: ea.pka, max: Infinity } : null;
    const a = situar(pk, p, d, lim);
    return a?.error ? a : { texto: `PK ${pk}`, ...a };
  }
  return ea ? { texto: ea.nom, pka: ea.pka, pk: ea.pk, nombre: ea.nom, estacion: true } : null;
}

/** Tramo de un ATE: de donde está el tren al recibirlo hasta la estación (entera). */
export function tramoAte(t, p) {
  const e = estaciones(p).find((x) => x.nom === t.est_fin), ini = t.desde?.pka;
  if (!e || ini == null) return null;
  const fin = Math.round((e.pka + MARGEN_ESTACION_KM) * 1000) / 1000;
  return fin > ini ? [ini, fin] : null;
}

/** Tramo de un COM: de donde está el tren hasta el final de la ruta. */
export function tramoCom(t, p) {
  const fs = filas(p), fin = fs.length ? fs[fs.length - 1].pka : null, ini = t.desde?.pka;
  return ini != null && fin != null && fin > ini ? [ini, fin] : null;
}

/** LTV del DLTV de la ruta que coinciden con un tramo (para suprimirlas): [{ id, texto }]. */
export function coincidentes(ini, fin, p, v = null) {
  const solapan = (p.dltv?.ltv || []).filter((l) => l.res === "APLICA" && l.pkai != null && Math.min(fin, l.pkaf) - Math.max(ini, l.pkai) > 0.001);
  const igual = v ? solapan.filter((l) => l.v === v) : [];
  const ids = new Set((igual.length ? igual : solapan).map((l) => "ltv-" + l.cod));
  return ltvsDeRuta(p).filter((l) => ids.has(l.id));
}

/** Tramo de la ruta [ini, fin] (km) entre dos puntos situados; una estación ocupa su eje ± 500 m. */
export function rango(desde, hasta) {
  if (!desde || desde.error) return null;
  const h = hasta && !hasta.error ? hasta : null;
  const pts = [desde, h || desde];
  let ini = Math.min(...pts.map((x) => x.pka)), fin = Math.max(...pts.map((x) => x.pka));
  const extremo = (x) => x.estacion;
  const primero = pts.find((x) => x.pka === ini), ultimo = pts.find((x) => x.pka === fin && x !== primero) || primero;
  if (extremo(primero)) ini -= MARGEN_ESTACION_KM;
  if (extremo(ultimo)) fin += MARGEN_ESTACION_KM;
  ini = Math.max(0, Math.round(ini * 1000) / 1000);
  fin = Math.round(fin * 1000) / 1000;
  return fin > ini ? [ini, fin] : null;
}

const nombrePunto = (x) => (x.nombre ? x.nombre : `PK ${fmtPk(x.pk)}`);
const esPk = (x) => /^(PK|KM)?\.?\s*\d+([.,]\d+)?$/i.test(String(x || "").trim());
const limpioPk = (x) => String(x).trim().replace(/^(PK|KM)\.?\s*/i, "");
const nombreRango = (t) => {
  if (t.pk_ini || t.est_ini) {
    const pk = t.pk_ini ? `PK ${t.pk_ini} – ${t.pk_fin}` : "";
    const est = t.est_ini ? (t.est_fin ? `${t.est_ini} – ${t.est_fin}` : t.est_ini) : "";
    return pk && est ? `${pk} (${est})` : pk || est;
  }
  const a = t.desde?.texto, b = t.hasta?.texto;
  if (!a) return "";
  if (!b) return esPk(a) ? `PK ${limpioPk(a)}` : a;
  if (esPk(a) && esPk(b)) return `PK ${limpioPk(a)} – ${limpioPk(b)}`;
  return `${esPk(a) ? "PK " + limpioPk(a) : a} – ${esPk(b) ? "PK " + limpioPk(b) : b}`;
};

/** Una línea con lo que prescribe el telefonema. */
export function resumen(t) {
  const lugar = nombreRango(t);
  const via = t.via ? ` · vía ${t.via.replace(/^v[ií]as?\s*/i, "")}` : "";
  if (t.tipo === "ltv")
    return `LTV ${t.v} km/h${t.csv ? " (CSV)" : ""} · ${lugar}${via}${t.senalizada === false ? " · sin señalizar" : ""}${t.causa ? " · " + t.causa : ""}`;
  if (t.tipo === "vista") return `Marcha a la vista · ${lugar}${t.v ? ` · máx. ${t.v} km/h` : ""}${t.causa ? " · " + t.causa : ""}`;
  const sitio = t.pk_ini ? `PK ${limpioPk(t.pk_ini)}` : t.est_ini || "";
  if (t.tipo === "ilt") return `Marcha a la vista al paso por el PK ${limpioPk(t.pk_ini || "?")}${via}`;
  if (t.tipo === "ate") return `No exceder ${t.v} km/h hasta ${t.est_fin || "?"}`;
  if (t.tipo === "com") return `El tren no puede exceder ${t.v} km/h${t.causa ? " · " + t.causa : ""}`;
  if (t.tipo === "parada") return `Parada en ${sitio || "?"}${t.causa ? " · " + t.causa : ""}`;
  if (t.tipo === "incidencia") {
    const c = codigoDe(t);
    if (c === "PN") return `PN sin protección · ${sitio || "?"}`;
    if (c === "SAP" || c === "ABA") return `${c === "SAP" ? "Señal apagada" : "Anormalidad en baliza"}${sitio ? " · " + sitio : ""}`;
    return `Incidencia · ${lugar}${t.texto ? " · " + t.texto : ""}`;
  }
  if (t.tipo === "suprime") {
    if (!t.pk_ini && !t.est_ini) return `Suprime ${t.ltv_txt || t.ltv || "una LTV"}`; // guardados antes
    return `Suprime LTV${t.v ? " " + t.v + " km/h" : ""} · ${lugar}${via}`;
  }
  return "Solo registro";
}

/** Errores de un telefonema antes de guardarlo (lista vacía si está bien). */
export function errores(t, p, d = 0) {
  const e = [];
  // Una LTV añadida a mano (Datos → DLTV) no es un telefonema: no lleva número ni hora.
  if (!t.manual) {
    if (!(Number.isInteger(t.numero) && t.numero >= 1 && t.numero <= NUM_MAX)) e.push(`el número va del 1 al ${NUM_MAX}`);
    if (!/^\d{1,2}:\d{2}$/.test(t.hora || "")) e.push("falta la hora");
  }
  const vel = t.v > 0 && t.v <= 400;
  if (["ltv", "ate", "com"].includes(t.tipo) && !vel) e.push("falta la velocidad");
  if (t.tipo === "vista" && t.v != null && !vel) e.push("la velocidad no cuadra");
  const nuevo = "pk_ini" in t || "est_ini" in t || !t.desde?.texto; // con los campos del formulario (no los de antes de la v0.15)
  if (t.tipo === "vista" && nuevo) {
    const l = lugar(t, p, d);
    if (l.error) e.push(l.error);
    else if (!rango(l.desde, l.hasta)) e.push("el inicio y el final son el mismo punto");
  } else if (["ilt", "parada", "incidencia"].includes(t.tipo) && nuevo) {
    const c = codigoDe(t), a = punto(t, p, d);
    if (t.tipo === "ilt" && !t.pk_ini) e.push("falta el PK");
    else if (c === "EAC14" && !t.est_ini) e.push("falta la estación");
    else if (a?.error) e.push(a.error);
    else if (!a && !["SAP", "ABA"].includes(c)) e.push("falta el PK o la estación");
  } else if (t.tipo === "com") {
    // rige desde donde está el tren hasta el final de la ruta: solo hace falta la velocidad
  } else if (t.tipo === "ate") {
    if (!t.est_fin) e.push("falta la estación hasta la que rige");
    else if (!estaciones(p).some((x) => x.nom === t.est_fin)) e.push(`la estación ${t.est_fin} no está en esta ruta`);
    else if (t.desde?.pka != null && !tramoAte(t, p)) e.push("esa estación ya está pasada");
  } else if (t.tipo === "ltv" || t.tipo === "suprime") {
    const l = lugar(t, p, d);
    if (l.error) e.push(l.error);
    else if (!rango(l.desde, l.hasta)) e.push("el inicio y el final son el mismo punto");
    else if (t.tipo === "suprime") {
      const [ini, fin] = rango(l.desde, l.hasta);
      if (!coincidentes(ini, fin, p, t.v).length) e.push("en ese tramo no hay ninguna LTV del DLTV que suprimir");
    }
  } else if (t.tipo !== "registro") {
    const a = situar(t.desde?.texto, p, d), b = situar(t.hasta?.texto, p, d);
    if (!a) e.push(t.tipo === "incidencia" ? "falta el punto" : "falta desde dónde");
    else if (a.error) e.push(a.error);
    if (b?.error) e.push(b.error);
    if (a && !a.error && t.tipo !== "incidencia" && !rango(a, b)) e.push("desde y hasta son el mismo punto");
  }
  return e;
}

/**
 * Lo que los telefonemas vigentes de esta ruta (no anulados) añaden a la marcha:
 * { eventos, limites: [{ini, fin, v, id, numero}], vistas: [{ini, fin, numero}] }.
 */
export function efectos(lista, p) {
  const eventos = [], limites = [], vistas = [], suprimidas = new Map();
  for (const t of lista || []) {
    if (t.ruta !== p.id || t.anulado || t.tipo === "registro") continue;
    if (t.tipo === "suprime") {
      for (const id of t.ltvs || (t.ltv ? [t.ltv] : [])) suprimidas.set(id, t.numero);
      continue;
    }
    const a = t.desde ? { ...t.desde } : null, b = t.hasta ? { ...t.hasta } : null;
    if (!a || a.pka == null) continue;
    const id = `tf-${t.id}`, tf = String(t.numero), ev = (sufijo, tipo, pk, datos, pictograma, picto, fase, aviso) =>
      eventos.push({ id: `ev-${id}-${sufijo}`, tipo, pk_acum: pk, datos: { ...datos, tf }, pictograma, picto, aviso_km: aviso, estado: "ok", fase, telefonema: t.id });
    if (t.tipo === "ate" || t.tipo === "com") {
      const r = t.tipo === "ate" ? tramoAte(t, p) : tramoCom(t, p);
      if (!r) continue;
      const [ini, fin] = r, nombre = t.tipo === "ate" ? `hasta ${t.est_fin}` : "hasta el final de la ruta";
      const motivo = `Telefonema nº ${t.numero} · ${codigoDe(t)}${t.causa ? " · " + t.causa : ""}`;
      limites.push({ ini, fin, v: t.v, id, numero: t.numero });
      ev("a", "ltv_inicio", ini, { v: t.v, de: null, motivo, nombre, ltv: id, csv: false, via: null }, "ltv", null, "accion", 3);
      if (t.tipo === "ate") ev("b", "ltv_fin", fin, { v: t.v, motivo, nombre, ltv: id, solo_cabeza: false, via: null }, "fin_ltv", null, "restablecer", 1);
      continue;
    }
    if (t.tipo === "ilt" || t.tipo === "parada" || t.tipo === "incidencia") {
      const c = codigoDe(t), nombre = nombrePunto(a);
      if (t.tipo === "ilt") ev("i", "tf_incidencia", a.pka, { nombre, texto: "marcha a la vista", voz: "Marcha a la vista al paso" }, "tf_ilt", PICTOS.tf_ilt, "accion", 3);
      else if (t.tipo === "parada") ev("i", "tf_incidencia", a.pka, { nombre, texto: t.causa || (c === "EAC14" ? "hasta que lo ordene el RC" : ""), voz: `Parada en ${nombre}` }, "tf_parada", PICTOS.tf_parada, "accion", 3);
      else if (c === "PN") ev("i", "tf_incidencia", a.pka, { nombre, texto: "PN sin protección", voz: "Paso a nivel sin protección" }, "tf_pn", PICTOS.tf_pn, "accion", 3);
      else {
        const texto = c === "SAP" ? "señal apagada" : c === "ABA" ? "anormalidad en baliza" : t.texto || nombre;
        ev("i", "tf_incidencia", a.pka, { nombre, texto, voz: c === "SAP" ? "Señal apagada" : c === "ABA" ? "Anormalidad en baliza" : "Incidencia" }, "tf_incidencia", PICTOS.tf_incidencia, "accion", 3);
      }
      continue;
    }
    const r = rango(a, b && b.pka != null ? b : null);
    if (!r) continue;
    const [ini, fin] = r, nombre = nombreRango(t);
    if (t.tipo === "ltv") {
      limites.push({ ini, fin, v: t.v, id, numero: t.numero });
      const motivo = `${t.manual ? "LTV añadida a mano" : "Telefonema nº " + t.numero}${t.causa ? " · " + t.causa : ""}${t.senalizada === false ? " · SIN SEÑALIZAR" : ""}`;
      ev("a", "ltv_inicio", ini, { v: t.v, de: null, motivo, nombre, ltv: id, csv: !!t.csv, via: t.via || null }, t.csv ? "ltv_csv" : "ltv", null, "accion", 3);
      ev("b", "ltv_fin", fin, { v: t.v, motivo, nombre, ltv: id, solo_cabeza: false, via: t.via || null }, "fin_ltv", null, "restablecer", 1);
    } else if (t.tipo === "vista") {
      vistas.push({ ini, fin, numero: t.numero });
      if (t.v) limites.push({ ini, fin, v: t.v, id, numero: t.numero });
      ev("a", "tf_vista_inicio", ini, { nombre }, "tf_vista", PICTOS.tf_vista, "accion", 3);
      ev("b", "tf_vista_fin", fin, { nombre }, "tf_vista_fin", PICTOS.tf_vista_fin, "restablecer", 1);
    }
  }
  return { eventos, limites, vistas, suprimidas };
}

/**
 * Vmax efectiva con las limitaciones de los telefonemas encima: en cada trozo, la menor.
 * `base`: tramos [{pk_acum_ini, pk_acum_fin, v, fuente, ltv, revisar}] seguidos.
 */
export function superponer(base, limites) {
  if (!limites.length) return base;
  const xs = [...new Set([...base.flatMap((t) => [t.pk_acum_ini, t.pk_acum_fin]), ...limites.flatMap((l) => [l.ini, l.fin])])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1], m = (a + b) / 2;
    if (b - a < 1e-9) continue;
    const t = base.find((x) => x.pk_acum_ini <= m && m < x.pk_acum_fin) || null;
    const l = limites.filter((x) => x.ini <= m && m < x.fin).sort((x, y) => x.v - y.v)[0];
    let n;
    // La marca del CVM (hoja ≠ CVM, a revisar) se conserva aunque mande otra limitación.
    const cvm = !!(t?.cvm || l?.cvm);
    if (l && (t?.v == null || l.v < t.v)) n = { pk_acum_ini: a, pk_acum_fin: b, v: l.v, fuente: l.fuente || "ltv", ltv: l.id ?? null, revisar: cvm, cvm, telefonema: l.numero };
    else if (t) n = { ...t, pk_acum_ini: a, pk_acum_fin: b };
    else continue;
    const u = out[out.length - 1];
    if (u && Math.abs(u.pk_acum_fin - a) < 1e-9 && u.v === n.v && u.fuente === n.fuente && u.ltv === n.ltv && u.revisar === n.revisar && !!u.cvm === !!n.cvm) u.pk_acum_fin = b;
    else out.push(n);
  }
  return out;
}

/** Texto del telefonema: el literal de la consigna con sus datos, o el escrito a mano. */
export const texto = (t) => ("pk_ini" in t || "est_ini" in t || t.codigo != null ? textoLiteral(t, t.tren) : null) ?? t.texto_tf ?? ""; // los de antes de la v0.15, sin texto

const anulacion = (t) => (t.anulado ? `${t.anulado.hora}${t.anulado.por ? " por el nº " + t.anulado.por : ""}` : "");

/**
 * Exportación para la empresa: CSV (separado por «;», UTF-8 con BOM: se abre bien en Excel),
 * un telefonema por fila.
 */
export function csvTelefonemas(lista) {
  const cols = [
    ["Fecha", (t) => t.fecha], ["Tren", (t) => t.tren], ["Código", (t) => codigoDe(t)], ["Nº", (t) => t.numero], ["Hora", (t) => t.hora],
    ["Emisor", (t) => t.emisor], ["Receptor", (t) => t.receptor], ["Tipo", (t) => TIPOS[t.tipo] || t.tipo],
    ["Velocidad", (t) => t.v], ["Vía(s)", (t) => t.via],
    ["PK inicio", (t) => t.pk_ini ?? (t.pk_ini === undefined && t.desde && !t.desde.estacion ? t.desde.texto : "")],
    ["PK final", (t) => t.pk_fin ?? (t.pk_fin === undefined && t.hasta && !t.hasta.estacion ? t.hasta.texto : "")],
    ["Estación inicio", (t) => t.est_ini], ["Estación final", (t) => t.est_fin], ["Causa", (t) => t.causa],
    ["Señalizada", (t) => (t.tipo === "ltv" ? (t.senalizada === false ? "no" : "sí") : "")],
    ["CSV", (t) => (t.tipo === "ltv" ? (t.csv ? "sí" : "no") : "")],
    ["LTV suprimidas", (t) => (t.tipo === "suprime" ? t.ltv_txt || "" : "")],
    ["Texto", (t) => texto(t)], ["Información adicional", (t) => t.mensaje], ["Firma", (t) => t.firma],
    ["Pendiente", (t) => (t.pendiente ? "sí" : "")], ["Anulado", (t) => anulacion(t)],
    ["Resumen", (t) => (t.tipo === "registro" ? "" : resumen(t))],
  ];
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const filas = [...lista].sort((a, b) => (a.fecha + a.hora + String(a.numero).padStart(2, "0")).localeCompare(b.fecha + b.hora + String(b.numero).padStart(2, "0")));
  return "\ufeff" + [cols.map(([n]) => celda(n)).join(";"), ...filas.map((t) => cols.map(([, f]) => celda(f(t))).join(";"))].join("\r\n") + "\r\n";
}

/** El registro en texto, para compartirlo o imprimirlo. */
export function textoRegistro(lista, tren, fecha) {
  const l = [`Telefonemas · Tren ${tren}${fecha ? " · " + fecha : ""}`, ""];
  for (const t of lista) {
    const c = codigoDe(t), tx = texto(t);
    l.push(`${c ? c + " · " : ""}Nº ${t.numero} · ${t.hora}${t.anulado ? `  [ANULADO ${anulacion(t)}]` : ""}${t.pendiente ? "  [PENDIENTE]" : ""}`);
    l.push(`De: ${t.emisor || "—"}`);
    l.push(`A: ${t.receptor || "—"}`);
    if (tx) l.push(`Texto: «${tx}»`);
    if (t.tipo !== "registro") l.push(`Prescribe: ${resumen(t)}`);
    if (t.mensaje) l.push(`${tx ? "Información adicional" : "Mensaje"}: ${t.mensaje}`);
    l.push(`Firma: ${t.firma || "—"}`, "");
  }
  l.push("Registrado en RailNav (servicio no oficial ni homologado por la AESF).");
  return l.join("\n");
}
