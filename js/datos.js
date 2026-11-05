// Vista Datos: ficha del tren y pestañas «Hoja de ruta» (original completa) y «DLTV».

import { esc, fecha, nf } from "./util.js";
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
  tren: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="13.5" r=".7"/><circle cx="15" cy="13.5" r=".7"/>',
};
export const ICONOS_FICHA = TI;
export const lineal = (k, tam = 26) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k]}</svg>`;

const CLASE = { mercancias: "Mercancías", viajeros: "Viajeros" };

export function pintarDatos(ruta, d) {
  const p = ruta.p, t = ruta.tren;
  const dl = p.dltv;
  const dec = (x) => ruta.revision?.(x.cod);
  const ap = dl ? dl.ltv.filter((x) => x.res === "APLICA" || dec(x)?.decision === "aplica").length : 0;
  const rv = dl ? dl.ltv.filter((x) => x.res !== "APLICA" && !dec(x)).length : 0;
  const tec = ruta.eventos.filter((e) => e.tipo === "parada_tecnica");
  const tile = (ico, lab, val, tit) => `<div class="tt" title="${esc(tit || lab)}">${ico}<div><b>${lab}</b><span>${val}</span></div></div>`;
  const radio0 = p.radios?.[0]?.[1];
  // En el teléfono la ficha se puede plegar a una línea para dejar sitio a la hoja.
  const resumen = [
    fecha(t.fecha) || null,
    dl ? `${ap} LTV${rv ? ` · ${rv} a revisar` : ""}` : "sin DLTV",
    tec.length ? `${tec.length} ${tec.length > 1 ? "paradas técnicas" : "parada técnica"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const plegada = prefs.leer("ficha.plegada", true);
  $("kv").classList.toggle("plegada", plegada);
  $("kv").innerHTML =
    `<div class="tr-cab"><span class="tr-ico">${lineal("tren", 30)}</span><div class="tr-txt"><div class="tr-num">${esc(t.numero)}${t.clase ? ` <span class="tr-cl">${CLASE[t.clase] || esc(t.clase)}</span>` : ""}</div>` +
    `<div class="tr-ruta">${esc(t.origen || "?")} <span>→</span> ${esc(t.destino || "?")}</div><div class="tr-res">${esc(resumen)}</div></div>` +
    `<button class="fi-tg" aria-expanded="${!plegada}" aria-label="${plegada ? "Ver la ficha completa" : "Plegar la ficha"}">${plegada ? "▾" : "▴"}</button></div><div class="tr-tiles">` +
    tile(`<span class="tl">${lineal("fecha")}</span>`, "Fecha", fecha(t.fecha) || "?") +
    tile(`<span class="tl">${lineal("loco")}</span>`, "Locomotora", esc(t.locomotora || "?")) +
    tile(`<span class="tl">${lineal("peso")}</span>`, "Peso", t.masa_t ? nf(t.masa_t, 0) + " t" : "?") +
    tile(`<span class="tl">${lineal("tipo")}</span>`, "Tipo de tren", esc(t.tipo || "?")) +
    (radio0 ? tile(icono(pic("radio"), 34, { canal: radio0 }), "Radiotelefonía inicial", "Canal " + esc(radio0)) : "") +
    tile(icono(pic("ltv"), 34, { v: ap }), "LTV que aplican", dl ? ap : "Sin DLTV") +
    (dl ? tile('<span class="tl rv">?</span>', "LTV a revisar", rv) : "") +
    tile(icono(pic("parada_tecnica"), 34, { min: "" }), "Paradas técnicas", tec.length ? tec.map((e) => `${esc(e.datos.nombre)} (${String(e.datos.min).replace(".", ",")} min)`).join(", ") : "Ninguna") +
    `</div>`;
  $("kv").querySelector(".fi-tg").onclick = () => {
    prefs.escribir("ficha.plegada", !plegada);
    pintarDatos(ruta, d);
  };
  pintarHoja(ruta, d);
  pintarDltv(ruta, d);
  mostrarPestana();
}

