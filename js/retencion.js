// Cuánto se guardan los datos en el dispositivo (sin DOM; se prueba con node).
//
// - Grabaciones de recorrido: se borran solas a los DIAS días, salvo las marcadas «Conservar»
//   y la que está en curso. Son la posición del dispositivo segundo a segundo, con la hora.
// - Telefonemas: se borran solos a los DIAS días (se exportan antes en CSV para la empresa).
// - Rutas y DLTV (lo que sube el usuario): se borran solos a los DIAS días de guardarlos (una
//   ruta se vuelve a guardar cada vez que se abre: cuenta desde el último uso). La ruta abierta,
//   no.

export const DIAS = 30;
export const AVISO_DIAS = 10; // se avisa cuando faltan estos días o menos (Joan, v0.20.4)
const DIA_MS = 864e5;

/** Días que faltan para que se borre algo guardado en `iso` (0 = hoy). null si no hay fecha. */
export function diasRestantes(iso, ahora = Date.now(), dias = DIAS) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t + dias * DIA_MS - ahora) / DIA_MS)) : null;
}

/** ¿Caduca pronto? (en AVISO_DIAS días o menos) */
export const caducaPronto = (iso, ahora = Date.now()) => {
  const n = diasRestantes(iso, ahora);
  return n != null && n <= AVISO_DIAS;
};

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
