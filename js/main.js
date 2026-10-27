// Arranque de la app: barra superior, vistas, carga de rutas y bucle de pintado.

import { VERSION_APP } from "./version.js";
import { esc, fecha } from "./util.js";
import { Ruta, validar } from "./ruta.js";
import { MODOS, Posicion, metrosPorPixel } from "./posicion.js";
import { dltvs, persistir, prefs, rutas, tramos } from "./almacen.js";
import { cargarPictos, deSerie } from "./pictos.js";
import { ajustarDibujo, altoDibujo, altoLinea, pintarMarcha, reiniciarHistorial } from "./marcha.js";
import { irAqui, mostrarPestana, pintarDatos } from "./datos.js";
import { iniciarEditor, pintarEditor } from "./editor.js";
import { LOGO, linea } from "./iconos.js";
import { ponerSilencio, ponerVolumen, probar, silenciado, volumen } from "./sonido.js";

const $ = (id) => document.getElementById(id);
let ruta = null, pos = null, vista = "marcha", sucio = true;

// ---------- barra superior ----------
function barra() {
  $("brand").innerHTML = LOGO(52) + `<small class="ver">v${VERSION_APP}</small>`;
  for (const [id, k, t] of [["m-marcha", "marcha", "Pantalla de marcha"], ["m-datos", "datos", "Datos del tren"], ["m-ajustes", "ajustes", "Ajustes"]]) {
    $(id).innerHTML = linea(k);
    $(id).title = t;
    $(id).onclick = () => mostrar(k);
  }
  $("m-tema").onclick = () => {
    document.documentElement.dataset.theme = oscuro() ? "light" : "dark";
    prefs.escribir("tema", document.documentElement.dataset.theme);
    iconoTema();
    sucio = true;
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", iconoTema);
  iconoTema();
  iniciarSonido();
}

// ---------- volumen y silencio ----------
function pintarSonido() {
  const v = Math.round(volumen() * 100), mudo = silenciado();
  $("m-vol").innerHTML = linea(v < 50 ? "volumen_bajo" : "volumen");
  $("m-vol").title = `Volumen: ${v} %`;
  $("m-mute").innerHTML = linea("silencio");
  $("m-mute").title = mudo ? "Sonido desactivado: pulsa para activarlo" : "Silenciar";
  $("m-mute").setAttribute("aria-pressed", String(mudo));
  $("m-mute").classList.toggle("mudo", mudo);
  $("vol").value = String(v);
  $("vol-n").textContent = mudo ? `${v} % · en silencio` : `${v} %`;
}

function iniciarSonido() {
  const pop = $("pop-vol");
  const cerrar = () => {
    pop.hidden = true;
    $("m-vol").setAttribute("aria-expanded", "false");
    $("m-vol").classList.remove("on");
  };
  $("m-vol").onclick = (e) => {
    e.stopPropagation();
    if (!pop.hidden) return cerrar();
    const r = $("m-vol").getBoundingClientRect();
    pop.hidden = false;
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2))}px`;
    $("m-vol").setAttribute("aria-expanded", "true");
    $("m-vol").classList.add("on");
  };
  $("vol").oninput = (e) => {
    ponerVolumen(+e.target.value / 100);
    if (silenciado() && +e.target.value > 0) ponerSilencio(false);
    pintarSonido();
  };
  $("vol").onchange = () => probar();
  $("m-mute").onclick = () => {
    ponerSilencio(!silenciado());
    pintarSonido();
    if (!silenciado()) probar();
  };
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !$("m-vol").contains(e.target)) cerrar();
  });
  pintarSonido();
}
const oscuro = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
// En modo día se ve la luna (pasa a noche) y en modo noche el sol.
const iconoTema = () => {
  $("m-tema").innerHTML = linea(oscuro() ? "sol" : "luna");
  $("m-tema").title = oscuro() ? "Pasar a modo día" : "Pasar a modo noche";
};

function estado() {
  const bq = ruta?.bloqueoEn(pos.d), rd = ruta?.radioEn(pos.d);
  $("tb-bq").innerHTML = bq ? `<span title="Bloqueo"><small>Bloqueo</small><b>${esc(bq)}</b></span>` : "";
  $("tb-rd").innerHTML = rd != null ? `<span title="Radiotelefonía"><small>Radiotelefonía</small><b>Canal ${esc(rd)}</b></span>` : "";
}

// ---------- vistas ----------
function mostrar(v) {
  vista = v;
  for (const k of ["marcha", "datos", "ajustes", "pictos"]) $("v-" + k).hidden = k !== v;
  for (const k of ["marcha", "datos", "ajustes"]) $("m-" + k).classList.toggle("on", k === v || (v === "pictos" && k === "ajustes"));
  if (v === "datos" && ruta) {
    pintarDatos(ruta, pos.d);
    requestAnimationFrame(() => irAqui(pos.d));
  }
  if (v === "ajustes") pintarAjustes();
  if (v === "pictos") pintarEditor();
  sucio = true;
}

// ---------- rutas ----------
async function abrir(paquete, guardarla = true) {
  const errores = validar(paquete);
  if (errores.length) throw new Error(errores.join("; "));
  if (guardarla) await rutas.guardar(paquete);
  ruta = new Ruta(paquete);
  prefs.escribir("activa", guardarla ? ruta.id : null);
  pos = new Posicion({
    fin: ruta.fin,
    d: prefs.leer("pos." + ruta.id, 0),
    modo: prefs.leer("modo", "manual"),
    factor: prefs.leer("factor", 40),
    alCambiar: () => {
      sucio = true;
      guardarPos();
    },
  });
  reiniciarHistorial();
  $("hist").scrollTop = 0;
  inercia = 0;
  pintarSim();
  sucio = true;
}

let tGuardar = 0;
const guardarPos = () => {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => ruta && prefs.escribir("pos." + ruta.id, Math.round(pos.d * 1000) / 1000), 400);
};

const demo = async () => (await fetch("datos/demo.railnav.json")).json();

async function cargarArchivos(lista) {
  const msg = [];
  let ultimo = null;
  for (const f of lista) {
    try {
      const p = JSON.parse(await f.text());
      const e = validar(p);
      if (e.length) throw new Error(e.join("; "));
      await rutas.guardar(p);
      ultimo = p;
      msg.push(`✓ ${f.name}: tren ${p.tren.numero}`);
    } catch (err) {
      msg.push(`✗ ${f.name}: ${err.message || "no es un paquete de ruta"}`);
    }
  }
  if (ultimo) await abrir(ultimo);
  $("msg-rutas").textContent = msg.join(" · ");
  pintarAjustes();
}

// ---------- generar la ruta desde los PDF (Fase 7) ----------
// Cargado al pulsar: pdf.js y los lectores solo se descargan de la caché cuando se usan.
const gen = () => import("./generador.js");
let hojaPdf = null;
let tablasDeSerie = null;

const mensaje = (html, tipo = "") => {
  $("gen-msg").className = "gen-msg " + tipo;
  $("gen-msg").innerHTML = html;
};

async function pintarDltvs(elegido) {
  const lista = await dltvs.listar();
  const actual = elegido ?? $("sel-dltv").value ?? prefs.leer("dltv", "");
  $("sel-dltv").innerHTML =
    '<option value="">Sin DLTV (solo la hoja)</option>' +
    lista
      .map((d) => `<option value="${esc(d.id)}">DLTV nº ${esc(d.numero ?? "?")} · ${fecha(d.desde)} – ${fecha(d.hasta)} · ${d.ltv} LTV</option>`)
      .join("");
  const ids = lista.map((d) => d.id);
  $("sel-dltv").value = ids.includes(actual) ? actual : ids.includes(prefs.leer("dltv", "")) ? prefs.leer("dltv", "") : ids[0] ?? "";
}

async function leerDltv(archivo) {
  const g = await gen();
  mensaje(`Leyendo el DLTV <b>${esc(archivo.name)}</b>…`);
  try {
    const doc = await g.leerDltvPdf(archivo, (n, total) => mensaje(`Leyendo el DLTV: página ${n} de ${total}…`));
    const r = await dltvs.guardar(doc);
    prefs.escribir("dltv", r.id);
    await pintarDltvs(r.id);
    mensaje(`✓ DLTV nº ${esc(r.numero ?? "?")} (${fecha(r.desde)} – ${fecha(r.hasta)}): ${r.ltv} LTV leídas y guardadas.`, "ok");
  } catch (e) {
    mensaje(`✗ No se ha podido leer el DLTV: ${esc(e.message || String(e))}`, "mal");
  }
}

async function tablasConocidas() {
  if (!tablasDeSerie)
    tablasDeSerie = await fetch("datos/tramos.json")
      .then((r) => r.json())
      .then((d) => d.tablas)
      .catch(() => []);
  return [...(await tramos.listar()), ...tablasDeSerie];
}

async function generarRuta() {
  if (!hojaPdf) return;
  $("b-generar").disabled = true;
  $("gen-tramos").hidden = true;
  try {
    const g = await gen();
    mensaje(`Leyendo la hoja de ruta <b>${esc(hojaPdf.name)}</b>…`);
    const ruta = await g.leerHojaPdf(hojaPdf);
    const idDltv = $("sel-dltv").value;
    const ltv = idDltv ? await dltvs.cargar(idDltv) : null;
    if (!ltv) return terminar(g, ruta, null, null);
    const tabla = g.elegirTabla(ruta, await tablasConocidas());
    if (tabla) return terminar(g, ruta, ltv, tabla);
    // Ruta nueva: se propone la línea de cada tramo y el maquinista la confirma.
    const [propuesta] = g.proponerTabla(ruta, ltv);
    revisarTramos(g, ruta, ltv, propuesta);
  } catch (e) {
    mensaje(`✗ No se ha podido generar la ruta: ${esc(e.message || String(e))}`, "mal");
  } finally {
    $("b-generar").disabled = !hojaPdf;
  }
}

function revisarTramos(g, ruta, ltv, propuesta) {
  mensaje(`Ruta nueva: <b>${esc(propuesta.ruta)}</b>. Confirma la línea de cada tramo para cruzar la hoja con el DLTV.`);
  const caja = $("gen-tramos");
  caja.innerHTML =
    `<table class="tr-t"><thead><tr><th>Tramo</th><th>Línea</th><th>De dónde sale la propuesta</th></tr></thead><tbody>` +
    propuesta.tramos
      .map(
        (t, i) =>
          `<tr><td>${esc(t.desde)} → ${esc(t.hasta)}</td><td><input data-i="${i}" value="${esc(t.linea)}" inputmode="numeric" aria-label="Línea del tramo ${i + 1}"${t.linea === "?" ? ' class="duda"' : ""}></td><td class="nota">${esc(t.nota ?? "")}</td></tr>`,
      )
      .join("") +
    `</tbody></table><div class="note">Pon el número de línea de ADIF de cada tramo. Si dejas «?», las LTV de ese tramo saldrán «a revisar». La tabla se guarda en este iPad para las próximas hojas de esta ruta.</div>` +
    `<button id="tr-ok" class="pri">Confirmar y generar</button><button id="tr-no">Cancelar</button>`;
  caja.hidden = false;
  caja.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => inp.classList.toggle("duda", inp.value.trim() === "?" || !inp.value.trim())));
  $("tr-no").onclick = () => {
    caja.hidden = true;
    mensaje("Generación cancelada.");
  };
  $("tr-ok").onclick = async () => {
    const tabla = {
      ruta: propuesta.ruta,
      tramos: propuesta.tramos.map((t, i) => {
        const linea = caja.querySelector(`input[data-i="${i}"]`).value.trim() || "?";
        return { ...t, linea, verificado: linea !== "?", nota: linea === t.linea ? t.nota : `confirmado en el iPad (propuesta: ${t.linea})` };
      }),
    };
    await tramos.guardar(tabla);
    caja.hidden = true;
    terminar(g, ruta, ltv, tabla).catch((e) => mensaje(`✗ No se ha podido generar la ruta: ${esc(e.message || String(e))}`, "mal"));
  };
}

async function terminar(g, ruta, ltv, tabla) {
  mensaje(ltv ? "Cruzando la hoja con el DLTV…" : "Preparando la ruta…");
  await new Promise((r) => setTimeout(r, 0));
  const { paquete, cruce, avisos } = g.generarPaquete(ruta, ltv, tabla, { version: 1, pictogramas: deSerie() });
  await abrir(paquete);
  const n = g.recuento(cruce);
  const t = paquete.tren;
  const ltvTxt = ltv
    ? ` · DLTV nº ${esc(ltv.numero ?? "?")}: <b>${n.APLICA}</b> LTV en la ruta` + (n.INCIERTA ? `, <b>${n.INCIERTA}</b> a revisar` : "")
    : " · sin DLTV";
  mensaje(
    `✓ Tren <b>${esc(t.numero)}</b> ${t.fecha ? "del " + fecha(t.fecha) : ""} · ${esc(t.origen ?? "?")} → ${esc(t.destino ?? "?")}${ltvTxt}. Guardada y abierta.` +
      (avisos.length ? `<ul>${avisos.slice(0, 6).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""),
    "ok",
  );
  pintarAjustes();
}

