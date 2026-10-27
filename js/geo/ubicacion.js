// Posición del iPad (Geolocation de Safari: Wi-Fi, GPS si lo hay). Una sola lectura continua
// compartida por el modo GPS y la grabación de recorridos. Para probar en casa, la fuente puede
// ser un GPS simulado (geo/simulado.js): entonces las lecturas y el reloj son los suyos.

let vigia = null, simulado = null, intervalo = null;
const oyentes = new Set();
let ultima = null, error = null;

export const disponible = () => simulado != null || (typeof navigator !== "undefined" && "geolocation" in navigator);
export const estado = () => ({ activa: vigia != null || intervalo != null, ultima, error });
export const esSimulado = () => simulado != null;
/** Reloj de las lecturas (ms): el real o el virtual del GPS simulado. */
export const ahora = () => (simulado ? simulado.ahora() : Date.now());

/** Usa un GPS simulado (o null para volver a la posición real del iPad). */
export function simular(sim) {
  const habia = oyentes.size > 0;
  parar();
  simulado = sim;
  ultima = null;
  error = null;
  if (habia) arrancar();
}

function arrancar() {
  if (simulado) {
    if (intervalo == null)
      intervalo = setInterval(() => {
        for (const l of simulado.avanzar()) {
          ultima = l;
          for (const f of oyentes) f(l, null);
        }
      }, 200);
    return;
  }
  if (vigia != null || !disponible()) return;
  vigia = navigator.geolocation.watchPosition(
    (p) => {
      const c = p.coords;
      ultima = {
        lat: c.latitude,
        lon: c.longitude,
        precision: c.accuracy,
        velocidad: c.speed ?? null,
        rumbo: c.heading ?? null,
        t: Date.now(),
      };
      error = null;
      for (const f of oyentes) f(ultima, null);
    },
    (e) => {
      error = e.code === 1 ? "permiso denegado" : e.code === 2 ? "posición no disponible" : "sin respuesta";
      for (const f of oyentes) f(null, error);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
}

function parar() {
  if (vigia != null) navigator.geolocation.clearWatch(vigia);
  vigia = null;
  if (intervalo != null) clearInterval(intervalo);
  intervalo = null;
}

/** Recibe cada lectura: fn(lectura | null, error | null). Devuelve la función para dejar de oír. */
export function escuchar(fn) {
  oyentes.add(fn);
  arrancar();
  return () => {
    oyentes.delete(fn);
    if (!oyentes.size) parar();
  };
}
