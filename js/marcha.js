// Pantalla de marcha: velocidad y avisos (izquierda), historial (centro) y línea de tiempo con
// odómetro (derecha). Las dos columnas laterales se dibujan en un único SVG de 900×440 que se
// muestra recortado en #sa y #sc; el historial es una lista HTML con scroll normal.

import { ajustar, anchoTexto, dm, esc, hm, hms, miles, partesVia, texto } from "./util.js";
import { forma, icono, pic, picDe } from "./pictos.js";
import { desvio } from "./ruta.js";

const $ = (id) => document.getElementById(id);

// Alto del dibujo (unidades del SVG). 440 en pantallas 16:9; en el iPad (más alto en proporción)
// crece para que las columnas laterales no se coman el historial: hay sitio para más avisos y
// la línea de tiempo se alarga.
let H = 440, hecha = false;
// Alto que se reserva abajo de la columna derecha para el botón «Residuo» (si hay longitud).
let R = 0;
// Anchos de las columnas (unidades del SVG): la de la velocidad y los avisos, más ancha; la de la
// línea de tiempo, más estrecha (pedido por Joan). El historial del centro sigue con su parte.
// v0.18 (Joan): tres columnas — velocidad y próximos, pasados, línea de tiempo. v0.20 (Joan):
// 40 % / 40 % / 20 %: la línea de tiempo mide la mitad que la de la velocidad.
export const WL = 345, XR = 596, WR = 171.75;
const HUECO = 8; // px entre columnas (.scr gap)
export const altoDibujo = () => H;
// iPad en vertical (v0.20, Joan): el dibujo de la velocidad acaba en «Siguiente»; los próximos
// van en su propio cuadro (#mv-prox), al lado de los pasados, en la mitad de abajo.
let soloVel = false;
export function ajustarDibujo(anchoPx, altoPx, apilado, vertical = false) {
  const col = (2 * (anchoPx - 2 * HUECO)) / 5; // ancho de la columna de la velocidad (40 %)
  const nuevo = vertical ? 342 : apilado ? 440 : Math.max(440, Math.round(((WL + 1.5) * altoPx) / col + 6.5));
  soloVel = vertical;
  if (nuevo === H && hecha) return false;
  H = nuevo;
  hecha = true;
  for (const [id, x, w] of [["sa", 3.25, WL + 1.5], ["sc", XR - 0.75, WR + 1.5]]) {
    const s = document.getElementById(id);
    s.setAttribute("viewBox", `${x} 3.25 ${w} ${H - 6.5}`);
    s.style.aspectRatio = `${w} / ${H - 6.5}`;
  }
  return true;
}
const CX = 4 + WL / 2, DER = 4 + WL - 10, XD = XR + WR - 6;

// Escala de la línea de tiempo: más espacio para lo cercano.
const K = [[0, 0], [500, 0.36], [1000, 0.62], [2000, 0.85], [3000, 1]];
export const Y = (m) => {
  const base = H - 60 - R, alto = H - 100 - R;
  for (let i = 1; i < K.length; i++)
    if (m <= K[i][0]) {
      const [a, fa] = K[i - 1], [b, fb] = K[i];
      return base - (fa + ((fb - fa) * (m - a)) / (b - a)) * alto;
    }
  return 40;
};
/** Alto en el SVG de la línea de tiempo (0 m → 3000 m), para pasar píxeles a metros. */
export const altoLinea = () => Y(0) - Y(3000);

export const alcance = (e) => {
  const p = picDe(e);
  return Math.min(3, p?.aviso ?? e.aviso_km ?? 3);
};
const accion = (e) =>
  e.tipo === "cambio_radio"
    ? "Cambio canal radio"
    : texto((picDe(e) || {}).accion || picDe(e)?.nombre || e.tipo, e.datos) + (e.datos?.cvm && e.tipo !== "aviso_cvm" ? (e.datos.vme ? " · VME" : " · CVM") : "");