export function mostrarPestana(t) {
  if (t) pestana = t;
  $("t-hoja").hidden = pestana !== "hoja";
  $("t-dltv").hidden = pestana !== "dltv";
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

/** Estado de una LTV en Datos → DLTV, con la decisión del maquinista si la hay. */
function estadoHtml(x, dec) {
  if (dec?.decision === "aplica") return '<span class="dl-res ap">Aplica</span><span class="dl-rev">revisada</span>';
  if (dec?.decision === "no") return '<span class="dl-res no">No aplica</span><span class="dl-rev">revisada</span>';
  return x.res === "APLICA" ? '<span class="dl-res ap">Aplica</span>' : '<span class="dl-res rv">A revisar</span>';
}

// Teléfono: cada LTV en una tarjeta con todos sus datos.
function dltvMovil(DL, d, dec = () => null) {
  let h = "<tbody>";
  for (const x of DL.ltv) {
    const aq = x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
    const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
    const dato = (lab, v) => (v ? `<span><i>${lab}</i> ${v}</span>` : "");
    const rvx = x.res !== "APLICA", dx = dec(x);
    h += `<tr class="dm${aq ? " aqui" : ""}${rvx ? " rvx" : ""}" data-a="${x.pkai ?? ""}"${rvx ? ` data-rev="${esc(x.cod)}"` : ""}><td><div class="dm-g">`;
    h += `<div class="dm-1">${estadoHtml(x, dx)}${x.va ? " " + cuadroViaHtml(x.va, false) : ""}${x.csv ? ' <span class="cs">CSV</span>' : ""}<span class="vm dm-v">${esc(dx?.decision === "aplica" ? dx.v : x.vel)}</span></div>`;
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

function pintarDltv(ruta, d) {
  const DL = ruta.p.dltv;
  $("dl-man").innerHTML = ltvManuales(ruta, d);
  if (!DL) {
    $("dl-cab").innerHTML = "";
    $("dl").innerHTML = '<tbody><tr><td style="padding:14px">Esta ruta no tiene documento de LTV cruzado.</td></tr></tbody>';
    return;
  }
  const dec = (x) => ruta.revision?.(x.cod);
  const ap = DL.ltv.filter((x) => x.res === "APLICA" || dec(x)?.decision === "aplica").length;
  const rv = DL.ltv.filter((x) => x.res !== "APLICA" && !dec(x)).length;
  $("dl-cab").innerHTML =
    `<div class="dlc-1"><b>DLTV nº ${esc(DL.numero || "?")}</b><span>semana ${fecha(DL.desde)} – ${fecha(DL.hasta)}</span></div>` +
    `<div class="dlc-2"><span class="dlc-n"><span class="dl-res ap">Aplica</span><b>${ap}</b></span><span class="dlc-n"><span class="dl-res rv">A revisar</span><b>${rv}</b></span></div>`;
  if (movil()) return void ($("dl").innerHTML = dltvMovil(DL, d, dec));
  // Tablet: siete columnas que caben en el ancho (Joan no quiere desplazamiento lateral). Lo que
  // antes eran columnas sueltas va apilado: km de la ruta con línea y PK debajo; motivo con las
  // observaciones; las fechas (si no vale toda la semana) y el horario, bajo el estado.
  const cols = ["Estado", "Km ruta<small>Línea · PK del DLTV</small>", "Vía", "Veloc.", "Trayecto", "Motivo<small>Observaciones</small>"];
  let h = `<colgroup><col class="c-est"><col class="c-km"><col class="c-via"><col class="c-vel"><col class="c-tr"><col class="c-mot"></colgroup>`;
  h += "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
  for (const x of DL.ltv) {
    const aq = x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
    const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
    const rvx = x.res !== "APLICA";
    h += `<tr class="${aq ? "aqui" : ""}${rvx ? " rvx" : ""}" data-a="${x.pkai ?? ""}"${rvx ? ` data-rev="${esc(x.cod)}" title="Toca para revisarla"` : ""}><td>${estadoHtml(x, dec(x))}${x.va ? " " + cuadroViaHtml(x.va, false) : ""}${x.vig === "declarada" ? `<small>${fecha(x.desde)} – ${fecha(x.hasta)}</small>` : ""}${x.hor ? `<small>${esc(x.hor)}</small>` : ""}</td>`;
    h += `<td><b class="km">${x.pkai != null ? nf(x.pkai) + " → " + nf(x.pkaf) : "–"}</b><small>${x.lin ? "L " + esc(x.lin) + " · " : ""}PK ${nf(x.pki, 3)} → ${nf(x.pkf, 3)}</small></td>`;
    h += `<td title="${esc(x.via_txt || "")}"><b>${esc(x.via || "")}</b><small>${esc(x.via_txt || "")}</small></td>`;
    h += `<td class="ce"><span class="vm">${esc(dec(x)?.decision === "aplica" ? dec(x).v : x.vel)}</span>${x.csv ? '<span class="cs">CSV</span>' : ""}</td><td>${esc((x.tray || []).join(" – "))}</td>`;
    h += `<td>${esc(x.mot || "")}${x.obs ? `<small>${esc(x.obs)}</small>` : ""}</td></tr>`;
    if (dudas.length && !dec(x)) h += `<tr class="por${aq ? " aqui" : ""} rvx" data-rev="${esc(x.cod)}"><td></td><td colspan="${cols.length - 1}">Por qué a revisar: ${esc(dudas.join(" · "))} · <b>toca para decidir</b></td></tr>`;
  }
  $("dl").innerHTML = h + "</tbody>";
}

/** Lleva la tabla visible a la fila de la posición actual. */
export function irAqui(d) {
  const dl = pestana === "dltv", w = $(dl ? "dl-w" : "hj-w");
  let r = document.querySelector((dl ? "#dl" : "#tb") + " tr.aqui");
  if (!r && dl) r = [...document.querySelectorAll("#dl tr[data-a]")].find((x) => parseFloat(x.dataset.a) >= d);
  if (r) w.scrollTop = r.offsetTop - w.clientHeight / 3;
}