// ---------- ajustes ----------
async function pintarAjustes() {
  const lista = await rutas.listar();
  $("rutas").innerHTML = lista.length
    ? lista
        .map(
          (r) =>
            `<div class="ru${ruta && r.id === ruta.id ? " on" : ""}"><div><b>${esc(r.tren)}</b> · ${esc(r.origen || "?")} → ${esc(r.destino || "?")}<small>${fecha(r.fecha)}${r.ltv ? " · DLTV nº " + esc(r.ltv) : " · sin DLTV"}</small></div>` +
            `<div>${ruta && r.id === ruta.id ? '<span class="act">En uso</span>' : `<button data-abrir="${esc(r.id)}">Abrir</button>`}<button data-borrar="${esc(r.id)}" title="Borrar del dispositivo">Borrar</button></div></div>`,
        )
        .join("")
    : '<div class="note">Todavía no hay rutas guardadas en este dispositivo.</div>';
  for (const m of Object.keys(MODOS)) {
    const r = document.querySelector(`input[name=modo][value=${m}]`);
    if (r) r.checked = pos?.modo === m;
  }
  $("acerca").innerHTML = `RailNav v${VERSION_APP} · Desarrollado por Joan Vilajosana Quesada · Servicio no oficial ni homologado por la AESF`;
}

