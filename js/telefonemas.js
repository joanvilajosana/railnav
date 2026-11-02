// Telefonemas: el registro de los que recibe el maquinista (número, hora, emisor, receptor,
// mensaje y firma) y lo que prescriben, para llevarlo a la marcha: una LTV o CSV, una marcha a
// la vista o una incidencia en un punto. Sin DOM: se prueba con node.
//
// Los puntos se escriben como en el telefonema: un PK de la línea («45,3») o el nombre de una
// dependencia de la hoja («Tarragona»). El PK se sitúa en la ruta con los PK de la hoja; una
// estación ocupa su eje ± 500 m (de señal de entrada a señal de entrada, criterio de Joan).

export const TIPOS = { ltv: "LTV", vista: "Marcha a la vista", incidencia: "Incidencia", suprime: "Suprime una LTV del DLTV", registro: "Solo registro" };
/** Velocidad que se propone para una marcha a la vista (no es un tope: en algunos casos se limita a 40). */
export const V_VISTA = 40;
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

/** Dependencias de la ruta (para la lista de sugerencias). */
export const dependencias = (p) => [...new Set(filas(p).map((r) => r.nom).filter(Boolean))];

/**
 * Sitúa en la ruta un punto escrito en el telefonema. `d`: posición actual (km), para elegir,
 * si el PK se repite (dos líneas), el primero que queda por delante.
 * Devuelve { pka, pk, nombre?, estacion, entre? } o { error }.
 */
export function situar(texto, p, d = 0) {
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
    const c = cand.find((c) => c.pka >= d - 0.05) || cand[0];
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
  const a = t.desde?.texto, b = t.hasta?.texto;
  if (!a) return "";
  if (!b) return esPk(a) ? `PK ${limpioPk(a)}` : a;
  if (esPk(a) && esPk(b)) return `PK ${limpioPk(a)} – ${limpioPk(b)}`;
  return `${esPk(a) ? "PK " + limpioPk(a) : a} – ${esPk(b) ? "PK " + limpioPk(b) : b}`;
};

/** Una línea con lo que prescribe el telefonema. */
export function resumen(t) {
  const lugar = nombreRango(t);
  if (t.tipo === "ltv") return `LTV ${t.v} km/h${t.csv ? " (CSV)" : ""} · ${lugar}${t.via ? " · " + t.via : ""}`;
  if (t.tipo === "vista") return `Marcha a la vista · ${lugar}${t.v ? ` · máx. ${t.v} km/h` : ""}`;
  if (t.tipo === "incidencia") return `Incidencia · ${lugar}${t.texto ? " · " + t.texto : ""}`;
  if (t.tipo === "suprime") return `Suprime ${t.ltv_txt || t.ltv || "una LTV"}`;
  return "Solo registro";
}

