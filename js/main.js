// Arranque de la app: barra superior, vistas, carga de rutas y bucle de pintado.

import { VERSION_APP } from "./version.js";
import { esc, fecha, may } from "./util.js";
import { Ruta, validar } from "./ruta.js";
import { MODOS, Posicion, metrosPorPixel } from "./posicion.js";
import { cvms, datos, dltvs, firmaRuta, geos, obsoleta, persistir, prefs, recorridos, rutas, telefonemas, tramos } from "./almacen.js";
import * as TF from "./telefonemas.js";
import { AVISO_DIAS, caducados, caducaPronto, diasRestantes, dltvAntiguo, DIAS, rutaAntigua } from "./retencion.js";
import { htmlLegal, SECCIONES } from "./legal.js";
import { cargarPictos, deSerie, picDe, restaurar as restaurarPictos } from "./pictos.js";
import { confirmar } from "./confirmar.js";
import { describirCopia, filtrarCopia } from "./copia.js";
import { dependenciasCvm, lineasCvm, rutaDesdeCvm } from "./ruta_cvm.js";
import { ajustarDibujo, alcance, altoDibujo, altoLinea, limitesLineaMovil, pintarMarcha, pintarMarchaMovil, reiniciarHistorial } from "./marcha.js";
import { irAqui, ltvVisibles, mostrarPestana, movil, pintarDatos, pintarFicha, vistaDltv } from "./datos.js";
import { iniciarEditor, pintarEditor } from "./editor.js";
import { LOGO, linea } from "./iconos.js";
import { desbloquear, ponerSilencio, probar, silenciado, tono, MUESTRA } from "./sonido.js";
import { Avisador } from "./avisos.js";
import { Residuo } from "./residuo.js";
import * as despierto from "./despierto.js";
import { Seguidor, Via } from "./geo/seguimiento.js";
import { ahora as ahoraGps, disponible as hayUbicacion, escuchar as escucharUbicacion, esSimulado, simular } from "./geo/ubicacion.js";
import { GpsSimulado } from "./geo/simulado.js";
import * as grabar from "./geo/grabar.js";
import { compartirArchivo } from "./compartir.js";
import { trazadoIncluido } from "./geo/firma.js";

const $ = (id) => document.getElementById(id);
let ruta = null, pos = null, vista = "marcha", sucio = true;
// Residuo (como en las 253): cuenta atrás de la longitud del tren desde que se pulsa.
const residuo = new Residuo();
let resRestante = null, resLibre = 0;