function iniciarAjustes() {
  $("f-hoja").onchange = (e) => {
    hojaPdf = e.target.files[0] || null;
    $("b-generar").disabled = !hojaPdf;
    if (hojaPdf) mensaje(`Hoja: <b>${esc(hojaPdf.name)}</b>. Elige el DLTV y pulsa «Generar ruta».`);
  };
  $("f-dltv").onchange = (e) => {
    const f = e.target.files[0];
    if (f) leerDltv(f).finally(() => (e.target.value = ""));
  };
  $("sel-dltv").onchange = () => prefs.escribir("dltv", $("sel-dltv").value);
  $("b-generar").onclick = generarRuta;
  pintarDltvs();
  $("f-ruta").onchange = (e) => cargarArchivos([...e.target.files]).finally(() => (e.target.value = ""));
  $("b-demo").onclick = async () => {
    await abrir(await demo(), false);
    pintarAjustes();
  };
  $("rutas").onclick = async (e) => {
    const a = e.target.closest("[data-abrir]"), b = e.target.closest("[data-borrar]");
    if (a) {
      await abrir(await rutas.cargar(a.dataset.abrir), true);
      pintarAjustes();
    }
    if (b && confirm("¿Borrar esta ruta del dispositivo? Se puede volver a cargar desde su archivo.")) {
      await rutas.borrar(b.dataset.borrar);
      if (ruta && ruta.id === b.dataset.borrar) await abrir(await demo(), false);
      pintarAjustes();
    }
  };
  document.querySelectorAll("input[name=modo]").forEach((r) =>
    r.addEventListener("change", () => {
      if (!pos) return;
      pos.cambiarModo(r.value);
      prefs.escribir("modo", pos.modo);
      inercia = 0;
      pintarAjustes();
      pintarSim();
    }),
  );
  $("oi").onclick = () => mostrar("pictos");
  $("bk").onclick = () => mostrar("ajustes");
}

