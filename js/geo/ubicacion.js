// Posición del iPad (Geolocation de Safari: Wi-Fi, GPS si lo hay). Una sola lectura continua
// compartida por el modo GPS y la grabación de recorridos.

let vigia = null;
const oyentes = new Set();
let ultima = null, error = null;

export const disponible = () => typeof navigator !== "undefined" && "geolocation" in navigator;
export const estado = () => ({ activa: vigia != null, ultima, error });

function arrancar() {
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
