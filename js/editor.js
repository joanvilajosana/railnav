// Ajustes → Pictogramas: los avisos de la pantalla de marcha (editables).

import { esc, texto } from "./util.js";
import { MUESTRA, guardar, icono, reemplazar, restaurar, todos } from "./pictos.js";

const $ = (id) => document.getElementById(id);
const DLTV = ["ltv", "ltv_csv", "fin_ltv"];
let sel = 0;

export function pintarEditor() {
  const D = todos();
  sel = Math.min(sel, D.length - 1);
  $("grid").innerHTML = D.map(
    (p, i) =>
      `<div class="c${i === sel ? " on" : ""}" data-i="${i}">${icono(p, 48, MUESTRA)}${esc(p.nombre)}${DLTV.includes(p.id) ? '<span class="tag">DLTV</span>' : ""}</div>`,
  ).join("");
  pintarFicha();
}

function pintarFicha() {
  const p = todos()[sel];
  const f = (k, l, t) => `<label>${l}<input data-k="${k}" type="${t || "text"}" value="${esc(p[k] ?? "")}"></label>`;
  $("ed").innerHTML =
    `<div class="pv" id="pv"></div>` +
    f("nombre", "Nombre") +
    f("id", "Identificador (lo usan los eventos; no lo cambies en los de serie)") +
    `<label>Forma<select data-k="forma">${["cuadrado", "circulo", "triangulo", "rombo", "vertical"].map((x) => `<option${p.forma === x ? " selected" : ""}>${x}</option>`).join("")}</select></label>` +
    `<div class="r3">${f("fondo", "Fondo", "color")}${f("borde", "Borde", "color")}${f("color", "Símbolo", "color")}</div>` +
    f("glifo", "Texto del símbolo ({a}, {v}, {canal}, {min}…)") +
    `<label>SVG propio (24×24, usa currentColor)<textarea data-k="svg" spellcheck="false">${esc(p.svg || "")}</textarea></label>` +
    f("aviso", "Avisar a (km antes, máx. 3)", "number") +
    f("accion", "Mensaje ({campos} de la hoja o del DLTV)") +
    f("marca", "Marca inferior (color #hex, opcional)");
  vista();
}

const vista = () => {
  const p = todos()[sel];
  $("pv").innerHTML = `${icono(p, 72, MUESTRA)}${icono(p, 32, MUESTRA)}<div><b>850 m</b><br><span style="color:var(--gy)">${esc(texto(p.accion, MUESTRA))}</span></div>`;
};

export function iniciarEditor() {
  $("grid").onclick = (e) => {
    const c = e.target.closest(".c");
    if (c) {
      sel = +c.dataset.i;
      pintarEditor();
    }
  };
  $("ed").oninput = (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    todos()[sel][k] = k === "aviso" ? +e.target.value : e.target.value;
    guardar();
    vista();
    $("grid").querySelector(`[data-i="${sel}"]`).innerHTML = icono(todos()[sel], 48, MUESTRA) + esc(todos()[sel].nombre);
  };
  $("nw").onclick = () => {
    todos().push({ id: "nuevo_" + (todos().length + 1), nombre: "Nuevo pictograma", forma: "cuadrado", fondo: "#10223c", borde: "#c5d1e0", color: "#ffffff", glifo: "?", svg: "", aviso: 3, accion: "", marca: "", tipos: [] });
    sel = todos().length - 1;
    guardar();
    pintarEditor();
  };
  $("du").onclick = () => {
    const c = JSON.parse(JSON.stringify(todos()[sel]));
    c.id += "_copia";
    c.nombre += " (copia)";
    todos().push(c);
    sel = todos().length - 1;
    guardar();
    pintarEditor();
  };
  $("de").onclick = () => {
    if (todos().length <= 1) return;
    todos().splice(sel, 1);
    sel = Math.max(0, sel - 1);
    guardar();
    pintarEditor();
  };
  $("ex").onclick = () => {
    $("js").value = JSON.stringify({ version: 2, pictogramas: todos() }, null, 1);
    $("js").select();
    navigator.clipboard?.writeText($("js").value).catch(() => {});
  };
  $("im").onclick = () => {
    try {
      const o = JSON.parse($("js").value), a = Array.isArray(o) ? o : o.pictogramas;
      if (!Array.isArray(a) || !a.length) throw 0;
      reemplazar(a);
      sel = 0;
      pintarEditor();
    } catch {
      alert("JSON no válido");
    }
  };
  $("rr").onclick = () => {
    if (confirm("¿Restaurar los pictogramas de serie?")) {
      restaurar();
      sel = 0;
      pintarEditor();
    }
  };
}
