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
let H = 440;
export const altoDibujo = () => H;
export function ajustarDibujo(anchoPx, altoPx, apilado) {
  const nuevo = apilado ? 440 : Math.max(440, Math.round((301.5 * altoPx) / (0.35 * anchoPx) + 6.5));
  if (nuevo === H) return false;
  H = nuevo;
  for (const [id, x] of [["sa", 3.25], ["sc", 595.25]]) {
    const s = document.getElementById(id);
    s.setAttribute("viewBox", `${x} 3.25 301.5 ${H - 6.5}`);
    s.style.aspectRatio = `301.5 / ${H - 6.5}`;
  }
  return true;
}

// Escala de la línea de tiempo: más espacio para lo cercano.
const K = [[0, 0], [500, 0.36], [1000, 0.62], [2000, 0.85], [3000, 1]];
export const Y = (m) => {
  const base = H - 60, alto = H - 100;
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
const accion = (e) => texto((picDe(e) || {}).accion || picDe(e)?.nombre || e.tipo, e.datos);

/** Cuadro «VÍA X» en SVG. */
function cuadroVia(x, y, codigo, fs) {
  const t = "VÍA " + codigo, w = anchoTexto(t, `800 ${fs}px`) + fs * 1.1, h = fs * 1.5;
  return [
    `<rect x="${x}" y="${y - fs * 1.1}" width="${w}" height="${h}" rx="${h / 4}" fill="var(--in)" stroke="var(--tx)" stroke-width="1.3"/>` +
      `<text x="${x + w / 2}" y="${y}" font-size="${fs}" font-weight="800" text-anchor="middle" fill="var(--tx)">${esc(t)}</text>`,
    w,
  ];
}

/** Segunda línea de un aviso: distancia, vía (si la LTV es de una sola vía) y «a revisar». */
function linea2(e, x, y, fs, pre, dist, maxX) {
  let s = `<text x="${x}" y="${y}" font-size="${fs}" fill="var(--gy)">${pre}<tspan font-weight="700" fill="var(--tx)">${dist}</tspan></text>`;
  let cx = x + anchoTexto(pre, `${fs}px`) + anchoTexto(dist, `700 ${fs}px`) + 7;
  if (e.estado === "revisar") {
    const t = "A REVISAR", w = anchoTexto(t, `800 ${fs * 0.85}px`) + fs;
    s += `<rect x="${cx}" y="${y - fs * 1.05}" width="${w}" height="${fs * 1.45}" rx="${fs * 0.35}" fill="none" stroke="var(--dn)" stroke-width="1.3" stroke-dasharray="3 2"/><text x="${cx + w / 2}" y="${y - 1}" font-size="${fs * 0.85}" font-weight="800" text-anchor="middle" fill="var(--dn)">${t}</text>`;
    cx += w + 6;
  }
  const v = e.datos && e.datos.via;
  if (!v) return s;
  const [codigo, resto] = partesVia(v), [c, cw] = cuadroVia(cx, y, codigo, fs * 0.95);
  s += c;
  if (resto) {
    const rx = cx + cw + 6, hueco = maxX - rx, rw = anchoTexto(resto, `700 ${fs}px`);
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
  return `<text x="886" y="${H - 15}" font-size="15" font-weight="800" text-anchor="end" fill="${color}">${txt}</text>`;
}

export function pintarMarcha(ruta, pos, { desvio: conDesvio = false } = {}) {
  const d = pos.d;
  const tramo = ruta.tramo(d);
  const vp = tramo?.v ?? null;
  const lt = tramo?.fuente === "ltv";
  const nx = ruta.siguiente(d);
  let s = `<rect width="900" height="${H}" fill="var(--bg)"/>`;
  for (const [x, y, w, h] of [[4, 4, 300, H - 8], [596, 4, 300, H - 48], [596, H - 38, 300, 34]])
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="var(--ln)" stroke-width="1.5"/>`;
  // Velocidad
  if (lt) s += `<g transform="translate(252 10) scale(.5)">${forma(pic("ltv") || {}, { v: vp })}</g><text x="246" y="27" font-size="13" font-weight="700" text-anchor="end" fill="var(--lt)">LTV</text>`;
  if (tramo?.revisar) s += `<rect x="14" y="12" width="96" height="20" rx="5" fill="none" stroke="var(--dn)" stroke-dasharray="3 2"/><text x="62" y="26" font-size="12" font-weight="800" text-anchor="middle" fill="var(--dn)">A REVISAR</text>`;
  s += vp != null
    ? `<text x="154" y="176" font-size="158" font-weight="700" text-anchor="middle" fill="${lt ? "var(--lt)" : "var(--tx)"}">${vp}</text>`
    : `<text x="154" y="120" font-size="26" font-weight="700" text-anchor="middle" fill="var(--gy)">Sin V Max</text><text x="154" y="148" font-size="14" text-anchor="middle" fill="var(--gy)">${ruta.p.prueba ? "ruta de prueba: sin datos de ADIF" : "la hoja no la da en este tramo"}</text>`;
  s += `${vp != null ? '<text x="154" y="198" font-size="13" text-anchor="middle" fill="var(--gy)">km/h</text>' : ""}<line x1="14" x2="294" y1="212" y2="212" stroke="var(--ln)"/>`;
  s += `<text x="16" y="234" font-size="13" fill="var(--gy)">Siguiente</text>`;
  if (nx) {
    const m = (nx.pk - d) * 1000, baja = vp != null && nx.v < vp, c = baja ? "var(--dn)" : "var(--up)";
    s += `<text x="16" y="274" font-size="40" font-weight="700" fill="${c}">${baja ? "▼ " : "▲ "}${nx.v}</text><text x="294" y="274" font-size="30" font-weight="700" text-anchor="end" fill="var(--tx)">${dm(m)}</text>`;
    s += `<rect x="16" y="284" width="278" height="5" rx="2" fill="var(--blu2)"/><rect x="16" y="284" width="${278 * (1 - Math.min(m, 3000) / 3000)}" height="5" rx="2" fill="${c}"/>`;
  } else s += `<text x="16" y="270" font-size="24" font-weight="700" fill="var(--gy)">Sin más cambios</text>`;
  // Avisos
  const ev = ruta.proximos(d, alcance);
  if (!ev.length) s += `<text x="16" y="326" font-size="13" fill="var(--gy)">Sin avisos próximos</text>`;
  ev.slice(0, Math.max(2, Math.floor((H - 8 - 304) / 58))).forEach((e, i) => {
    const k = picDe(e) || {}, y = 304 + i * 58, [t, at] = ajustar(accion(e), 230, 26);
    s += `<rect x="10" y="${y}" width="288" height="50" rx="6" fill="none" stroke="${esc(k.borde || "var(--ln)")}" stroke-width="${i ? 1.5 : 2.5}"${e.estado === "revisar" ? ' stroke-dasharray="5 3"' : ""}/>`;
    s += `<g transform="translate(15 ${y + 7}) scale(.75)">${forma(k, e.datos)}</g><text x="58" y="${y + 21}" font-size="14" font-weight="700" fill="var(--tx)"${at}>${t}</text>`;
    s += linea2(e, 58, y + 41, 14, "a ", dm((e.pk_acum - d) * 1000), 294);
  });
  // Línea de tiempo
  for (const m of [0, 500, 1000, 2000, 3000])
    s += `<line x1="630" x2="890" y1="${Y(m)}" y2="${Y(m)}" stroke="var(--gy)" opacity=".35" stroke-dasharray="3 4"/><text x="625" y="${Y(m) + 4}" font-size="10" text-anchor="end" fill="var(--gy)">${m}</text>`;
  s += `<text x="890" y="22" font-size="10" font-weight="700" letter-spacing=".06em" text-anchor="end" fill="${pos.fiable ? "var(--gy)" : "var(--lt)"}">${esc(pos.etiqueta || (pos.fiable ? MODO_TXT[pos.modo] || "" : "POSICIÓN NO FIABLE"))}</text>`;
  s += `<line x1="644" x2="644" y1="40" y2="${H - 60}" stroke="var(--gy)" stroke-width="3" stroke-linecap="round"/>`;
  let pv = 999, fondo = "", frente = "";
  for (const e of ev) {
    const k = picDe(e) || {}, [t, at] = ajustar(accion(e), 221, 30), m = (e.pk_acum - d) * 1000, y = Y(m), ty = Math.min(y, pv - 38);
    pv = ty;
    if (ty < 48) continue;
    fondo += `<circle cx="644" cy="${y}" r="3.5" fill="${esc(k.borde || "var(--gy)")}"/><line x1="644" x2="644" y1="${y}" y2="${ty}" stroke="${esc(k.borde || "var(--gy)")}" stroke-width="2"/>`;
    frente += `<g transform="translate(629 ${ty - 15}) scale(.625)">${forma(k, e.datos)}</g><text x="667" y="${ty - 1}" font-size="12" font-weight="700" fill="var(--tx)"${at}>${t}</text>`;
    frente += linea2(e, 667, ty + 14, 12, "", dm(m), 890);
  }
  s += fondo + frente;
  s += `<polygon points="644,${H - 72} 634,${H - 52} 654,${H - 52}" fill="var(--yl)"/>`;
  const eta = ruta.eta(d);
  const dsv = conDesvio ? cuadroDesvio(ruta, pos, eta) : "";
  s += `<rect x="602" y="${H - 33}" width="130" height="24" fill="var(--disc)"/><text x="667" y="${H - 15}" font-size="16" font-weight="700" text-anchor="middle" fill="var(--dt)">${miles(d * 1000)} m</text>`;
  s += dsv
    ? `<text x="738" y="${H - 15}" font-size="15" fill="var(--tx)">${eta == null ? "--:--" : hms(eta).slice(0, 5)}</text>` + dsv
    : `<text x="814" y="${H - 15}" font-size="16" text-anchor="middle" fill="var(--tx)">${eta == null ? "--:--:--" : hms(eta)}</text>`;
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
  $("hist").innerHTML = H.length
    ? H.map((e) => {
        const k = picDe(e), eta = ruta.eta(e.pk_acum);
        return `<div class="hr${e.estado === "revisar" ? " rv" : ""}">${icono(k, 26, e.datos)}<div><b>${esc(accion(e))}</b><small>${eta == null ? "" : hm(eta) + " · "}hace ${dm((d - e.pk_acum) * 1000)}${e.datos?.via ? " · " + cuadroViaHtml(e.datos.via) : ""}${e.estado === "revisar" ? ' · <span class="rvchip">A REVISAR</span>' : ""}</small></div></div>`;
      }).join("")
    : `<div class="vac">Todavía no ha pasado nada</div>`;
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

export function pintarMarchaMovil(ruta, pos, { desvio: conDesvio = false } = {}) {
  const d = pos.d;
  const tramo = ruta.tramo(d);
  const vp = tramo?.v ?? null;
  const lt = tramo?.fuente === "ltv";
  const nx = ruta.siguiente(d);
  // Velocidad y siguiente cambio
  let v = `<div class="mv-v${lt ? " ltv" : ""}">`;
  if (vp != null) v += `<span class="mv-n">${vp}</span><span class="mv-u">km/h</span>`;
  else v += `<span class="mv-sin">Sin V Max<small>${ruta.p.prueba ? "ruta de prueba: sin datos de ADIF" : "la hoja no la da en este tramo"}</small></span>`;
  if (lt || tramo?.revisar)
    v += `<span class="mv-et">${lt ? '<span class="mv-ltv">LTV</span>' : ""}${tramo?.revisar ? '<span class="rvchip">A REVISAR</span>' : ""}</span>`;
  v += `</div><div class="mv-sig"><small>Siguiente</small>`;
  if (nx) {
    const m = (nx.pk - d) * 1000, baja = vp != null && nx.v < vp;
    v += `<b class="${baja ? "baja" : "sube"}">${baja ? "▼" : "▲"} ${nx.v}</b><span class="mv-dist">${dm(m)}</span>`;
    v += `<i class="mv-bar"><i class="${baja ? "baja" : "sube"}" style="width:${(100 * (1 - Math.min(m, 3000) / 3000)).toFixed(1)}%"></i></i>`;
  } else v += `<b class="mv-nada">Sin más cambios</b>`;
  v += `</div>`;
  $("mv-vel").innerHTML = v;
  // Próximos avisos
  const ev = ruta.proximos(d, alcance);
  $("mv-prox").innerHTML = ev.length
    ? ev
        .map((e, i) => {
          const k = picDe(e) || {};
          return `<div class="px${i ? "" : " pri"}${e.estado === "revisar" ? " rv" : ""}" style="--bc:${esc(k.borde || "var(--ln)")}">${icono(k, 40, e.datos)}<div><b>${esc(accion(e))}</b><small>a <strong>${dm((e.pk_acum - d) * 1000)}</strong>${chipsLinea2(e)}</small></div></div>`;
        })
        .join("")
    : `<div class="vac">Sin avisos en los próximos 3 km</div>`;
  // Línea de tiempo
  const el = $("mv-linea"), W = el.clientWidth, Ht = el.clientHeight;
  if (W && Ht) {
    const [arriba, abajo] = limitesLineaMovil(Ht), x = 34, y = (m) => yMovil(m, arriba, abajo);
    let s = "";
    for (const m of [0, 500, 1000, 2000, 3000])
      s += `<line x1="${x}" x2="${W - 4}" y1="${y(m)}" y2="${y(m)}" stroke="var(--gy)" opacity=".35" stroke-dasharray="3 4"/><text x="${x - 6}" y="${y(m) + 4}" font-size="11" text-anchor="end" fill="var(--gy)">${m}</text>`;
    s += `<line x1="${x}" x2="${x}" y1="${arriba}" y2="${abajo}" stroke="var(--gy)" stroke-width="3" stroke-linecap="round"/>`;
    const tam = Math.min(36, W - x - 12), esc_ = tam / 48;
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
    s += `<polygon points="${x},${abajo - 12} ${x - 10},${abajo + 8} ${x + 10},${abajo + 8}" fill="var(--yl)"/>`;
    el.setAttribute("viewBox", `0 0 ${W} ${Ht}`);
    el.innerHTML = s;
  }
  // Odómetro, hora prevista, adelanto o retraso y de dónde sale la posición
  const eta = ruta.eta(d), dsv = conDesvio ? valorDesvio(ruta, pos, eta) : null;
  const modo = pos.etiqueta || (pos.fiable ? MODO_TXT[pos.modo] || "" : "POSICIÓN NO FIABLE");
  $("mv-odo").innerHTML =
    `<span class="odo-km">${miles(d * 1000)} m</span><span class="odo-h">${eta == null ? "--:--:--" : hms(eta)}</span>` +
    (dsv ? `<span class="odo-d" style="color:${dsv[1]}">${dsv[0]}</span>` : "") +
    `<span class="odo-m${pos.fiable ? "" : " mal"}">${esc(modo)}</span>`;
  pintarHistorial(ruta, d);
}
