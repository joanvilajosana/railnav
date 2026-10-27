// Avisos sonoros: cuándo suena cada aviso y qué dice la voz. Sin DOM (se prueba con node).
//
// Cada evento avisa una vez al llegar a su distancia de aviso (la del pictograma, máx. 3 km):
// «anuncio». Las LTV, los CSV y las bajadas de velocidad suenan otra vez al llegar al punto:
// «acción». Si la posición salta (arrastre rápido, cambio de ruta, GPS que se recupera) no se
// suelta una ráfaga de avisos atrasados: lo saltado se da por avisado. Al retroceder, lo que
// vuelve a quedar por delante se puede avisar otra vez.

import { partesVia } from "./util.js";

export const SALTO_KM = 1.5;
const ACCION = new Set(["ltv_inicio", "csv", "cambio_vmax_baja"]);

export class Avisador {
  /**
   * @param {(e) => number} alcance  km antes del evento en que se avisa
   */
  constructor(alcance) {
    this.alcance = alcance;
    this.ruta = null;
    this.ultimo = null;
    this.anunciados = new Set();
    this.acciones = new Set();
  }

  reiniciar(ruta, d) {
    this.ruta = ruta;
    this.ultimo = d;
    this.anunciados.clear();
    this.acciones.clear();
    this.marcar(d);
  }

  // Todo lo que ya queda atrás (o dentro de su distancia de aviso) se da por avisado.
  marcar(d) {
    for (const e of this.ruta.eventos) {
      if (e.pk_acum - this.alcance(e) <= d + 1e-9) this.anunciados.add(e.id);
      if (e.pk_acum <= d + 1e-9) this.acciones.add(e.id);
    }
  }

  /** Avisos que tocan al pasar de la última posición a `d`: [{fase, e, metros}]. */
  revisar(ruta, d) {
    if (ruta !== this.ruta || this.ultimo === null) {
      this.reiniciar(ruta, d);
      return [];
    }
    const antes = this.ultimo, delta = d - antes;
    this.ultimo = d;
    if (delta === 0) return [];
    if (delta < 0) {
      for (const e of ruta.eventos) {
        if (e.pk_acum - this.alcance(e) > d) this.anunciados.delete(e.id);
        if (e.pk_acum > d) this.acciones.delete(e.id);
      }
      return [];
    }
    if (delta > SALTO_KM) {
      this.marcar(d);
      return [];
    }
    const salida = [];
    for (const e of ruta.eventos) {
      const disparo = e.pk_acum - this.alcance(e);
      if (!this.anunciados.has(e.id) && disparo > antes && disparo <= d + 1e-9) {
        this.anunciados.add(e.id);
        if (e.pk_acum > d) salida.push({ fase: "anuncio", e, metros: (e.pk_acum - d) * 1000 });
      }
      if (ACCION.has(e.tipo) && !this.acciones.has(e.id) && e.pk_acum > antes && e.pk_acum <= d + 1e-9) {
        this.acciones.add(e.id);
        salida.push({ fase: "accion", e, metros: 0 });
      }
    }
    return salida;
  }
}

// ---------------------------------------------------------------- texto para la voz

/** «800 metros», «1,5 kilómetros», «3 kilómetros». */
export function distanciaVoz(m) {
  if (m < 950) return `${Math.max(100, Math.round(m / 100) * 100)} metros`;
  const km = Math.round(m / 100) / 10;
  return km === 1 ? "1 kilómetro" : `${String(km).replace(".", ",")} kilómetros`;
}

const ROMANOS = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6" };

/** «vía II» → «vía 2»; «vía E: No afecta a vías generales» → «vía E». */
export function viaVoz(via) {
  if (!via) return "";
  const [codigo] = partesVia(via);
  return `vía ${ROMANOS[codigo] ?? codigo}`;
}

/** Nombres de la hoja («FUENCARRAL F.G.») en minúsculas, para que la voz no deletree. */
export function nombreVoz(n) {
  if (!n) return "";
  return n
    .replace(/\.{2,}$/, "")
    .replace(/\s*\(APD\)\s*/i, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

const num = (v) => (typeof v === "number" || /^\d+$/.test(String(v ?? "")) ? String(v) : null);

/** Lo que dice la voz para un aviso; cadena vacía si no hay nada que decir. */
export function textoVoz({ fase, e, metros }) {
  const d = e.datos || {}, en = fase === "anuncio" ? ` en ${distanciaVoz(metros)}` : "";
  const via = d.via ? `, ${viaVoz(d.via)}` : "";
  switch (e.tipo) {
    case "ltv_inicio": {
      const v = num(d.v);
      if (fase === "accion") return v ? `Inicio de limitación, ${v}${via}` : `Inicio de limitación${via}`;
      return (v ? `Limitación temporal a ${v}${en}` : `Limitación temporal${en}, velocidad a revisar`) + via + (e.estado === "revisar" ? ", a revisar" : "");
    }
    case "ltv_fin":
      return `Fin de limitación${en}`;
    case "csv":
      if (fase === "accion") return num(d.a) ? `Velocidad ${d.a}` : "";
      return `Cambio significativo de velocidad${num(d.a) ? ` a ${d.a}` : ""}${en}`;
    case "cambio_vmax_baja":
      if (fase === "accion") return `Velocidad ${d.a}`;
      return `Velocidad máxima ${d.a}${en}`;
    case "cambio_vmax_sube":
      return `Velocidad máxima ${d.a}${en}`;
    case "cambio_radio":
      return `Cambio de radio, canal ${d.canal}${en}`;
    case "cambio_bloqueo":
      return `Cambio de bloqueo${en}`;
    case "parada_tecnica":
      return `Parada técnica en ${nombreVoz(d.nombre)}${en}`;
    case "parada_comercial":
      return `Parada comercial${d.nombre ? ` en ${nombreVoz(d.nombre)}` : ""}${en}`;
    case "estacion":
      return `Estación ${nombreVoz(d.nombre)}${en}`;
    case "apeadero":
      return `Apeadero ${nombreVoz(d.nombre)}${en}`;
    case "bifurcacion":
      return `Bifurcación${en}`;
    case "curva_nota":
      return num(d.v) ? `Curva a ${d.v}${en}` : `Nota de la hoja${en}`;
    case "cambio_linea":
      return `Cambio de línea${en}`;
    default:
      return "";
  }
}
