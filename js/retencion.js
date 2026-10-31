// Cuánto se guardan los datos en el dispositivo (sin DOM; se prueba con node).
//
// - Grabaciones de recorrido: se borran solas a los DIAS días, salvo las marcadas «Conservar»
//   y la que está en curso. Son la posición del dispositivo segundo a segundo, con la hora.
// - Rutas y DLTV: no se borran solos (pueden hacer falta), pero a los DIAS días se avisa de que
//   son antiguos y se pueden borrar de una vez.

export const DIAS = 30;
const DIA_MS = 864e5;

/** Ids de las grabaciones caducadas. `lista`: [{id (ISO), conservar}]. */
export function caducados(lista, ahora = Date.now(), enCurso = null, dias = DIAS) {
  return lista
    .filter((r) => !r.conservar && r.id !== enCurso && ahora - Date.parse(r.id) > dias * DIA_MS)
    .map((r) => r.id);
}

/** ¿Es antigua una ruta? Por la fecha de la hoja; si no tiene (rutas de prueba), por cuándo se guardó. */
export function rutaAntigua(r, ahora = Date.now(), dias = DIAS) {
  const t = Date.parse(r.fecha || r.guardado || "");
  return Number.isFinite(t) && ahora - t > dias * DIA_MS;
}

/** ¿Es antiguo un DLTV? Cuando su semana terminó hace más de `dias` días. */
export function dltvAntiguo(d, ahora = Date.now(), dias = DIAS) {
  const t = Date.parse(d.hasta || d.guardado || "");
  return Number.isFinite(t) && ahora - t > dias * DIA_MS;
}
