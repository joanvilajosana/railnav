// Datos de OpenStreetMap (los mismos que usa OpenRailwayMap) por la API Overpass.
// Solo hace falta conexión al preparar el GPS de una ruta; el trazado queda en el paquete.
// Datos © colaboradores de OpenStreetMap, licencia ODbL.

// Primero el que mejor ha respondido en las pruebas desde España (27-10-2026); los demás
// suelen limitar (429) o no responder.
const SERVIDORES = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Cada servidor se intenta hasta tres veces: si está ocupado (429, 504) se espera y se repite.
// Respuestas ya recibidas en esta sesión: si se reintenta la preparación, no se repiten.
const recibidas = new Map();

export async function consulta(q, espera = 180) {
  if (recibidas.has(q)) return recibidas.get(q);
  const d = await consultaRed(q, espera);
  recibidas.set(q, d);
  return d;
}

async function consultaRed(q, espera) {
  const fallos = [];
  for (const url of SERVIDORES)
    for (let intento = 0; intento < 3; intento++) {
      const ctrl = new AbortController();
      const reloj = setTimeout(() => ctrl.abort(), espera * 1000);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(q),
          signal: ctrl.signal,
        });
        if (r.ok) return await r.json();
        fallos.push(`${new URL(url).host}: ${r.status}`);
        if (r.status !== 429 && r.status !== 504 && r.status !== 503) break;
        await dormir(8000 * (intento + 1));
      } catch (e) {
        fallos.push(`${new URL(url).host}: ${e.name === "AbortError" ? "sin respuesta" : e.message}`);
        break;
      } finally {
        clearTimeout(reloj);
      }
    }
  throw new Error(`OpenStreetMap no responde (${[...new Set(fallos)].join("; ")})`);
}

// Expresión regular que no distingue tildes ni eñes (OSM escribe «Alcázar», la hoja «ALCAZAR»).
const SIN_TILDES = { a: "[aáàä]", e: "[eéèë]", i: "[iíìï]", o: "[oóòö]", u: "[uúùü]", n: "[nñ]", c: "[cç]" };
const patron = (palabra) => [...palabra].map((c) => SIN_TILDES[c] || c).join("");

/**
 * Estaciones de la lista incluida en la app (datos/estaciones.json, generada con
 * `npm run estaciones`): [{nombre, otros, lat, lon, tipo}]. Sin conexión.
 */
export function deLista(datos) {
  return datos.estaciones.map(([nombre, lat, lon, tipo, otros = []]) => ({ nombre, otros, lat, lon, tipo }));
}

/**
 * Estaciones y apeaderos de España cuyo nombre contiene alguna de `claves` (palabras sin tildes,
 * en minúsculas): [{nombre, otros: [nombres alternativos], lat, lon}].
 */
export async function estaciones(claves) {
  const re = [...new Set(claves)].filter((c) => /^[a-z0-9]{3,}$/.test(c)).map(patron).join("|");
  const q = `[out:json][timeout:120];
area["ISO3166-1"="ES"][admin_level=2]->.es;
nwr["railway"~"^(station|halt|stop|service_station|yard)$"]["name"~"${re}",i](area.es);
out tags center;`;
  const d = await consulta(q);
  return d.elements
    .map((e) => {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      const otros = ["official_name", "alt_name", "short_name", "name:es", "old_name"].map((k) => t[k]).filter(Boolean);
      return { nombre: t.name || otros[0] || "", otros, lat, lon, tipo: t.railway };
    })
    .filter((e) => e.nombre && e.lat != null);
}

/**
 * Vías de tren en un rectángulo [sur, oeste, norte, este]: [{id, nodos: [ids], geo: [[lat, lon]],
 * tags}]. Sin vías de playa ni apartaderos particulares (service=yard/spur).
 */
export async function vias(caja) {
  const [s, o, n, e] = caja.map((v) => v.toFixed(5));
  const q = `[out:json][timeout:180];
way["railway"="rail"]["service"!~"^(yard|spur)$"](${s},${o},${n},${e});
out geom;`;
  const d = await consulta(q, 240);
  return d.elements
    .filter((w) => w.type === "way" && w.geometry?.length >= 2)
    .map((w) => ({ id: w.id, nodos: w.nodes, geo: w.geometry.map((p) => [p.lat, p.lon]), tags: w.tags || {} }));
}
