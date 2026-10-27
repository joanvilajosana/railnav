// Pantalla siempre encendida mientras la app está abierta.
//
// 1) Screen Wake Lock (Safari 16.4 y posteriores; en la app instalada, iPadOS 18.4 y posteriores).
// 2) Si no está o falla: un vídeo mudo de 2 s en bucle, invisible, que iOS trata como
//    reproducción y no deja que se apague la pantalla (la técnica de NoSleep.js).
// Las dos necesitan un toque del usuario la primera vez: se activa en el primer toque.

import { prefs } from "./almacen.js";

let candado = null;
let video = null;
let modo = "apagado"; // "wakelock" | "video" | "apagado" | "no disponible"
let alCambiar = () => {};

export const activado = () => prefs.leer("despierto", true);
export const estado = () => modo;

function poner(m) {
  modo = m;
  alCambiar(m);
}

async function conWakeLock() {
  if (!("wakeLock" in navigator)) return false;
  try {
    candado = await navigator.wakeLock.request("screen");
    candado.addEventListener("release", () => {
      candado = null;
      if (modo === "wakelock") poner("apagado");
    });
    poner("wakelock");
    return true;
  } catch {
    return false;
  }
}

async function conVideo() {
  try {
    if (!video) {
      video = document.createElement("video");
      video.src = "media/despierto.mp4";
      video.loop = true;
      video.muted = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-hidden", "true");
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;left:0;bottom:0;pointer-events:none";
      document.body.appendChild(video);
    }
    await video.play();
    poner("video");
    return true;
  } catch {
    return false;
  }
}

/** Intenta mantener la pantalla encendida (llamar tras un toque y al volver a la app). */
export async function mantener() {
  if (!activado() || document.visibilityState !== "visible") return;
  if (candado || (video && !video.paused)) return;
  if (await conWakeLock()) return;
  if (!(await conVideo())) poner("no disponible");
}

export function soltar() {
  candado?.release().catch(() => {});
  candado = null;
  video?.pause();
  poner("apagado");
}

export function activar(si) {
  prefs.escribir("despierto", !!si);
  if (si) mantener();
  else soltar();
}

export function iniciar(cb) {
  alCambiar = cb || alCambiar;
  const tocar = () => mantener();
  document.addEventListener("pointerdown", tocar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") mantener();
  });
  mantener();
}