// El PK de cada aviso: el que trae el propio texto («… PASO A NIVEL KM 78.975»), que se quita del
// título, o el de la hoja en ese punto. Se enseña en vez de la hora (pedido por Joan).
// En una LTV, su rango de PK (del DLTV o, si se añadió a mano, de la hoja entre su inicio y su fin).
const RE_KM = /\s*(?:·\s*)?\b(?:KM|PK)\.?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:AL|A|-|–)\s*(?:(?:KM|PK)\.?\s*)?(\d+(?:[.,]\d+)?))?/i;
const fmtPk = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");
const fmtPk3 = (x) => x.toFixed(3).replace(".", ",");
function rangoLtv(ruta, e) {
  const id = e.datos?.ltv;
  if (!id) return "";
  const x = (ruta.p.dltv?.ltv || []).find((l) => "ltv-" + l.cod === id || l.cod === id);
  if (x?.pki != null && x?.pkf != null) return `PK ${fmtPk3(x.pki)} – ${fmtPk3(x.pkf)}`;
  const otro = ruta.eventos.find((o) => o !== e && o.datos?.ltv === id && (o.tipo === "ltv_inicio" || o.tipo === "ltv_fin"));
  if (!otro) return "";
  const [a, b] = [e, otro].sort((p, q) => p.pk_acum - q.pk_acum).map((o) => ruta.pkEn?.(o.pk_acum));
  return a == null || b == null ? "" : `PK ${fmtPk(a)} – ${fmtPk(b)}`;
}
function tituloPk(ruta, e) {
  const t = accion(e);
  if (e.tipo === "ltv_inicio" || e.tipo === "ltv_fin") {
    const r = rangoLtv(ruta, e);
    if (r) return [t, r];
  }
  const m = t.match(RE_KM);
  if (m) {
    const pk = "PK " + m[1].replace(".", ",") + (m[2] ? " – " + m[2].replace(".", ",") : "");
    return [t.replace(RE_KM, "").replace(/\s*·\s*$/, "").replace(/\s{2,}/g, " ").trim(), pk];
  }
  const pk = ruta.pkEn?.(e.pk_acum);
  return [t, pk == null ? "" : "PK " + fmtPk(pk)];
}
/** Número grande a la derecha del aviso (el canal, en los cambios de radio). */
const numeroGrande = (e) => (e.tipo === "cambio_radio" && e.datos?.canal != null ? String(e.datos.canal) : "");

/** Cuadro «VÍA X» en SVG. */
function cuadroVia(x, y, codigo, fs) {
  const t = "VÍA " + codigo, w = anchoTexto(t, `800 ${fs}px`) + fs * 1.1, h = fs * 1.5;
  return [
    `<rect x="${x}" y="${y - fs * 1.1}" width="${w}" height="${h}" rx="${h / 4}" fill="var(--in)" stroke="var(--tx)" stroke-width="1.3"/>` +
      `<text x="${x + w / 2}" y="${y}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="var(--tx)">${esc(t)}</text>`,
    w,
  ];
}

/**
 * Título de un aviso en la línea de tiempo (columna estrecha): se mide el texto; si no cabe se
 * aprieta hasta un 25 % y, si ni así, se corta con «…».
 */
function ajustarAncho(t, ancho, fs) {
  const f = `700 ${fs}px`;
  let s = String(t);
  if (anchoTexto(s, f) > ancho * 1.25) {
    let c = s;
    while (c.length > 3 && anchoTexto(c.trimEnd() + "…", f) > ancho * 1.25) c = c.slice(0, -1);
    s = c.trimEnd() + "…";
  }
  return [esc(s), anchoTexto(s, f) > ancho ? ` textLength="${ancho}" lengthAdjust="spacingAndGlyphs"` : ""];
}

/** Segunda línea de un aviso: distancia, vía (si la LTV es de una sola vía) y «a revisar». */
// PK con un decimal y sin espacios en el guion: para cuando el renglón no cabe.
const compactar = (t) => t.replace(/(\d+),(\d{2,})/g, (_, a, b) => fmtPk(Number(a + "." + b))).replace(/ – /g, "–");

