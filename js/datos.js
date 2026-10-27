// Vista Datos: ficha del tren y pestañas «Hoja de ruta» (original completa) y «DLTV».

import { esc, fecha, nf } from "./util.js";
import { icono, pic } from "./pictos.js";
import { cuadroViaHtml } from "./marcha.js";

const $ = (id) => document.getElementById(id);
let pestana = "hoja";

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
  const ap = dl ? dl.ltv.filter((x) => x.res === "APLICA").length : 0;
  const rv = dl ? dl.ltv.length - ap : 0;
  const tec = ruta.eventos.filter((e) => e.tipo === "parada_tecnica");
  const tile = (ico, lab, val, tit) => `<div class="tt" title="${esc(tit || lab)}">${ico}<div><b>${lab}</b><span>${val}</span></div></div>`;
  const radio0 = p.radios?.[0]?.[1];
  $("kv").innerHTML =
    `<div class="tr-cab"><span class="tr-ico">${lineal("tren", 30)}</span><div><div class="tr-num">${esc(t.numero)}${t.clase ? ` <span class="tr-cl">${CLASE[t.clase] || esc(t.clase)}</span>` : ""}</div>` +
    `<div class="tr-ruta">${esc(t.origen || "?")} <span>→</span> ${esc(t.destino || "?")}</div></div></div><div class="tr-tiles">` +
    tile(`<span class="tl">${lineal("fecha")}</span>`, "Fecha", fecha(t.fecha) || "?") +
    tile(`<span class="tl">${lineal("loco")}</span>`, "Locomotora", esc(t.locomotora || "?")) +
    tile(`<span class="tl">${lineal("peso")}</span>`, "Peso", t.masa_t ? nf(t.masa_t, 0) + " t" : "?") +
    tile(`<span class="tl">${lineal("tipo")}</span>`, "Tipo de tren", esc(t.tipo || "?")) +
    (radio0 ? tile(icono(pic("radio"), 34, { canal: radio0 }), "Radiotelefonía inicial", "Canal " + esc(radio0)) : "") +
    tile(icono(pic("ltv"), 34, { v: ap }), "LTV que aplican", dl ? ap : "Sin DLTV") +
    (dl ? tile('<span class="tl rv">?</span>', "LTV a revisar", rv) : "") +
    tile(icono(pic("parada_tecnica"), 34, { min: "" }), "Paradas técnicas", tec.length ? tec.map((e) => `${esc(e.datos.nombre)} (${String(e.datos.min).replace(".", ",")} min)`).join(", ") : "Ninguna") +
    `</div>`;
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

function pintarDltv(ruta, d) {
  const DL = ruta.p.dltv;
  if (!DL) {
    $("dl-cab").innerHTML = "";
    $("dl").innerHTML = '<tbody><tr><td style="padding:14px">Esta ruta no tiene documento de LTV cruzado.</td></tr></tbody>';
    return;
  }
  const ap = DL.ltv.filter((x) => x.res === "APLICA").length, rv = DL.ltv.length - ap;
  $("dl-cab").innerHTML =
    `<span><b style="color:var(--tx)">DLTV nº ${esc(DL.numero || "?")}</b> · semana ${fecha(DL.desde)} – ${fecha(DL.hasta)}</span>` +
    `<span><span class="dl-res ap">Aplica</span> ${ap}</span><span><span class="dl-res rv">A revisar</span> ${rv}</span>` +
    `<span>${cuadroViaHtml("vía II", false)} LTV de una sola vía: aparece siempre, indicando a qué vía afecta</span><span>Ordenadas por su posición en la ruta</span>`;
  const cols = ["Estado", "Km ruta", "Línea", "Vía", "PK inicio → fin", "Veloc.", "Trayecto", "Motivo", "Vigencia", "CSV", "Horario", "Observaciones"];
  let h = "<thead><tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
  for (const x of DL.ltv) {
    const aq = x.pkai != null && d >= Math.min(x.pkai, x.pkaf) - 1e-6 && d <= Math.max(x.pkai, x.pkaf) + 1e-6;
    const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
    h += `<tr${aq ? ' class="aqui"' : ""} data-a="${x.pkai ?? ""}"><td>${x.res === "APLICA" ? '<span class="dl-res ap">Aplica</span>' : '<span class="dl-res rv">A revisar</span>'}${x.va ? " " + cuadroViaHtml(x.va, false) : ""}</td>`;
    h += `<td class="n">${x.pkai != null ? nf(x.pkai) + " → " + nf(x.pkaf) : ""}</td><td>${esc(x.lin || "")}</td><td title="${esc(x.via_txt || "")}"><b>${esc(x.via || "")}</b><small>${esc(x.via_txt || "")}</small></td>`;
    h += `<td class="n">${nf(x.pki, 3)} → ${nf(x.pkf, 3)}</td><td class="n"><span class="vm">${esc(x.vel)}</span></td><td class="tw">${esc((x.tray || []).join(" – "))}</td><td class="tw">${esc(x.mot || "")}</td>`;
    h += `<td>${x.vig === "declarada" ? fecha(x.desde) + " – " + fecha(x.hasta) : "semana"}</td><td class="ce">${x.csv ? '<span class="cs">CSV</span>' : ""}</td><td>${esc(x.hor || "")}</td><td class="tw">${esc(x.obs || "")}</td></tr>`;
    if (dudas.length) h += `<tr class="por${aq ? " aqui" : ""}"><td></td><td colspan="${cols.length - 1}">Por qué a revisar: ${esc(dudas.join(" · "))}</td></tr>`;
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
