// Vista Datos: ficha del tren y pestañas «Hoja de ruta» (original completa), «DLTV» y «CVM».

import { esc, fecha, may, nf } from "./util.js";
import { rango, resumen } from "./telefonemas.js";
import { icono, pic } from "./pictos.js";
import { cuadroViaHtml } from "./marcha.js";
import { prefs } from "./almacen.js";

const $ = (id) => document.getElementById(id);
let pestana = "hoja";
/** Disposición de teléfono (Ajustes → Pantalla). */
export const movil = () => document.documentElement.dataset.disp === "telefono";

const TI = {
  fecha: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  loco: '<path d="M3 16V9a2 2 0 0 1 2-2h10l5 5v4z"/><path d="M6 10h3v2.5H6zM11 10h3v2.5h-3z"/><circle cx="7" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/><path d="M2 21h20"/>',
  peso: '<path d="M8 8a4 4 0 1 1 8 0"/><path d="M5.5 8h13l2 12h-17z"/>',
  tipo: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2"/>',
  origen: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  destino: '<path d="M6 21V4"/><path d="M6 4h12l-2.5 4L18 12H6"/>',
  ruta: '<circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 17c6-1 3-9 10-10"/>',
  tren: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="13.5" r=".7"/><circle cx="15" cy="13.5" r=".7"/>',
};
export const ICONOS_FICHA = TI;
export const lineal = (k, tam = 26) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k]}</svg>`;

const CLASE = { mercancias: "Mercancías", viajeros: "Viajeros" };

/** Ficha del tren (desplegable del cuadro «Tren», en cualquier pantalla). */
export function pintarFicha(ruta) {
  const p = ruta.p, t = ruta.tren;
  const dl = p.dltv;
  const dec = (x) => ruta.revision?.(x.cod);
  const ap = dl ? dl.ltv.filter((x) => estadoLtv(x, dec(x)) === "ap").length : 0;
  const rv = dl ? dl.ltv.filter((x) => estadoLtv(x, dec(x)) === "rv").length : 0;
  const tec = ruta.eventos.filter((e) => e.tipo === "parada_tecnica");
  const tile = (ico, lab, val, tit) => `<div class="tt" title="${esc(tit || lab)}">${ico}<div><b>${lab}</b><span>${val}</span></div></div>`;
  const cvm = p.cvm ? (p.cvm.tramos.length ? `CVM: ${p.cvm.tramos.length} a revisar` : "Coincide con el CVM") : null;
  // El número está en el cuadro «Tren» de arriba; la clase, el origen y el destino, aquí
  // (v0.26.2; origen y destino por separado desde la v0.27.0).
  $("kv").innerHTML =
    `<div class="tr-tiles">` +
    tile(`<span class="tl">${lineal("origen")}</span>`, "Origen", esc(t.origen || "?")) +
    tile(`<span class="tl">${lineal("destino")}</span>`, "Destino", esc(t.destino || "?")) +
    (t.clase ? tile(`<span class="tl">${lineal("tren")}</span>`, "Clase", esc(CLASE[t.clase] || t.clase)) : "") +
    tile(`<span class="tl">${lineal("fecha")}</span>`, "Fecha", fecha(t.fecha) || "?") +
    tile(`<span class="tl">${lineal("loco")}</span>`, "Locomotora", esc(t.locomotora || "?")) +
    tile(`<span class="tl">${lineal("peso")}</span>`, "Peso", t.masa_t ? nf(t.masa_t, 0) + " t" : "?") +
    tile(`<span class="tl">${lineal("tipo")}</span>`, "Tipo de tren", esc(t.tipo || "?")) +
    tile(icono(pic("ltv"), 34, { v: ap }), "LTV que aplican", dl ? ap : "Sin DLTV") +
    (dl ? tile('<span class="tl rv">?</span>', "LTV a revisar", rv) : "") +
    (p.cvm ? tile(icono(pic("aviso_cvm"), 34, { v: "" }), "CVM", p.cvm.tramos.length ? `${p.cvm.tramos.length} a revisar` : "Coincide", cvm) : "") +
    tile(icono(pic("parada_tecnica"), 34, { min: "" }), "Paradas técnicas", tec.length ? tec.map((e) => `${esc(e.datos.nombre)} (${String(e.datos.min).replace(".", ",")} min)`).join(", ") : "Ninguna") +
    `</div>`;
}

export function pintarDatos(ruta, d) {
  pintarHoja(ruta, d);
  pintarDltv(ruta, d);
  pintarCvm(ruta);
  mostrarPestana();
}

export function mostrarPestana(t) {
  if (t) pestana = t;
  $("t-hoja").hidden = pestana !== "hoja";
  $("t-dltv").hidden = pestana !== "dltv";
  $("t-cvm").hidden = pestana !== "cvm";
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === pestana));
}

const TIPO_PIC = { estacion: "estacion", apeadero: "apeadero", bifurcacion: "bifurcacion", cambio_linea: "cambio_linea" };

function pintarHoja(ruta, d) {
  const H = ruta.p.hoja || [];
  const tiene = (k) => H.some((r) => r[k] != null);
  const cols = [["pk", "PK"], ["nom", "Dependencia"], ["v", "V Max"], ["bq", "Bloqueo"], ["radio", "Radio"], ["hora", "Hora"], ["tec", "Técn."], ["conc", "Conc."], ["tcop", "Tc. Op."]].filter(
    (c) => c[0] === "nom" || tiene(c[0]),
  );
  let aqui = -1;
  H.forEach((r, i) => {
    if (r.pka != null && r.pka <= d + 1e-6) aqui = i;
  });
  if (movil()) return void ($("tb").innerHTML = hojaMovil(H, aqui));
  const clase = (k) => (["tec", "conc"].includes(k) ? ' class="cc"' : ["pk", "v"].includes(k) ? ' style="text-align:right"' : "");
  let h = "<thead><tr>" + cols.map(([k, n]) => `<th${clase(k)}>${n}</th>`).join("") + "</tr></thead><tbody>";
  let pg = null;
  const prev = {};
  H.forEach((r, i) => {
    if (r.pag !== pg) {
      pg = r.pag;
      h += `<tr class="pg"><td colspan="${cols.length}">Página ${pg} del PDF</td></tr>`;
    }
    h += `<tr${i === aqui ? ' class="aqui"' : ""}>`;
    for (const [k] of cols) {
      const v = r[k], rep = ["v", "bq", "radio"].includes(k) && v != null && prev[k] === v && !r.cv;
      if (k === "pk") h += `<td class="n"><b>${nf(v)}</b>${r.pkl != null ? `<small>antes ${nf(r.pkl)}</small>` : ""}${r.lin ? `<small>línea ${esc(r.lin)}</small>` : ""}</td>`;
      else if (k === "nom") {
        const tp = /^BIF\b/i.test(v || "") ? "bifurcacion" : TIPO_PIC[r.tipo];
        h += `<td><div class="nm${v ? "" : " sin"}">${tp && v ? icono(pic(tp), 24, { nombre: v, pk: nf(r.pk) }) : '<span style="width:24px"></span>'}${v ? esc(v) : "—"}</div></td>`;
      } else if (k === "v") h += `<td class="n">${v == null ? "" : r.cv ? `<span class="cs vm">${v}</span>` : `<span class="vm${rep ? " rep" : ""}">${v}</span>`}</td>`;
      else if (k === "tec" || k === "conc") h += `<td class="cc">${v == null ? "" : String(v).replace(".", ",")}</td>`;
      else h += `<td${rep ? ' class="rep"' : ""}>${v == null ? "" : esc(v)}</td>`;
    }
    h += "</tr>";
    for (const k of ["v", "bq", "radio"]) if (r[k] != null) prev[k] = r[k];
    for (const n of r.notas || []) h += `<tr class="nota${i === aqui ? " aqui" : ""}"><td colspan="${cols.length}"><span${(r.cn || []).includes(n) ? ' class="cs"' : ""}>${esc(n)}</span></td></tr>`;
  });
  $("tb").innerHTML = h + "</tbody>";
}

// Teléfono: cada fila de la hoja en dos líneas (PK, dependencia y V Max; debajo hora, bloqueo,
// radio y paradas). Los valores que repiten la fila anterior salen en gris, como en la tabla.
function hojaMovil(H, aqui) {
  let h = "<tbody>", pg = null;
  const prev = {};
  H.forEach((r, i) => {
    if (r.pag !== pg) {
      pg = r.pag;
      h += `<tr class="pg"><td>Página ${pg} del PDF</td></tr>`;
    }
    const tp = /^BIF\b/i.test(r.nom || "") ? "bifurcacion" : TIPO_PIC[r.tipo];
    const rep = (k) => r[k] != null && prev[k] === r[k] && !r.cv;
    const x = [];
    if (r.hora) x.push(`<span class="hk hora">${esc(r.hora)}</span>`);
    for (const [k, lab] of [["bq", "Bloqueo"], ["radio", "Radio"], ["tec", "Técn."], ["conc", "Conc."], ["tcop", "Tc. Op."]])
      if (r[k] != null) x.push(`<span class="hk${rep(k) ? " rep" : ""}"><i>${lab}</i> ${esc(String(r[k]).replace(/^(\d+)\.(\d+)$/, "$1,$2"))}</span>`);
    const v = r.v == null ? "" : r.cv ? `<span class="cs vm">${r.v}</span>` : `<span class="vm${rep("v") ? " rep" : ""}">${r.v}</span>`;
    h += `<tr class="hm${i === aqui ? " aqui" : ""}"><td><div class="hm-g">`;
    h += `<div class="hm-pk">${r.pk != null ? `<b>${nf(r.pk)}</b>` : ""}${r.pkl != null ? `<small>antes ${nf(r.pkl)}</small>` : ""}${r.lin ? `<small>línea ${esc(r.lin)}</small>` : ""}</div>`;
    h += `<div class="nm${r.nom ? "" : " sin"}">${tp && r.nom ? icono(pic(tp), 28, { nombre: r.nom, pk: nf(r.pk) }) : ""}${r.nom ? esc(r.nom) : "—"}</div>`;
    h += `<div class="hm-v">${v}</div>${x.length ? `<div class="hm-x">${x.join("")}</div>` : ""}</div></td></tr>`;
    for (const k of ["v", "bq", "radio"]) if (r[k] != null) prev[k] = r[k];
    for (const n of r.notas || []) h += `<tr class="nota${i === aqui ? " aqui" : ""}"><td><span${(r.cn || []).includes(n) ? ' class="cs"' : ""}>${esc(n)}</span></td></tr>`;
  });
  return h + "</tbody>";
}

/**
 * Estado de una LTV del DLTV para el maquinista: "ap" (aplica), "rv" (a revisar) o "no" (no
 * aplica). Manda su decisión (Datos → DLTV); sin decisión, lo que dio el cruce.
 */
export function estadoLtv(x, dec) {
  if (dec?.decision === "no") return "no";
  if (dec?.decision === "aplica") return "ap";
  return x.res === "APLICA" ? "ap" : "rv";
}

export const ESTADOS_LTV = [
  ["ap", "Aplica"],
  ["rv", "A revisar"],
  ["no", "No aplica"],
];
const NOMBRE_ESTADO = Object.fromEntries(ESTADOS_LTV);

/**
 * Datos → DLTV: categoría que se ve ("" = todas, agrupadas por estado) y LTV marcadas mientras se
 * selecciona (null: no se está seleccionando). Lo cambia main.js; aquí solo se pinta.
 */
export const vistaDltv = { filtro: "", sel: null, msg: "" };

/**
 * LTV del DLTV en el orden en que se ven: por su km en la ruta (las que no se sabe dónde caen, al
 * final, en el orden del documento), con «Todas» y con cada categoría (Joan, 09-11-2026).
 */
export function ltvVisibles(ruta) {
  const DL = ruta?.p.dltv;
  if (!DL) return [];
  const est = (x) => estadoLtv(x, ruta.revision?.(x.cod));
  const km = (x) => (x.pkai == null ? Infinity : Math.min(x.pkai, x.pkaf ?? x.pkai));
  return DL.ltv
    .map((x, i) => [x, i])
    .filter(([x]) => !vistaDltv.filtro || est(x) === vistaDltv.filtro)
    .sort(([a, i], [b, j]) => km(a) - km(b) || i - j)
    .map(([x]) => x);
}

/** Estado de una LTV en Datos → DLTV, con la decisión del maquinista si la hay. */
function estadoHtml(x, dec) {
  const e = estadoLtv(x, dec);
  return `<span class="dl-res ${e}">${NOMBRE_ESTADO[e]}</span>${dec ? '<span class="dl-rev">revisada</span>' : ""}`;
}

/** Casilla de selección (solo mientras se selecciona). */
const casilla = (x) =>
  vistaDltv.sel ? `<input type="checkbox" class="dl-ck" tabindex="-1" aria-label="Seleccionar la LTV ${esc(x.cod)}"${vistaDltv.sel.has(x.cod) ? " checked" : ""}>` : "";

/** LTV que sigue a la posición actual cuando el tren no está dentro de ninguna (raya encima). */
let proxima = null;

/** Atributos de la fila de una LTV: todas se pueden tocar (revisar o seleccionar). */
function filaAttrs(x, e, aq, extra = "") {
  const sel = vistaDltv.sel?.has(x.cod), pos = x === proxima && extra !== "por";
  return `class="${extra}${aq ? " aqui" : ""}${pos ? " pos-antes" : ""} dl-${e} rvx${sel ? " sel" : ""}" data-a="${x.pkai ?? ""}" data-cod="${esc(x.cod)}" title="${vistaDltv.sel ? "Toca para marcarla" : "Toca para cambiar su estado"}"`;
}

// Teléfono: cada LTV en una tarjeta con todos sus datos.
function dltvMovil(lista, d, dec) {
  let h = "<tbody>";
  for (const x of lista) {
    const dx = dec(x), e = estadoLtv(x, dx);
    const aq = x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
    const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
    const dato = (lab, v) => (v ? `<span><i>${lab}</i> ${v}</span>` : "");
    h += `<tr ${filaAttrs(x, e, aq, "dm")}><td><div class="dm-g">`;
    h += `<div class="dm-1">${casilla(x)}${estadoHtml(x, dx)}${x.va ? " " + cuadroViaHtml(x.va, false) : ""}${x.csv ? ' <span class="cs">CSV</span>' : ""}<span class="vm dm-v">${esc(dx?.decision === "aplica" ? dx.v : x.vel)}</span></div>`;
    h += `<div class="dm-2">${dato("Km ruta", x.pkai != null ? `<b>${nf(x.pkai)} → ${nf(x.pkaf)}</b>` : "")}${dato("Línea", esc(x.lin || ""))}${dato("Vía", x.via ? `<b>${esc(x.via)}</b>${x.via_txt ? " " + esc(x.via_txt) : ""}` : "")}${dato("PK", `${nf(x.pki, 3)} → ${nf(x.pkf, 3)}`)}</div>`;
    if (x.tray?.length) h += `<div class="dm-t">${esc(x.tray.join(" – "))}</div>`;
    if (x.mot) h += `<div class="dm-m">${esc(x.mot)}</div>`;
    h += `<div class="dm-2">${dato("Vigencia", x.vig === "declarada" ? fecha(x.desde) + " – " + fecha(x.hasta) : "semana")}${dato("Horario", esc(x.hor || ""))}</div>`;
    if (x.obs) h += `<div class="dm-o"><i>Observaciones</i> ${esc(x.obs)}</div>`;
    if (dudas.length && !dx) h += `<div class="dm-por">Por qué a revisar: ${esc(dudas.join(" · "))} · <b>toca para decidir</b></div>`;
    h += `</div></td></tr>`;
  }
  return h + "</tbody>";
}

/** LTV añadidas a mano en esta ruta (se guardan con los telefonemas, con `manual`). */
function ltvManuales(ruta, d) {
  const lista = (ruta.telefonemas || []).filter((t) => t.manual);
  if (!lista.length) return "";
  const filas = lista
    .map((t) => {
      const r = rango(t.desde, t.hasta), aq = r && d >= r[0] && d <= r[1];
      return (
        `<div class="ltvm-it${aq ? " aqui" : ""}"><div><div class="ltvm-1"><span class="dl-res ap">A mano</span>${t.csv ? ' <span class="cs">CSV</span>' : ""}<span class="vm">${esc(t.v)} km/h</span></div>` +
        `<b>${esc(resumen(t).replace(/^LTV \d+ km\/h( \(CSV\))? · /, ""))}</b>${r ? `<small>Km ruta ${nf(r[0])} → ${nf(r[1])}</small>` : ""}</div>` +
        `<div class="ltvm-acc"><button data-ltvman="${esc(t.id)}" data-acc="editar">Editar</button><button data-ltvman="${esc(t.id)}" data-acc="borrar" class="peligro">Borrar</button></div></div>`
      );
    })
    .join("");
  return `<div class="ltvm">${filas}</div>`;
}

/** Barra de la selección múltiple: cuántas hay marcadas y a qué estado se pasan. */
function pintarSeleccion(lista) {
  const el = $("dl-sel"), sel = vistaDltv.sel;
  el.hidden = !sel;
  if (!sel) return;
  const n = sel.size, todas = lista.length > 0 && lista.every((x) => sel.has(x.cod)), no = n ? "" : " disabled";
  el.innerHTML =
    `<div class="dl-sel-1"><span><b>${n}</b> ${n === 1 ? "marcada" : "marcadas"}</span><button data-dlsel="todas">${todas ? "Desmarcar todas" : "Todas"}</button><button data-dlsel="fin" class="dl-sel-fin">Terminar</button></div>` +
    `<div class="dl-sel-2"><span>Pasar a</span><button data-dlsel="ap"${no}><span class="dl-res ap">Aplica</span></button><button data-dlsel="no"${no}><span class="dl-res no">No aplica</span></button><button data-dlsel="quitar"${no}>DLTV</button></div>` +
    (vistaDltv.msg ? `<div class="dl-sel-m" role="status">${esc(vistaDltv.msg)}</div>` : "");
}

function pintarDltv(ruta, d) {
  const DL = ruta.p.dltv;
  $("dl-man").innerHTML = ltvManuales(ruta, d);
  $("dl-selb").hidden = !DL || !!vistaDltv.sel;
  if (!DL) {
    vistaDltv.sel = null;
    $("dl-cab").innerHTML = "";
    $("dl-sel").hidden = true;
    $("dl").innerHTML = '<tbody><tr><td style="padding:14px">Esta ruta no tiene documento de LTV cruzado.</td></tr></tbody>';
    return;
  }
  const dec = (x) => ruta.revision?.(x.cod);
  const n = { ap: 0, rv: 0, no: 0 };
  for (const x of DL.ltv) n[estadoLtv(x, dec(x))]++;
  if (vistaDltv.filtro && !(vistaDltv.filtro in n)) vistaDltv.filtro = "";
  // La leyenda es también el filtro: una categoría enseña solo sus LTV; «Todas», todas. Siempre
  // en el orden de la ruta.
  const chip = (k, txt, cuenta) =>
    `<button class="dlc-n${vistaDltv.filtro === k ? " on" : ""}" data-filtro="${k}" aria-pressed="${vistaDltv.filtro === k}">${txt}<b>${cuenta}</b></button>`;
  $("dl-cab").innerHTML =
    `<div class="dlc-1"><b>DLTV nº ${esc(DL.numero || "?")}</b><span>semana ${fecha(DL.desde)} – ${fecha(DL.hasta)}</span></div>` +
    `<div class="dlc-2" role="group" aria-label="Ver las LTV por estado">${chip("", '<span class="dlc-tx">Todas</span>', DL.ltv.length)}${ESTADOS_LTV.map(([k, t]) => chip(k, `<span class="dl-res ${k}">${t}</span>`, n[k])).join("")}</div>`;
  const lista = ltvVisibles(ruta);
  // Posición actual, en el color de la hoja: las LTV en las que está el tren; si no está en
  // ninguna, una raya encima de la siguiente.
  const dentro = (x) => x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
  proxima = lista.some(dentro) ? null : lista.find((x) => x.pkai != null && Math.min(x.pkai, x.pkaf ?? x.pkai) > d) || null;
  pintarSeleccion(lista);
  const vacio = (cols) => `<tbody><tr><td colspan="${cols}" class="dl-vacio">Ninguna LTV ${vistaDltv.filtro ? `«${NOMBRE_ESTADO[vistaDltv.filtro]}»` : ""} en este DLTV.</td></tr></tbody>`;
  if (movil()) return void ($("dl").innerHTML = lista.length ? dltvMovil(lista, d, dec) : vacio(1));
  // Tablet: siete columnas que caben en el ancho (Joan no quiere desplazamiento lateral). Lo que
  // antes eran columnas sueltas va apilado: km de la ruta con línea y PK debajo; motivo con las
  // observaciones; las fechas (si no vale toda la semana) y el horario, bajo el estado.
  const cols = ["Estado", "Km ruta<small>Línea · PK del DLTV</small>", "Vía", "Veloc.", "Trayecto", "Motivo<small>Observaciones</small>"];
  let h = `<colgroup><col class="c-est"><col class="c-km"><col class="c-via"><col class="c-vel"><col class="c-tr"><col class="c-mot"></colgroup>`;
  h += "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead>";
  if (!lista.length) return void ($("dl").innerHTML = h + vacio(cols.length));
  h += "<tbody>";
  for (const x of lista) {
    const dx = dec(x), e = estadoLtv(x, dx);
    const aq = x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
    const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
    h += `<tr ${filaAttrs(x, e, aq)}><td>${casilla(x)}${estadoHtml(x, dx)}${x.va ? " " + cuadroViaHtml(x.va, false) : ""}${x.vig === "declarada" ? `<small>${fecha(x.desde)} – ${fecha(x.hasta)}</small>` : ""}${x.hor ? `<small>${esc(x.hor)}</small>` : ""}</td>`;
    h += `<td><b class="km">${x.pkai != null ? nf(x.pkai) + " → " + nf(x.pkaf) : "–"}</b><small>${x.lin ? "L " + esc(x.lin) + " · " : ""}PK ${nf(x.pki, 3)} → ${nf(x.pkf, 3)}</small></td>`;
    h += `<td title="${esc(x.via_txt || "")}"><b>${esc(x.via || "")}</b><small>${esc(x.via_txt || "")}</small></td>`;
    h += `<td class="ce"><span class="vm">${esc(dx?.decision === "aplica" ? dx.v : x.vel)}</span>${x.csv ? '<span class="cs">CSV</span>' : ""}</td><td>${esc((x.tray || []).join(" – "))}</td>`;
    h += `<td>${esc(x.mot || "")}${x.obs ? `<small>${esc(x.obs)}</small>` : ""}</td></tr>`;
    if (dudas.length && !dx) h += `<tr ${filaAttrs(x, e, aq, "por")}><td></td><td colspan="${cols.length - 1}">Por qué a revisar: ${esc(dudas.join(" · "))} · <b>toca para decidir</b></td></tr>`;
  }
  $("dl").innerHTML = h + "</tbody>";
}

const SENTIDO = { par: "par", impar: "impar" };
const pkTxt = (a, b) => `PK ${nf(a)} → ${nf(b)}`;

/** Cotejo de la hoja con el CVM (C2): qué parte se cotejó con qué cuadro y dónde no coinciden. */
function pintarCvm(ruta) {
  const c = ruta.p.cvm;
  if (!c) {
    $("cv").innerHTML = `<p class="cv-nada">Esta ruta no se ha cotejado con el CVM. Carga el CVM en Ajustes y vuelve a generar la ruta.</p>`;
    return;
  }
  const pk = (x) => ` · km ${nf(x)} de la ruta`;
  const regla = {
    hoja: "Donde no coinciden <b>prevalece la hoja</b> (Ajustes): lo que diría el CVM solo se avisa",
    cvm: "Donde no coinciden <b>prevalece el CVM</b> (Ajustes), también si da más que la hoja",
  }[c.prevalece] || "Donde no coinciden rige la más restrictiva";
  let h = `<p class="cv-cab">Columna <b>${esc(c.columna)}</b> del CVM${c.tope ? ` · tope del tren ${c.tope} km/h` : ""}. ${regla}; lo que no se puede cotejar vale como dice la hoja.</p>`;
  h += `<h3>No coinciden</h3>`;
  h += c.tramos.length
    ? c.tramos
        .map(
          (t) =>
            `<div class="cv-it rv"><b>${pkTxt(t.pki, t.pkf)} · línea ${esc(t.lin)} ${esc(SENTIDO[t.sen] || t.sen || "")}</b>` +
            `<span>Hoja <b>${t.hoja}</b> · CVM <b>${t.cvm}</b> → rige <b>${t.v ?? t.hoja}</b>${t.v != null ? " (el CVM)" : " (la hoja)"}</span>` +
            `<small>${t.pag ? `pág. ${t.pag} · ` : ""}${esc(t.doc || "")}${pk(t.pkai)}</small></div>`,
        )
        .join("")
    : `<p class="cv-nada">Ninguno: la V Max de la hoja coincide con el CVM en todo lo cotejado.</p>`;
  h += pintarVme(c);
  h += `<h3>Partes de la ruta</h3>`;
  h += c.partes
    .map((x) => {
      const n = (x.puntos || 1) - 1;
      const estado = x.cvm
        ? `${x.ok || 0} de ${n} tramos coinciden${x.sin ? ` · ${x.sin} sin cotejo (vale la hoja)` : ""}`
        : `Sin cotejo: ${esc(x.mot || "")}`;
      return `<div class="cv-it${x.cvm ? "" : " sin"}"><b>${esc(x.de || "?")} → ${esc(x.a || "?")}</b><span>Línea ${esc(x.lin || "?")}${x.sen ? " " + esc(x.sen) : ""} · ${estado}</span>${x.cvm ? `<small>${esc(x.cvm)}${x.pags ? ` · págs. ${x.pags.join(", ")}` : ""}</small>` : ""}</div>`;
    })
    .join("");
  $("cv").innerHTML = h;
}

const EFECTO_VME = {
  RIGE: ["rige", "rv"],
  AVISO_VIA: ["aviso · otra vía", "rv"],
  SIN_EFECTO: ["sin efecto", ""],
  SIN_ZONA: ["sin PK · no se avisa", " sin"],
  SIN_VELOCIDAD: ["sin velocidad", " sin"],
};

/** VME del CVM que pisa la ruta (C3): las que rigen o se avisan primero; las demás, contadas. */
function pintarVme(c) {
  const vs = c.vme || [];
  let h = `<h3>VME del CVM</h3>`;
  if (!vs.length) return h + `<p class="cv-nada">Ninguna VME del CVM en esta ruta (o el CVM se cargó antes de la v0.20.0: vuelve a cargarlo).</p>`;
  const avisan = vs.filter((x) => x.ef === "RIGE" || x.ef === "AVISO_VIA"), resto = vs.filter((x) => !avisan.includes(x));
  const zona = (x) => (x.pki == null ? "Sin PK" : x.pki === x.pkf ? `PK ${nf(x.pki)}` : pkTxt(x.pki, x.pkf));
  const item = (x) => {
    const [txt, cl] = EFECTO_VME[x.ef] || [x.ef, ""];
    const rige = x.ef === "RIGE" && c.prevalece === "hoja" ? "aviso · prevalece la hoja" : txt;
    return (
      `<div class="cv-it${cl ? (cl.startsWith(" ") ? cl : " " + cl) : ""}"><b>${zona(x)} · línea ${esc(x.lin)} ${esc(SENTIDO[x.sen] || x.sen || "")} · ${rige}</b>` +
      `<span>${esc(x.txt)}</span>` +
      `<small>${may(`${x.v != null ? `VME ${x.v} · ` : ""}${x.ya != null ? `ya rige ${x.ya} · ` : ""}${esc(x.mot || "")}${x.pag ? ` · pág. ${x.pag}` : ""}`)}</small></div>`
    );
  };
  h += avisan.length ? avisan.map(item).join("") : `<p class="cv-nada">Ninguna baja de lo que ya rige.</p>`;
  if (resto.length) h += `<details class="cv-mas"><summary>${resto.length} más que no cambian nada</summary>${resto.map(item).join("")}</details>`;
  return h;
}

/** Lleva la tabla visible a la fila de la posición actual. */
export function irAqui(d) {
  const dl = pestana === "dltv", w = $(dl ? "dl-w" : "hj-w");
  let r = document.querySelector((dl ? "#dl" : "#tb") + " tr.aqui");
  if (!r && dl) r = [...document.querySelectorAll("#dl tr[data-a]")].find((x) => parseFloat(x.dataset.a) >= d);
  if (r) w.scrollTop = r.offsetTop - w.clientHeight / 3;
}
