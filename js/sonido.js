// Sonido de la app: silencio (se recuerda en el dispositivo), tonos de los avisos y
// voz (síntesis del propio iPad, funciona sin conexión).
// Safari solo deja sonar y hablar después de un toque del usuario: en el primer toque se
// «desbloquean» el audio y la voz.

import { prefs } from "./almacen.js";

let ctx = null;
let maestro = null;
const estado = {
  // Sin volumen propio (Joan, 09-11-2026): siempre al máximo; manda el volumen del dispositivo.
  volumen: 1,
  silencio: !!prefs.leer("silencio", false),
};

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

export function ponerSilencio(s) {
  estado.silencio = !!s;
  prefs.escribir("silencio", estado.silencio);
  aplicar();
  if (estado.silencio) callar();
}

const audible = () => !estado.silencio;

// Tonos: [frecuencia Hz, inicio s, duración s, intensidad 0–1]. Avisos sencillos, como una
// notificación del teléfono (campanita de notas cortas, sin voz).
// Cada aviso importante tiene la suya (pedido por Joan), con el mismo estilo de campanita:
// Breves (Joan, 09-11-2026): dos o tres toques como mucho, cada aviso con sus notas.
const TONOS = {
  // al llegar a la distancia de aviso (otros avisos): dos notas que suben
  aviso: [[1047, 0, 0.18, 0.5], [1319, 0.12, 0.3, 0.5]],
  // al pasar por el punto (otros avisos): dos notas que bajan
  paso: [[1568, 0, 0.15, 0.45], [1175, 0.11, 0.28, 0.45]],
  // inicio del aviso de una LTV o un CSV: dos notas que suben una quinta (do → sol agudos)
  ltv_aviso: [[1047, 0, 0.16, 0.55], [1568, 0.12, 0.34, 0.55]],
  // paso por una LTV: dos notas graves que bajan (sol → re)
  ltv_paso: [[784, 0, 0.16, 0.6], [587, 0.13, 0.34, 0.6]],
  // paso por una LTV que es CSV: grave, más grave y una aguda (sol → re → re agudo)
  ltv_csv: [[784, 0, 0.14, 0.6], [587, 0.12, 0.14, 0.6], [1175, 0.25, 0.34, 0.6]],
  // paso por un CSV: tres notas que bajan (fa → do → sol)
  csv: [[1397, 0, 0.14, 0.6], [1047, 0.12, 0.14, 0.6], [784, 0.24, 0.34, 0.6]],
  // cambio de canal de radio: «pi-pi-piii», dos iguales y una más alta
  radio: [[988, 0, 0.09, 0.5], [988, 0.12, 0.09, 0.5], [1480, 0.24, 0.3, 0.5]],
  // residuo libre (la cola ha pasado): tres notas que suben (mi → la → do agudos)
  residuo: [[1319, 0, 0.13, 0.5], [1760, 0.11, 0.13, 0.5], [2093, 0.22, 0.34, 0.5]],
};
TONOS.prueba = TONOS.aviso;
/** Tonos que se oyen en «Escuchar los avisos», con su nombre. */
export const MUESTRA = [
  ["ltv_aviso", "Inicio del aviso (LTV o CSV)"],
  ["ltv_paso", "Paso por LTV"],
  ["ltv_csv", "Paso por LTV que es CSV"],
  ["csv", "Paso por CSV"],
  ["radio", "Cambio de canal de radio"],
  ["residuo", "Residuo libre"],
];

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