function linea2(e, x, y, fs, pre, dist, maxX) {
  const via = e.datos && e.datos.via, rv = e.estado === "revisar";
  // Si no cabe: el PK más corto, luego sin PK y, en la columna estrecha, «!» en vez de «A REVISAR».
  let t = "A REVISAR";
  const ancho = () =>
    anchoTexto(pre, `${fs}px`) + anchoTexto(dist, `700 ${fs}px`) + 7 +
    (rv ? anchoTexto(t, `800 ${fs * 0.85}px`) + fs + 6 : 0) +
    (via ? anchoTexto("VÍA " + partesVia(via)[0], `800 ${fs * 0.95}px`) + fs * 1.1 : 0);
  if (x + ancho() > maxX) pre = compactar(pre);
  if (x + ancho() > maxX && !via) pre = "";
  if (x + ancho() > maxX && rv) t = "!";
  let s = `<text x="${x}" y="${y}" font-size="${fs}" fill="var(--gy)">${pre}<tspan font-weight="700" fill="var(--tx)">${dist}</tspan></text>`;
  let cx = x + anchoTexto(pre, `${fs}px`) + anchoTexto(dist, `700 ${fs}px`) + 7;
  if (rv) {
    const w = anchoTexto(t, `800 ${fs * 0.85}px`) + fs;
    s += `<rect x="${cx}" y="${y - fs * 1.05}" width="${w}" height="${fs * 1.45}" rx="${fs * 0.35}" fill="none" stroke="var(--dn)" stroke-width="1.3" stroke-dasharray="3 2"/><text x="${cx + w / 2}" y="${y - 1}" font-size="${fs * 0.85}" font-weight="800" text-anchor="middle" fill="var(--dn)">${t}</text>`;
    cx += w + 6;
  }
  const v = e.datos && e.datos.via;
  if (!v) return s;
  const [codigo, resto] = partesVia(v), [c, cw] = cuadroVia(cx, y, codigo, fs * 0.95);
  s += c;
  if (resto) {
    const rx = cx + cw + 6, hueco = maxX - rx, rw = anchoTexto(resto, `700 ${fs}px`);
    // Si no cabe ni apretado, se deja solo el cuadro de la vía (la explicación está en Datos).
    if (hueco < rw * 0.7) return s;
    s += `<text x="${rx}" y="${y}" font-size="${fs}" font-weight="700" fill="var(--tx)"${rw > hueco ? ` textLength="${hueco}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(resto)}</text>`;
  }
  return s;
}

/** Cuadro «VÍA X» en HTML (historial, DLTV). */
export const cuadroViaHtml = (v, conResto = true) => {
  const [codigo, resto] = partesVia(v);
  return `<span class="vchip">VÍA ${esc(codigo)}</span>` + (conResto && resto ? ` <span class="vrest">${esc(resto)}</span>` : "");
};

const MODO_TXT = { manual: "POSICIÓN MANUAL", simulacion: "SIMULACIÓN", gps: "GPS" };

// Adelanto o retraso: con la posición que da el maquinista o el GPS (en la simulación solo a
// tiempo real ×1, si no no tiene sentido). [texto, color] o null.
function valorDesvio(ruta, pos, eta) {
  if (eta == null || (pos.modo === "simulacion" && pos.factor !== 1)) return null;
  const t = new Date(), ahora = t.getHours() * 60 + t.getMinutes() + t.getSeconds() / 60;
  // Solo el día de la hoja (o el siguiente, trenes de noche) y dentro de ±4 h: fuera de eso no
  // es la marcha real y la cifra no significaría nada.
  const f = ruta.tren?.fecha;
  if (f) {
    const hoy = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ayer = new Date(t.getTime() - 864e5);
    if (f !== hoy(t) && f !== hoy(ayer)) return null;
  }
  const x = desvio(ahora, eta), n = Math.round(x);
  if (Math.abs(x) > 240) return null;
  return n === 0 ? ["en hora", "var(--up)"] : n > 0 ? [`+${n} min`, n >= 5 ? "var(--lt)" : "var(--dn)"] : [`−${-n} min`, "var(--ac)"];
}

function cuadroDesvio(ruta, pos, eta) {
  const v = valorDesvio(ruta, pos, eta);
  if (!v) return "";
  const [txt, color] = v;
  return `<text x="${XR + WR - 8}" y="${H - 15 - R}" font-size="13" font-weight="800" text-anchor="end" fill="${color}">${txt}</text>`;
}

