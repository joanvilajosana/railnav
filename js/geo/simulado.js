// GPS simulado (pruebas en casa): un tren «fantasma» recorre el trazado de la ruta y da lecturas
// de posición como las de Safari, con los defectos de las de verdad: error de unos metros,
// lecturas imprecisas, algún salto y sin señal en los túneles. Las lecturas pasan por el mismo
// seguidor que las reales, así que se prueba la app entera sin subir a un tren. Sin DOM.
//
// Con `factor` > 1 el tiempo corre más deprisa: el reloj de las lecturas es virtual y el
// seguidor usa ese mismo reloj (`ahora()`).

/** Generador pseudoaleatorio determinista (mulberry32). */
export function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = 6371.0088;

export class GpsSimulado {
  /**
   * @param via   Via del seguimiento (trazado de la ruta)
   * @param o.d          km donde empieza el tren fantasma
   * @param o.velocidad  (km) => km/h en ese punto (la Vmax de la ruta; si no hay, 80)
   * @param o.factor     cuántas veces más rápido que el tiempo real
   * @param o.tuneles    [[km_ini, km_fin]] sin señal (si el trazado los trae)
   * @param o.semilla    para repetir la misma prueba
   * @param o.reloj      () => ms reales (Date.now por defecto; las pruebas lo cambian)
   */
  constructor(via, { d = 0, velocidad = () => 80, factor = 1, tuneles = [], semilla = 1, reloj = () => Date.now() } = {}) {
    this.via = via;
    this.d = d; // km del tren fantasma (la verdad)
    this.velocidad = velocidad;
    this.factor = factor;
    this.tuneles = tuneles;
    this.rnd = azar(semilla);
    this.reloj = reloj;
    this.t0r = reloj();
    this.t0v = this.t0r;
    this.tv = this.t0v; // ms virtuales ya simulados
    this.v = 0; // km/h actuales (arranca parado y acelera)
    this.hueco = 0; // ms virtuales sin señal (corte aleatorio)
  }

  /** Reloj virtual (ms). */
  ahora() {
    return this.t0v + (this.reloj() - this.t0r) * this.factor;
  }

  cambiarFactor(f) {
    const ahora = this.ahora();
    this.t0r = this.reloj();
    this.t0v = ahora;
    this.factor = f;
  }

  enTunel(d) {
    return this.tuneles.some(([a, b]) => d >= a && d <= b);
  }

  gauss() {
    const u = Math.max(1e-9, this.rnd()), v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Avanza hasta ahora: una lectura por segundo virtual (las que caen en túnel o corte, no). */
  avanzar() {
    const fin = this.ahora(), r = [];
    while (this.tv + 1000 <= fin) {
      this.tv += 1000;
      // Acelera (0,5 m/s²) o frena (0,7 m/s²) hacia la velocidad del punto; para al final.
      const objetivo = this.d >= this.via.fin - 0.05 ? 0 : Math.min(this.velocidad(this.d) ?? 80, (Math.sqrt(2 * 0.7 * Math.max(0, this.via.fin - this.d) * 1000) * 3.6));
      this.v = this.v < objetivo ? Math.min(objetivo, this.v + 1.8) : Math.max(objetivo, this.v - 2.5);
      this.d = Math.min(this.via.fin, this.d + this.v / 3600);
      if (this.hueco > 0) {
        this.hueco -= 1000;
        continue;
      }
      if (this.enTunel(this.d)) continue;
      if (this.rnd() < 0.003) {
        this.hueco = (20 + this.rnd() * 40) * 1000; // corte de señal de 20 a 60 s
        continue;
      }
      r.push(this.lectura());
    }
    return r;
  }

  lectura() {
    const [lat, lon] = this.via.punto(this.d);
    const x = this.rnd();
    // 90 %: buena (5–25 m); 7 %: imprecisa (200–800 m, la app la ignora); 3 %: salto de unos
    // cientos de metros con precisión «buena» (lo que a veces hace el posicionamiento Wi-Fi).
    let precision, error;
    if (x < 0.9) precision = error = 5 + this.rnd() * 20;
    else if (x < 0.97) precision = error = 200 + this.rnd() * 600;
    else (precision = 20), (error = 300 + this.rnd() * 500);
    const dn = (this.gauss() * error) / 2 / 1000, de = (this.gauss() * error) / 2 / 1000;
    return {
      lat: lat + (dn / R) * (180 / Math.PI),
      lon: lon + (de / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI),
      precision: Math.round(precision),
      velocidad: this.rnd() < 0.8 ? Math.max(0, this.v / 3.6 + this.gauss() * 0.5) : null,
      rumbo: null,
      t: this.tv,
      simulada: true,
    };
  }
}
