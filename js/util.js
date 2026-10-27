// Utilidades sin dependencias del DOM (se prueban con node --test).

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Rellena «{campo}» con los datos del evento; los campos que faltan quedan vacíos. */
export const rellenar = (plantilla, datos) =>
  String(plantilla || "").replace(/\{(\w+)\}/g, (_, k) => (datos && datos[k] != null ? datos[k] : ""));

/** Igual que rellenar, pero quita los «·» que quedan colgando si falta un campo. */
export const texto = (plantilla, datos) =>
  rellenar(plantilla, datos)
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

export const two = (x) => String(x).padStart(2, "0");

/** «HH:MM» → minutos desde las 00:00. */
export const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":");
  return +h * 60 + +m;
};

/** Minutos (pueden pasar de 24 h) → «HH:MM:SS». */
export const hms = (min) => {
  const s = Math.round(min * 60);
  return two(Math.floor(s / 3600) % 24) + ":" + two(Math.floor((s % 3600) / 60)) + ":" + two(s % 60);
};
export const hm = (min) => hms(min).slice(0, 5);

/** Distancia en metros para leer de un vistazo: «850 m», «1,7 km». */
export const dm = (m) =>
  m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km";

/** Número con coma decimal. */
export const nf = (x, dec = 1) => (x == null ? "" : (+x).toFixed(dec).replace(".", ","));

/** Metros con espacio de miles: «31 000». */
export const miles = (m) => String(Math.round(m)).replace(/\B(?=(\d{3})+$)/g, " ");

/** «2025-12-12» → «12/12/2025». */
export const fecha = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "");

/**
 * Texto de una línea en SVG: nunca se corta un número; si no cabe se estrecha y, si es muy
 * largo, termina en «…» tras una palabra entera. Devuelve [texto escapado, atributos].
 */
export const ajustar = (t, ancho, n) => {
  t = String(t);
  if (t.length > n + 12) t = t.slice(0, n + 11).replace(/\s+\S*$/, "") + "…";
  return [esc(t), t.length > n ? ` textLength="${ancho}" lengthAdjust="spacingAndGlyphs"` : ""];
};

/** «vía E: No afecta a vías generales» → ["E", "No afecta a vías generales"]. */
export const partesVia = (v) => {
  const m = /^vía\s+(\S+?)(?::\s*(.*))?$/.exec(v || "");
  return m ? [m[1], m[2] || ""] : [String(v || ""), ""];
};

export const FUENTE = 'system-ui,-apple-system,"Segoe UI",sans-serif';
let lienzo = null;
/** Ancho de un texto con la fuente de la app (aproximado fuera del navegador). */
export const anchoTexto = (t, estilo) => {
  if (typeof document === "undefined") return String(t).length * (parseFloat(/\d+(\.\d+)?px/.exec(estilo)?.[0]) || 14) * 0.58;
  lienzo = lienzo || document.createElement("canvas").getContext("2d");
  lienzo.font = estilo + " " + FUENTE;
  return lienzo.measureText(t).width;
};