// Botón «Residuo» de la tablet: en la columna de la línea de tiempo, debajo del odómetro
// (x, y, ancho, alto en el SVG). Se toca en el contenedor (pointerdown), antes de repintar.
function botonResiduo(res, x, y, w, h) {
  const act = res.restante != null;
  let s = `<g data-residuo="1" style="cursor:pointer">`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${act ? "var(--pn)" : "transparent"}" stroke="${act ? "var(--tx)" : res.libre ? "var(--up)" : "var(--ln)"}" stroke-width="${act ? 2.5 : 1.5}"/>`;
  if (act) s += `<rect x="${x + 2}" y="${y + h - 6}" width="${(w - 4) * (1 - res.restante / res.metros)}" height="4" rx="2" fill="var(--up)"/>`;
  s += `<text x="${x + 10}" y="${y + h / 2 + 4}" font-size="11" font-weight="800" letter-spacing=".04em" fill="${act ? "var(--tx)" : "var(--gy)"}">RESIDUO</text>`;
  const txt = act ? `${miles(res.restante)} m` : res.libre ? "LIBRE" : `${miles(res.metros)} m`;
  s += `<text x="${x + w - 10}" y="${y + h / 2 + (act ? 7 : 5)}" font-size="${act ? 18 : 14}" font-weight="700" text-anchor="end" fill="${act ? "var(--tx)" : res.libre ? "var(--up)" : "var(--tx)"}">${txt}</text>`;
  return s + "</g>";
}

// Botón «Residuo» del teléfono: en la fila del odómetro, debajo de la línea de tiempo. Es un
// elemento fijo al que solo se le cambia el texto (rehecho en cada fotograma se iría del dedo).
function pintarResiduo(res, b) {
  if (!b) return;
  b.hidden = !res;
  if (!res) return;
  const act = res.restante != null;
  const cls = "odo-res" + (act ? " on" : res.libre ? " libre" : "");
  if (b.className !== cls) b.className = cls;
  const txt = act ? `${miles(res.restante)} m` : res.libre ? "LIBRE" : `${miles(res.metros)} m`;
  const v = b.querySelector("b");
  if (v.textContent !== txt) v.textContent = txt;
}

