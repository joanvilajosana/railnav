// Arranque de la app: barra superior, vistas, carga de rutas y bucle de pintado.

import { VERSION_APP } from "./version.js";
import { esc, fecha } from "./util.js";
import { Ruta, validar } from "./ruta.js";
import { MODOS, Posicion, metrosPorPixel } from "./posicion.js";
import { dltvs, firmaRuta, geos, persistir, prefs, recorridos, rutas, tramos } from "./almacen.js";
import { cargarPictos, deSerie, picDe } from "./pictos.js";
import { ajustarDibujo, alcance, altoDibujo, altoLinea, limitesLineaMovil, pintarMarcha, pintarMarchaMovil, reiniciarHistorial } from "./marcha.js";
import { irAqui, mostrarPestana, movil, pintarDatos } from "./datos.js";
import { iniciarEditor, pintarEditor } from "./editor.js";
import { LOGO, linea } from "./iconos.js";
import { desbloquear, ponerSilencio, ponerVolumen, probar, silenciado, tono, volumen } from "./sonido.js";
import { Avisador } from "./avisos.js";
import * as despierto from "./despierto.js";
import { Seguidor, Via } from "./geo/seguimiento.js";
import { ahora as ahoraGps, disponible as hayUbicacion, escuchar as escucharUbicacion, esSimulado, simular } from "./geo/ubicacion.js";
import { GpsSimulado } from "./geo/simulado.js";
import * as grabar from "./geo/grabar.js";
import { compartirArchivo } from "./compartir.js";
import { trazadoIncluido } from "./geo/firma.js";

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
    aplicarPaleta();
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
  $("vol").style.setProperty("--v", v + "%");
  $("vol").setAttribute("aria-valuenow", String(v));
  $("vol").classList.toggle("mudo", mudo);
  $("vol-n").textContent = mudo ? "Silencio" : `${v} %`;
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
  // Barra vertical: arriba, más volumen. Se arrastra o se toca; al soltar suena la campanita.
  const barraVol = $("vol");
  const poner = (y) => {
    const r = barraVol.getBoundingClientRect();
    const v = Math.round(Math.min(1, Math.max(0, (r.bottom - y) / r.height)) * 20) / 20;
    ponerVolumen(v);
    if (silenciado() && v > 0) ponerSilencio(false);
    pintarSonido();
  };
  let arrastrando = false;
  barraVol.onpointerdown = (e) => {
    arrastrando = true;
    barraVol.setPointerCapture(e.pointerId);
    poner(e.clientY);
  };
  barraVol.onpointermove = (e) => arrastrando && poner(e.clientY);
  barraVol.onpointerup = () => {
    if (!arrastrando) return;
    arrastrando = false;
    probar();
  };
  barraVol.onpointercancel = () => (arrastrando = false);
  barraVol.onkeydown = (e) => {
    const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
    if (!d) return;
    e.preventDefault();
    ponerVolumen(volumen() + d);
    pintarSonido();
  };
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
  const poner = (id, v) => {
    $(id).textContent = v ?? "—";
    $(id).classList.toggle("vacio", v == null);
  };
  poner("in-tren", ruta?.tren?.numero ?? null);
  const t = ruta?.tren;
  $("in-ruta").textContent = t ? `${t.origen || "?"} → ${t.destino || "?"}` : "";
  $("in-ruta").title = $("in-ruta").textContent;
  poner("in-bq", bq || null);
  poner("in-rd", rd != null ? `Canal ${rd}` : null);
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
  // Trazado de la vía ya preparado otro día para esta misma ruta
  if (!paquete.geo) {
    const geo = (await geos.cargar(firmaRuta(paquete)).catch(() => null)) || (await trazadoIncluido(paquete).catch(() => null));
    if (geo) paquete.geo = geo;
  }
  if (guardarla) await rutas.guardar(paquete);
  ruta = new Ruta(paquete);
  via = paquete.geo?.puntos?.length ? new Via(paquete.geo) : null;
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
  pararGpsSimulado();
  reiniciarHistorial();
  $("hist").scrollTop = 0;
  inercia = 0;
  if (pos.modo === "gps" && !via) pos.cambiarModo("manual");
  if (pos.modo === "gps") activarGps();
  else desactivarGps();
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
    `</tbody></table><div class="note">Pon el número de línea de ADIF de cada tramo. Si dejas «?», las LTV de ese tramo saldrán «a revisar». La tabla se guarda en este dispositivo para las próximas hojas de esta ruta.</div>` +
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
        return { ...t, linea, verificado: linea !== "?", nota: linea === t.linea ? t.nota : `confirmado en el dispositivo (propuesta: ${t.linea})` };
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
  if (!paquete.geo && navigator.onLine) prepararGps(); // en segundo plano; si falla, se avisa abajo
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

