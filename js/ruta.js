// Paquete de ruta (formato «railnav-ruta» v1, lo genera `python -m cruce.paquete`) y las
// consultas que hace la pantalla: Vmax en un punto, siguiente cambio, hora estimada…
// Sin DOM: se prueba con node --test.

import { minutos } from "./util.js";

export const FORMATO = "railnav-ruta";
export const VERSION = 1;

/** Errores de un paquete; lista vacía si se puede abrir. */
export function validar(p) {
  const e = [];
  if (!p || typeof p !== "object") return ["no es un paquete de ruta"];
  if (p.formato !== FORMATO) e.push(`formato «${p.formato}»: se esperaba «${FORMATO}»`);
  if (p.version !== VERSION) e.push(`versión ${p.version}: esta app lee la versión ${VERSION}`);
  if (!p.id) e.push("sin identificador");
  if (!p.tren || !p.tren.numero) e.push("sin tren");
  if (!Array.isArray(p.eventos)) e.push("sin eventos");
  if (!Array.isArray(p.vmax)) e.push("sin Vmax efectiva");
  if (!(p.fin >= 0)) e.push("sin longitud de ruta");
  return e;
}

/** Valor de una lista [[pk_acum, valor], …] en el punto d. */
export const valorEn = (lista, d) => {
  let v = null;
  for (const [pk, x] of lista || []) if (pk <= d + 1e-6) v = x;
  return v;
};

export class Ruta {
  constructor(p) {
    const errores = validar(p);
    if (errores.length) throw new Error(errores.join("; "));
    this.p = p;
    this.id = p.id;
    this.tren = p.tren;
    this.fin = p.fin;
    this.vmax = [...p.vmax].sort((a, b) => a.pk_acum_ini - b.pk_acum_ini);
    this.eventos = [...p.eventos].sort((a, b) => a.pk_acum - b.pk_acum);
    this.horario = (p.horario || []).map(([pk, h]) => [pk, minutos(h)]);
    // Horas que pasan de medianoche: se siguen contando (23:50 → 24:10).
    for (let i = 1; i < this.horario.length; i++)
      while (this.horario[i][1] < this.horario[i - 1][1] - 60) this.horario[i][1] += 1440;
  }

  /** Tramo de Vmax efectiva en d (o null). */
  tramo(d) {
    let t = null;
    for (const x of this.vmax) if (x.pk_acum_ini <= d + 1e-6) t = x;
    return t;
  }

  vEn(d) {
    return this.tramo(d)?.v ?? null;
  }

  /** Siguiente cambio de Vmax efectiva después de d: { pk, v, tramo } o null. */
  siguiente(d) {
    const actual = this.vEn(d);
    for (const t of this.vmax)
      if (t.pk_acum_ini > d + 1e-6 && t.v != null && t.v !== actual) return { pk: t.pk_acum_ini, v: t.v, tramo: t };
    return null;
  }

  radioEn(d) {
    return valorEn(this.p.radios, d);
  }

  bloqueoEn(d) {
    return valorEn(this.p.bloqueos, d);
  }

  /** Hora estimada (minutos) en d, interpolando el horario de la hoja. */
  eta(d) {
    const h = this.horario;
    if (!h.length) return null;
    if (d <= h[0][0]) return h[0][1];
    for (let i = 1; i < h.length; i++)
      if (d <= h[i][0]) {
        const [a, ta] = h[i - 1], [b, tb] = h[i];
        return b > a ? ta + ((d - a) / (b - a)) * (tb - ta) : tb;
      }
    return h[h.length - 1][1];
  }

  /** Eventos ya pasados, del más reciente al más antiguo. */
  pasados(d) {
    return this.eventos.filter((e) => e.pk_acum <= d + 1e-6).reverse();
  }

  /** Eventos por delante a menos de `alcance(e)` km. */
  proximos(d, alcance) {
    return this.eventos.filter((e) => e.pk_acum > d + 0.02 && e.pk_acum - d <= alcance(e));
  }
}