// ---------- barra superior ----------
function barra() {
  iniciarFicha();
  $("brand").innerHTML = LOGO(52) + `<small class="ver">v${VERSION_APP}</small>`;
  $("hj-aqui").innerHTML = linea("aqui", 24);
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

// ---------- silencio ----------
// Sin control de volumen propio (Joan, 09-11-2026): manda el volumen del dispositivo. Solo se
// puede silenciar la app.
function pintarSonido() {
  const mudo = silenciado();
  $("m-mute").innerHTML = linea("silencio");
  $("m-mute").title = mudo ? "Sonido desactivado: pulsa para activarlo" : "Silenciar";
  $("m-mute").setAttribute("aria-pressed", String(mudo));
  $("m-mute").classList.toggle("mudo", mudo);
}

function iniciarSonido() {
  $("m-mute").onclick = () => {
    ponerSilencio(!silenciado());
    pintarSonido();
    if (!silenciado()) probar();
  };
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
  // En el cuadro, solo «TREN» y el número (Joan, 09-11-2026): la clase (Viajeros/Mercancías) y el
  // trayecto se ven en la ficha, al abrir el desplegable.
  $("in-ficha").hidden = !ruta;
  $("in-ruta").textContent = "";
  // iPad: el cuadro «Tren» es más ancho y lleva también el origen y el destino (v0.27.0).
  $("in-od").hidden = !t;
  if (t) {
    $("in-ori").textContent = t.origen || "?";
    $("in-des").textContent = t.destino || "?";
    $("in-od").title = `${t.origen || "?"} → ${t.destino || "?"}`;
  }
  // Cambios de radio y de bloqueo: en vez de ir a «Próximos» y «Pasados», el cuadro de arriba
  // parpadea (radio en el color de su pictograma, bloqueo en naranja) con «antes → después», desde
  // que se avisa hasta 500 m después del punto. Radio: solo el número del canal.
  ponerCambio("in-rd", ruta?.cambioCerca(pos.d, "cambio_radio", alcance), rd);
  ponerCambio("in-bq", ruta?.cambioCerca(pos.d, "cambio_bloqueo", alcance), bq || null);
}

function ponerCambio(id, c, actual) {
  const b = $(id), ic = b.closest(".ic"), txt = c ? `${c.de ?? "?"} → ${c.a ?? "?"}` : (actual ?? "—");
  // Canal en cambio: antiguo, flecha y nuevo en piezas (en el iPhone en vertical, uno encima de
  // otro con la flecha ↓; en lo demás, en una línea con →).
  const html = c && id === "in-rd" ? `<span class="cb-de">${esc(c.de ?? "?")}</span><span class="cb-fl" aria-label="pasa a"><i class="h">→</i><i class="v">↓</i></span><span class="cb-a">${esc(c.a ?? "?")}</span>` : esc(txt);
  if (b.dataset.v !== html) {
    b.dataset.v = html;
    b.innerHTML = html;
  }
  b.classList.toggle("vacio", !c && actual == null);
  if (ic.classList.contains("cambia") !== !!c) ic.classList.toggle("cambia", !!c);
  if (c && id === "in-rd") ic.style.setProperty("--cambio", picDe(c.e)?.borde || "#35c2b5");
  ic.title = c ? `Cambio de ${id === "in-rd" ? "canal de radio" : "bloqueo"}: ${txt}` : "";
}

// ---------- vistas ----------
// ---------- ficha del tren: desplegable desde el cuadro «Tren» ----------
const TRIANGULO = (arriba) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><polygon points="${arriba ? "4,16 20,16 12,6.5" : "4,8 20,8 12,17.5"}" fill="currentColor"/></svg>`;

/** Desplegables flotantes (datos del tren y telefonemas): bajo los cuadros de arriba, a todo el ancho. */
function colocarPop(pop) {
  const info = document.querySelector(".info").getBoundingClientRect(), vw = document.querySelector(".vw").getBoundingClientRect();
  const top = info.bottom + 6;
  Object.assign(pop.style, { top: top + "px", left: vw.left + "px", width: vw.width + "px", maxHeight: Math.max(160, innerHeight - top - 12) + "px" });
}

function ponerFicha(abrir) {
  abrir = !!abrir && !!ruta;
  if (abrir) {
    ponerTf(false);
    pintarFicha(ruta);
    colocarPop($("pop-ficha"));
  }
  $("pop-ficha").hidden = !abrir;
  const b = $("in-ficha");
  b.setAttribute("aria-expanded", String(abrir));
  b.setAttribute("aria-label", abrir ? "Plegar los datos del tren" : "Ver los datos del tren");
  b.classList.toggle("on", abrir);
  b.innerHTML = TRIANGULO(abrir);
}

function iniciarFicha() {
  ponerFicha(false);
  $("in-ficha").onclick = () => ponerFicha($("pop-ficha").hidden);
  // Se pliegan al tocar fuera, salvo en una ventana emergente abierta encima (nuevo telefonema,
  // confirmación).
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".modal")) return;
    if (!$("pop-ficha").hidden && !e.target.closest?.("#pop-ficha,#in-ficha")) ponerFicha(false);
    if (!$("pop-tf").hidden && !e.target.closest?.("#pop-tf,#m-tf")) ponerTf(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector(".modal:not([hidden])")) return;
    if (!$("pop-ficha").hidden) ponerFicha(false);
    if (!$("pop-tf").hidden) ponerTf(false);
  });
  addEventListener("resize", () => {
    if (!$("pop-ficha").hidden) colocarPop($("pop-ficha"));
    if (!$("pop-tf").hidden) colocarPop($("pop-tf"));
  });
}

/** Telefonemas: desplegable desde el triángulo, como el de los datos del tren. */
function ponerTf(abrir) {
  abrir = !!abrir && !!ruta;
  if (abrir) {
    ponerFicha(false);
    colocarPop($("pop-tf"));
  }
  $("pop-tf").hidden = !abrir;
  if (abrir) {
    pintarTf();
    $("pop-tf").scrollTop = 0;
  }
  $("m-tf").classList.toggle("on", abrir);
  $("m-tf").setAttribute("aria-expanded", String(abrir));
}

function mostrar(v) {
  vista = v;
  if (v !== "datos") {
    vistaDltv.sel = null;
    $("dlsel").hidden = true;
  }
  ponerFicha(false);
  ponerTf(false);
  for (const k of ["marcha", "datos", "ajustes"]) $("v-" + k).hidden = k !== v;
  for (const k of ["marcha", "datos", "ajustes"]) $("m-" + k).classList.toggle("on", k === v);
  if (v === "datos" && ruta) {
    pintarDatos(ruta, pos.d);
    requestAnimationFrame(() => irAqui(pos.d));
  }
  if (v === "ajustes") pintarAjustes();
  sucio = true;
}

// ---------- telefonemas ----------
// El registro de los telefonemas de la ruta abierta; los vigentes entran en la marcha.
let tfs = [];
const hhmm = (f = new Date()) => `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;

function pintarBotonTf() {
  const n = tfs.filter((t) => !t.anulado && !t.manual).length;
  $("tf-n").hidden = !n;
  $("tf-n").textContent = n;
}

async function aplicarTf() {
  tfs = await telefonemas.deRuta(ruta.id);
  ruta.ponerTelefonemas(tfs);
  pintarBotonTf();
  pintarTf();
  sucio = true;
}

const radio = (n) => document.querySelector(`input[name=${n}]:checked`)?.value;
const ponerRadio = (n, v) => {
  for (const r of document.querySelectorAll(`input[name=${n}]`)) r.checked = r.value === v;
};
function tipoTf() {
  return radio("tf-tipo") || "ltv";
}

/** Los campos tal como están en el formulario. */
function camposTf() {
  const tipo = tipoTf(), lugar = tipo === "ltv" || tipo === "suprime";
  return {
    tipo,
    numero: Number($("tf-num").value),
    hora: $("tf-hora").value,
    emisor: $("tf-emisor").value.trim(),
    receptor: $("tf-receptor").value.trim(),
    firma: $("tf-firma").value.trim(),
    v: lugar ? Number($("tf-v").value) || null : null,
    via: lugar ? $("tf-via").value.trim() || null : null,
    pk_ini: lugar ? $("tf-pki").value.trim() || null : null,
    pk_fin: lugar ? $("tf-pkf").value.trim() || null : null,
    est_ini: lugar ? $("tf-esti").value || null : null,
    est_fin: lugar ? $("tf-estf").value || null : null,
    causa: tipo === "ltv" ? $("tf-causa").value.trim() || null : null,
    senalizada: tipo === "ltv" ? radio("tf-sen") !== "no" : null,
    csv: tipo === "ltv" && radio("tf-csvr") === "si",
    mensaje: $("tf-msg").value.trim(),
  };
}

/** Estación final: solo las que van después de la inicial. */
function estacionesFinTf() {
  const est = TF.estaciones(ruta.p), ini = $("tf-esti").value, actual = $("tf-estf").value;
  const k = ini ? est.findIndex((e) => e.nom === ini) : -1;
  const lista = k >= 0 ? est.slice(k + 1) : est;
  $("tf-estf").innerHTML = `<option value="">—</option>` + lista.map((e) => `<option value="${esc(e.nom)}">${esc(e.nom)}</option>`).join("");
  $("tf-estf").value = lista.some((e) => e.nom === actual) ? actual : "";
}

function formTf(ev) {
  const t = camposTf();
  $("tf-form").dataset.tipo = t.tipo;
  if (ev?.target?.id === "tf-esti") estacionesFinTf();
  const el = $("tf-donde");
  el.className = "tf-r";
  el.textContent = "";
  if (t.tipo !== "ltv" && t.tipo !== "suprime") return;
  if (!t.pk_ini && !t.pk_fin && !t.est_ini) return;
  const l = TF.lugar(t, ruta.p, pos.d);
  if (l.error) {
    el.className = "tf-r mal";
    el.textContent = may(l.error);
    return;
  }
  const r = TF.rango(l.desde, l.hasta);
  if (!r) {
    el.className = "tf-r mal";
    el.textContent = "El inicio y el final son el mismo punto.";
    return;
  }
  const km = r[0] - pos.d, lejos = km < -0.05 ? (r[1] > pos.d ? "estás dentro" : "ya pasado") : `empieza a ${dmTf(km)}`;
  let txt = `Tramo de ${dmTf(r[1] - r[0])} · ${lejos}`;
  if (t.tipo === "suprime") {
    const c = TF.coincidentes(r[0], r[1], ruta.p, t.v);
    if (!c.length) {
      el.className = "tf-r mal";
      el.textContent = "En ese tramo no hay ninguna LTV del DLTV que suprimir";
      return;
    }
    txt += ` · Suprime: ${c.map((x) => x.texto).join(" / ")}`;
  }
  el.textContent = txt;
}
const dmTf = (km) => (km >= 1 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km * 1000)} m`);

function abrirFormTf(t = null, { manual = false } = {}) {
  manual = manual || !!t?.manual;
  $("tf-form").dataset.manual = manual ? "1" : "";
  $("tf-titulo").textContent = manual ? (t ? "Editar LTV añadida a mano" : "Añadir una LTV a mano") : t ? "Editar telefonema" : "Nuevo telefonema";
  const hoy = tfs.filter((x) => !x.manual && x.fecha === new Date().toISOString().slice(0, 10));
  const ult = tfs[tfs.length - 1];
  $("tf-id").value = t?.id || "";
  $("tf-num").value = t?.numero ?? Math.min(99, Math.max(0, ...hoy.map((x) => x.numero)) + 1);
  $("tf-hora").value = t?.hora || hhmm();
  $("tf-emisor").value = t?.emisor ?? ult?.emisor ?? prefs.leer("tf.emisor", "");
  $("tf-receptor").value = t?.receptor ?? ult?.receptor ?? `Maquinista ${ruta.tren.numero}`;
  $("tf-firma").value = t?.firma ?? ult?.firma ?? "";
  ponerRadio("tf-tipo", manual ? "ltv" : t && TF.TIPOS[t.tipo] && ["ltv", "suprime", "registro"].includes(t.tipo) ? t.tipo : t ? "registro" : "ltv");
  $("tf-v").value = t?.v || "";
  $("tf-via").value = t?.via || "";
  $("tf-pki").value = t?.pk_ini || "";
  $("tf-pkf").value = t?.pk_fin || "";
  const est = TF.estaciones(ruta.p);
  $("tf-esti").innerHTML = `<option value="">—</option>` + est.map((e) => `<option value="${esc(e.nom)}">${esc(e.nom)}</option>`).join("");
  $("tf-esti").value = t?.est_ini || "";
  $("tf-estf").innerHTML = `<option value="${esc(t?.est_fin || "")}"></option>`;
  $("tf-estf").value = t?.est_fin || "";
  estacionesFinTf();
  $("tf-causa").value = t?.causa || "";
  ponerRadio("tf-sen", t?.senalizada === false ? "no" : "si");
  ponerRadio("tf-csvr", t?.csv ? "si" : "no");
  $("tf-msg").value = t?.mensaje || "";
  $("tf-err").textContent = "";
  $("tf-guardar").textContent = t ? "Guardar cambios" : "Guardar";
  telefonemas.listar().then((l) => {
    $("tf-emisores").innerHTML = [...new Set(l.map((x) => x.emisor).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join("");
  });
  // Ventana emergente (v0.20, Joan), como la de revisar una LTV.
  $("tf-form").hidden = false;
  $("tf-modal").hidden = false;
  formTf();
  $("tf-modal").querySelector(".modal-c").scrollTop = 0;
}

function cerrarFormTf() {
  const manual = $("tf-form").dataset.manual === "1";
  $("tf-form").hidden = true;
  $("tf-modal").hidden = true;
  $("tf-form").dataset.manual = "";
  document.activeElement?.blur?.();
  if (manual) volverADltv();
}

// ---------- estado de las LTV del DLTV (Datos → DLTV) ----------
// Cualquier LTV se puede pasar a «Aplica» o «No aplica», una a una (tocándola) o varias a la vez
// («Seleccionar»). La decisión se guarda en el dispositivo, por ruta; el DLTV no se toca.
let revCod = null;
const claveRev = () => "revision." + ruta.id;
const ahoraIso = () => new Date().toISOString();
const velDltv = (x) => x.v || Number((String(x.vel).match(/\d+/) || [""])[0]) || null;

function abrirRevision(cod) {
  const x = (ruta?.p.dltv?.ltv || []).find((l) => l.cod === cod);
  if (!x) return;
  revCod = cod;
  const dec = ruta.revision(cod);
  const dudas = (x.ev || []).filter((e) => e.startsWith("a revisar")).map((e) => e.replace(/^a revisar:\s*/, ""));
  const fila = (lab, v) => (v ? `<div><i>${lab}</i><span>${v}</span></div>` : "");
  const nf1 = (v) => String(v).replace(".", ","), pk3 = (v) => (v == null ? "?" : Number(v).toFixed(3).replace(".", ","));
  const delDltv = x.res === "APLICA" ? "aplica" : "a revisar";
  $("rev-d").innerHTML =
    fila("Velocidad", `<b>${esc(x.vel)}</b>${x.csv ? ' <span class="cs">CSV</span>' : ""}`) +
    fila("Km ruta", x.pkai != null ? `${nf1(x.pkai)} → ${nf1(x.pkaf)}` : "no se sabe dónde cae en la ruta") +
    fila("Línea · PK", `${esc(x.lin || "?")} · ${pk3(x.pki)} → ${pk3(x.pkf)}`) +
    fila("Vía", x.via ? `${esc(x.via)} ${esc(x.via_txt || "")}` : "") +
    fila("Trayecto", esc((x.tray || []).join(" – "))) +
    fila("Motivo", esc(x.mot || "")) +
    fila("Observaciones", esc(x.obs || "")) +
    fila("Tren", `${esc(ruta.tren.numero)}${ruta.tren.clase ? " · " + ({ mercancias: "Mercancías", viajeros: "Viajeros" }[ruta.tren.clase] || esc(ruta.tren.clase)) : ""}`) +
    fila("Según el DLTV", delDltv) +
    (dudas.length ? `<div class="rev-por">Por qué a revisar: ${esc(dudas.join(" · "))}</div>` : "") +
    (dec ? `<div class="rev-ya">Ya revisada: <b>${dec.decision === "aplica" ? "aplica a " + dec.v + " km/h" : "no aplica"}</b></div>` : "");
  const sinSitio = x.pkai == null;
  $("rev-v").value = dec?.v || velDltv(x) || "";
  $("rev-v").classList.remove("mal");
  $("rev-vl").hidden = sinSitio;
  $("rev-si").disabled = sinSitio;
  $("rev-si").title = sinSitio ? "No se sabe dónde cae en la ruta: si aplica, añádela con el botón + (Añadir LTV)" : "";
  $("rev-quitar").textContent = `Volver a «${delDltv}» (DLTV)`;
  $("rev-quitar").hidden = !dec;
  $("rev").hidden = false;
}

function cerrarRevision() {
  $("rev").hidden = true;
  revCod = null;
  document.activeElement?.blur?.();
}

/**
 * Guarda la decisión sobre una LTV en `todas` (null: la quita). «Aplica» a la velocidad del
 * DLTV en una LTV que el DLTV ya da como APLICA es lo mismo que no decidir nada.
 */
function anotar(todas, x, decision, v = null) {
  if (decision === "aplica" && x.res === "APLICA" && v === x.v) decision = null;
  if (decision === "aplica") todas[x.cod] = { decision, v, fecha: ahoraIso() };
  else if (decision === "no") todas[x.cod] = { decision, fecha: ahoraIso() };
  else delete todas[x.cod];
}

function guardarRevisiones(todas) {
  prefs.escribir(claveRev(), todas);
  ruta.ponerRevisiones(todas);
  pintarDatos(ruta, pos.d);
  sucio = true;
}

function decidir(decision) {
  const x = (ruta?.p.dltv?.ltv || []).find((l) => l.cod === revCod);
  if (!x) return;
  const todas = { ...prefs.leer(claveRev(), {}) };
  let v = null;
  if (decision === "aplica") {
    v = Math.round(Number($("rev-v").value));
    if (!(v >= 5 && v <= 300)) {
      $("rev-v").focus();
      $("rev-v").classList.add("mal");
      return;
    }
  }
  anotar(todas, x, decision, v);
  cerrarRevision();
  guardarRevisiones(todas);
}

/** Selección múltiple: entrar, marcar las que se ven, terminar o pasar las marcadas a un estado. */
function accionSeleccion(acc) {
  if (!ruta?.p.dltv) return;
  vistaDltv.msg = "";
  if (acc === "modo") vistaDltv.sel = new Set();
  else if (acc === "fin") vistaDltv.sel = null;
  else if (acc === "todas" && vistaDltv.sel) {
    const vis = ltvVisibles(ruta).map((x) => x.cod);
    const todas = vis.length && vis.every((c) => vistaDltv.sel.has(c));
    for (const c of vis) todas ? vistaDltv.sel.delete(c) : vistaDltv.sel.add(c);
  } else if (vistaDltv.sel?.size) {
    const todas = { ...prefs.leer(claveRev(), {}) }, dl = ruta.p.dltv.ltv;
    let hechas = 0, saltadas = 0;
    for (const x of dl.filter((l) => vistaDltv.sel.has(l.cod))) {
      if (acc === "ap") {
        // Si ya aplica (por el DLTV o por una decisión), se queda como está, con su velocidad.
        if (todas[x.cod]?.decision === "aplica" || (x.res === "APLICA" && !todas[x.cod])) {
          hechas++;
          continue;
        }
        const v = velDltv(x);
        if (x.pkai == null || !(v >= 5 && v <= 300)) {
          saltadas++;
          continue;
        }
        anotar(todas, x, "aplica", x.res === "APLICA" ? x.v : v);
      } else anotar(todas, x, acc === "no" ? "no" : null);
      hechas++;
    }
    const a = { ap: "«Aplica»", no: "«No aplica»", quitar: "lo que dice el DLTV" }[acc];
    vistaDltv.msg =
      `${hechas} ${hechas === 1 ? "LTV pasada" : "LTV pasadas"} a ${a}.` +
      (saltadas ? ` ${saltadas} sin sitio en la ruta o sin velocidad: tócala${saltadas > 1 ? "s una a una" : ""} para decidir.` : "");
    vistaDltv.sel = new Set();
    guardarRevisiones(todas);
    return;
  }
  pintarDatos(ruta, pos.d);
}

function iniciarRevision() {
  $("v-datos").addEventListener("click", (e) => {
    if (!ruta) return;
    const f = e.target.closest("[data-filtro]");
    if (f) {
      vistaDltv.filtro = f.dataset.filtro === vistaDltv.filtro ? "" : f.dataset.filtro;
      vistaDltv.msg = "";
      return pintarDatos(ruta, pos.d);
    }
    const s = e.target.closest("[data-dlsel]");
    if (s) return accionSeleccion(s.dataset.dlsel);
    const r = e.target.closest("#dl [data-cod]");
    if (!r || e.target.closest("button")) return;
    abrirRevision(r.dataset.cod);
  });
  // Ventana de la selección múltiple: filtros, acciones y casillas; la X o el fondo la cierran.
  $("dlsel").addEventListener("click", (e) => {
    if (!ruta) return;
    if (e.target === $("dlsel")) return accionSeleccion("fin");
    const f = e.target.closest("[data-filtro]");
    if (f) {
      vistaDltv.filtro = f.dataset.filtro === vistaDltv.filtro ? "" : f.dataset.filtro;
      vistaDltv.msg = "";
      return pintarDatos(ruta, pos.d);
    }
    const s = e.target.closest("[data-dlsel]");
    if (s) accionSeleccion(s.dataset.dlsel);
  });
  $("dlsel").addEventListener("change", (e) => {
    const c = e.target.dataset?.dlck;
    if (!ruta || !c || !vistaDltv.sel) return;
    e.target.checked ? vistaDltv.sel.add(c) : vistaDltv.sel.delete(c);
    vistaDltv.msg = "";
    pintarDatos(ruta, pos.d);
  });
  $("rev-si").onclick = () => decidir("aplica");
  $("rev-no").onclick = () => decidir("no");
  $("rev-quitar").onclick = () => decidir(null);
  $("rev-x").onclick = cerrarRevision;
  $("rev").addEventListener("click", (e) => e.target === $("rev") && cerrarRevision());
  addEventListener("keydown", (e) => e.key === "Escape" && !$("rev").hidden && $("conf").hidden && cerrarRevision());
  $("rev-v").addEventListener("input", () => $("rev-v").classList.remove("mal"));
}

/** Desde el formulario de una LTV a mano se vuelve a Datos → DLTV, no a la marcha. */
function volverADltv() {
  mostrar("datos");
  mostrarPestana("dltv");
}

async function guardarTf(ev) {
  ev.preventDefault();
  const c = camposTf();
  const viejo = tfs.find((x) => x.id === $("tf-id").value);
  const manual = $("tf-form").dataset.manual === "1";
  if (manual) Object.assign(c, { tipo: "ltv", numero: null, hora: null, emisor: "", receptor: "", firma: "" });
  const t = {
    id: viejo?.id || new Date().toISOString(),
    manual,
    ruta: ruta.id,
    tren: ruta.tren.numero,
    fecha: viejo?.fecha || new Date().toISOString().slice(0, 10),
    ...c,
    desde: null,
    hasta: null,
    anulado: viejo?.anulado || null,
  };
  const e = TF.errores(t, ruta.p, pos.d);
  if (e.length) {
    $("tf-err").textContent = "Falta o no cuadra: " + e.join("; ") + ".";
    return;
  }
  if (t.tipo === "ltv" || t.tipo === "suprime") {
    const l = TF.lugar(t, ruta.p, pos.d);
    t.desde = l.desde;
    t.hasta = l.hasta;
    if (t.tipo === "suprime") {
      const [ini, fin] = TF.rango(l.desde, l.hasta), co = TF.coincidentes(ini, fin, ruta.p, t.v);
      t.ltvs = co.map((x) => x.id);
      t.ltv_txt = co.map((x) => x.texto).join(" / ");
    }
  }
  if (t.emisor) prefs.escribir("tf.emisor", t.emisor);
  await telefonemas.guardar(t);
  await aplicarTf();
  cerrarFormTf();
}

function pintarTf() {
  if (!ruta || $("pop-tf").hidden) return;
  const tr = ruta.tren;
  $("tf-tren").textContent = `Tren ${tr.numero}${tr.fecha ? " · " + fecha(tr.fecha) : ""}`;
  const lista = tfs.filter((t) => !t.manual).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  $("tf-compartir").hidden = !lista.length;
  $("tf-lista").innerHTML = lista.length
    ? lista
        .map((t) => {
          const r = TF.rango(t.desde, t.hasta && t.hasta.pka != null ? t.hasta : null);
          const ini = t.tipo === "incidencia" ? t.desde?.pka : r?.[0], fin = t.tipo === "incidencia" ? t.desde?.pka : r?.[1];
          let est = "";
          if (t.anulado) est = `<span class="tf-chip an">ANULADO ${esc(t.anulado.hora)}${t.anulado.por ? " · nº " + esc(t.anulado.por) : ""}</span>`;
          else if (t.tipo === "suprime") est = `<span class="tf-chip en">EN VIGOR</span>`;
          else if (ini != null && pos.d < ini) est = `<span class="tf-chip">a ${dmTf(ini - pos.d)}</span>`;
          else if (fin != null && pos.d <= fin + 0.001 && t.tipo !== "incidencia") est = `<span class="tf-chip en">EN CURSO</span>`;
          else if (ini != null) est = `<span class="tf-chip pas">pasado</span>`;
          const presc = t.tipo === "registro" ? "" : `<div class="tf-presc">${esc(TF.resumen(t))}</div>`;
          return `<article class="tf-it${t.anulado ? " anulado" : ""}" data-id="${esc(t.id)}">
            <header><b>Nº ${t.numero}</b><span>${esc(t.hora)}</span>${est}</header>${presc}
            <dl><dt>De</dt><dd>${esc(t.emisor || "—")}</dd><dt>A</dt><dd>${esc(t.receptor || "—")}</dd>${t.mensaje ? `<dt>Mensaje</dt><dd>${esc(t.mensaje)}</dd>` : ""}<dt>Firma</dt><dd>${esc(t.firma || "—")}</dd></dl>
            <div class="tf-acc"><button data-tf="editar">Editar</button><button data-tf="anular">${t.anulado ? "Quitar anulación" : "Anular"}</button><button data-tf="borrar" class="peligro">Borrar</button></div>
          </article>`;
        })
        .join("")
    : `<div class="vac">Sin telefonemas en esta ruta. Pulsa «Nuevo telefonema» para registrar el primero.</div>`;
}

/** Datos → DLTV: «+ Añadir LTV» y borrar/editar las añadidas a mano. */
function iniciarLtvManual() {
  $("v-datos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ltvman]");
    if (!b || !ruta) return;
    const id = b.dataset.ltvman, t = tfs.find((x) => x.id === id);
    // La LTV a mano se añade en la ventana emergente, sin salir de Datos → DLTV.
    if (id === "nueva") return abrirFormTf(null, { manual: true });
    if (!t) return;
    if (b.dataset.acc === "editar") return abrirFormTf(t, { manual: true });
    if (b.dataset.acc === "borrar" && (await confirmar({ titulo: "Borrar la LTV", mensaje: "¿Borrar esta LTV añadida a mano? No se puede deshacer.", si: "Borrar", peligro: true }))) {
      await telefonemas.borrar(t.id);
      await aplicarTf();
      if (vista === "datos") pintarDatos(ruta, pos.d);
    }
  });
}

function iniciarTelefonemas() {
  iniciarLtvManual();
  iniciarRevision();
  // El triángulo despliega y pliega los telefonemas, sin salir de la pantalla en la que se está.
  $("m-tf").setAttribute("aria-controls", "pop-tf");
  $("m-tf").setAttribute("aria-haspopup", "true");
  $("m-tf").onclick = () => ponerTf($("pop-tf").hidden);
  $("tf-nuevo").onclick = () => abrirFormTf();
  $("tf-cancelar").onclick = cerrarFormTf;
  addEventListener("keydown", (e) => e.key === "Escape" && !$("tf-modal").hidden && $("conf").hidden && cerrarFormTf());
  $("tf-form").onsubmit = guardarTf;
  $("tf-form").oninput = formTf;
  $("tf-form").onchange = formTf;
  $("tf-lista").onclick = async (e) => {
    const b = e.target.closest("[data-tf]"), id = e.target.closest("[data-id]")?.dataset.id;
    const t = tfs.find((x) => x.id === id);
    if (!b || !t) return;
    if (b.dataset.tf === "editar") return abrirFormTf(t);
    if (b.dataset.tf === "anular") {
      if (t.anulado) t.anulado = null;
      else {
        const r = await confirmar({
          titulo: `Anular el telefonema nº ${t.numero}`,
          mensaje: "¿Lo anula otro telefonema? Escribe su número (o déjalo vacío).",
          si: "Anular",
          campo: { placeholder: "Nº del telefonema que lo anula", inputmode: "numeric" },
        });
        if (r === null) return;
        const por = parseInt(r, 10);
        t.anulado = { hora: hhmm(), por: por >= 1 && por <= 99 ? por : null };
      }
    }
    if (b.dataset.tf === "borrar") {
      if (!(await confirmar({ titulo: "Borrar el telefonema", mensaje: `¿Borrar el telefonema nº ${t.numero}? No se puede deshacer.`, si: "Borrar", peligro: true }))) return;
      await telefonemas.borrar(t.id);
    } else await telefonemas.guardar(t);
    await aplicarTf();
  };
  $("tf-csv-exp").onclick = async () => {
    const todos = (await telefonemas.listar()).filter((t) => !t.manual);
    if (!todos.length) return;
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await compartirArchivo(`telefonemas-RailNav-${hoy}.csv`, TF.csvTelefonemas(todos), "text/csv");
  };
  $("tf-compartir").onclick = async () => {
    const tr = ruta.tren, lista = tfs.filter((t) => !t.manual).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
    const txt = TF.textoRegistro(lista, tr.numero, tr.fecha ? fecha(tr.fecha) : null);
    await compartirArchivo(`telefonemas-${tr.numero}-${tr.fecha || "ruta"}.txt`, txt, "text/plain");
  };
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
  Object.assign(vistaDltv, { filtro: "", sel: null, msg: "" });
  ruta.ponerLongitud(prefs.leer("longitud", 0));
  tfs = await telefonemas.deRuta(ruta.id).catch(() => []);
  ruta.ponerTelefonemas(tfs);
  ruta.ponerRevisiones(prefs.leer("revision." + ruta.id, {}));
  pintarBotonTf();
  $("aviso-ruta").hidden = !obsoleta(paquete);
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

async function pintarCvms() {
  const lista = await cvms.listar();
  pintarPruebas();
  $("cvm-lista").innerHTML = lista.length
    ? `<small>Se coteja la hoja con:</small>` +
      lista.map((c) => `<span class="cvm-it">${esc(c.titulo || c.id)}${c.anejo ? " · anejo " + esc(c.anejo) : ""} · ${c.lineas} líneas<button data-quitar="${esc(c.id)}" aria-label="Quitar">✕</button></span>`).join("")
    : `<small>Sin CVM: la V Max de la hoja no se coteja.</small>`;
  $("fila-prevalece").hidden = !lista.length;
  for (const b of $("cvm-lista").querySelectorAll("[data-quitar]"))
    b.onclick = async () => {
      await cvms.borrar(b.dataset.quitar);
      pintarCvms();
    };
}

// CVM: el PDF de ADIF (se lee aquí) o el .cvm.json leído en el ordenador.
async function leerCvms(archivos) {
  const g = await gen();
  const hechos = [], faltan = [];
  for (const f of archivos)
    try {
      mensaje(`Leyendo el CVM <b>${esc(f.name)}</b>…`);
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const r = await g.leerCvmPdf(f, (n, total) => mensaje(`Leyendo el CVM <b>${esc(f.name)}</b>: página ${n} de ${total}…`));
        hechos.push(await cvms.guardar(r.doc));
        if (r.sinTexto.length)
          faltan.push(
            `<br>⚠ <b>${esc(f.name)}</b>: ${r.sinTexto.length === 1 ? "la página " + r.sinTexto[0] + " está dibujada" : "las páginas " + r.sinTexto.join(", ") + " están dibujadas"} (sin texto) y no se ${r.sinTexto.length === 1 ? "ha" : "han"} podido leer` +
              (r.incompletas.length ? `: a ${r.incompletas.length === 1 ? "la línea" : "las líneas"} ${r.incompletas.map(esc).join(", ")} les faltan tramos` : "") +
              ". Donde falte el CVM, vale la hoja.",
          );
      } else hechos.push(await cvms.guardar(g.leerCvmJson(await f.text())));
    } catch (e) {
      mensaje(`✗ ${esc(f.name)}: ${esc(e.message || String(e))}`, "mal");
      return pintarCvms();
    }
  await pintarCvms();
  mensaje(`✓ CVM guardado${hechos.length > 1 ? "s" : ""}: ${hechos.map((c) => `${esc(c.titulo || c.id)} (${c.lineas} líneas)`).join(", ")}. Las rutas que generes se cotejarán con ${hechos.length > 1 ? "ellos" : "él"}.${faltan.join("")}`, faltan.length ? "aviso" : "ok");
}

// Solo las tablas de este dispositivo: la app ya no trae tablas de serie (Joan, 08-11-2026).
const tablasConocidas = () => tramos.listar();

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
    if (!ltv) return terminar(g, ruta, null, g.elegirTabla(ruta, await tablasConocidas()));
    // Hay maquinistas que usan hojas antiguas con el DLTV de la semana: la fecha de la hoja no
    // descarta LTV (decisión de Joan, 04-11-2026; se revisará cuando haya DLTV periódicos).
    ignorarFechasGen = true;
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
    `<div class="tr-l">` +
    propuesta.tramos.map((t, i) => tramoHtml(t, i, `data-i="${i}"`)).join("") +
    `</div><div class="note">Pon el número de línea de ADIF de cada tramo. Si dejas «?», las LTV de ese tramo saldrán «a revisar». La tabla se guarda en este dispositivo para las próximas hojas de esta ruta.</div>` +
    `<button id="tr-ok" class="pri">Confirmar y generar</button><button id="tr-no">Cancelar</button>`;
  caja.hidden = false;
  caja.querySelectorAll("input").forEach((inp) =>
    inp.addEventListener("input", () => {
      const duda = inp.value.trim() === "?" || !inp.value.trim();
      inp.classList.toggle("duda", duda);
      inp.closest(".tr-it")?.classList.toggle("sin", duda);
    }),
  );
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

let ignorarFechasGen = false;
async function terminar(g, ruta, ltv, tabla) {
  mensaje(ltv ? "Cruzando la hoja con el DLTV…" : "Preparando la ruta…");
  await new Promise((r) => setTimeout(r, 0));
  const listaCvm = await cvms.todos();
  const prevalece = prefs.leer("prevalece", "restrictiva");
  const { paquete, cruce, avisos } = g.generarPaquete(ruta, ltv, tabla, { version: 1, pictogramas: deSerie() }, { ignorarFechas: !!ltv && ignorarFechasGen, cvms: listaCvm, prevalece });
  await abrir(paquete);
  if (!paquete.geo && navigator.onLine) prepararGps(); // en segundo plano; si falla, se avisa abajo
  const n = g.recuento(cruce);
  const t = paquete.tren;
  const ltvTxt = ltv
    ? ` · DLTV nº ${esc(ltv.numero ?? "?")}: <b>${n.APLICA}</b> LTV en la ruta` + (n.INCIERTA ? `, <b>${n.INCIERTA}</b> a revisar` : "")
    : " · sin DLTV";
  const cv = paquete.cvm;
  const mayor = cv ? cv.tramos.filter((x) => x.res === "HOJA_MAYOR").length : 0;
  const rigen = cv?.vme ? cv.vme.filter((x) => x.ef === "RIGE").length : 0;
  const otraVia = cv?.vme ? cv.vme.filter((x) => x.ef === "AVISO_VIA").length : 0;
  const PREV = { hoja: "prevalece la hoja", cvm: "prevalece el CVM" };
  const cvmTxt = !cv
    ? ""
    : (cv.tramos.length
        ? ` · CVM: <b>${cv.tramos.length}</b> tramo${cv.tramos.length > 1 ? "s" : ""} no coincide${cv.tramos.length > 1 ? "n" : ""} con la hoja${mayor && cv.prevalece !== "hoja" ? ` (en ${mayor} rige el CVM)` : ""}, a revisar`
        : " · coincide con el CVM") +
      (rigen || otraVia ? ` · VME: ${rigen ? `<b>${rigen}</b> rige${rigen > 1 ? "n" : ""}` : ""}${rigen && otraVia ? ", " : ""}${otraVia ? `<b>${otraVia}</b> de otra vía (aviso)` : ""}` : "") +
      (PREV[cv.prevalece] ? ` · ${PREV[cv.prevalece]}` : "");
  mensaje(
    `✓ Tren <b>${esc(t.numero)}</b> ${t.fecha ? "del " + fecha(t.fecha) : ""} · ${esc(t.origen ?? "?")} → ${esc(t.destino ?? "?")}${ltvTxt}${cvmTxt}. Guardada y abierta.` +
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
  tablasVistas = (await tramos.listar()).map((t) => ({ t, propia: true })).sort((a, b) => (a.t.ruta < b.t.ruta ? -1 : 1));
  $("tablas-n").textContent = tablasVistas.length === 1 ? "1 tabla" : `${tablasVistas.length} tablas`;
  $("tablas").innerHTML = tablasVistas.length
    ? tablasVistas
        .map(({ t }, i) => {
          const sin = t.tramos.filter((x) => !x.linea || x.linea === "?").length;
          return (
            `<div class="ru"><div><b>${esc(t.ruta)}</b><small>${t.tramos.length} tramos` +
            (sin ? ` · <span class="aviso">${sin} sin línea</span>` : "") +
            `</small></div><div><button data-ted="${i}">Editar</button><button data-tcomp="${i}">Compartir</button><button data-tborrar="${i}">Borrar</button></div></div>`
          );
        })
        .join("")
    : '<div class="note">Todavía no hay tablas de tramos.</div>';
}

/** Un tramo de una tabla, como tarjeta (sin tabla ni scroll lateral): de → a, línea y nota. */
function tramoHtml(x, i, attrs, conCheck = false) {
  const duda = !x.linea || x.linea === "?";
  return (
    `<div class="tr-it${duda ? " sin" : ""}"><div class="tr-d"><span class="tr-i">${i + 1}</span><b>${esc(x.desde)}</b><b class="tr-a">→ ${esc(x.hasta)}</b>` +
    (x.nota ? `<small>${esc(x.nota)}</small>` : "") +
    `</div><label class="tr-lin">Línea<input ${attrs} value="${esc(x.linea === "?" ? "" : x.linea)}" placeholder="?" inputmode="numeric" maxlength="4" aria-label="Línea del tramo ${i + 1}"${duda ? ' class="duda"' : ""}></label>` +
    (conCheck ? `<label class="tr-ok"><input type="checkbox" data-v="${i}"${x.verificado ? " checked" : ""}> Comprobada</label>` : "") +
    `</div>`
  );
}

function editarTabla(tabla) {
  const caja = $("tabla-ed");
  const t = JSON.parse(JSON.stringify(tabla));
  caja.innerHTML =
    `<div class="pop-t">Editar tabla de tramos</div>` +
    `<label>Nombre de la ruta<input id="te-ruta" value="${esc(t.ruta)}"></label>` +
    `<div class="tr-l">` +
    t.tramos.map((x, i) => tramoHtml(x, i, `data-l="${i}"`, true)).join("") +
    `</div><div class="note">Al cambiar una línea se marca como comprobada. Para que una ruta ya generada use la tabla corregida, vuelve a generarla desde sus PDF.</div>` +
    `<button id="te-ok" class="pri">Guardar en este dispositivo</button><button id="te-no">Cancelar</button>`;
  caja.hidden = false;
  caja.scrollIntoView({ block: "nearest", behavior: "smooth" });
  caja.querySelectorAll("input[data-l]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const duda = !inp.value.trim() || inp.value.trim() === "?";
      inp.classList.toggle("duda", duda);
      inp.closest(".tr-it")?.classList.toggle("sin", duda);
      caja.querySelector(`input[data-v="${inp.dataset.l}"]`).checked = !duda;
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
    if (b.dataset.tborrar != null && (await confirmar({ titulo: "Borrar la tabla", mensaje: `¿Borrar la tabla «${v.t.ruta}» de este dispositivo?`, si: "Borrar", peligro: true }))) {
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
            `<div class="ru${ruta && r.id === ruta.id ? " on" : ""}"><div><b>${esc(r.tren)}</b> · ${esc(r.origen || "?")} → ${esc(r.destino || "?")}<small>${r.tren === "PRUEBA" ? "ruta de prueba desde el CVM (sin hoja de ruta)" : fecha(r.fecha) + (r.ltv ? " · DLTV nº " + esc(r.ltv) : " · sin DLTV")}${r.obsoleta ? '<br><span class="aviso">Generada con una versión anterior: vuelve a generarla</span>' : ""}${!(ruta && r.id === ruta.id) && caducaPronto(r.guardado) ? `<br><span class="caduca">${textoCaduca(diasRestantes(r.guardado))}</span>` : ""}</small></div>` +
            `<div>${ruta && r.id === ruta.id ? "" : `<button data-abrir="${esc(r.id)}">Abrir</button>`}<button data-comp="${esc(r.id)}" title="Enviar la ruta (AirDrop, Mensajes, Correo…)">Compartir</button><button data-borrar="${esc(r.id)}" title="Borrar del dispositivo">Borrar</button></div></div>`,
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
  // Solo se explica si no se puede: si está activa ya lo dice el interruptor.
  $("est-despierto").textContent = despierto.activado() && despierto.estado() === "no disponible" ? "Este navegador no lo permite" : "";
  $("est-despierto").className = "estado";
  $("op-sonar").checked = conSonido();
  pintarBordes();
  pintarTusDatos();
  const pp = prefs.leer("pantalla", "auto");
  for (const r of document.querySelectorAll("input[name=pantalla]")) r.checked = r.value === pp;
  $("est-pantalla").textContent = pp === "auto" ? `Según el tamaño de la pantalla: ahora, ${automatica() === "telefono" ? "teléfono" : "tablet"}.` : pp === "telefono" ? "Piezas grandes, una debajo de otra." : "La pantalla de marcha completa en tres columnas.";
  $("desc-modo").textContent = {
    manual: "Arrastra la línea de tiempo hacia abajo para avanzar y hacia arriba para retroceder.",
    simulacion: "El tren avanza solo a la velocidad máxima: marcha, pausa y velocidad, abajo en la pantalla de marcha.",
    gps: "La posición del dispositivo sobre el trazado de la vía.",
  }[pos?.modo] || "";
  $("desc-sonar").textContent = conSonido() ? "LTV y CSV (al acercarse y al pasar), cambio de canal de radio y residuo libre, cada uno con su campanita" : "Sin sonido";
  $("op-desvio").checked = prefs.leer("desvio", false);
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
  $("sel-prevalece").value = prefs.leer("prevalece", "restrictiva");
  $("sel-prevalece").onchange = () => prefs.escribir("prevalece", $("sel-prevalece").value);
  $("f-cvm").onchange = (e) => {
    const fs = [...(e.target.files || [])];
    if (fs.length) leerCvms(fs).finally(() => (e.target.value = ""));
  };
  pintarCvms();
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
    if (b && (await confirmar({ titulo: "Borrar la ruta", mensaje: "¿Borrar esta ruta del dispositivo? Se puede volver a cargar desde su archivo.", si: "Borrar", peligro: true }))) {
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
  $("op-sonar").onchange = (e) => {
    prefs.escribir("sonar", e.target.checked ? "si" : "no");
    pintarAjustes();
  };
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
  const longitud = () => {
    const m = Math.min(2000, Math.max(0, Math.round(Number($("op-longitud").value) || 0)));
    $("desc-longitud").textContent = m
      ? `Las limitaciones se mantienen hasta que pasan los ${m} m del tren (salvo LTV «solo vehículo cabeza»). En la marcha, el botón «Residuo» cuenta atrás los ${m} m`
      : "Sin longitud: las limitaciones acaban en la cabeza";
    return m;
  };
  $("op-longitud").value = prefs.leer("longitud", 0) || "";
  longitud();
  $("op-longitud").oninput = longitud;
  $("op-longitud").onchange = () => {
    const m = longitud();
    $("op-longitud").value = m || "";
    prefs.escribir("longitud", m);
    ruta?.ponerLongitud(m);
    sucio = true;
  };
  $("b-probar-aviso").onclick = probarAviso;
  $("b-geo").onclick = prepararGps;
  iniciarGpsSimulado();
  iniciarPruebaCvm();
  iniciarGrabacion();
  // Editor de pictogramas: ventana flotante como la de la información legal, con X para cerrar.
  const cerrarPictos = () => {
    $("pictos").hidden = true;
    document.activeElement?.blur?.();
    sucio = true;
  };
  $("oi").onclick = () => {
    pintarEditor();
    $("pictos").hidden = false;
    $("pictos").querySelector(".modal-c").scrollTop = 0;
  };
  $("pictos-x").onclick = cerrarPictos;
  $("pictos").addEventListener("click", (e) => e.target === $("pictos") && cerrarPictos());
  addEventListener("keydown", (e) => e.key === "Escape" && !$("pictos").hidden && $("conf").hidden && cerrarPictos());
  // Restablecer los pictogramas de serie: solo los pictogramas, el resto de ajustes no cambia.
  $("b-pic-reset").onclick = async () => {
    const si = await confirmar({
      titulo: "Restablecer los pictogramas",
      mensaje: "Se restaurarán los pictogramas originales de la aplicación y se perderán los cambios que hayas hecho en ellos. El resto de ajustes no cambia.",
      si: "Restablecer",
    });
    if (!si) return;
    restaurarPictos();
    sucio = true;
    $("msg-pic").className = "gen-msg ok";
    $("msg-pic").innerHTML = "✓ Pictogramas restablecidos: son los originales de la aplicación.";
  };
}

// ---------- avisos sonoros ----------
const avisador = new Avisador(alcance);
// Sonido sí o no (Joan, 05-11-2026): solo suenan las LTV y CSV, el cambio de canal de radio y el
// residuo libre. Los valores antiguos («urgentes», «todos») cuentan como «sí».
const conSonido = () => prefs.leer("sonar", "si") !== "no";

/** Campanita de cada aviso (null: ese aviso no suena). */
// Cada uno con su campanita (Joan, 09-11-2026): inicio del aviso, LTV, LTV que es CSV, CSV, radio
// y residuo (este, aparte, al quedar libre).
function sonDe(x) {
  const e = x.e;
  if (e.tipo === "ltv_inicio" || e.tipo === "csv") {
    if (x.fase !== "accion") return "ltv_aviso";
    if (e.tipo === "csv") return "csv";
    return e.pictograma === "ltv_csv" || e.datos?.csv ? "ltv_csv" : "ltv_paso";
  }
  if (e.tipo === "cambio_radio" && x.fase === "accion") return "radio";
  return null;
}
// Si coinciden varios, suena el más importante: una LTV que es CSV puede traer también su CSV.
const ORDEN_SON = ["ltv_csv", "csv", "ltv_paso", "ltv_aviso", "radio"];

function sonarAvisos() {
  const salida = avisador.revisar(ruta, pos.d);
  if (!conSonido()) return;
  // Una sola campanita aunque coincidan varios avisos: la más importante.
  const sonar = salida.map(sonDe);
  const son = ORDEN_SON.find((t) => sonar.includes(t));
  if (son) tono(son);
}

let muestra = null;
function probarAviso() {
  clearTimeout(muestra);
  const b = $("b-probar-aviso"), base = "Escuchar los avisos";
  let i = 0;
  const otro = () => {
    if (i >= MUESTRA.length) return void (b.textContent = base);
    const [t, nombre] = MUESTRA[i++];
    b.textContent = "▶ " + nombre;
    muestra = setTimeout(otro, (tono(t) + 0.9) * 1000);
  };
  otro();
}

// ---------- GPS (Fase 8) ----------
let via = null, seguidor = null, quitarGps = null, errorGps = null;

function activarGps() {
  desactivarGps();
  if (!via) return;
  seguidor = new Seguidor(via);
  errorGps = hayUbicacion() ? null : "Este navegador no da la posición";
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
  e.textContent = errorGps ? may(errorGps) : !u ? "Esperando la primera lectura…" : `Última lectura ±${Math.round(u.precision)} m · ${may(u.motivo)}`;
  if (gpsSim && seguidor?.d != null) e.textContent += ` · Error respecto al tren simulado: ${Math.round(Math.abs(seguidor.d - gpsSim.d) * 1000)} m`;
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
    `<b>Trazado preparado</b> (${fecha(g.fecha)}): ${g.anclas.length} de ${g.estaciones} dependencias de la hoja situadas en el mapa` +
    (dud.length ? ` · <b>${km.toFixed(1)} km dudosos</b> (allí la posición sale «no fiable»):<ul>${dud.slice(0, 5).map((d) => `<li>${esc(d[2])}</li>`).join("")}</ul>` : " · sin tramos dudosos.");
  $("b-geo").textContent = "Volver a preparar el trazado";
  $("b-geo").hidden = false;
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

// ---------- ruta de prueba desde el CVM (sin hoja de ruta; Joan, 08-11-2026) ----------
let cvmsPrueba = [];

async function pintarPruebas() {
  cvmsPrueba = await cvms.todos();
  const ls = lineasCvm(cvmsPrueba);
  const antes = prefs.leer("prueba.linea", "");
  $("pc-linea").innerHTML = ls.map((l) => `<option value="${esc(l.clave)}">${esc(l.linea)} · ${esc(l.de)} – ${esc(l.a)}</option>`).join("");
  if (ls.some((l) => l.clave === antes)) $("pc-linea").value = antes;
  $("pc-generar").disabled = !ls.length;
  for (const id of ["pc-linea", "pc-desde", "pc-hasta", "pc-tipo", "pc-tope"]) $(id).disabled = !ls.length;
  if (!ls.length) {
    $("pc-desde").innerHTML = $("pc-hasta").innerHTML = "";
    $("pc-msg").className = "gen-msg";
    $("pc-msg").textContent = "Carga antes un CVM (Ajustes → Nueva ruta → CVM).";
    return;
  }
  pintarDependenciasPrueba();
}

function pintarDependenciasPrueba() {
  const [archivo, linea] = splitClave($("pc-linea").value);
  const doc = cvmsPrueba.find((c) => c.archivo === archivo)?.doc;
  const deps = doc ? dependenciasCvm(doc, linea) : [];
  const op = deps.map((d) => `<option>${esc(d)}</option>`).join("");
  const [d0, h0] = [prefs.leer("prueba.desde", ""), prefs.leer("prueba.hasta", "")];
  $("pc-desde").innerHTML = $("pc-hasta").innerHTML = op;
  $("pc-desde").value = deps.includes(d0) ? d0 : deps[0] ?? "";
  $("pc-hasta").value = deps.includes(h0) ? h0 : deps.at(-1) ?? "";
}

const splitClave = (c) => {
  const i = (c || "").lastIndexOf("|");
  return i < 0 ? ["", ""] : [c.slice(0, i), c.slice(i + 1)];
};

function iniciarPruebaCvm() {
  $("pc-linea").onchange = () => {
    prefs.escribir("prueba.linea", $("pc-linea").value);
    pintarDependenciasPrueba();
  };
  $("pc-tipo").value = prefs.leer("prueba.tipo", "n");
  $("pc-tope").value = prefs.leer("prueba.tope", "") || "";
  $("pc-generar").onclick = async () => {
    const msg = (t, c = "") => {
      $("pc-msg").className = "gen-msg " + c;
      $("pc-msg").innerHTML = t;
    };
    const [archivo, linea] = splitClave($("pc-linea").value);
    const doc = cvmsPrueba.find((c) => c.archivo === archivo)?.doc;
    const desde = $("pc-desde").value, hasta = $("pc-hasta").value;
    const columna = $("pc-tipo").value;
    const tope = Number($("pc-tope").value) > 0 ? Number($("pc-tope").value) : null;
    if (!doc || !desde || !hasta) return;
    if (desde === hasta) return msg("Elige dos dependencias distintas.", "mal");
    for (const [k, v] of [["linea", $("pc-linea").value], ["desde", desde], ["hasta", hasta], ["tipo", columna], ["tope", tope ?? ""]]) prefs.escribir("prueba." + k, v);
    $("pc-generar").disabled = true;
    try {
      const g = await gen();
      const idDltv = $("sel-dltv").value;
      const ltv = idDltv ? await dltvs.cargar(idDltv) : null;
      // Con DLTV, la ruta es de su semana (así sus LTV se aplican); sin él, de hoy.
      const dia = ltv?.semana?.desde || new Date().toISOString().slice(0, 10);
      const r = rutaDesdeCvm(doc, archivo, linea, desde, hasta, { columna, tope, fecha: dia });
      const { paquete, cruce, avisos } = g.generarPaquete(r.ruta, ltv, r.tabla, { version: 1, pictogramas: deSerie() }, { cvms: cvmsPrueba, prevalece: prefs.leer("prevalece", "restrictiva") });
      paquete.id = `prueba-cvm-${linea}-${desde}-${hasta}-${columna}${tope ?? ""}`.replace(/[^\p{L}\p{N}]+/gu, "-");
      paquete.prueba = `Ruta de prueba desde el CVM (línea ${linea}, ${desde} → ${hasta}, tipo ${paquete.tren.tipo}): sin hoja de ruta, no sirve para circular.`;
      await abrir(paquete);
      if (!paquete.geo && navigator.onLine) prepararGps();
      const n = g.recuento(cruce);
      const km = paquete.fin ?? r.ruta.puntos.at(-1).pk_acum;
      msg(
        `✓ Abierta: <b>${esc(desde)} → ${esc(hasta)}</b> (línea ${esc(linea)}, tipo ${esc(paquete.tren.tipo)}, ${String(Math.round(km * 10) / 10).replace(".", ",")} km)` +
          (ltv ? ` · DLTV nº ${esc(ltv.numero ?? "?")}: <b>${n.APLICA}</b> LTV${n.INCIERTA ? `, <b>${n.INCIERTA}</b> a revisar` : ""}` : " · sin DLTV") +
          ". Para el GPS, prepara el trazado si no se ha hecho solo." +
          ([...r.avisos, ...avisos].length ? `<ul>${[...r.avisos, ...avisos].slice(0, 5).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""),
        "ok",
      );
    } catch (err) {
      msg(`✗ No se ha podido generar: ${esc(err.message || String(err))}`, "mal");
    } finally {
      $("pc-generar").disabled = false;
      pintarAjustes();
    }
  };
}