// ---------- compartir una ruta ----------
// El paquete va con el trazado de la vía (si lo tiene): quien lo recibe lo carga en Ajustes →
// «Cargar paquete de ruta» y tiene la ruta y el GPS listos.
async function compartirRuta(id) {
  const p = await rutas.cargar(id);
  if (!p) return;
  if (!p.geo) p.geo = (await geos.cargar(firmaRuta(p)).catch(() => null)) || (await trazadoIncluido(p).catch(() => null));
  const nombre = `RailNav ${p.tren.numero}${p.tren.fecha ? " " + p.tren.fecha : ""}.railnav.json`;
  const r = await compartirArchivo(nombre, JSON.stringify(p), "application/json");
  $("msg-rutas").textContent = r === "descargado" ? `Guardado como «${nombre}».` : r === "compartido" ? "Ruta enviada." : "";
}

// ---------- tablas de tramos ----------
let tablasVistas = [];

async function pintarTablas() {
  const propias = await tramos.listar();
  await tablasConocidas();
  const nombres = new Set(propias.map((t) => t.ruta));
  tablasVistas = [
    ...propias.map((t) => ({ t, propia: true })),
    ...(tablasDeSerie || []).filter((t) => !nombres.has(t.ruta)).map((t) => ({ t, propia: false })),
  ].sort((a, b) => (a.t.ruta < b.t.ruta ? -1 : 1));
  const propiasN = tablasVistas.filter((x) => x.propia).length;
  $("tablas-n").textContent = `${tablasVistas.length} tablas` + (propiasN ? ` (${propiasN} de este dispositivo)` : "");
  $("tablas").innerHTML = tablasVistas.length
    ? tablasVistas
        .map(({ t, propia }, i) => {
          const sin = t.tramos.filter((x) => !x.linea || x.linea === "?").length;
          return (
            `<div class="ru"><div><b>${esc(t.ruta)}</b><small>${t.tramos.length} tramos · ${propia ? "guardada en este dispositivo" : "de serie"}` +
            (sin ? ` · <span class="aviso">${sin} sin línea</span>` : "") +
            `</small></div><div><button data-ted="${i}">Editar</button><button data-tcomp="${i}">Compartir</button>${propia ? `<button data-tborrar="${i}">Borrar</button>` : ""}</div></div>`
          );
        })
        .join("")
    : '<div class="note">Todavía no hay tablas de tramos.</div>';
}

function editarTabla(tabla) {
  const caja = $("tabla-ed");
  const t = JSON.parse(JSON.stringify(tabla));
  caja.innerHTML =
    `<div class="pop-t">Editar tabla de tramos</div>` +
    `<label>Nombre de la ruta<input id="te-ruta" value="${esc(t.ruta)}"></label>` +
    `<table class="tr-t"><thead><tr><th>Tramo</th><th>Línea</th><th>Comprobada</th><th>Nota</th></tr></thead><tbody>` +
    t.tramos
      .map(
        (x, i) =>
          `<tr><td>${esc(x.desde)} → ${esc(x.hasta)}</td><td><input data-l="${i}" value="${esc(x.linea)}" inputmode="numeric"${!x.linea || x.linea === "?" ? ' class="duda"' : ""}></td>` +
          `<td><input type="checkbox" data-v="${i}"${x.verificado ? " checked" : ""} aria-label="Línea comprobada"></td><td class="nota">${esc(x.nota ?? "")}</td></tr>`,
      )
      .join("") +
    `</tbody></table><div class="note">Al cambiar una línea se marca como comprobada. Para que una ruta ya generada use la tabla corregida, vuelve a generarla desde sus PDF.</div>` +
    `<button id="te-ok" class="pri">Guardar en este dispositivo</button><button id="te-no">Cancelar</button>`;
  caja.hidden = false;
  caja.scrollIntoView({ block: "nearest", behavior: "smooth" });
  caja.querySelectorAll("input[data-l]").forEach((inp) =>
    inp.addEventListener("input", () => {
      inp.classList.toggle("duda", !inp.value.trim() || inp.value.trim() === "?");
      caja.querySelector(`input[data-v="${inp.dataset.l}"]`).checked = !!inp.value.trim() && inp.value.trim() !== "?";
    }),
  );
  $("te-no").onclick = () => (caja.hidden = true);
  $("te-ok").onclick = async () => {
    const nueva = {
      ruta: $("te-ruta").value.trim() || t.ruta,
      tramos: t.tramos.map((x, i) => {
        const linea = caja.querySelector(`input[data-l="${i}"]`).value.trim() || "?";
        return { ...x, linea, verificado: linea !== "?" && caja.querySelector(`input[data-v="${i}"]`).checked };
      }),
    };
    if (nueva.ruta !== tabla.ruta && (await tramos.listar()).some((x) => x.ruta === tabla.ruta)) await tramos.borrar(tabla.ruta);
    await tramos.guardar(nueva);
    caja.hidden = true;
    $("msg-tablas").className = "gen-msg ok";
    $("msg-tablas").textContent = `✓ Tabla «${nueva.ruta}» guardada.`;
    pintarTablas();
  };
}

