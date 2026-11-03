// Cuánto se guardan los datos en el dispositivo (sin DOM; se prueba con node).
//
// - Grabaciones de recorrido: se borran solas a los DIAS días, salvo las marcadas «Conservar»
//   y la que está en curso. Son la posición del dispositivo segundo a segundo, con la hora.
// - Telefonemas: se borran solos a los DIAS días (se exportan antes en CSV para la empresa).
// - Rutas y DLTV (lo que sube el usuario): se borran solos a los DIAS días de guardarlos (una
//   ruta se vuelve a guardar cada vez que se abre: cuenta desde el último uso). La ruta abierta,
//   no.

export const DIAS = 30;
const DIA_MS = 864e5;

/** Ids de las grabaciones caducadas. `lista`: [{id (ISO), conservar}]. */
export function caducados(lista, ahora = Date.now(), enCurso = null, dias = DIAS) {
  return lista
    .filter((r) => !r.conservar && r.id !== enCurso && ahora - Date.parse(r.id) > dias * DIA_MS)
    .map((r) => r.id);
}

/** ¿Es antigua una ruta? Por cuándo se guardó o se abrió por última vez (no por la fecha de la hoja). */
export function rutaAntigua(r, ahora = Date.now(), dias = DIAS) {
  const t = Date.parse(r.guardado || "");
  return Number.isFinite(t) && ahora - t > dias * DIA_MS;
}

/** ¿Es antiguo un DLTV? Cuando se subió hace más de `dias` días. */
export function dltvAntiguo(d, ahora = Date.now(), dias = DIAS) {
  const t = Date.parse(d.guardado || "");
  return Number.isFinite(t) && ahora - t > dias * DIA_MS;
}