// ---------- tus datos: copia de seguridad, borrar, retención ----------

async function antiguos() {
  const activa = ruta?.id ?? prefs.leer("activa", null);
  const r = (await rutas.listar()).filter((x) => x.id !== activa && rutaAntigua(x));
  const d = (await dltvs.listar()).filter((x) => dltvAntiguo(x));
  return { r, d };
}

/** Al abrir la app: las rutas y los DLTV guardados hace más de 30 días se borran (la ruta abierta no). */
async function caducarArchivos() {
  const { r, d } = await antiguos();
  for (const x of r) await rutas.borrar(x.id);
  for (const x of d) await dltvs.borrar(x.id);
  if (r.length || d.length) pintarDltvs();
  return r.length + d.length;
}

const textoCaduca = (n) => (n <= 0 ? "Se borra hoy" : n === 1 ? "Se borra mañana" : `Se borra en ${n} días`);

/** Lo que se borrará en AVISO_DIAS días o menos (la ruta abierta no se borra). */
async function porCaducar() {
  const activa = ruta?.id ?? prefs.leer("activa", null);
  const r = (await rutas.listar()).filter((x) => x.id !== activa && caducaPronto(x.guardado));
  const d = (await dltvs.listar()).filter((x) => caducaPronto(x.guardado));
  const t = (await telefonemas.listar()).filter((x) => caducaPronto(x.id));
  return { r, d, t, n: r.length + d.length + t.length };
}