/** Comprueba una tabla de tramos cargada de un archivo. */
function validarTabla(t) {
  if (!t || typeof t.ruta !== "string" || !Array.isArray(t.tramos) || !t.tramos.length) return "no es una tabla de tramos";
  for (const [i, x] of t.tramos.entries()) {
    if (typeof x.desde !== "string" || typeof x.hasta !== "string" || typeof x.linea !== "string") return `el tramo ${i + 1} está incompleto`;
    if (i > 0 && t.tramos[i - 1].hasta !== x.desde) return `los tramos ${i} y ${i + 1} no son contiguos`;
  }
  return null;
}

function iniciarTablas() {
  $("tablas").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const v = tablasVistas[+(b.dataset.ted ?? b.dataset.tcomp ?? b.dataset.tborrar)];
    if (!v) return;
    if (b.dataset.ted != null) editarTabla(v.t);
    if (b.dataset.tcomp != null) compartirArchivo(`Tramos ${v.t.ruta.replace(/[^\p{L}\p{N} _-]+/gu, "-").replace(/-+$/, "")}.json`, JSON.stringify(v.t, null, 2));
    if (b.dataset.tborrar != null && confirm(`¿Borrar la tabla «${v.t.ruta}» de este dispositivo?`)) {
      await tramos.borrar(v.t.ruta);
      pintarTablas();
    }
  };
  $("f-tabla").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const t = JSON.parse(await f.text());
      const error = validarTabla(t);
      if (error) throw new Error(error);
      await tramos.guardar({ ruta: t.ruta, tramos: t.tramos.map((x) => ({ desde: x.desde, hasta: x.hasta, linea: x.linea, verificado: !!x.verificado, nota: x.nota ?? null })) });
      $("msg-tablas").className = "gen-msg ok";
      $("msg-tablas").textContent = `✓ Tabla «${t.ruta}» cargada (${t.tramos.length} tramos).`;
      pintarTablas();
    } catch (err) {
      $("msg-tablas").className = "gen-msg mal";
      $("msg-tablas").textContent = `✗ ${f.name}: ${err.message}`;
    }
  };
}

