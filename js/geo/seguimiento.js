// Seguimiento del tren sobre el trazado (Fase 8). Sin DOM: se prueba con node.
//
// Cada lectura de posición del iPad (Wi-Fi o GPS) se proyecta sobre el trazado de la ruta y da
// un pk_acum. Se descartan las lecturas imprecisas, las que caen lejos de la vía y los saltos
// imposibles; entre lecturas el tren avanza con su velocidad estimada. Sin lecturas buenas
// durante PERDIDA_S la posición deja de ser fiable («POSICIÓN NO FIABLE») y, pasado
// PARADA_S, deja de avanzar.

import { distanciaASegmento } from "./trazado.js";

export const PRECISION_MAX_M = 150; // lecturas peores se ignoran
export const PERDIDA_S = 30;
export const PARADA_S = 120;
export const V_MAX_KMS = 200 / 3600; // por encima, la lectura es un salto imposible

export class Via {
  constructor(geo) {
    this.p = geo.puntos; // [lat, lon, pka]
    this.dudosos = geo.dudosos || [];
    this.fin = this.p.length ? this.p[this.p.length - 1][2] : 0;
  }

  /**
   * Punto de la vía más cercano a (lat, lon): {d (pk_acum), lateral (km)}. Con `cerca`, solo se
   * miran los tramos a menos de `ventana` km de ese pk_acum (evita saltar a otra vía paralela o
   * al otro lado de un lazo).
   */
  proyectar(lat, lon, cerca = null, ventana = Infinity) {
    let mejor = null;
    for (let i = 0; i + 1 < this.p.length; i++) {
      const a = this.p[i], b = this.p[i + 1];
      if (cerca != null && (Math.max(a[2], b[2]) < cerca - ventana || Math.min(a[2], b[2]) > cerca + ventana)) continue;
      const { d, t } = distanciaASegmento([lat, lon], a, b);
      if (!mejor || d < mejor.lateral) mejor = { lateral: d, d: a[2] + t * (b[2] - a[2]) };
    }
    return mejor;
  }

  /** [lat, lon] en un pk_acum. */
  punto(d) {
    const p = this.p;
    if (!p.length) return null;
    if (d <= p[0][2]) return [p[0][0], p[0][1]];
    for (let i = 1; i < p.length; i++)
      if (d <= p[i][2]) {
        const a = p[i - 1], b = p[i], t = b[2] > a[2] ? (d - a[2]) / (b[2] - a[2]) : 0;
        return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      }
    return [p.at(-1)[0], p.at(-1)[1]];
  }

  /** ¿Está d en un tramo dudoso del trazado? */
  dudoso(d) {
    return this.dudosos.some(([a, b]) => d >= a && d <= b);
  }
}

export class Seguidor {
  constructor(via) {
    this.via = via;
    this.d = null; // km
    this.v = 0; // km/s
    this.t = null; // ms: momento de la estimación
    this.tFix = null; // ms: última lectura aceptada
    this.dFix = null;
    this.raros = 0; // lecturas seguidas que no encajan
    this.ultima = null; // última lectura recibida {precision, motivo}
  }

  get fiable() {
    return this.tFix != null && this.t - this.tFix <= PERDIDA_S * 1000 && !this.via.dudoso(this.d);
  }

  /**
   * Nueva lectura {lat, lon, precision (m), t (ms), velocidad (m/s o null)}.
   * @returns "aceptada" | "imprecisa" | "fuera de la vía" | "salto"
   */
  lectura({ lat, lon, precision, t, velocidad = null }) {
    const r = (motivo) => ((this.ultima = { precision, motivo, t }), motivo);
    if (!(precision <= PRECISION_MAX_M)) return r("imprecisa");
    const iniciado = this.d != null;
    if (iniciado) this.estimar(t);
    const ventana = iniciado ? Math.max(2, Math.abs(this.v) * ((t - this.tFix) / 1000) * 3 + 1) : Infinity;
    const tolerancia = Math.max(0.08, (precision / 1000) * 1.5);
    let c = this.via.proyectar(lat, lon, iniciado && this.raros < 3 ? this.d : null, ventana);
    if (!c || c.lateral > tolerancia) {
      // Fuera de la ventana: si en otro punto de la ruta sí está sobre la vía, es un salto (tras
      // tres seguidos se acepta: el tren estaba de verdad allí).
      const g = iniciado ? this.via.proyectar(lat, lon) : null;
      if (!g || g.lateral > tolerancia) return r("fuera de la vía");
      this.raros++;
      if (this.raros < 3) return r("salto");
      c = g;
    }
    if (iniciado && this.raros < 3) {
      const dt = Math.max(0.5, (t - this.tFix) / 1000);
      const margen = (precision / 1000) * 3 + 0.3 + V_MAX_KMS * dt * 0.5;
      if (Math.abs(c.d - this.d) > margen) {
        this.raros++;
        return r("salto");
      }
    }
    // Aceptada: se corrige la estimación según la precisión de la lectura.
    if (!iniciado || this.raros >= 3) {
      this.d = c.d;
      this.v = 0;
    } else {
      const k = Math.min(0.9, Math.max(0.3, 1 - precision / 300));
      const dt = (t - this.tFix) / 1000;
      if (dt >= 0.5) {
        let vMedida = (c.d - this.dFix) / dt;
        if (velocidad != null && velocidad >= 0) vMedida = 0.5 * vMedida + 0.5 * (velocidad / 1000);
        this.v = Math.min(V_MAX_KMS, Math.max(0, 0.6 * this.v + 0.4 * vMedida));
      }
      this.d += k * (c.d - this.d);
    }
    this.raros = 0;
    this.d = Math.min(this.via.fin, Math.max(0, this.d));
    this.t = this.tFix = t;
    this.dFix = c.d;
    return r("aceptada");
  }

  /** Posición estimada en el instante t (ms): avanza con la velocidad estimada. */
  estimar(t) {
    if (this.d == null) return null;
    const dt = (t - this.t) / 1000;
    if (dt > 0) {
      const sinLectura = (t - this.tFix) / 1000;
      if (sinLectura <= PARADA_S) this.d = Math.min(this.via.fin, this.d + this.v * dt);
      else this.v = 0;
      this.t = t;
    }
    return this.d;
  }
}