/** Errores de un telefonema antes de guardarlo (lista vacía si está bien). */
export function errores(t, p, d = 0) {
  const e = [];
  if (!(Number.isInteger(t.numero) && t.numero >= 1 && t.numero <= 99)) e.push("el número va del 1 al 99");
  if (!/^\d{1,2}:\d{2}$/.test(t.hora || "")) e.push("falta la hora");
  if (t.tipo === "ltv" && !(t.v > 0 && t.v <= 400)) e.push("falta la velocidad");
  if (t.tipo === "suprime" && !t.ltv) e.push("elige la LTV que suprime");
  if (t.tipo !== "registro" && t.tipo !== "suprime") {
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
      if (t.ltv) suprimidas.set(t.ltv, t.numero);
      continue;
    }
    const a = t.desde ? { ...t.desde } : null, b = t.hasta ? { ...t.hasta } : null;
    if (!a || a.pka == null) continue;
    const id = `tf-${t.id}`, tf = String(t.numero), ev = (sufijo, tipo, pk, datos, pictograma, picto, fase, aviso) =>
      eventos.push({ id: `ev-${id}-${sufijo}`, tipo, pk_acum: pk, datos: { ...datos, tf }, pictograma, picto, aviso_km: aviso, estado: "ok", fase, telefonema: t.id });
    if (t.tipo === "incidencia") {
      ev("i", "tf_incidencia", a.pka, { texto: t.texto || nombrePunto(a) }, "tf_incidencia", PICTOS.tf_incidencia, "accion", 3);
      continue;
    }
    const r = rango(a, b && b.pka != null ? b : null);
    if (!r) continue;
    const [ini, fin] = r, nombre = nombreRango(t);
    if (t.tipo === "ltv") {
      limites.push({ ini, fin, v: t.v, id, numero: t.numero });
      const motivo = `Telefonema nº ${t.numero}`;
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
    if (l && (t?.v == null || l.v < t.v)) n = { pk_acum_ini: a, pk_acum_fin: b, v: l.v, fuente: "ltv", ltv: l.id, revisar: false, telefonema: l.numero };
    else if (t) n = { ...t, pk_acum_ini: a, pk_acum_fin: b };
    else continue;
    const u = out[out.length - 1];
    if (u && Math.abs(u.pk_acum_fin - a) < 1e-9 && u.v === n.v && u.fuente === n.fuente && u.ltv === n.ltv && u.revisar === n.revisar) u.pk_acum_fin = b;
    else out.push(n);
  }
  return out;
}

const anulacion = (t) => (t.anulado ? `${t.anulado.hora}${t.anulado.por ? " por el nº " + t.anulado.por : ""}` : "");

/**
 * Exportación para la empresa: CSV (separado por «;», UTF-8 con BOM: se abre bien en Excel),
 * un telefonema por fila.
 */
export function csvTelefonemas(lista) {
  const cols = [
    ["Fecha", (t) => t.fecha], ["Tren", (t) => t.tren], ["Nº", (t) => t.numero], ["Hora", (t) => t.hora],
    ["Emisor", (t) => t.emisor], ["Receptor", (t) => t.receptor], ["Tipo", (t) => TIPOS[t.tipo] || t.tipo],
    ["Prescribe", (t) => (t.tipo === "registro" ? "" : resumen(t))], ["Desde", (t) => t.desde?.texto],
    ["Hasta", (t) => t.hasta?.texto], ["Velocidad", (t) => t.v], ["CSV", (t) => (t.tipo === "ltv" ? (t.csv ? "sí" : "no") : "")],
    ["Vía", (t) => t.via], ["Mensaje", (t) => t.mensaje], ["Firma", (t) => t.firma],
    ["Anulado", (t) => anulacion(t)],
  ];
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const filas = [...lista].sort((a, b) => (a.fecha + a.hora + String(a.numero).padStart(2, "0")).localeCompare(b.fecha + b.hora + String(b.numero).padStart(2, "0")));
  return "\ufeff" + [cols.map(([n]) => celda(n)).join(";"), ...filas.map((t) => cols.map(([, f]) => celda(f(t))).join(";"))].join("\r\n") + "\r\n";
}

/** El registro en texto, para compartirlo o imprimirlo. */
export function textoRegistro(lista, tren, fecha) {
  const l = [`Telefonemas · Tren ${tren}${fecha ? " · " + fecha : ""}`, ""];
  for (const t of lista) {
    l.push(`Nº ${t.numero} · ${t.hora}${t.anulado ? `  [ANULADO ${anulacion(t)}]` : ""}`);
    l.push(`De: ${t.emisor || "—"}`);
    l.push(`A: ${t.receptor || "—"}`);
    if (t.tipo !== "registro") l.push(`Prescribe: ${resumen(t)}`);
    if (t.mensaje) l.push(`Mensaje: ${t.mensaje}`);
    l.push(`Firma: ${t.firma || "—"}`, "");
  }
  l.push("Registrado en RailNav (servicio no oficial ni homologado por la AESF).");
  return l.join("\n");
}