// ---------- ajustes ----------
async function pintarAjustes() {
  const lista = await rutas.listar();
  $("rutas").innerHTML = lista.length
    ? lista
        .map(
          (r) =>
            `<div class="ru${ruta && r.id === ruta.id ? " on" : ""}"><div><b>${esc(r.tren)}</b> · ${esc(r.origen || "?")} → ${esc(r.destino || "?")}<small>${r.tren === "PRUEBA" ? "ruta de prueba del GPS (sin datos de ADIF)" : fecha(r.fecha) + (r.ltv ? " · DLTV nº " + esc(r.ltv) : " · sin DLTV")}</small></div>` +
            `<div>${ruta && r.id === ruta.id ? '<span class="act">En uso</span>' : `<button data-abrir="${esc(r.id)}">Abrir</button>`}<button data-comp="${esc(r.id)}" title="Enviar la ruta (AirDrop, Mensajes, Correo…)">Compartir</button><button data-borrar="${esc(r.id)}" title="Borrar del dispositivo">Borrar</button></div></div>`,
        )
        .join("")
    : '<div class="note">Todavía no hay rutas guardadas en este dispositivo.</div>';
  pintarTablas();
  pintarPruebas();
  for (const m of Object.keys(MODOS)) {
    const r = document.querySelector(`input[name=modo][value=${m}]`);
    if (r) r.checked = pos?.modo === m;
  }
  pintarGeo();
  pintarEstadoGps();
  pintarGrabacion();
  pintarRecorridos();
  $("op-despierto").checked = despierto.activado();
  const ed = { wakelock: ["activa", "ok"], video: ["activa (modo de reserva)", "ok"], apagado: ["", ""], "no disponible": ["este navegador no lo permite", ""] }[despierto.estado()];
  $("est-despierto").textContent = despierto.activado() ? ed[0] : "";
  $("est-despierto").className = "estado " + ed[1];
  for (const r of document.querySelectorAll("input[name=sonar]")) r.checked = r.value === prefs.leer("sonar", "urgentes");
  pintarBordes();
  const pp = prefs.leer("pantalla", "auto");
  for (const r of document.querySelectorAll("input[name=pantalla]")) r.checked = r.value === pp;
  $("est-pantalla").textContent = pp === "auto" ? `Según el tamaño de la pantalla: ahora, ${automatica() === "telefono" ? "teléfono" : "tablet"}.` : pp === "telefono" ? "Piezas grandes, una debajo de otra." : "La pantalla de marcha completa en tres columnas.";
  $("desc-modo").textContent = {
    manual: "Arrastra la línea de tiempo hacia abajo para avanzar y hacia arriba para retroceder.",
    simulacion: "El tren avanza solo a la velocidad máxima: marcha, pausa y velocidad, abajo en la pantalla de marcha.",
    gps: "La posición del dispositivo sobre el trazado de la vía.",
  }[pos?.modo] || "";
  $("desc-sonar").textContent = {
    no: "Sin sonido.",
    urgentes: "Una campanita al acercarse a una LTV, CSV o bajada de velocidad, y otra más corta al pasar.",
    todos: "Una campanita en cada aviso (también estaciones, radio, bloqueo…) y otra más corta al pasar.",
  }[prefs.leer("sonar", "urgentes")];
  $("op-desvio").checked = prefs.leer("desvio", true);
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
    const a = e.target.closest("[data-abrir]"), b = e.target.closest("[data-borrar]"), c = e.target.closest("[data-comp]");
    if (c) compartirRuta(c.dataset.comp);
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
      if (r.value === "gps" && !via) {
        $("geo-msg").className = "gen-msg mal";
        $("geo-msg").textContent = "Primero prepara el GPS de esta ruta (botón de abajo).";
        pintarAjustes();
        return;
      }
      if (r.value !== "gps") pararGpsSimulado();
      pos.cambiarModo(r.value);
      prefs.escribir("modo", pos.modo);
      inercia = 0;
      if (pos.modo === "gps") activarGps();
      else desactivarGps();
      pintarAjustes();
      pintarSim();
    }),
  );
  $("op-despierto").onchange = (e) => {
    despierto.activar(e.target.checked);
    pintarAjustes();
  };
  document.querySelectorAll("input[name=sonar]").forEach((r) =>
    r.addEventListener("change", () => {
      prefs.escribir("sonar", r.value);
      pintarAjustes();
    }),
  );
  // iconos de las secciones y nombre del archivo elegido en las casillas de carga
  for (const e of document.querySelectorAll("#v-ajustes [data-i]")) e.insertAdjacentHTML("afterbegin", linea(e.dataset.i, e.tagName === "H2" ? 22 : 26));
  for (const l of document.querySelectorAll("label.carga"))
    l.querySelector("input").addEventListener("change", (e) => {
      const n = l.querySelector(".carga-n"), f = e.target.files?.[0];
      if (f) n.textContent = f.name;
      l.classList.toggle("elegido", !!f);
    });
  $("op-desvio").onchange = (e) => {
    prefs.escribir("desvio", e.target.checked);
    sucio = true;
  };
  $("b-probar-aviso").onclick = probarAviso;
  $("b-geo").onclick = prepararGps;
  iniciarGpsSimulado();
  $("pruebas").onclick = async (e) => {
    const b = e.target.closest("button[data-prueba]");
    if (!b) return;
    b.disabled = true;
    try {
      const p = await fetch("datos/pruebas/" + b.dataset.prueba).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
      await abrir(p, true);
      $("msg-pruebas").textContent = `Abierta: ${p.tren.origen} → ${p.tren.destino}. Elige «GPS» en «Posición del tren».`;
    } catch (err) {
      $("msg-pruebas").textContent = `No se ha podido abrir: ${err.message}`;
    } finally {
      b.disabled = false;
      pintarAjustes();
    }
  };
  iniciarGrabacion();
  $("oi").onclick = () => mostrar("pictos");
  $("bk").onclick = () => mostrar("ajustes");
}

// ---------- avisos sonoros ----------
const avisador = new Avisador(alcance);
const urgente = (x) => x.fase === "accion" || picDe(x.e)?.prioridad === "urgente";

function sonarAvisos() {
  const modo = prefs.leer("sonar", "urgentes");
  const salida = avisador.revisar(ruta, pos.d);
  if (modo === "no") return;
  // Una sola campanita aunque coincidan varios avisos: la de aviso si hay alguno, si no la de paso.
  const sonar = salida.filter((x) => modo === "todos" || urgente(x));
  if (sonar.some((x) => x.fase !== "accion")) tono("aviso");
  else if (sonar.length) tono("paso");
}

