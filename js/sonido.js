// Sonido de la app: volumen y silencio (se recuerdan en el dispositivo), tonos de los avisos y
// voz (síntesis del propio iPad, funciona sin conexión).
// Safari solo deja sonar y hablar después de un toque del usuario: en el primer toque se
// «desbloquean» el audio y la voz.

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
  if (estado.silencio) callar();
}

const audible = () => !estado.silencio && estado.volumen > 0;

// Tonos: [frecuencia Hz, inicio s, duración s, intensidad 0–1]. Avisos sencillos, como una
// notificación del teléfono (campanita de notas cortas, sin voz).
const TONOS = {
  // al llegar a la distancia de aviso: tres notas que suben
  aviso: [[1047, 0, 0.32, 0.55], [1319, 0.1, 0.32, 0.5], [1568, 0.2, 0.5, 0.5]],
  // al pasar por el punto: la misma campanita, más corta y bajando
  paso: [[1568, 0, 0.3, 0.45], [1175, 0.11, 0.45, 0.45]],
};
TONOS.prueba = TONOS.aviso;

/** Toca un tono (no suena en silencio). Devuelve su duración en s. */
export function tono(tipo = "prueba") {
  const c = contexto(), notas = TONOS[tipo] || TONOS.prueba;
  if (!c || !audible()) return 0;
  const t0 = c.currentTime + 0.02;
  for (const [f, ini, dur, amp] of notas) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = t0 + ini;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(maestro);
    o.start(t);
    o.stop(t + dur + 0.01);
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = "sine";
    o2.frequency.value = f * 2.76; // parcial de campana
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(amp * 0.18, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
    o2.connect(g2).connect(maestro);
    o2.start(t);
    o2.stop(t + dur + 0.01);
  }
  return Math.max(...notas.map(([, ini, dur]) => ini + dur));
}

export const probar = () => tono("prueba");

// ---- voz
let vozEs = null;
function elegirVoz() {
  const voces = window.speechSynthesis?.getVoices?.() || [];
  vozEs = voces.find((v) => v.lang === "es-ES" && v.localService) || voces.find((v) => v.lang === "es-ES") || voces.find((v) => v.lang?.startsWith("es")) || null;
}
if (window.speechSynthesis) {
  elegirVoz();
  speechSynthesis.addEventListener?.("voiceschanged", elegirVoz);
}

export const hayVoz = () => !!window.speechSynthesis;

/** Lee un texto en voz alta (en cola: los avisos seguidos no se pisan). */
export function hablar(texto, retraso = 0) {
  if (!window.speechSynthesis || !audible() || !texto) return;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-ES";
  if (vozEs) u.voice = vozEs;
  u.volume = estado.volumen;
  u.rate = 1.05;
  if (retraso > 0) setTimeout(() => audible() && speechSynthesis.speak(u), retraso * 1000);
  else speechSynthesis.speak(u);
}

export const callar = () => window.speechSynthesis?.cancel();

/** Primer toque: Safari deja ya sonar y hablar el resto de la sesión. */
export function desbloquear() {
  const una = () => {
    contexto();
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    document.removeEventListener("pointerdown", una, true);
  };
  document.addEventListener("pointerdown", una, true);
}