export function pintarMarcha(ruta, pos, { desvio: conDesvio = false, residuo = null } = {}) {
  const d = pos.d;
  const tramo = ruta.tramo(d);
  const vp = tramo?.v ?? null;
  const lt = tramo?.fuente === "ltv";
  const nx = ruta.siguiente(d);
  let s = `<rect width="${XR + WR + 10}" height="${H}" fill="var(--bg)"/>`;
  R = residuo ? 50 : 0;
  for (const [x, y, w, h] of [[4, 4, WL, H - 8], [XR, 4, WR, H - 48 - R], [XR, H - 38 - R, WR, 34]])
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="var(--ln)" stroke-width="1.5"/>`;
  // Velocidad
  if (lt) s += `<g transform="translate(${WL - 48} 10) scale(.5)">${forma(pic("ltv") || {}, { v: vp })}</g><text x="${WL - 54}" y="27" font-size="13" font-weight="700" text-anchor="end" fill="var(--lt)">LTV</text>`;
  else if (tramo?.fuente === "cvm") s += `<text x="${WL - 14}" y="27" font-size="13" font-weight="800" text-anchor="end" fill="var(--dn)">CVM</text>`;
  if (tramo?.revisar) s += `<rect x="14" y="12" width="96" height="20" rx="5" fill="none" stroke="var(--dn)" stroke-dasharray="3 2"/><text x="62" y="26" font-size="12" font-weight="800" text-anchor="middle" fill="var(--dn)">A REVISAR</text>`;
  s += vp != null
    ? `<text x="${CX}" y="178" font-size="${String(vp).length > 2 ? 182 : 190}" font-weight="700" text-anchor="middle" fill="${lt ? "var(--lt)" : "var(--tx)"}">${vp}</text>`
    : `<text x="${CX}" y="120" font-size="26" font-weight="700" text-anchor="middle" fill="var(--gy)">Sin V Max</text><text x="${CX}" y="148" font-size="14" text-anchor="middle" fill="var(--gy)">${ruta.p.prueba ? "ruta de prueba: el CVM no la da aquí" : "la hoja no la da en este tramo"}</text>`;
  s += vp != null ? `<text x="${CX}" y="199" font-size="13" text-anchor="middle" fill="var(--gy)">km/h</text>` : "";
  // Hueco fijo entre la velocidad y «Siguiente» para las franjas de texto (marcha a la vista,
  // limitación que se mantiene por la cola): no tapan la velocidad ni mueven lo demás.
  const vista = ruta.vistaEn?.(d);
  if (vista) s += `<rect x="12" y="206" width="${WL - 16}" height="30" rx="6" fill="#ffd200"/><text x="${CX}" y="226" font-size="15" font-weight="800" text-anchor="middle" fill="#111">MARCHA A LA VISTA · TF ${vista.numero} · ${dm((vista.fin - d) * 1000)}</text>`;
  else if (tramo?.por_cola) s += `<rect x="12" y="206" width="${WL - 16}" height="30" rx="6" fill="none" stroke="var(--gy)" stroke-width="1.5"/><text x="${CX}" y="226" font-size="15" font-weight="800" text-anchor="middle" fill="var(--tx)">LIBRAR POR COLA · ${dm((tramo.libera - d) * 1000)}</text>`;
  s += `<line x1="14" x2="${DER}" y1="244" y2="244" stroke="var(--ln)"/>`;
  s += `<text x="16" y="266" font-size="13" fill="var(--gy)">Siguiente</text>`;
  const vc = ruta.tramoCabeza(d)?.v ?? vp; // librando por cola: la de la cabeza
  if (nx) {
    const m = (nx.pk - d) * 1000, baja = vc != null && nx.v < vc, c = baja ? "var(--dn)" : "var(--up)";
    s += `<text x="16" y="308" font-size="46" font-weight="700" fill="${c}">${baja ? "▼ " : "▲ "}${nx.v}</text><text x="${DER}" y="308" font-size="34" font-weight="700" text-anchor="end" fill="var(--tx)">${dm(m)}</text>`;
    s += `<rect x="16" y="318" width="${WL - 22}" height="5" rx="2" fill="var(--blu2)"/><rect x="16" y="318" width="${(WL - 22) * (1 - Math.min(m, 3000) / 3000)}" height="5" rx="2" fill="${c}"/>`;
  } else s += `<text x="16" y="302" font-size="24" font-weight="700" fill="var(--gy)">Sin más cambios</text>`;
  // Avisos próximos (el residuo va abajo de los pasados). En el iPad en vertical, en su cuadro.
  const ev = soloVel ? [] : ruta.proximos(d, alcance);
  if (soloVel) pintarProximos(ruta, d, null);
  else s += `<text x="14" y="343" font-size="11" font-weight="800" letter-spacing=".08em" fill="var(--gy)">PRÓXIMOS</text>`;
  if (!soloVel && !ev.length) s += `<text x="16" y="366" font-size="13" fill="var(--gy)">Ninguno en los próximos 3 km</text>`;
  ev.slice(0, Math.max(1, Math.floor((H - 8 - 350) / 62))).forEach((e, i) => {
    const k = picDe(e) || {}, y = 350 + i * 62, [tit, pk] = tituloPk(ruta, e), num = numeroGrande(e), [t, at] = ajustar(tit, num ? WL - 130 : WL - 74, 30);
    s += `<rect x="10" y="${y}" width="${WL - 12}" height="55" rx="6" fill="none" stroke="${esc(k.borde || "var(--ln)")}" stroke-width="${i ? 1.5 : 2.5}"${e.estado === "revisar" ? ' stroke-dasharray="5 3"' : ""}/>`;
    s += `<g transform="translate(15 ${y + 8}) scale(.8)">${forma(k, e.datos)}</g><text x="60" y="${y + 23}" font-size="16" font-weight="700" fill="var(--tx)"${at}>${t}</text>`;
    s += linea2(e, 60, y + 45, 15, `${pk ? pk + " · " : ""}a `, dm((e.pk_acum - d) * 1000), DER);
    if (num) s += `<text x="${WL - 6}" y="${y + 40}" font-size="34" font-weight="800" text-anchor="end" fill="${esc(k.color || "var(--tx)")}">${esc(num)}</text>`;
  });
  // Línea de tiempo
  for (const m of [0, 500, 1000, 2000, 3000])
    s += `<line x1="630" x2="${XD}" y1="${Y(m)}" y2="${Y(m)}" stroke="var(--gy)" opacity=".35" stroke-dasharray="3 4"/><text x="625" y="${Y(m) + 4}" font-size="10" text-anchor="end" fill="var(--gy)">${m}</text>`;
  s += `<text x="${XD}" y="22" font-size="10" font-weight="700" letter-spacing=".06em" text-anchor="end" fill="${pos.fiable ? "var(--gy)" : "var(--lt)"}">${esc(pos.etiqueta || (pos.fiable ? MODO_TXT[pos.modo] || "" : "POSICIÓN NO FIABLE"))}</text>`;
  s += `<line x1="644" x2="644" y1="40" y2="${H - 60 - R}" stroke="var(--gy)" stroke-width="3" stroke-linecap="round"/>`;
  let pv = 999, fondo = "", frente = "";
  for (const e of ev) {
    const k = picDe(e) || {}, [tit, pk] = tituloPk(ruta, e), num = numeroGrande(e), [t, at] = ajustarAncho(num ? `${tit} ${num}` : tit, XD - 662, 12), m = (e.pk_acum - d) * 1000, y = Y(m), ty = Math.min(y, pv - 38);
    pv = ty;
    if (ty < 48) continue;
    fondo += `<circle cx="644" cy="${y}" r="3.5" fill="${esc(k.borde || "var(--gy)")}"/><line x1="644" x2="644" y1="${y}" y2="${ty}" stroke="${esc(k.borde || "var(--gy)")}" stroke-width="2"/>`;
    frente += `<g transform="translate(629 ${ty - 15}) scale(.625)">${forma(k, e.datos)}</g><text x="662" y="${ty - 1}" font-size="12" font-weight="700" fill="var(--tx)"${at}>${t}</text>`;
    frente += linea2(e, 662, ty + 14, 11, pk ? pk + " · " : "", dm(m), XD);
  }
  s += fondo + frente;
  s += `<polygon points="644,${H - 72 - R} 634,${H - 52 - R} 654,${H - 52 - R}" fill="var(--yl)"/>`;
  const eta = ruta.eta(d);
  const dsv = conDesvio ? cuadroDesvio(ruta, pos, eta) : "";
  // Columna estrecha (20 %): odómetro y hora más pequeños, uno al lado del otro.
  s += `<rect x="602" y="${H - 33 - R}" width="92" height="24" fill="var(--disc)"/><text x="648" y="${H - 15 - R}" font-size="15" font-weight="700" text-anchor="middle" fill="var(--dt)">${miles(d * 1000)} m</text>`;
  s += dsv
    ? `<text x="699" y="${H - 15 - R}" font-size="13" fill="var(--tx)">${eta == null ? "--:--" : hms(eta).slice(0, 5)}</text>` + dsv
    : `<text x="${(694 + XD) / 2}" y="${H - 15 - R}" font-size="14" text-anchor="middle" fill="var(--tx)">${eta == null ? "--:--:--" : hms(eta)}</text>`;
  if (residuo) s += botonResiduo(residuo, XR, H - 46, WR, 42);
  $("sa").innerHTML = s;
  $("sc").innerHTML = s;
  pintarHistorial(ruta, d);
}

let hN = -1, hT = 0, hRuta = null;
export const reiniciarHistorial = () => {
  hN = -1;
};

function pintarHistorial(ruta, d) {
  const ahora = performance.now(), H = ruta.pasados(d);
  if (H.length === hN && ruta === hRuta && ahora - hT < 500) return;
  hN = H.length;
  hT = ahora;
  hRuta = ruta;
  $("hist-l").innerHTML = H.length
    ? H.map((e) => {
        const k = picDe(e), [tit, pk] = tituloPk(ruta, e), num = numeroGrande(e);
        return `<div class="hr${e.estado === "revisar" ? " rv" : ""}">${icono(k, 26, e.datos)}<div><b>${esc(tit)}</b><small>${pk ? pk + " · " : ""}hace ${dm((d - e.pk_acum) * 1000)}${e.datos?.via ? " · " + cuadroViaHtml(e.datos.via) : ""}${e.estado === "revisar" ? ' · <span class="rvchip">A REVISAR</span>' : ""}</small></div>${num ? `<span class="hr-n" style="color:${esc(k?.color || "var(--tx)")}">${esc(num)}</span>` : ""}</div>`;
      }).join("")
    : `<div class="vac">Todavía no ha pasado nada</div>`;
}

/** Cuadro de próximos avisos en HTML (teléfono e iPad en vertical). */
function pintarProximos(ruta, d, vista) {
  const ev = ruta.proximos(d, alcance);
  // Franjas de texto (marcha a la vista): entre la velocidad y los avisos, sin tapar nada.
  poner("mv-prox", (vista ? `<div class="mv-vista">MARCHA A LA VISTA · TF ${vista.numero} · ${dm((vista.fin - d) * 1000)}</div>` : "") + (ev.length
    ? ev
        .map((e, i) => {
          const k = picDe(e) || {}, [tit, pk] = tituloPk(ruta, e), num = numeroGrande(e);
          return `<div class="px${i ? "" : " pri"}${e.estado === "revisar" ? " rv" : ""}" style="--bc:${esc(k.borde || "var(--ln)")}">${icono(k, 40, e.datos)}<div><b>${esc(tit)}</b><small>${pk ? pk + " · " : ""}a <strong>${dm((e.pk_acum - d) * 1000)}</strong>${chipsLinea2(e)}</small></div>${num ? `<span class="px-n" style="color:${esc(k.color || "var(--tx)")}">${esc(num)}</span>` : ""}</div>`;
        })
        .join("")
    : `<div class="vac">Ninguno en los próximos 3 km</div>`));
}

// ---------------------------------------------------------------- teléfono
// Las mismas informaciones que la pantalla de tablet, en piezas que se leen a ese tamaño:
// velocidad y siguiente cambio (arriba), próximos avisos y pasados (lista), línea de tiempo
// estrecha a la derecha (se arrastra igual) y odómetro con la hora abajo.

/** Línea de tiempo del teléfono: [y(3000 m), y(0 m)] en píxeles del elemento. */
export const limitesLineaMovil = (alto) => [26, alto - 30];
const yMovil = (m, arriba, abajo) => {
  for (let i = 1; i < K.length; i++)
    if (m <= K[i][0]) {
      const [a, fa] = K[i - 1], [b, fb] = K[i];
      return abajo - (fa + ((fb - fa) * (m - a)) / (b - a)) * (abajo - arriba);
    }
  return arriba;
};

const chipsLinea2 = (e) =>
  (e.datos?.via ? " · " + cuadroViaHtml(e.datos.via) : "") + (e.estado === "revisar" ? ' · <span class="rvchip">A REVISAR</span>' : "");

/** innerHTML solo si cambia (evita rehacer el DOM en cada fotograma). */
const hecho = new Map();
function poner(id, html) {
  if (hecho.get(id) === html) return;
  hecho.set(id, html);
  $(id).innerHTML = html;
}
const texto_ = (el, t) => {
  if (el.textContent !== t) el.textContent = t;
};

export function pintarMarchaMovil(ruta, pos, { desvio: conDesvio = false, residuo = null } = {}) {
  const d = pos.d;
  const tramo = ruta.tramo(d);
  const vp = tramo?.v ?? null;
  const lt = tramo?.fuente === "ltv";
  const nx = ruta.siguiente(d);
  // Velocidad y siguiente cambio
  const vista = ruta.vistaEn?.(d);
  const etiqueta = lt || tramo?.fuente === "cvm" || tramo?.revisar;
  // Con tres cifras, la etiqueta (LTV, CVM, A REVISAR) se pegaba al número en el iPhone (Joan).
  let v = `<div class="mv-v${lt ? " ltv" : ""}${etiqueta && vp != null && String(vp).length > 2 ? " largo" : ""}">`;
  if (vp != null) v += `<span class="mv-n">${vp}</span><span class="mv-u">km/h</span>`;
  else v += `<span class="mv-sin">Sin V Max<small>${ruta.p.prueba ? "ruta de prueba: el CVM no la da aquí" : "la hoja no la da en este tramo"}</small></span>`;
  const cv = tramo?.fuente === "cvm";
  if (lt || cv || tramo?.revisar)
    v += `<span class="mv-et">${lt ? '<span class="mv-ltv">LTV</span>' : cv ? '<span class="rvchip">CVM</span>' : ""}${tramo?.revisar ? '<span class="rvchip">A REVISAR</span>' : ""}</span>`;
  v += `</div><div class="mv-sig"><small>Siguiente</small>`;
  const vc = ruta.tramoCabeza(d)?.v ?? vp; // librando por cola: la de la cabeza
  if (nx) {
    const m = (nx.pk - d) * 1000, baja = vc != null && nx.v < vc;
    v += `<b class="${baja ? "baja" : "sube"}">${baja ? "▼" : "▲"} ${nx.v}</b><span class="mv-dist">${dm(m)}</span>`;
    v += `<i class="mv-bar"><i class="${baja ? "baja" : "sube"}" style="width:${(100 * (1 - Math.min(m, 3000) / 3000)).toFixed(1)}%"></i></i>`;
  } else v += `<b class="mv-nada">Sin más cambios</b>`;
  // «Librar por cola», debajo de «Siguiente». Su hueco está siempre (vacío si no toca): así el
  // cuadro no cambia de tamaño ni se mueve nada cuando aparece.
  if (tramo?.por_cola) v += `<span class="mv-libra"><small>LIBRAR POR COLA</small><b>${dm((tramo.libera - d) * 1000)}</b></span>`;
  else v += `<span class="mv-libra vacio" aria-hidden="true"><small>LIBRAR POR COLA</small><b>000 m</b></span>`;
  v += `</div>`;
  poner("mv-vel", v);
  // Próximos avisos
  pintarProximos(ruta, d, vista);
  const ev = ruta.proximos(d, alcance);
  // Línea de tiempo
  const el = $("mv-linea"), W = el.clientWidth, Ht = el.clientHeight;
  if (W && Ht) {
    // Las cifras de la escala, separadas del marco; el tren, un triángulo pequeño a la derecha del 0.
    const [arriba, abajo] = limitesLineaMovil(Ht), x = 38, y = (m) => yMovil(m, arriba, abajo);
    let s = "";
    for (const m of [0, 500, 1000, 2000, 3000])
      s += `<line x1="${x}" x2="${W - 4}" y1="${y(m)}" y2="${y(m)}" stroke="var(--gy)" opacity=".35" stroke-dasharray="3 4"/><text x="${x - 9}" y="${y(m) + 4}" font-size="10" text-anchor="end" fill="var(--gy)">${m}</text>`;
    s += `<line x1="${x}" x2="${x}" y1="${arriba}" y2="${abajo}" stroke="var(--gy)" stroke-width="3" stroke-linecap="round"/>`;
    const tam = Math.min(34, W - x - 12), esc_ = tam / 48;
    let pv = 1e9, fondo = "", frente = "";
    for (const e of ev) {
      const k = picDe(e) || {}, yy = y((e.pk_acum - d) * 1000), ty = Math.min(yy, pv - tam - 4);
      pv = ty;
      if (ty < arriba - 8) continue;
      fondo += `<circle cx="${x}" cy="${yy}" r="3.5" fill="${esc(k.borde || "var(--gy)")}"/><path d="M${x} ${yy}L${x + 8} ${ty}" stroke="${esc(k.borde || "var(--gy)")}" stroke-width="2" fill="none"/>`;
      frente += `<g transform="translate(${x + 8} ${ty - tam / 2}) scale(${esc_})">${forma(k, e.datos)}</g>`;
      if (W - (x + 12 + tam) >= 34)
        frente += `<text x="${W - 4}" y="${ty + 4}" font-size="12" font-weight="700" text-anchor="end" fill="var(--tx)">${dm((e.pk_acum - d) * 1000)}</text>`;
    }
    s += fondo + frente;
    s += `<polygon points="${x},${abajo - 7} ${x - 6},${abajo + 5} ${x + 6},${abajo + 5}" fill="var(--yl)"/>`;
    el.setAttribute("viewBox", `0 0 ${W} ${Ht}`);
    el.innerHTML = s;
  }
  // Odómetro, hora prevista, adelanto o retraso y de dónde sale la posición
  const eta = ruta.eta(d), dsv = conDesvio ? valorDesvio(ruta, pos, eta) : null;
  const modo = pos.etiqueta || (pos.fiable ? MODO_TXT[pos.modo] || "" : "POSICIÓN NO FIABLE");
  // Las piezas de la fila se crean una vez y luego solo se cambia su texto: si se rehiciera la
  // fila en cada fotograma, el botón «Residuo» desaparecería bajo el dedo y el iPhone se atasca.
  const o = $("mv-odo");
  if (!o.querySelector(".odo-km"))
    o.innerHTML =
      `<span class="odo-kh"><span class="odo-km"></span><span class="odo-h"></span><span class="odo-d"></span></span>` +
      `<button class="odo-res" data-residuo="1" aria-label="Residuo: cuenta atrás de la longitud del tren">Residuo <b></b></button><span class="odo-m"></span>`;
  texto_(o.querySelector(".odo-km"), `${miles(d * 1000)} m`);
  texto_(o.querySelector(".odo-h"), eta == null ? "--:--:--" : hms(eta));
  const od = o.querySelector(".odo-d");
  od.hidden = !dsv;
  if (dsv) {
    texto_(od, dsv[0]);
    od.style.color = dsv[1];
  }
  pintarResiduo(residuo, o.querySelector(".odo-res"));
  const om = o.querySelector(".odo-m");
  om.className = "odo-m" + (pos.fiable ? "" : " mal");
  texto_(om, modo);
  pintarHistorial(ruta, d);
}