// ---------- simulación: controles en la pantalla de marcha ----------
// La simulación sigue corriendo aunque se cambie de vista (datos, ajustes…).
function pintarSim() {
  const sim = pos?.modo === "simulacion";
  $("simbar").hidden = !sim;
  if (!sim) return;
  $("sb-pl").innerHTML = linea(pos.enMarcha ? "pausa" : "play", 24) + `<span>${pos.enMarcha ? "Pausa" : "Marcha"}</span>`;
  $("sb-pl").classList.toggle("on", pos.enMarcha);
  $("sb-pl").setAttribute("aria-label", pos.enMarcha ? "Pausa" : "Marcha");
  $("sb-ini").innerHTML = linea("inicio", 22);
  for (const b of document.querySelectorAll(".sb-f button")) b.classList.toggle("on", +b.dataset.f === pos.factor);
}

function iniciarSimulacion() {
  $("sb-pl").onclick = () => {
    if (pos.d >= pos.fin) pos.poner(0);
    pos.enMarcha = !pos.enMarcha;
    pintarSim();
  };
  $("sb-ini").onclick = () => {
    pos.poner(0);
    reiniciarHistorial();
    pintarSim();
  };
  document.querySelector(".sb-f").onclick = (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    pos.factor = +b.dataset.f;
    prefs.escribir("factor", pos.factor);
    pintarSim();
  };
}

// ---------- mover la ruta arrastrando la línea de tiempo ----------
// Despacio, el tren sigue al dedo (la línea de tiempo enseña 3 km); deprisa, el arrastre se
// acelera (hasta ×ACELERACION) y al soltar sigue un poco por inercia, como el scroll del iPad.
// Tocar la línea de tiempo para la inercia.
const ACELERACION = 12;
const FRENADA = 0.4; // s: cuánto dura la inercia (constante de tiempo)
let inercia = 0; // km/s

