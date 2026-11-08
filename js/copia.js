// Qué trae una copia de seguridad, para elegir qué se incorpora al restaurarla (sin DOM).
//
// Una copia (`railnav-copia`) es un solo archivo JSON con todo lo guardado en un dispositivo:
// sirve para cambiar de dispositivo, para pasar rutas, DLTV, CVM o tablas de tramos a un
// compañero y para mandar datos al desarrollo de la app. Al importarla se elige qué entra.
//
// - Cada elemento se marca de entrada, salvo lo caducado (más de DIAS días: se borraría al abrir
//   la app) y los ajustes (son de quien hizo la copia: tema, ruta abierta, emisor…).
// - Lo que ya está en el dispositivo con la misma clave se sustituye; se indica.

import { caducados, dltvAntiguo, rutaAntigua } from "./retencion.js";

export const FORMATO_COPIA = "railnav-copia";

// Clave de cada almacén (la misma que en almacen.js) y cómo se llama cada cosa.
export const GRUPOS = [
  { k: "rutas", clave: "id", titulo: "Rutas" },
  { k: "dltv", clave: "id", titulo: "DLTV" },
  { k: "cvm", clave: "id", titulo: "CVM" },
  { k: "tramos", clave: "ruta", titulo: "Tablas de tramos" },
  { k: "geo", clave: "firma", titulo: "Trazados de la vía", soloGrupo: true },
  { k: "recorridos", clave: "id", titulo: "Grabaciones GPS" },
  { k: "telefonemas", clave: "id", titulo: "Telefonemas" },
];

const dma = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "?");
// Fecha y hora locales de un instante ISO (las grabaciones se identifican por su hora UTC).
const local = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function etiqueta(k, f) {
  switch (k) {
    case "rutas": {
      const t = f.paquete?.tren || {};
      return [`Tren ${t.numero ?? "?"}${t.fecha ? " · " + dma(t.fecha) : ""}`, `${t.origen ?? "?"} → ${t.destino ?? "?"}`];
    }
    case "dltv": {
      const d = f.doc || {};
      return [`DLTV nº ${d.numero ?? "?"}`, `${dma(d.semana?.desde)} – ${dma(d.semana?.hasta)} · ${d.registros?.length ?? 0} LTV`];
    }
    case "cvm": {
      const d = f.doc || {};
      return [d.titulo || f.id, `${d.anejo ? "anejo " + d.anejo + " · " : ""}${new Set((d.lineas || []).map((l) => l.linea)).size} líneas`];
    }
    case "tramos":
      return [f.ruta, `${f.tramos?.length ?? 0} tramos`];
    case "recorridos":
      return [`Grabación del ${local(f.id)}`, [f.tren && "tren " + f.tren, f.ruta, `${f.puntos?.length ?? 0} puntos`].filter(Boolean).join(" · ")];
    case "telefonemas":
      return [`Telefonema${f.numero ? " nº " + f.numero : ""} del ${dma(f.fecha || f.id)}`, [f.tipo, f.ruta].filter(Boolean).join(" · ")];
    default:
      return [String(f[GRUPOS.find((g) => g.k === k)?.clave] ?? "?"), ""];
  }
}

function caducado(k, f, ahora) {
  if (k === "rutas") return rutaAntigua(f, ahora);
  if (k === "dltv") return dltvAntiguo(f, ahora);
  if (k === "telefonemas") return caducados([{ id: f.id }], ahora).length > 0;
  if (k === "recorridos") return !f.conservar && caducados([{ id: f.id }], ahora).length > 0;
  return false;
}

/**
 * Lo que trae una copia, por grupos.
 * @param copia       el JSON de la copia
 * @param existentes  {almacén: Set de claves} de lo que ya hay en el dispositivo
 * @returns {{fecha, grupos: {k, titulo, soloGrupo, items: {clave, titulo, detalle, existe, caducado, marcado}[]}[], preferencias: number}}
 */
export function describirCopia(copia, existentes = {}, ahora = Date.now()) {
  if (copia?.formato !== FORMATO_COPIA) throw new Error("no es una copia de seguridad de RailNav");
  const grupos = [];
  for (const g of GRUPOS) {
    const filas = Array.isArray(copia.almacenes?.[g.k]) ? copia.almacenes[g.k] : [];
    const items = filas
      .filter((f) => f && f[g.clave] != null)
      .map((f) => {
        const clave = f[g.clave];
        const [titulo, detalle] = etiqueta(g.k, f);
        const cad = caducado(g.k, f, ahora);
        return { clave, titulo, detalle, existe: !!existentes[g.k]?.has(clave), caducado: cad, marcado: !cad };
      });
    if (items.length) grupos.push({ k: g.k, titulo: g.titulo, soloGrupo: !!g.soloGrupo, items });
  }
  return { fecha: copia.fecha ?? null, grupos, preferencias: Object.keys(copia.preferencias || {}).length };
}

/**
 * La parte de la copia que se ha elegido.
 * @param eleccion  {almacenes: {almacén: Set de claves}, preferencias: bool}
 */
export function filtrarCopia(copia, eleccion) {
  const almacenes = {};
  for (const g of GRUPOS) {
    const si = eleccion.almacenes?.[g.k];
    const filas = Array.isArray(copia.almacenes?.[g.k]) ? copia.almacenes[g.k] : [];
    if (si?.size) almacenes[g.k] = filas.filter((f) => f && si.has(f[g.clave]));
  }
  return { ...copia, almacenes, preferencias: eleccion.preferencias ? copia.preferencias || {} : {} };
}
