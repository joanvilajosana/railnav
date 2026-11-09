// Paquete de ruta (formato «railnav-ruta» v1, lo genera `python -m cruce.paquete`) y las
// consultas que hace la pantalla: Vmax en un punto, siguiente cambio, hora estimada…
// Sin DOM: se prueba con node --test.

import { minutos } from "./util.js";
import { PICTOS, efectos, pkEn, superponer, vmaxHoja } from "./telefonemas.js";

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
    this.vmax0 = [...p.vmax].sort((a, b) => a.pk_acum_ini - b.pk_acum_ini);
    this.eventos0 = [...p.eventos].sort((a, b) => a.pk_acum - b.pk_acum);
    this.cola = 0;
    this.revisiones = {};
    this.ponerTelefonemas([]);
    this.horario = (p.horario || []).map(([pk, h]) => [pk, minutos(h)]);
    // Horas que pasan de medianoche: se siguen contando (23:50 → 24:10).
    for (let i = 1; i < this.horario.length; i++)
      while (this.horario[i][1] < this.horario[i - 1][1] - 60) this.horario[i][1] += 1440;
  }

  /**
   * Telefonemas registrados (js/telefonemas.js): sus LTV entran en la Vmax efectiva y sus
   * avisos (LTV, marcha a la vista, incidencias) en la lista de eventos.
   */
  /**
   * Decisiones del maquinista sobre las LTV del DLTV (Datos → DLTV): { cod: { decision:
   * "aplica" | "no", v } }. Valen para todas, no solo las «a revisar»: las que aplican entran en
   * la Vmax con su velocidad; las que no aplican (p. ej. las de una vía de apartado) salen de los
   * avisos y, si el DLTV las daba como APLICA, también de la Vmax, como si un telefonema las
   * suprimiera. Los datos del DLTV no se tocan. Se guardan en el dispositivo, por ruta.
   */
  ponerRevisiones(r) {
    this.revisiones = r || {};
    this.ponerTelefonemas(this.telefonemas);
  }

  /** Decisión sobre una LTV del DLTV (por su código), o null. */
  revision(cod) {
    return this.revisiones?.[cod] || null;
  }

  ponerTelefonemas(lista) {
    this.telefonemas = lista || [];
    const { eventos, limites, vistas, suprimidas } = efectos(lista, this.p);
    this.vistas = vistas;
    const rev = this.revisiones || {}, dl = this.p.dltv?.ltv || [];
    // LTV del DLTV suprimidas por telefonema, o que el DLTV da como APLICA y el maquinista ha
    // marcado «No aplica» o con otra velocidad: donde mandaban, vuelve la de la hoja (o la de
    // otra LTV que siga en vigor).
    const fuera = new Set(suprimidas.keys());
    for (const l of dl) {
      const r = rev[l.cod];
      if (l.res === "APLICA" && r && (r.decision === "no" || (r.decision === "aplica" && r.v !== l.v))) fuera.add("ltv-" + l.cod);
    }
    let base = this.vmax0;
    if (fuera.size) {
      const hoja = vmaxHoja(this.p);
      const otras = dl
        .filter((l) => l.res === "APLICA" && l.v != null && l.pkai != null && !fuera.has("ltv-" + l.cod))
        .map((l) => ({ ini: l.pkai, fin: l.pkaf, v: l.v, id: "ltv-" + l.cod }))
        // donde rige el CVM (la hoja da más), sigue rigiendo
        .concat((this.p.cvm?.tramos || []).filter((x) => x.v != null).map((x) => ({ ini: x.pkai, fin: x.pkaf, v: x.v, id: null, fuente: "cvm", cvm: true })))
        .concat(
          this.p.cvm?.prevalece === "hoja"
            ? []
            : (this.p.cvm?.vme || []).filter((x) => x.ef === "RIGE" && x.v != null && x.pkaf > x.pkai).map((x) => ({ ini: x.pkai, fin: x.pkaf, v: x.v, id: null, fuente: "cvm", cvm: true })),
        );
      base = [];
      for (const t of this.vmax0) {
        if (t.fuente !== "ltv" || !fuera.has(t.ltv)) {
          base.push(t);
          continue;
        }
        const recorte = (x) => ({ ...x, pk_acum_ini: Math.max(x.pk_acum_ini, t.pk_acum_ini), pk_acum_fin: Math.min(x.pk_acum_fin, t.pk_acum_fin) });
        const h = hoja.filter((x) => x.pk_acum_fin > t.pk_acum_ini && x.pk_acum_ini < t.pk_acum_fin).map(recorte);
        const lims = otras.filter((l) => l.fin > t.pk_acum_ini && l.ini < t.pk_acum_fin).map((l) => ({ ...l, ini: Math.max(l.ini, t.pk_acum_ini), fin: Math.min(l.fin, t.pk_acum_fin) }));
        base.push(...(lims.length ? superponer(h, lims).map((x) => (x.telefonema ? { ...x, telefonema: undefined } : x)) : h));
      }
    }
    // LTV revisadas a mano: las que aplican, con su velocidad; ya no quedan «a revisar».
    const revLim = dl
      .filter((l) => rev[l.cod]?.decision === "aplica" && rev[l.cod].v && l.pkai != null && l.pkaf != null)
      .map((l) => ({ ini: Math.min(l.pkai, l.pkaf), fin: Math.max(l.pkai, l.pkaf), v: rev[l.cod].v, id: "ltv-" + l.cod }));
    this.vmax = superponer(base, [...limites, ...revLim]);
    if (Object.keys(rev).length) {
      const pendientes = dl.filter((l) => l.res !== "APLICA" && !rev[l.cod]);
      const pisa = (l, t) => l.pkai == null || (Math.min(l.pkai, l.pkaf) < t.pk_acum_fin && Math.max(l.pkai, l.pkaf) > t.pk_acum_ini);
      this.vmax = this.vmax.map((t) => (t.revisar && !t.cvm && !pendientes.some((l) => pisa(l, t)) ? { ...t, revisar: false } : t));
    }
    const decidida = (e) => (e.datos?.ltv?.startsWith("ltv-") ? rev[e.datos.ltv.slice(4)] : null);
    const sup = (e) => e.datos?.ltv && suprimidas.has(e.datos.ltv);
    const propios = this.eventos0
      .filter((e) => decidida(e)?.decision !== "no")
      .map((e) => (decidida(e)?.decision === "aplica" ? { ...e, estado: "ok", datos: { ...e.datos, v: decidida(e).v } } : e))
      .filter((e) => !(sup(e) && e.tipo === "ltv_fin"))
      .map((e) =>
        sup(e) && e.tipo === "ltv_inicio"
          ? { ...e, tipo: "ltv_suprimida", pictograma: "tf_suprimida", picto: PICTOS.tf_suprimida, fase: null, datos: { ...e.datos, tf: String(suprimidas.get(e.datos.ltv)) } }
          : e,
      );
    for (const e of eventos)
      if (e.tipo === "ltv_inicio") {
        let t = null;
        for (const x of this.vmax0) if (x.pk_acum_ini <= e.pk_acum + 1e-6) t = x;
        e.datos.de = t?.v ?? null;
      }
    this.base = [...propios, ...eventos].sort((a, b) => a.pk_acum - b.pk_acum);
    // LTV que solo afectan al vehículo de cabeza: no se mantienen hasta que pasa la cola.
    this.soloCabeza = new Set(this.base.filter((e) => e.tipo === "ltv_fin" && e.datos?.solo_cabeza).map((e) => e.datos.ltv));
    this.ponerLongitud(this.cola * 1000);
  }

  /** PK de la línea en el punto d de la ruta (null si la hoja no lo permite saber). */
  pkEn(d) {
    this._pk ??= new Map();
    const k = Math.round(d * 1000);
    if (!this._pk.has(k)) this._pk.set(k, pkEn(this.p, d));
    return this._pk.get(k);
  }

  /** Marcha a la vista en d (por telefonema): { ini, fin, numero } o null. */
  vistaEn(d) {
    return this.vistas.find((x) => x.ini <= d + 1e-6 && d < x.fin - 1e-6) || null;
  }

  /**
   * Longitud del tren en metros (0: no se tiene en cuenta). Con longitud, una limitación se
   * mantiene hasta que la cola sale de ella: la Vmax en d es la menor de los tramos que pisa
   * el tren (de d − longitud a d). Las LTV «solo vehículo cabeza» solo cuentan en la cabeza.
   * Los avisos de subida y de fin de LTV van en su punto (v0.20.4, Joan): al rebasarlo empieza
   * la cuenta de «librar por cola» (`tramo().por_cola`, hasta `libera`).
   */
  ponerLongitud(metros) {
    this.cola = Math.max(0, Number(metros) || 0) / 1000;
    this.eventos = this.base;
  }

  /** Tramo de Vmax en la cabeza del tren, en d (o null). */
  tramoCabeza(d) {
    let t = null;
    for (const x of this.vmax) if (x.pk_acum_ini <= d + 1e-6) t = x;
    return t;
  }

  /**
   * Tramo que manda en d: el de la cabeza o, si la cola aún está en uno más restrictivo, ese
   * (con `por_cola` y `libera`: el punto donde la cabeza estará cuando la cola salga).
   */
  tramo(d) {
    const cabeza = this.tramoCabeza(d);
    if (!this.cola) return cabeza;
    let peor = cabeza;
    for (const t of this.vmax) {
      if (t.pk_acum_ini > d + 1e-6) break;
      if (t === cabeza || t.v == null || t.pk_acum_fin <= d - this.cola + 1e-6) continue;
      if (t.fuente === "ltv" && this.soloCabeza.has(t.ltv)) continue;
      if (peor?.v == null || t.v < peor.v) peor = t;
    }
    return peor === cabeza ? cabeza : { ...peor, por_cola: true, libera: peor.pk_acum_fin + this.cola };
  }

  vEn(d) {
    return this.tramo(d)?.v ?? null;
  }

  /**
   * Siguiente cambio de Vmax después de d, en la cabeza: { pk, v, tramo } o null. Con longitud
   * también: la subida se anuncia en su punto; lo que falta para librar por cola lo cuenta
   * `tramo(d).libera` una vez rebasado (v0.20.4, Joan).
   */
  siguiente(d) {
    const actual = this.tramoCabeza(d)?.v ?? null;
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

/**
 * Adelanto (−) o retraso (+) en minutos: hora real menos hora del horario, ambas en minutos
 * del día. Se toma la diferencia más corta (el horario puede pasar de medianoche).
 */
export function desvio(ahora, prevista) {
  let x = (ahora - prevista) % 1440;
  if (x > 720) x -= 1440;
  if (x < -720) x += 1440;
  return x + 0;
}
