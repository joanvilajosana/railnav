// Lo que la app guarda en el dispositivo:
//   rutas  → IndexedDB (paquetes de ruta cargados o generados; sin límite práctico de tamaño)
//   dltv   → IndexedDB (DLTV leídos de su PDF: se leen una vez por semana)
//   tramos → IndexedDB (tablas de tramos confirmadas por el maquinista en este iPad)
//   geo    → IndexedDB (trazados de la vía ya preparados, por ruta: se reutilizan cada día)
//   recorridos → IndexedDB (grabaciones de la posición del iPad)
//   prefs  → localStorage (ruta activa, posición por ruta, tema, modo de posición, pictogramas)
// Si el navegador no deja guardar (modo privado…), todo sigue funcionando en memoria.

const PREFIJO = "railnav.";
const memoria = new Map();

export const prefs = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem(PREFIJO + clave);
      return v == null ? defecto : JSON.parse(v);
    } catch {
      return memoria.has(clave) ? memoria.get(clave) : defecto;
    }
  },
  escribir(clave, valor) {
    memoria.set(clave, valor);
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  },
  borrar(clave) {
    memoria.delete(clave);
    try {
      localStorage.removeItem(PREFIJO + clave);
    } catch {
      /* nada */
    }
  },
};

let db = null;
const ALMACENES = { rutas: "id", dltv: "id", tramos: "ruta", geo: "firma", recorridos: "id" };
const mem = Object.fromEntries(Object.keys(ALMACENES).map((k) => [k, new Map()]));

function abrir() {
  if (db) return Promise.resolve(db);
  return new Promise((ok) => {
    try {
      const r = indexedDB.open("railnav", 3);
      r.onupgradeneeded = () => {
        for (const [nombre, clave] of Object.entries(ALMACENES))
          if (!r.result.objectStoreNames.contains(nombre)) r.result.createObjectStore(nombre, { keyPath: clave });
      };
      r.onsuccess = () => ok((db = r.result));
      r.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
}

function tx(almacen, modo, fn) {
  return abrir().then(
    (base) =>
      new Promise((ok, mal) => {
        if (!base) return ok(fn(null));
        const t = base.transaction(almacen, modo);
        const r = fn(t.objectStore(almacen));
        t.oncomplete = () => ok(r && "result" in r ? r.result : r);
        t.onerror = () => mal(t.error);
      }),
  );
}

// Operaciones comunes de un almacén, con copia en memoria si IndexedDB no está disponible.
const almacen = (nombre) => ({
  async poner(fila) {
    mem[nombre].set(fila[ALMACENES[nombre]], fila);
    await tx(nombre, "readwrite", (s) => s && s.put(fila)).catch(() => null);
  },
  async todas() {
    return (await tx(nombre, "readonly", (s) => s && s.getAll()).catch(() => null)) || [...mem[nombre].values()];
  },
  async una(id) {
    return (await tx(nombre, "readonly", (s) => s && s.get(id)).catch(() => null)) || mem[nombre].get(id) || null;
  },
  async quitar(id) {
    mem[nombre].delete(id);
    await tx(nombre, "readwrite", (s) => s && s.delete(id)).catch(() => null);
  },
});
const A = Object.fromEntries(Object.keys(ALMACENES).map((k) => [k, almacen(k)]));

const resumen = (p, guardado) => ({
  id: p.id,
  tren: p.tren.numero,
  fecha: p.tren.fecha,
  origen: p.tren.origen,
  destino: p.tren.destino,
  ltv: p.fuentes?.ltv_numero || null,
  guardado,
});

export const rutas = {
  async guardar(paquete) {
    const fila = { id: paquete.id, guardado: new Date().toISOString(), paquete };
    await A.rutas.poner(fila);
    return resumen(paquete, fila.guardado);
  },
  async listar() {
    return (await A.rutas.todas()).map((f) => resumen(f.paquete, f.guardado)).sort((a, b) => (a.guardado < b.guardado ? 1 : -1));
  },
  async cargar(id) {
    return (await A.rutas.una(id))?.paquete ?? null;
  },
  borrar: (id) => A.rutas.quitar(id),
};

// DLTV leídos: se guardan los últimos MAX_DLTV (cada uno ocupa alrededor de 1 MB).
const MAX_DLTV = 4;
const resumenDltv = (f) => ({
  id: f.id,
  numero: f.doc.numero,
  desde: f.doc.semana?.desde ?? null,
  hasta: f.doc.semana?.hasta ?? null,
  archivo: f.doc.fuente.archivo,
  ltv: f.doc.registros.length,
  guardado: f.guardado,
});

export const dltvs = {
  async guardar(doc) {
    const id = `${doc.numero ?? "sn"}-${doc.semana?.desde ?? doc.fuente.sha256.slice(0, 12)}`;
    const fila = { id, guardado: new Date().toISOString(), doc };
    await A.dltv.poner(fila);
    const todas = (await A.dltv.todas()).sort((a, b) => (a.guardado < b.guardado ? 1 : -1));
    for (const f of todas.slice(MAX_DLTV)) await A.dltv.quitar(f.id);
    return resumenDltv(fila);
  },
  async listar() {
    return (await A.dltv.todas()).map(resumenDltv).sort((a, b) => ((a.desde ?? "") < (b.desde ?? "") ? 1 : -1));
  },
  async cargar(id) {
    return (await A.dltv.una(id))?.doc ?? null;
  },
  borrar: (id) => A.dltv.quitar(id),
};

// Tablas de tramos confirmadas en este iPad (clave: el nombre de la ruta).
export const tramos = {
  guardar: (tabla) => A.tramos.poner(tabla),
  listar: () => A.tramos.todas(),
  borrar: (ruta) => A.tramos.quitar(ruta),
};

// Trazados de la vía ya preparados. La firma identifica la ruta (mismas dependencias y PK).
export { firma as firmaRuta } from "./geo/firma.js";
export const geos = {
  guardar: (firma, geo) => A.geo.poner({ firma, geo }),
  cargar: async (firma) => (await A.geo.una(firma))?.geo ?? null,
};

// Recorridos grabados (los 10 últimos).
export const recorridos = {
  async guardar(r) {
    await A.recorridos.poner(r);
    const todas = (await A.recorridos.todas()).sort((a, b) => (a.id < b.id ? 1 : -1));
    for (const f of todas.slice(10)) await A.recorridos.quitar(f.id);
  },
  listar: async () => (await A.recorridos.todas()).sort((a, b) => (a.id < b.id ? 1 : -1)),
  cargar: (id) => A.recorridos.una(id),
  borrar: (id) => A.recorridos.quitar(id),
};

/** Pide al navegador que no borre los datos guardados (iPad: app en la pantalla de inicio). */
export const persistir = () => navigator.storage?.persist?.().catch(() => false);