/** Aviso de caducidad: en «Tus datos» y un punto en el botón de Ajustes. */
async function avisarCaducidad() {
  const c = await porCaducar();
  $("m-ajustes").classList.toggle("caduca", c.n > 0);
  const el = $("datos-cad");
  el.hidden = !c.n;
  if (!c.n) return;
  const plural = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
  const partes = [c.r.length && plural(c.r.length, "ruta", "rutas"), c.d.length && plural(c.d.length, "DLTV", "DLTV"), c.t.length && plural(c.t.length, "telefonema", "telefonemas")].filter(Boolean);
  el.textContent = `⚠ ${partes.join(", ").replace(/, ([^,]*)$/, " y $1")} se ${c.n === 1 ? "borrará" : "borrarán"} en ${AVISO_DIAS} días o menos. Descarga una copia de seguridad para no perderlos.`;
}

async function pintarTusDatos() {
  avisarCaducidad();
  const n = await datos.recuento();
  const plural = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
  $("datos-res").textContent =
    `En este dispositivo: ${plural(n.rutas, "ruta", "rutas")}, ${plural(n.dltv, "DLTV", "DLTV")}, ` +
    `${plural(n.recorridos, "grabación", "grabaciones")}, ${plural(n.telefonemas, "telefonema", "telefonemas")} y ${plural(n.tramos, "tabla de tramos propia", "tablas de tramos propias")}.`;
  $("datos-res").textContent += ` Rutas, DLTV y telefonemas se borran solos a los ${DIAS} días; las grabaciones, cuando las borras.`;
}

