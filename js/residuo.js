// «Residuo», como en las locomotoras 253: al pulsarlo empieza una cuenta atrás de los metros del
// tren con la distancia que se recorre. Sirve para saber cuándo la cola ha salido de una
// limitación. Cada pulsación vuelve a empezar la cuenta. Sin DOM: se prueba con node.

export class Residuo {
  constructor() {
    this.metros = 0;
    this.inicio = null; // posición (km) al pulsar
    this.recorrido = 0; // km recorridos desde que se pulsó (no baja si la posición retrocede)
  }

  get activo() {
    return this.inicio !== null;
  }

  /** Empieza (o vuelve a empezar) la cuenta atrás de `metros` desde la posición `d` (km). */
  pulsar(d, metros) {
    this.metros = Math.max(0, Math.round(Number(metros) || 0));
    this.inicio = this.metros ? d : null;
    this.recorrido = 0;
  }

  cancelar() {
    this.inicio = null;
  }

  /**
   * Metros que faltan con el tren en `d`, o null si no está en marcha. Al llegar a 0 se para y
   * devuelve 0 una vez: es el momento de avisar.
   */
  restante(d) {
    if (!this.activo) return null;
    this.recorrido = Math.max(this.recorrido, d - this.inicio);
    // (redondeo a milímetros: 5.1 − 5 no es exactamente 0.1)
    const r = Math.max(0, Math.ceil(Math.round((this.metros - this.recorrido * 1000) * 1000) / 1000));
    if (r === 0) this.inicio = null;
    return r;
  }
}