function iniciarArrastre() {
  const sc = $("sc");
  let y0 = null, t0 = 0, vel = 0;
  const mpp = () => metrosPorPixel((sc.getBoundingClientRect().height * altoLinea()) / (altoDibujo() - 6.5));
  sc.addEventListener("pointerdown", (e) => {
    if (!pos || pos.modo !== "manual") return;
    inercia = 0;
    vel = 0;
    y0 = e.clientY;
    t0 = e.timeStamp;
    sc.setPointerCapture(e.pointerId);
  });
  sc.addEventListener("pointermove", (e) => {
    if (y0 == null) return;
    const dy = e.clientY - y0, dt = Math.max(1, e.timeStamp - t0);
    const rapidez = Math.abs(dy) / dt; // px/ms
    const ganancia = 1 + (ACELERACION - 1) * Math.min(1, Math.max(0, (rapidez - 0.25) / 2)) ** 1.4;
    const km = ((dy * mpp()) / 1000) * ganancia; // hacia abajo = avanzar
    pos.mover(km);
    vel = 0.7 * vel + 0.3 * (km / (dt / 1000));
    y0 = e.clientY;
    t0 = e.timeStamp;
  });
  const fin = (e) => {
    if (y0 == null) return;
    // inercia solo si el dedo se movía al soltar
    if (e.timeStamp - t0 < 80 && Math.abs(vel) > 0.5) inercia = vel;
    y0 = null;
  };
  sc.addEventListener("pointerup", fin);
  sc.addEventListener("pointercancel", () => (y0 = null));
  sc.addEventListener(
    "wheel",
    (e) => {
      if (!pos || pos.modo !== "manual") return;
      e.preventDefault();
      inercia = 0;
      pos.mover((e.deltaY * mpp() * 3) / 1000);
    },
    { passive: false },
  );
}

function pasoInercia(dt) {
  if (!inercia || !pos) return false;
  const antes = pos.d;
  pos.mover(inercia * dt);
  inercia *= Math.exp(-dt / FRENADA);
  if (Math.abs(inercia) < 0.05 || pos.d === antes) inercia = 0;
  return pos.d !== antes;
}

// ---------- tamaño del dibujo según la pantalla (16:9, iPad…) ----------
function iniciarTamano() {
  const scr = document.querySelector(".scr");
  const medir = () => {
    const r = scr.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const apilado = matchMedia("(max-aspect-ratio: 5/4)").matches;
    if (ajustarDibujo(r.width, r.height, apilado)) sucio = true;
    // unidad del dibujo en píxeles: el historial usa la misma escala de letra
    scr.style.setProperty("--u", (apilado ? r.width / 900 : r.height / (altoDibujo() - 6.5)) + "px");
  };
  new ResizeObserver(medir).observe(scr);
  medir();
}

// ---------- bucle ----------
let antes = 0;
function bucle(t) {
  const dt = Math.min(0.1, (t - antes) / 1000);
  antes = t;
  // Donde la hoja no da V Max, la simulación sigue a la siguiente (o a 30 km/h).
  const enMarcha = pos?.enMarcha;
  if (pos && ruta && pos.paso(dt, ruta.vEn(pos.d) ?? ruta.siguiente(pos.d)?.v ?? 30)) sucio = true;
  if (pos && enMarcha !== pos.enMarcha) pintarSim(); // la simulación ha llegado al final
  if (pasoInercia(dt)) sucio = true;
  if (sucio && ruta) {
    sucio = false;
    estado();
    if (vista === "marcha") pintarMarcha(ruta, pos);
  }
  requestAnimationFrame(bucle);
}

// ---------- inicio ----------
async function iniciar() {
  const tema = prefs.leer("tema", null);
  if (tema) document.documentElement.dataset.theme = tema;
  barra();
  await cargarPictos();
  iniciarAjustes();
  iniciarEditor();
  iniciarArrastre();
  iniciarSimulacion();
  iniciarTamano();
  $("tabs").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    mostrarPestana(b.dataset.t);
    irAqui(pos.d);
  };
  $("hj-aqui").onclick = () => {
    pintarDatos(ruta, pos.d);
    irAqui(pos.d);
  };
  const activa = prefs.leer("activa", null);
  const guardada = activa ? await rutas.cargar(activa).catch(() => null) : null;
  await abrir(guardada || (await demo()), !!guardada).catch(async () => abrir(await demo(), false));
  mostrar("marcha");
  pintarSim();
  requestAnimationFrame(bucle);
  persistir();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost"))
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

iniciar();