/** Al abrir la app: los telefonemas de hace más de 30 días se borran (antes, se exportan). */
async function caducarTelefonemas() {
  const ids = caducados((await telefonemas.listar()).map((t) => ({ id: t.id })), Date.now());
  for (const id of ids) await telefonemas.borrar(id);
  if (ids.length && ruta) await aplicarTf();
  return ids.length;
}


function iniciarTusDatos() {
  const msg = (t, c = "") => {
    $("msg-datos").className = "gen-msg " + c;
    $("msg-datos").textContent = t;
  };
  $("b-copia").onclick = async () => {
    const c = await datos.exportar();
    const r = await compartirArchivo(`RailNav copia ${c.fecha.slice(0, 10)}.json`, JSON.stringify(c), "application/json");
    msg(r === "descargado" ? "Copia descargada. Guárdala en un sitio seguro: lleva tus rutas y grabaciones." : r === "compartido" ? "Copia enviada." : "", "ok");
  };
  // Importar: primero se enseña lo que trae la copia y se elige qué se incorpora.
  let pendiente = null;
  // Lo que trae la copia se enseña en una ventana emergente, como la de «Nuevo telefonema».
  const cerrarImp = () => {
    pendiente = null;
    $("imp").hidden = true;
    $("imp-lista").innerHTML = "";
    $("imp-err").textContent = "";
    document.activeElement?.blur?.();
  };
  $("imp-x").onclick = cerrarImp;
  $("imp").addEventListener("click", (e) => e.target === $("imp") && cerrarImp());
  addEventListener("keydown", (e) => e.key === "Escape" && !$("imp").hidden && $("conf").hidden && cerrarImp());
  $("f-copia").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const copia = JSON.parse(await f.text());
      const d = describirCopia(copia, await datos.claves());
      if (!d.grupos.length && !d.preferencias) throw new Error("la copia está vacía");
      pendiente = { copia, d };
      pintarImportar(d, f.name);
      msg("");
      $("imp-err").textContent = "";
      $("imp").querySelector(".modal-c").scrollTop = 0;
    } catch (err) {
      cerrarImp();
      msg(`✗ No se ha podido leer la copia: ${err.message}`, "mal");
    }
  };
  $("imp-no").onclick = cerrarImp;
  $("imp-si").onclick = async () => {
    if (!pendiente) return;
    const { copia, d } = pendiente;
    const L = $("imp-lista");
    const almacenes = {};
    d.grupos.forEach((g, gi) => {
      const si = new Set();
      if (g.soloGrupo) {
        if (L.querySelector(`input[data-g="${gi}"]`)?.checked) g.items.forEach((x) => si.add(x.clave));
      } else for (const c of L.querySelectorAll(`input[data-g="${gi}"][data-i]`)) if (c.checked) si.add(g.items[+c.dataset.i].clave);
      almacenes[g.k] = si;
    });
    const preferencias = !!L.querySelector("input[data-pref]")?.checked;
    const n = Object.values(almacenes).reduce((s, x) => s + x.size, 0);
    if (!n && !preferencias) return void ($("imp-err").textContent = "No has marcado nada.");
    try {
      const hechos = await datos.importar(filtrarCopia(copia, { almacenes, preferencias }));
      cerrarImp();
      msg(`✓ Incorporado: ${hechos} elemento${hechos === 1 ? "" : "s"}${preferencias ? " y los ajustes" : ""}. Se vuelve a abrir la app…`, "ok");
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      $("imp-err").textContent = `✗ No se ha podido importar: ${err.message}`;
    }
  };
  $("b-borrar-todo").onclick = async () => {
    const si = await confirmar({
      titulo: "Borrar todos los datos",
      mensaje: "¿Borrar TODOS los datos de RailNav en este dispositivo (rutas, DLTV, tablas, trazados, grabaciones y preferencias)? No se puede deshacer. Si quieres conservarlos, descarga antes una copia de seguridad.",
      si: "Borrar todo",
      peligro: true,
    });
    if (!si) return;
    await grabar.terminar();
    desactivarGps();
    await datos.borrarTodo();
    location.reload();
  };
}

