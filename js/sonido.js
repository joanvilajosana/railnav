// Sonido de la app: volumen y silencio (se recuerdan en el dispositivo).
// Los avisos sonoros llegarán más adelante; de momento hay un pitido de prueba.
// Safari solo deja sonar después de un toque del usuario: el contexto de audio se crea al
// primer uso desde un botón.

import { prefs } from "./almacen.js";

let ctx = null;
let maestro = null;
const estado = {
  volumen: Math.min(1, Math.max(0, prefs.leer("volumen", 0.7))),
  silencio: !!prefs.leer("silencio", false),
};

export const volumen = () => estado.volumen;
export const silenciado = () => estado.silencio;

function aplicar() {
  if (maestro) maestro.gain.setTargetAtTime(estado.silencio ? 0 : estado.volumen, ctx.currentTime, 0.02);
}

function contexto() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    maestro = ctx.createGain();
    maestro.connect(ctx.destination);
    aplicar();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function ponerVolumen(v) {
  estado.volumen = Math.min(1, Math.max(0, v));
  prefs.escribir("volumen", estado.volumen);
  aplicar();
}

export function ponerSilencio(s) {
  estado.silencio = !!s;
  prefs.escribir("silencio", estado.silencio);
  aplicar();
}

/** Dos tonos cortos al volumen actual (no suena en silencio). */
export function probar() {
  const c = contexto();
  if (!c || estado.silencio || estado.volumen === 0) return;
  const t0 = c.currentTime + 0.02;
  [880, 1175].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = t0 + i * 0.16;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(maestro);
    o.start(t);
    o.stop(t + 0.15);
  });
}
