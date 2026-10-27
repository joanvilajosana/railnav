// Trazado de la ruta sobre la vía real (Fase 8). Sin DOM: se prueba con node.
//
// 1. Anclas: las dependencias de la hoja (estaciones, apeaderos, cambios de línea) se buscan
//    entre las estaciones de OpenStreetMap por el nombre (la hoja trunca y abrevia) y se elige
//    la combinación coherente con las distancias de la hoja: entre dos estaciones la vía no
//    puede ser más corta que la línea recta.
// 2. Red de vías del rectángulo que cubre las anclas; entre cada dos anclas seguidas, el camino
//    más corto por la vía cuya longitud se parezca más a la de la hoja.
// 3. Cada vértice del camino recibe su pk_acum repartiendo, entre dos anclas, la distancia de la
//    hoja en proporción a la longitud real: así el trazado queda calibrado con los PK.
// Lo que no encaja (estaciones sin encontrar, tramos sin camino o con longitud muy distinta) se
// apunta en `dudosos` y la app avisa de «posición no fiable» allí.

const R = 6371.0088; // km
const rad = (g) => (g * Math.PI) / 180;

/** Distancia en km entre dos puntos [lat, lon]. */
export function distancia(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------- nombres

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "apd", "estacion", "apeadero", "halt"]);
const norm = (t) =>
  (t || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase();
const palabras = (t) => norm(t).split(/[^a-z0-9]+/).filter((p) => p && !VACIAS.has(p));

/**
 * Parecido entre el nombre de la hoja y uno de OSM (0–1). Las palabras de la hoja de dos o más
 * letras deben empezar alguna palabra de OSM (o al revés); las de una letra («F.G», «S.») solo
 * suman. La primera palabra de la hoja tiene que estar.
 */
export function parecido(hoja, osm) {
  const h = palabras(hoja), o = palabras(osm);
  if (!h.length || !o.length) return 0;
  const casa = (p) => o.some((q) => q.startsWith(p) || (p.length >= 3 && q.length >= 3 && p.startsWith(q)));
  const largas = h.filter((p) => p.length >= 2);
  if (!largas.length || !casa(largas[0])) return 0;
  return largas.filter(casa).length / largas.length;
}

const esBif = (n) => /^bif\b/i.test(norm(n).trim());

/** Palabra más distintiva de cada nombre (la primera de 3 o más letras), para buscar en OSM. */
export const claves = (filas) => filas.filter((f) => f.nom && !esBif(f.nom)).map((f) => palabras(f.nom).find((p) => p.length >= 3)).filter(Boolean);

/**
 * Emparejamiento de las dependencias de la hoja con estaciones de OSM.
 * @param filas  [{nom, pka}] en el orden de la ruta
 * @param osm    [{nombre, otros, lat, lon}]
 * @returns [{nom, pka, lat, lon, osm, parecido}] (solo las encontradas)
 */
export function anclar(filas, osm) {
  const cand = filas.map((f) => {
    if (!f.nom || f.pka == null || esBif(f.nom)) return [];
    const r = [];
    for (const e of osm) {
      const p = Math.max(parecido(f.nom, e.nombre), ...e.otros.map((x) => parecido(f.nom, x)));
      if (p >= 0.5) r.push({ ...e, p });
    }
    return r.sort((a, b) => b.p - a.p).slice(0, 12);
  });
  // Viterbi: elegir como mucho una estación por fila, coherente con las distancias.
  const SALTA = 3, n = filas.length;
  const mejor = cand.map((cs) => cs.map(() => ({ coste: Infinity, prev: null })));
  const trans = (fa, ca, fb, cb) => {
    const delta = Math.abs(fb.pka - fa.pka), g = distancia([ca.lat, ca.lon], [cb.lat, cb.lon]);
    if (g > delta * 1.15 + 1.5) return Infinity; // la recta no puede ser más larga que la vía
    if (delta > 3 && g < delta * 0.4 - 2) return 6; // demasiado sinuoso: improbable
    return 0;
  };
  for (let i = 0; i < n; i++)
    cand[i].forEach((c, k) => {
      let b = { coste: SALTA * i + (1 - c.p) * 2, prev: null };
      for (let j = 0; j < i; j++)
        cand[j].forEach((cj, kj) => {
          const base = mejor[j][kj].coste;
          if (base === Infinity) return;
          const t = trans(filas[j], cj, filas[i], c);
          const coste = base + t + SALTA * (i - j - 1) + (1 - c.p) * 2;
          if (coste < b.coste) b = { coste, prev: [j, kj] };
        });
      mejor[i][k] = b;
    });
  let fin = null, finCoste = SALTA * n;
  for (let i = 0; i < n; i++)
    cand[i].forEach((c, k) => {
      const coste = mejor[i][k].coste + SALTA * (n - 1 - i);
      if (coste < finCoste) [finCoste, fin] = [coste, [i, k]];
    });
  const anclas = [];
  for (let x = fin; x; x = mejor[x[0]][x[1]].prev) {
    const [i, k] = x, c = cand[i][k];
    anclas.unshift({ nom: filas[i].nom, pka: filas[i].pka, lat: c.lat, lon: c.lon, osm: c.nombre, parecido: c.p });
  }
  return anclas;
}

// ---------------------------------------------------------------- red de vías

class Monticulo {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(x) {
    const a = this.a;
    a.push(x);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Vías que un tren de la red convencional evita salvo que no haya otra: alta velocidad, ancho estándar o métrico. */
function penalizacion(t) {
  if (t.highspeed === "yes") return 4;
  if (t.gauge && !/1668/.test(t.gauge)) return 4;
  if (t.service === "siding" || t.service === "crossover") return 1.3;
  return 1;
}

export class Red {
  constructor(vias) {
    this.pos = new Map(); // id → [lat, lon]
    this.ady = new Map(); // id → [[vecino, km reales, coste]]
    for (const w of vias) {
      const pen = penalizacion(w.tags);
      w.nodos.forEach((id, k) => this.pos.set(id, w.geo[k]));
      for (let k = 0; k + 1 < w.nodos.length; k++) {
        const a = w.nodos[k], b = w.nodos[k + 1], km = distancia(w.geo[k], w.geo[k + 1]);
        if (!this.ady.has(a)) this.ady.set(a, []);
        if (!this.ady.has(b)) this.ady.set(b, []);
        this.ady.get(a).push([b, km, km * pen]);
        this.ady.get(b).push([a, km, km * pen]);
      }
    }
    // Rejilla de ~1 km para buscar nodos cerca de un punto.
    this.rejilla = new Map();
    for (const [id, p] of this.pos) {
      const k = this.celda(p);
      if (!this.rejilla.has(k)) this.rejilla.set(k, []);
      this.rejilla.get(k).push(id);
    }
  }
  celda([lat, lon]) {
    return `${Math.floor(lat * 100)},${Math.floor(lon * 80)}`;
  }
  /** Nodos de vía a menos de `radio` km de p: [[id, km]]. */
  cerca(p, radio = 0.6) {
    const r = [], [i0, j0] = [Math.floor(p[0] * 100), Math.floor(p[1] * 80)], m = Math.ceil(radio) + 1;
    for (let i = i0 - m; i <= i0 + m; i++)
      for (let j = j0 - m; j <= j0 + m; j++)
        for (const id of this.rejilla.get(`${i},${j}`) || []) {
          const d = distancia(p, this.pos.get(id));
          if (d <= radio) r.push([id, d]);
        }
    return r.sort((a, b) => a[1] - b[1]);
  }
  /**
   * Caminos más cortos (por coste) desde `origenes` [[id, coste inicial]] hasta `tope` de coste.
   * @returns {Map<id, {coste, km, prev}>}
   */
  dijkstra(origenes, tope) {
    const est = new Map(), h = new Monticulo();
    for (const [id, c0] of origenes) {
      est.set(id, { coste: c0, km: 0, prev: null });
      h.push([c0, id]);
    }
    while (h.size) {
      const [c, id] = h.pop();
      const e = est.get(id);
      if (c > e.coste || c > tope) continue;
      for (const [v, km, coste] of this.ady.get(id) || []) {
        const nc = c + coste, ev = est.get(v);
        if (!ev || nc < ev.coste) {
          est.set(v, { coste: nc, km: e.km + km, prev: id });
          h.push([nc, v]);
        }
      }
    }
    return est;
  }
  camino(est, fin) {
    const r = [];
    for (let id = fin; id != null; id = est.get(id).prev) r.unshift(id);
    return r;
  }
}

// ---------------------------------------------------------------- trazado

const RADIO_ANCLA = 0.8; // km: una estación de OSM está a menos de esto de su vía

/**
 * Trazado calibrado de la ruta.
 * @returns {{puntos: [lat, lon, pka][], anclas, dudosos: [pka_ini, pka_fin, motivo][]}}
 */
export function trazar(red, anclas) {
  const puntos = [], dudosos = [];
  let actual = null; // nodo en el que acaba el tramo anterior
  for (let i = 0; i + 1 < anclas.length; i++) {
    const a = anclas[i], b = anclas[i + 1], delta = b.pka - a.pka;
    if (delta <= 0) continue;
    const origen = actual != null ? [[actual, 0]] : red.cerca([a.lat, a.lon], RADIO_ANCLA).map(([id, d]) => [id, d * 2]);
    const destinos = red.cerca([b.lat, b.lon], RADIO_ANCLA);
    if (!origen.length || !destinos.length) {
      dudosos.push([a.pka, b.pka, !origen.length ? `sin vía cerca de ${a.nom}` : `sin vía cerca de ${b.nom}`]);
      actual = null;
      continue;
    }
    const est = red.dijkstra(origen, delta * 2.5 + 8);
    // De los nodos junto a la estación siguiente, el que deja un recorrido de longitud más
    // parecida a la de la hoja (con preferencia por los más cercanos a la estación).
    let elegido = null, mejor = Infinity;
    for (const [id, d] of destinos) {
      const e = est.get(id);
      if (!e) continue;
      const nota = Math.abs(e.km - delta) + d * 0.5;
      if (nota < mejor) [mejor, elegido] = [nota, id];
    }
    if (elegido == null) {
      dudosos.push([a.pka, b.pka, `sin camino por la vía entre ${a.nom} y ${b.nom}`]);
      actual = null;
      continue;
    }
    const ids = red.camino(est, elegido), km = est.get(elegido).km;
    const razon = km / delta;
    if (razon < 0.85 || razon > 1.2)
      dudosos.push([a.pka, b.pka, `entre ${a.nom} y ${b.nom} la vía mide ${km.toFixed(1)} km y la hoja dice ${delta.toFixed(1)}`]);
    let s = 0;
    ids.forEach((id, k) => {
      if (k > 0) s += distancia(red.pos.get(ids[k - 1]), red.pos.get(id));
      if (k === 0 && puntos.length && actual != null) return; // ya está (fin del tramo anterior)
      const [lat, lon] = red.pos.get(id);
      puntos.push([lat, lon, a.pka + (km > 0 ? (delta * s) / km : 0)]);
    });
    actual = elegido;
  }
  return { puntos: simplificar(puntos, 0.004), anclas, dudosos };
}

/** Douglas-Peucker sobre [lat, lon, pka] con tolerancia en km. */
export function simplificar(p, tol) {
  if (p.length < 3) return p;
  const guardar = new Uint8Array(p.length);
  guardar[0] = guardar[p.length - 1] = 1;
  const pila = [[0, p.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let max = 0, k = -1;
    for (let m = i + 1; m < j; m++) {
      const d = distanciaASegmento(p[m], p[i], p[j]).d;
      if (d > max) [max, k] = [d, m];
    }
    if (max > tol) {
      guardar[k] = 1;
      pila.push([i, k], [k, j]);
    }
  }
  return p.filter((_, i) => guardar[i]);
}

/** Distancia (km) de q al segmento a-b y fracción t del segmento (0–1), en plano local. */
export function distanciaASegmento(q, a, b) {
  const kx = 111.32 * Math.cos(rad(q[0])), ky = 110.574;
  const ax = (a[1] - q[1]) * kx, ay = (a[0] - q[0]) * ky, bx = (b[1] - q[1]) * kx, by = (b[0] - q[0]) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
  const px = ax + t * dx, py = ay + t * dy;
  return { d: Math.hypot(px, py), t };
}

/** Rectángulo [sur, oeste, norte, este] que cubre las anclas, con margen en km. */
export function caja(anclas, margen = 6) {
  const lats = anclas.map((a) => a.lat), lons = anclas.map((a) => a.lon);
  const dLat = margen / 110.574, dLon = margen / (111.32 * Math.cos(rad(lats.reduce((x, y) => x + y, 0) / lats.length)));
  return [Math.min(...lats) - dLat, Math.min(...lons) - dLon, Math.max(...lats) + dLat, Math.max(...lons) + dLon];
}