function probarAviso() {
  const dur = tono("aviso");
  setTimeout(() => tono("paso"), (dur + 0.6) * 1000);
}

// ---------- GPS (Fase 8) ----------
let via = null, seguidor = null, quitarGps = null, errorGps = null;

function activarGps() {
  desactivarGps();
  if (!via) return;
  seguidor = new Seguidor(via);
  errorGps = hayUbicacion() ? null : "este navegador no da la posición";
  pos.fiable = false;
  quitarGps = escucharUbicacion((p, e) => {
    if (p) {
      seguidor.lectura(p);
      errorGps = null;
    } else errorGps = e;
    if (vista === "ajustes") pintarEstadoGps();
  });
}

function desactivarGps() {
  quitarGps?.();
  quitarGps = null;
  seguidor = null;
  if (pos) {
    pos.etiqueta = "";
    pos.fiable = true;
  }
}

function pasoGps() {
  if (pos?.modo !== "gps" || !seguidor) return false;
  const d = seguidor.estimar(ahoraGps());
  const fiable = d != null && seguidor.fiable;
  const ult = seguidor.ultima;
  const etiqueta =
    d == null
      ? errorGps ? `GPS: ${errorGps.toUpperCase()}` : "GPS: BUSCANDO POSICIÓN…"
      : !fiable ? "POSICIÓN NO FIABLE" : `${esSimulado() ? "GPS SIMULADO" : "GPS"} ±${Math.round(ult?.precision ?? 0)} m`;
  let cambio = etiqueta !== pos.etiqueta || fiable !== pos.fiable;
  pos.etiqueta = etiqueta;
  pos.fiable = fiable;
  if (d != null && Math.abs(d - pos.d) > 1e-6) {
    pos.poner(d);
    cambio = true;
  }
  return cambio;
}

function pintarEstadoGps() {
  const e = $("est-gps");
  if (pos?.modo !== "gps") return void (e.textContent = "");
  const u = seguidor?.ultima;
  e.textContent = errorGps ? errorGps : !u ? "esperando la primera lectura…" : `última lectura ±${Math.round(u.precision)} m · ${u.motivo}`;
  if (gpsSim && seguidor?.d != null) e.textContent += ` · error respecto al tren simulado: ${Math.round(Math.abs(seguidor.d - gpsSim.d) * 1000)} m`;
  e.className = "estado " + (seguidor?.fiable ? "ok" : "mal");
}

function pintarGeo() {
  const g = ruta?.p.geo;
  const opcion = document.querySelector("input[name=modo][value=gps]");
  opcion.disabled = !g;
  $("op-gps").classList.toggle("off", !g);
  $("op-simgps").classList.toggle("off", !g);
  $("op-simgps").querySelector("input").disabled = !g;
  $("op-simgps").querySelector("input").checked = !!gpsSim;
  $("sel-simgps").closest(".fila").hidden = !gpsSim;
  if (!g) {
    $("geo-info").innerHTML = "Esta ruta todavía no tiene el trazado de la vía: pulsa «Preparar el GPS de esta ruta» (con conexión).";
    $("b-geo").textContent = "Preparar el GPS de esta ruta";
    $("b-geo").hidden = false;
    return;
  }
  const dud = g.dudosos || [], km = dud.reduce((s, [a, b]) => s + (b - a), 0);
  $("geo-info").innerHTML =
    ruta.p.prueba
      ? `<b>Ruta de prueba</b>: recorrido por la vía de OpenStreetMap con ${g.anclas.length} estaciones y apeaderos` + (g.tuneles?.length ? ` · ${g.tuneles.length} túneles (sin señal en el GPS simulado).` : ".")
      : `<b>Trazado preparado</b> (${fecha(g.fecha)}): ${g.anclas.length} de ${g.estaciones} dependencias de la hoja situadas en el mapa` +
    (dud.length ? ` · <b>${km.toFixed(1)} km dudosos</b> (allí la posición sale «no fiable»):<ul>${dud.slice(0, 5).map((d) => `<li>${esc(d[2])}</li>`).join("")}</ul>` : " · sin tramos dudosos.");
  $("b-geo").textContent = "Volver a preparar el trazado";
  $("b-geo").hidden = !!ruta.p.prueba; // el de una ruta de prueba sale de la vía misma
}

