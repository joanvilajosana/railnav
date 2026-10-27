// De dónde sale la posición del tren en la ruta (pk_acum, en km).
//   manual     → el maquinista arrastra la línea de tiempo (Fase 6)
//   simulacion → avanza sola a la Vmax efectiva (pruebas)
//   gps        → Fase 8: geometría de la vía + ajuste a la vía; en túneles «posición no fiable»
// La pantalla solo lee `d`, `fiable` y `modo`: cambiar de fuente no toca nada más.

export const MODOS = {
  manual: "Manual: se arrastra la línea de tiempo",
  simulacion: "Simulación a la velocidad máxima permitida",
  gps: "GPS (Fase 8)",
};

export class Posicion {
  constructor({ fin = 0, d = 0, modo = "manual", factor = 40, alCambiar = () => {} } = {}) {
    this.fin = fin;
    this.d = 0;
    this.modo = MODOS[modo] && modo !== "gps" ? modo : "manual";
    this.factor = factor;
    this.enMarcha = false;
    this.fiable = true;
    this.alCambiar = alCambiar;
    this.poner(d);
  }

  /** Coloca el tren en d (km), dentro de la ruta. */
  poner(d) {
    const n = Math.min(this.fin, Math.max(0, +d || 0));
    if (n !== this.d) {
      this.d = n;
      this.alCambiar(this);
    }
    return this.d;
  }

  mover(km) {
    return this.poner(this.d + km);
  }

  cambiarModo(modo) {
    if (modo === "gps") return false; // Fase 8
    this.modo = MODOS[modo] ? modo : "manual";
    if (this.modo !== "simulacion") this.enMarcha = false;
    this.alCambiar(this);
    return true;
  }

  /** Avance de la simulación: dt en segundos, v en km/h. */
  paso(dt, v) {
    if (this.modo !== "simulacion" || !this.enMarcha || !v) return false;
    const antes = this.d;
    this.poner(this.d + (v / 3600) * dt * this.factor);
    if (this.d >= this.fin) this.enMarcha = false;
    return this.d !== antes;
  }
}

/**
 * Metros que avanza el tren por cada píxel arrastrado en la línea de tiempo: arrastrar el alto
 * entero de la línea de tiempo equivale a sus 3 km.
 */
export const metrosPorPixel = (altoPx) => (altoPx > 0 ? 3000 / altoPx : 5);
