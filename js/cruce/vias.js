// Cómo se nombra la vía afectada por una LTV, a partir de la leyenda del propio DLTV
// (traducción de cruce/vias.py).

// Leyenda de vía banalizada (y no «No banalizada»): se lee del documento, no se codifica.
export const BANALIZADA = /(?<!no )banalizada/i;

/** «vía II» si es banalizada; si no, la vía con su leyenda. */
export function textoVia(codigo, viaAfectada) {
  if (BANALIZADA.test(viaAfectada)) return `vía ${viaAfectada.split(" (")[0]}`;
  if (codigo && viaAfectada !== codigo) return `vía ${codigo}: ${viaAfectada}`;
  return `vía ${viaAfectada}`;
}

/** La vía para la pantalla de marcha: «vía II», «vía I: impar, no banalizada»… */
export function textoViaCorto(codigo, viaAfectada) {
  if (BANALIZADA.test(viaAfectada) || !codigo) return textoVia(codigo, viaAfectada);
  if (viaAfectada === codigo) return `vía ${codigo}`;
  const m = /^\s*(.+?)\s*\((.+)\)\s*$/.exec(viaAfectada);
  if (m) {
    const detalle = m[2].trim();
    const cuando = /^cuando\s+(.+)/i.exec(detalle);
    if (cuando) {
      const t = cuando[1];
      return `vía ${codigo}: ${t[0].toUpperCase()}${t.slice(1).toLowerCase()}`;
    }
    return `vía ${codigo}: ${m[1].toLowerCase()}, ${detalle.toLowerCase()}`;
  }
  return `vía ${codigo}: ${viaAfectada.toLowerCase()}`;
}
