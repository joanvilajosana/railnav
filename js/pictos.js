// Pictogramas: los de serie vienen de datos/pictogramas.json (el mismo repositorio que usa el
// generador de eventos); los cambios del usuario se guardan en este dispositivo.

import { esc, rellenar } from "./util.js";
import { prefs } from "./almacen.js";

let SERIE = [];
let D = [];

export async function cargarPictos(url = "datos/pictogramas.json") {
  const r = await fetch(url);
  SERIE = (await r.json()).pictogramas;
  const propios = prefs.leer("pictos", null);
  D = Array.isArray(propios) && propios.length ? propios : clonar(SERIE);
  return D;
}

const clonar = (x) => JSON.parse(JSON.stringify(x));
export const todos = () => D;
export const deSerie = () => SERIE;
export const pic = (id) => D.find((p) => p.id === id);
/** Pictograma de un evento: el que indica el evento o, si se borró, el primero de su tipo. */
export const picDe = (e) => pic(e.pictograma) || D.find((p) => (p.tipos || []).includes(e.tipo));
export const guardar = () => prefs.escribir("pictos", D);
export const restaurar = () => {
  D = clonar(SERIE);
  prefs.borrar("pictos");
  return D;
};
export const reemplazar = (lista) => {
  D = lista;
  guardar();
};

const limpiarSvg = (s) =>
  String(s || "").replace(/<script[\s\S]*?<\/script>|\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");

/** SVG (48×48) de un pictograma con los datos de un evento. */
export function forma(p, datos) {
  const st = `fill="${esc(p.fondo || "#10223c")}" stroke="${esc(p.borde || "#c5d1e0")}" stroke-width="3"`;
  const c = esc(p.color || "#fff");
  const sh =
    {
      cuadrado: `<rect x="4" y="4" width="40" height="40" rx="7" ${st}/>`,
      circulo: `<circle cx="24" cy="24" r="20" ${st}/>`,
      triangulo: `<polygon points="24,4 45,42 3,42" ${st} stroke-linejoin="round"/>`,
      rombo: `<polygon points="24,3 45,24 24,45 3,24" ${st}/>`,
      vertical: `<rect x="13" y="3" width="22" height="42" rx="3" ${st}/>`,
    }[p.forma] || "";
  const g = rellenar(p.glifo, datos);
  const fs = g.length <= 1 ? 24 : g.length == 2 ? 19 : g.length == 3 ? 14 : 11;
  const dy = p.forma == "triangulo" ? 9 : 0;
  return (
    sh +
    (p.marca ? `<rect x="17" y="40" width="14" height="7" fill="${esc(p.marca)}" stroke="#111" stroke-width="1.5"/>` : "") +
    (p.svg
      ? `<g color="${c}" transform="translate(8 8) scale(1.333)">${limpiarSvg(p.svg)}</g>`
      : `<text x="24" y="${24 + fs * 0.35 + dy}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${c}">${esc(g)}</text>`)
  );
}

export const icono = (p, tam, datos) =>
  `<svg viewBox="0 0 48 48" width="${tam}" height="${tam}" aria-hidden="true">${p ? forma(p, datos) : ""}</svg>`;

/** Datos de ejemplo para el editor. */
export const MUESTRA = { nombre: "Tablada", hora: "09:56", min: 7, canal: 66, de: 110, a: 90, v: 60, motivo: "túnel", nota: "vía I", pk: "6,2" };
