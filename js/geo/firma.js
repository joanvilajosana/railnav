// Firma de una ruta: la misma para todas las hojas del mismo recorrido (origen, destino y
// dependencias con su pk_acum), sea cual sea el día o el DLTV. Con ella se reutiliza el
// trazado de la vía.

export const firma = (p) =>
  [p.tren?.origen, p.tren?.destino, p.fin, ...(p.hoja || []).filter((f) => f.nom).map((f) => `${f.nom}@${f.pka ?? 0}`)].join("|");

/** Trazado incluido en la app (datos/trazados.json) para esa ruta, o null. */
let incluidos = null;
export async function trazadoIncluido(paquete, cargar = () => fetch("datos/trazados.json").then((r) => (r.ok ? r.json() : null))) {
  if (!incluidos) incluidos = await Promise.resolve(cargar()).catch(() => null) || { trazados: [] };
  const f = firma(paquete);
  return incluidos.trazados.find((t) => t.firma === f)?.geo ?? null;
}