async function prepararGps() {
  if (!ruta) return;
  const msg = (t, c = "") => {
    $("geo-msg").className = "gen-msg " + c;
    $("geo-msg").innerHTML = t;
  };
  $("b-geo").disabled = true;
  try {
    const { preparar } = await import("./geo/preparar.js");
    msg("Situando las estaciones de la hoja…");
    const lista = await fetch("datos/estaciones.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const geo = await preparar(ruta.p, (t) => msg(esc(t)), { lista });
    ruta.p.geo = geo;
    await geos.guardar(firmaRuta(ruta.p), geo);
    if (prefs.leer("activa", null) === ruta.id) await rutas.guardar(ruta.p);
    via = new Via(geo);
    if (pos.modo === "gps") activarGps();
    msg(`✓ Trazado preparado: ${geo.anclas.length} de ${geo.estaciones} dependencias situadas. Ya puedes elegir «GPS».`, "ok");
  } catch (e) {
    msg(`✗ No se ha podido preparar el trazado: ${esc(e.message || String(e))}. Inténtalo más tarde con conexión.`, "mal");
  } finally {
    $("b-geo").disabled = false;
    pintarAjustes();
  }
}

// ---------- pantalla: teléfono o tablet ----------
const automatica = () => (Math.min(screen.width, screen.height) < 600 ? "telefono" : "tablet");

function aplicarPantalla() {
  const p = prefs.leer("pantalla", "auto");
  const d = p === "auto" ? automatica() : p;
  if (document.documentElement.dataset.disp === d) return;
  document.documentElement.dataset.disp = d;
  reiniciarHistorial();
  sucio = true;
  if (vista === "datos" && ruta) pintarDatos(ruta, pos.d);
}

// Color de la barra de estado del sistema: el fondo de la app (gris claro o casi negro).
function aplicarPaleta() {
  document.querySelector('meta[name="theme-color"]').content = oscuro() ? "#0a0a0b" : "#e4e4e6";
  sucio = true;
}

function iniciarPantalla() {
  aplicarPaleta();
  document.querySelectorAll("input[name=pantalla]").forEach((r) =>
    r.addEventListener("change", () => {
      prefs.escribir("pantalla", r.value);
      aplicarPantalla();
      pintarAjustes();
    }),
  );
  new ResizeObserver(() => (sucio = true)).observe($("mv-linea"));
  aplicarPantalla();
}

// ---------- GPS simulado (pruebas en casa) ----------
let gpsSim = null;

function iniciarGpsSimulado() {
  $("sel-simgps").value = String(prefs.leer("simgps", 5));
  $("sel-simgps").onchange = () => {
    const f = Number($("sel-simgps").value);
    prefs.escribir("simgps", f);
    gpsSim?.cambiarFactor(f);
  };
  $("op-simgps").querySelector("input").onchange = (e) => {
    if (e.target.checked && via && ruta) {
      gpsSim = new GpsSimulado(via, {
        d: pos.d,
        velocidad: (d) => ruta.vEn(d) ?? 80,
        factor: Number($("sel-simgps").value),
        tuneles: ruta.p.geo?.tuneles || [],
        semilla: Date.now() % 1e9,
      });
      simular(gpsSim);
      if (pos.modo !== "gps") {
        pos.cambiarModo("gps");
        prefs.escribir("modo", "gps");
      }
      activarGps();
    } else pararGpsSimulado();
    pintarAjustes();
    pintarSim();
  };
}

function pararGpsSimulado() {
  if (!gpsSim) return;
  gpsSim = null;
  simular(null);
  if (pos?.modo === "gps") activarGps();
}

// ---------- rutas de prueba del GPS ----------
let pruebas = null;

async function pintarPruebas() {
  pruebas ??= await fetch("datos/pruebas/indice.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  $("pruebas").innerHTML = pruebas?.rutas?.length
    ? pruebas.rutas.map((r) => `<div class="ru"><div><b>${esc(r.nombre)}</b><small>${String(r.km).replace(".", ",")} km</small></div><div><button data-prueba="${esc(r.archivo)}">Abrir</button></div></div>`).join("")
    : '<div class="note">No hay rutas de prueba en esta versión.</div>';
}

// ---------- grabar recorrido ----------
function pintarGrabacion(r, e) {
  const g = r || grabar.enCurso();
  $("op-grabar").checked = !!g;
  if (!g) {
    $("est-grabar").textContent = "Para medir la precisión en un viaje";
    $("est-grabar").className = "estado";
    return;
  }
  const u = g.puntos.at(-1);
  $("est-grabar").textContent = `● grabando · ${g.puntos.length} posiciones` + (u ? ` · última ±${u[3]} m` : "") + (e ? ` · ${e}` : "");
  $("est-grabar").className = "estado " + (e ? "mal" : "ok");
}

async function pintarRecorridos() {
  const lista = await recorridos.listar();
  $("recorridos").innerHTML = lista
    .map((r) => {
      const x = grabar.resumen(r), enCurso = grabar.enCurso()?.id === r.id;
      return (
        `<div class="rec"><div><b>${esc(new Date(r.id).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }))}</b> · tren ${esc(r.tren ?? "?")}` +
        `<small>${x.puntos} posiciones · ${x.minutos.toFixed(0)} min` +
        (x.mediana != null ? ` · precisión típica ±${x.mediana} m, peor ±${x.peor} m` : "") +
        (enCurso ? " · en curso" : "") +
        `</small></div><div><button data-gpx="${esc(r.id)}">GPX</button><button data-json="${esc(r.id)}">JSON</button>${enCurso ? "" : `<button data-borrar-rec="${esc(r.id)}">Borrar</button>`}</div></div>`
      );
    })
    .join("");
}

function iniciarGrabacion() {
  $("op-grabar").onchange = async (e) => {
    if (e.target.checked) {
      if (!hayUbicacion()) {
        e.target.checked = false;
        $("est-grabar").textContent = "este navegador no da la posición";
        return;
      }
      grabar.empezar({ ruta: ruta?.id, tren: ruta?.tren?.numero, posicion: () => pos?.d, modo: () => pos?.modo + (esSimulado() ? " simulado" : "") }, (r, err) => {
        pintarGrabacion(r, err);
        if (vista === "ajustes" && r.puntos.length % 10 === 1) pintarRecorridos();
      });
      pintarGrabacion();
    } else {
      await grabar.terminar();
      pintarGrabacion();
    }
    pintarRecorridos();
  };
  $("recorridos").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.gpx || b.dataset.json || b.dataset.borrarRec;
    const r = await recorridos.cargar(id);
    if (!r) return;
    const base = `railnav-${r.tren ?? "recorrido"}-${r.id.slice(0, 16).replace(/[:T]/g, "-")}`;
    if (b.dataset.gpx) compartirArchivo(base + ".gpx", grabar.gpx(r), "application/gpx+xml");
    if (b.dataset.json) compartirArchivo(base + ".json", grabar.json(r));
    if (b.dataset.borrarRec && confirm("¿Borrar esta grabación?")) {
      await recorridos.borrar(id);
      pintarRecorridos();
    }
  };
}

// ---------- simulación: controles en la pantalla de marcha ----------
// La simulación sigue corriendo aunque se cambie de vista (datos, ajustes…).
function pintarSim() {
  const sim = pos?.modo === "simulacion";
  $("simbar").hidden = !sim;
  document.querySelector(".pie").hidden = !sim; // abajo solo queda la barra de la simulación
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
  arrastrable($("sc"), () => ($("sc").getBoundingClientRect().height * altoLinea()) / (altoDibujo() - 6.5));
  // Teléfono: línea de tiempo estrecha, dibujada en píxeles
  arrastrable($("mv-linea"), () => {
    const [arriba, abajo] = limitesLineaMovil($("mv-linea").clientHeight);
    return abajo - arriba;
  });
}

/** El arrastre de una línea de tiempo; `altoPx` = píxeles que ocupan sus 3 km. */
function arrastrable(sc, altoPx) {
  let y0 = null, t0 = 0, vel = 0;
  const mpp = () => metrosPorPixel(altoPx());
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
// App instalada en iOS: el sistema da a veces un alto de pantalla al que le falta justo la barra
// de estado (la app empieza debajo de ella pero acaba antes del borde inferior). Si falta
// exactamente eso, se suma; si iOS lo corrige, no se suma nada.
function corregirAlto() {
  const r = document.documentElement;
  let extra = 0;
  if (r.classList.contains("instalada")) {
    const sonda = document.createElement("div");
    sonda.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
    document.body.appendChild(sonda);
    const arriba = sonda.offsetHeight;
    sonda.remove();
    const apaisado = innerWidth > innerHeight;
    const pantalla = apaisado ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const falta = pantalla - innerHeight;
    if (arriba > 0 && falta > 0 && Math.abs(falta - arriba) <= 3) extra = falta;
    // Otra señal del mismo fallo: el «viewport grande» (100lvh) mide más que la ventana, cosa
    // que en una app instalada (sin barras de Safari que se escondan) no debería pasar.
    const lvh = medir("100lvh");
    if (lvh > innerHeight + 10 && lvh - innerHeight <= 90) extra = Math.max(extra, lvh - innerHeight);
  }
  r.style.setProperty("--extra", extra + "px");
  r.style.setProperty("--aj-sup", prefs.leer("aj.sup", 0) + "px");
  r.style.setProperty("--aj-inf", prefs.leer("aj.inf", 0) + "px");
}

/** Alto en píxeles de una medida CSS (100vh, 100lvh, env(...)…). */
function medir(alto) {
  const s = document.createElement("div");
  s.style.cssText = `position:fixed;top:0;left:0;width:1px;height:${alto};visibility:hidden;pointer-events:none`;
  document.body.appendChild(s);
  const h = s.offsetHeight;
  s.remove();
  return h;
}

function pintarBordes() {
  $("aj-sup").textContent = `${prefs.leer("aj.sup", 0)} px`;
  $("aj-inf").textContent = `${prefs.leer("aj.inf", 0)} px`;
  const r = document.documentElement;
  $("medidas").textContent =
    `Medidas (para revisar el ajuste): pantalla ${screen.width}×${screen.height} · ventana ${innerWidth}×${innerHeight} · ` +
    `100vh ${medir("100vh")} · 100lvh ${medir("100lvh")} · 100dvh ${medir("100dvh")} · ` +
    `zona segura arriba ${medir("env(safe-area-inset-top,0px)")}, abajo ${medir("env(safe-area-inset-bottom,0px)")} · ` +
    `corrección ${getComputedStyle(r).getPropertyValue("--extra").trim() || "0px"} · ${r.classList.contains("instalada") ? "instalada" : "en Safari"} · v${VERSION_APP}`;
}

function iniciarBordes() {
  document.querySelectorAll("button[data-aj]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = "aj." + b.dataset.aj, v = Math.max(-40, Math.min(120, prefs.leer(k, 0) + +b.dataset.d));
      prefs.escribir(k, v);
      corregirAlto();
      pintarBordes();
      sucio = true;
    }),
  );
  $("aj-rest").onclick = () => {
    prefs.escribir("aj.sup", 0);
    prefs.escribir("aj.inf", 0);
    corregirAlto();
    pintarBordes();
  };
}