/** Lista de lo que trae una copia, con una casilla por grupo y por elemento. */
function pintarImportar(d, nombre) {
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const L = $("imp-lista");
  $("imp-cab").innerHTML = `<b>${esc(nombre)}</b>${d.fecha ? ` · hecha el ${fecha(d.fecha.slice(0, 10))}` : ""}. Marca lo que quieres incorporar. Lo que ya tienes con el mismo nombre se sustituye; lo caducado (más de ${DIAS} días) va desmarcado porque se borraría al abrir la app.`;
  let h = "";
  d.grupos.forEach((g, gi) => {
    if (g.soloGrupo) {
      const marcado = g.items.some((x) => x.marcado);
      h += `<div class="imp-g solo"><label class="imp-gt"><input type="checkbox" data-g="${gi}"${marcado ? " checked" : ""}><span><b>${esc(g.titulo)}</b><small>${plural(g.items.length, "trazado ya preparado", "trazados ya preparados")}: ahorran volver a prepararlos</small></span></label></div>`;
      return;
    }
    h += `<div class="imp-g"><label class="imp-gt"><input type="checkbox" data-g="${gi}"><span><b>${esc(g.titulo)}</b><small data-cuenta="${gi}"></small></span></label>`;
    g.items.forEach((x, i) => {
      const notas = [x.detalle && esc(x.detalle), x.existe && `<span class="ya">ya lo tienes: se sustituye</span>`, x.caducado && `<span class="ya">caducado</span>`].filter(Boolean).join(" · ");
      h += `<label class="imp-it"><input type="checkbox" data-g="${gi}" data-i="${i}"${x.marcado ? " checked" : ""}><span>${esc(x.titulo)}${notas ? `<small>${notas}</small>` : ""}</span></label>`;
    });
    h += `</div>`;
  });
  if (d.preferencias)
    h += `<div class="imp-g solo"><label class="imp-gt"><input type="checkbox" data-pref><span><b>Ajustes</b><small>Los de quien hizo la copia: tema, sonido, ruta abierta, emisor de telefonemas… Márcalo solo si la copia es tuya.</small></span></label></div>`;
  L.innerHTML = h;
  $("imp").hidden = false;
  // La casilla de cada grupo marca o desmarca todo el grupo y refleja lo marcado.
  const cuenta = (gi) => {
    const its = [...L.querySelectorAll(`input[data-g="${gi}"][data-i]`)];
    const cab = L.querySelector(`input[data-g="${gi}"]:not([data-i])`);
    const n = its.filter((c) => c.checked).length;
    cab.checked = n === its.length;
    cab.indeterminate = n > 0 && n < its.length;
    L.querySelector(`[data-cuenta="${gi}"]`).textContent = `${n} de ${its.length} marcado${its.length === 1 ? "" : "s"}`;
  };
  d.grupos.forEach((g, gi) => {
    if (g.soloGrupo) return;
    const cab = L.querySelector(`input[data-g="${gi}"]:not([data-i])`);
    cab.onchange = () => {
      for (const c of L.querySelectorAll(`input[data-g="${gi}"][data-i]`)) c.checked = cab.checked;
      cuenta(gi);
    };
    for (const c of L.querySelectorAll(`input[data-g="${gi}"][data-i]`)) c.onchange = () => cuenta(gi);
    cuenta(gi);
  });
}

// ---------- información legal ----------
// Ventana emergente como la de «Nuevo telefonema», con pestañas y una X para cerrarla.
function pintarLegal(id) {
  $("legal-t").textContent = SECCIONES.find((s) => s.id === id)?.titulo || "Información legal";
  $("legal-txt").innerHTML = htmlLegal(id);
  for (const b of document.querySelectorAll("#tabs-legal button")) b.classList.toggle("on", b.dataset.legal === id);
  $("legal").querySelector(".modal-c").scrollTop = 0;
}

function cerrarLegal() {
  $("legal").hidden = true;
  document.activeElement?.blur?.();
}

function iniciarLegal() {
  const abrirLegal = (e) => {
    const b = e.target.closest("button[data-legal]");
    if (!b) return;
    pintarLegal(b.dataset.legal);
    $("legal").hidden = false;
  };
  document.querySelector(".legal-b").onclick = abrirLegal;
  $("tabs-legal").onclick = abrirLegal;
  $("legal-x").onclick = cerrarLegal;
  $("legal").addEventListener("click", (e) => e.target === $("legal") && cerrarLegal());
  addEventListener("keydown", (e) => e.key === "Escape" && !$("legal").hidden && cerrarLegal());
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
  $("est-grabar").textContent = `● Grabando · ${g.puntos.length} posiciones` + (u ? ` · Última ±${u[3]} m` : "") + (e ? ` · ${may(e)}` : "");
  $("est-grabar").className = "estado " + (e ? "mal" : "ok");
}