function iniciarTamano() {
  corregirAlto();
  addEventListener("resize", corregirAlto);
  addEventListener("orientationchange", () => setTimeout(corregirAlto, 300));
  const scr = document.querySelector(".scr");
  const medir = () => {
    const r = scr.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const apilado = matchMedia("(max-aspect-ratio: 5/4)").matches;
    const vertical = matchMedia("(max-aspect-ratio: 4/5)").matches;
    if (ajustarDibujo(r.width, r.height, apilado)) sucio = true;
    // unidad del dibujo en píxeles: el historial usa la misma escala de letra
    // en vertical las dos columnas de dibujo ocupan el ancho; el historial, con letra legible
    const u = vertical ? Math.max(1, r.width / 603) : apilado ? r.width / 900 : r.height / (altoDibujo() - 6.5);
    scr.style.setProperty("--u", u + "px");
  };
  new ResizeObserver(medir).observe(scr);
  medir();
}

// ---------- bucle ----------
let antes = 0, ultimoSegundo = 0;
function bucle(t) {
  const dt = Math.min(0.1, (t - antes) / 1000);
  antes = t;
  // Donde la hoja no da V Max, la simulación sigue a la siguiente (o a 30 km/h).
  const enMarcha = pos?.enMarcha;
  if (pos && ruta && pos.paso(dt, ruta.vEn(pos.d) ?? ruta.siguiente(pos.d)?.v ?? 30)) sucio = true;
  if (pos && enMarcha !== pos.enMarcha) pintarSim(); // la simulación ha llegado al final
  if (pasoInercia(dt)) sucio = true;
  if (pasoGps()) sucio = true;
  if (pos && ruta) sonarAvisos();
  // el adelanto o retraso depende del reloj: se repinta cada segundo
  if (t - ultimoSegundo > 1000) {
    ultimoSegundo = t;
    if (prefs.leer("desvio", true)) sucio = true;
  }
  if (sucio && ruta) {
    sucio = false;
    estado();
    if (vista === "marcha") (movil() ? pintarMarchaMovil : pintarMarcha)(ruta, pos, { desvio: prefs.leer("desvio", true) });
  }
  requestAnimationFrame(bucle);
}

// ---------- inicio ----------
async function iniciar() {
  const tema = prefs.leer("tema", null);
  if (tema) document.documentElement.dataset.theme = tema;
  barra();
  desbloquear();
  despierto.iniciar(() => vista === "ajustes" && pintarAjustes());
  await cargarPictos();
  iniciarAjustes();
  iniciarEditor();
  iniciarArrastre();
  iniciarSimulacion();
  iniciarTablas();
  iniciarTamano();
  iniciarPantalla();
  iniciarBordes();
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