async function pintarRecorridos() {
  const lista = await recorridos.listar();
  $("recorridos").innerHTML = lista
    .map((r) => {
      const x = grabar.resumen(r), enCurso = grabar.enCurso()?.id === r.id;
      return (
        `<div class="rec"><div><b>${esc(new Date(r.id).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }))}</b> · Tren ${esc(r.tren ?? "?")}` +
        `<small>${x.puntos} posiciones · ${x.minutos.toFixed(0)} min` +
        (x.mediana != null ? ` · Precisión típica ±${x.mediana} m, peor ±${x.peor} m` : "") +
        (enCurso ? " · En curso" : "") +
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
        $("est-grabar").textContent = "Este navegador no da la posición";
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
    if (b.dataset.borrarRec && (await confirmar({ titulo: "Borrar la grabación", mensaje: "¿Borrar esta grabación? No se puede deshacer.", si: "Borrar", peligro: true }))) {
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
  // Reproductor (v0.20.3, Joan): principio, rebobinar, marcha, pausa, adelantar y final.
  for (const [id, ico] of [["sb-ini", "inicio"], ["sb-atr", "rebobinar"], ["sb-play", "play"], ["sb-pausa", "pausa"], ["sb-ade", "adelantar"], ["sb-fin", "final"]])
    if (!$(id).firstChild) $(id).innerHTML = linea(ico, 22);
  $("sb-play").classList.toggle("on", pos.enMarcha);
  $("sb-pausa").classList.toggle("on", !pos.enMarcha);
  $("sb-play").setAttribute("aria-pressed", String(pos.enMarcha));
  $("sb-pausa").setAttribute("aria-pressed", String(!pos.enMarcha));
  for (const b of document.querySelectorAll(".sb-f button")) b.classList.toggle("on", +b.dataset.f === pos.factor);
}

function iniciarSimulacion() {
  const PASO_KM = 1; // rebobinar y adelantar
  const ir = (d) => {
    const atras = d < pos.d;
    pos.poner(Math.min(pos.fin, Math.max(0, d)));
    if (atras) reiniciarHistorial();
    sucio = true;
    pintarSim();
  };
  $("sb-play").onclick = () => {
    if (pos.d >= pos.fin) ir(0);
    pos.enMarcha = true;
    pintarSim();
  };
  $("sb-pausa").onclick = () => {
    pos.enMarcha = false;
    pintarSim();
  };
  $("sb-ini").onclick = () => ir(0);
  $("sb-atr").onclick = () => ir(pos.d - PASO_KM);
  $("sb-ade").onclick = () => ir(pos.d + PASO_KM);
  $("sb-fin").onclick = () => {
    pos.enMarcha = false;
    ir(pos.fin);
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
  // Botón «Residuo» (se pinta con la pantalla de marcha: se escucha en el contenedor).
  for (const id of ["sa", "sc", "mv-odo"])
    $(id).addEventListener("pointerdown", (e) => {
      if (!e.target.closest?.("[data-residuo]") || !pos) return;
      e.preventDefault();
      e.stopPropagation();
      residuo.pulsar(pos.d, prefs.leer("longitud", 0));
      resRestante = residuo.activo ? residuo.metros : null;
      resLibre = 0;
      navigator.vibrate?.(30);
      sucio = true;
    });
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
  const inf = ajInf();
  r.style.setProperty("--aj-sup", prefs.leer("aj.sup", 0) + "px");
  r.style.setProperty("--aj-inf", inf + "px");
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

// Panel inferior y superior: desde la v0.15.2 la app ocupa la ventana sin cálculos de alto,
// así que no hace falta ningún ajuste (0 px). Los ajustes de antes (40, 44 px…) compensaban el
// cálculo viejo y ahora la sacarían de la pantalla: se ponen a 0 una vez.
const ajInfDefecto = () => 0;
function ajInf() {
  if (!prefs.leer("aj.fijo", false)) {
    prefs.escribir("aj.inf", 0);
    prefs.escribir("aj.sup", 0);
    prefs.escribir("aj.fijo", true);
  }
  return prefs.leer("aj.inf", ajInfDefecto());
}

function pintarBordes() {
  $("aj-sup").textContent = `${prefs.leer("aj.sup", 0)} px`;
  $("aj-inf").textContent = `${ajInf()} px`;
}

function iniciarBordes() {
  document.querySelectorAll("button[data-aj]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = "aj." + b.dataset.aj, v = Math.max(-40, Math.min(120, (k === "aj.inf" ? ajInf() : prefs.leer(k, 0)) + +b.dataset.d));
      prefs.escribir(k, v);
      corregirAlto();
      pintarBordes();
      sucio = true;
    }),
  );
  $("aj-rest").onclick = () => {
    prefs.escribir("aj.sup", 0);
    prefs.escribir("aj.inf", ajInfDefecto());
    corregirAlto();
    pintarBordes();
  };
}

// Con el teclado del iPhone abierto, iOS desplaza toda la página hacia arriba para enseñar el
// campo y, en la app instalada, a veces no la devuelve: la barra de arriba queda bajo la Dynamic
// Island. La página nunca debe tener scroll propio (lo tienen las vistas): se devuelve a 0 al
// cerrar el teclado. Y mientras el teclado está abierto no se recalcula el alto.
const escribiendo = () => document.activeElement?.matches?.("input:not([type=checkbox]):not([type=radio]),textarea,select");
function devolverPagina() {
  if (escribiendo()) return;
  if (scrollX || scrollY) scrollTo(0, 0);
  const se = document.scrollingElement;
  if (se && (se.scrollTop || se.scrollLeft)) se.scrollTop = se.scrollLeft = 0;
  document.body.scrollTop = document.body.scrollLeft = 0;
}
function iniciarTeclado() {
  addEventListener("focusout", () => setTimeout(() => {
    devolverPagina();
    corregirAlto();
  }, 120));
  addEventListener("scroll", () => devolverPagina(), { passive: true });
  visualViewport?.addEventListener("resize", () => {
    if (!escribiendo()) setTimeout(devolverPagina, 50);
  });
}

function iniciarTamano() {
  corregirAlto();
  iniciarTeclado();
  addEventListener("resize", () => {
    if (!escribiendo()) corregirAlto();
  });
  addEventListener("orientationchange", () => setTimeout(corregirAlto, 300));
  const scr = document.querySelector(".scr");
  const medir = () => {
    const r = scr.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const apilado = matchMedia("(max-aspect-ratio: 5/4)").matches;
    const vertical = matchMedia("(max-aspect-ratio: 4/5)").matches;
    const tablet = document.documentElement.dataset.disp === "tablet";
    if (ajustarDibujo(r.width, r.height, apilado, vertical && tablet)) sucio = true;
    // unidad del dibujo en píxeles: el historial usa la misma escala de letra
    // en vertical las dos columnas de dibujo ocupan el ancho; el historial, con letra legible
    // anchos del dibujo: velocidad 346,5 y línea de tiempo 173,25 (40 % / 20 %, v0.20)
    // iPad en vertical: los pasados van en media pantalla, con letra de tamaño fijo
    const u = vertical ? Math.max(1, r.width / 640) : apilado ? r.width / 866 : r.height / (altoDibujo() - 6.5);
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
  if (residuo.activo && pos) {
    const r = residuo.restante(pos.d);
    if (r !== resRestante) sucio = true;
    resRestante = residuo.activo ? r : null;
    if (r === 0) {
      resLibre = t;
      if (conSonido()) tono("residuo");
    }
  }
  if (resLibre && t - resLibre > 3000) {
    resLibre = 0;
    sucio = true;
  }
  // el adelanto o retraso depende del reloj: se repinta cada segundo
  if (t - ultimoSegundo > 1000) {
    ultimoSegundo = t;
    if (prefs.leer("desvio", false)) sucio = true;
  }
  if (sucio && ruta) {
    sucio = false;
    estado();
    const lon = prefs.leer("longitud", 0);
    const res = lon ? { metros: lon, restante: resRestante, libre: !!resLibre } : null;
    if (vista === "marcha") (movil() ? pintarMarchaMovil : pintarMarcha)(ruta, pos, { desvio: prefs.leer("desvio", false), residuo: res });
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
  iniciarTusDatos();
  iniciarLegal();
  iniciarTelefonemas();
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
  caducarTelefonemas().catch(() => {});
  caducarArchivos().catch(() => {}).finally(() => avisarCaducidad().catch(() => {}));
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) actualizaciones();
}

// Versiones nuevas: se buscan al abrir la app y cada vez que vuelve a primer plano (el iPhone
// no la recarga al volver a ella), y en cuanto la nueva toma el control se recarga sola, para
// que una corrección llegue sin tener que cerrar y abrir la app varias veces. No se recarga
// con el teclado abierto ni con un telefonema a medio escribir.
function actualizaciones() {
  const habia = !!navigator.serviceWorker.controller;
  let recargada = false;
  const recargar = () => {
    if (recargada || !habia) return;
    if (escribiendo() || !$("tf-form").hidden) return setTimeout(recargar, 3000);
    recargada = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", recargar);
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

iniciar();
