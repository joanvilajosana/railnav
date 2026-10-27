// Cruce LTV ↔ ruta (SPEC §4.3 y §6.3; traducción de cruce/cruce.py).
//
// Para cada LTV: APLICA, NO_APLICA o INCIERTA, con la evidencia que lleva al resultado. Se
// empareja por línea, PK dentro del tramo de esa línea, nombres del trayecto y vía; nunca por
// proximidad numérica. Una LTV que encaja pero tiene algo que no se puede comprobar es
// INCIERTA: no cambia la Vmax, pero se muestra «a revisar».

import { segmentos } from "./lineas.js";
import { lineaNormalizada, mismaDependencia } from "./nombres.js";
import { BANALIZADA } from "./vias.js";
import { fmtG, palabras, redondear, str } from "../pdf/py.js";

const VIAS_SEGURAS = new Set(["U", "A"]); // única y ambas: afectan a cualquier tren de la línea
const RE_HORARIO = /(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/;
const RE_CONDICION = /\b(PAR|PARES|IMPAR|IMPARES|SENTIDO|ERTMS|ANCHO)\b/i;
const SUFIJO_CLASE = { viajeros: "V", mercancias: "M" }; // confirmado por el usuario

const fmt = (v) => (v === null || v === undefined ? "?" : fmtG(v));
const p2 = (n) => String(n).padStart(2, "0");

/** Hora de paso interpolada entre los dos puntos con hora que rodean `acum`. */
export function horaEstimada(ruta, acum) {
  const minutos = (h) => {
    const p = h.split(":").map(Number);
    return p[0] * 60 + p[1] + (p.length > 2 ? p[2] / 60 : 0);
  };
  const conHora = ruta.puntos.filter((p) => p.hora && p.pk_acum !== null).map((p) => [p.pk_acum, minutos(p.hora)]);
  for (let k = 0; k + 1 < conHora.length; k++) {
    const [a0, m0] = conHora[k];
    let [a1, m1] = conHora[k + 1];
    if (a0 <= acum && acum <= a1) {
      if (m1 < m0) m1 += 24 * 60;
      let m = a1 === a0 ? m0 : m0 + ((acum - a0) / (a1 - a0)) * (m1 - m0);
      m = ((redondear(m) % 1440) + 1440) % 1440;
      return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
    }
  }
  return null;
}

const minutosDe = (h) => {
  const [hh, mm] = h.split(":");
  return Number(hh) * 60 + Number(mm);
};

/** ¿La hora de paso cae dentro del horario de la LTV («00.30-04.30»)? null si no se entiende. */
export function enHorario(horario, paso) {
  const m = RE_HORARIO.exec(horario);
  if (!m) return null;
  const ini = Number(m[1]) * 60 + Number(m[2]), fin = Number(m[3]) * 60 + Number(m[4]);
  const t = minutosDe(paso);
  return ini <= fin ? ini <= t && t <= fin : t >= ini || t <= fin;
}

function bloqueoEn(ruta, seg, acum) {
  if (acum === null) return null;
  let b = null;
  for (const p of ruta.puntos.slice(seg.iIni, seg.iFin + 1)) if (p.pk_acum !== null && p.pk_acum <= acum && p.bloqueo) b = p.bloqueo;
  return b;
}

function paradas(ruta, seg, a, b) {
  if (a === null || b === null) return [];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return ruta.puntos
    .slice(seg.iIni, seg.iFin + 1)
    .filter((p) => p.pk_acum !== null && lo <= p.pk_acum && p.pk_acum <= hi && (p.tecn_min || p.tc_op))
    .map((p) => p.nombre || "?");
}

function velocidadPara(ltv, ruta) {
  const vel = ltv.velocidad;
  if (vel.valor !== null) return [vel.valor, [`velocidad ${vel.valor}`], []];
  const texto = palabras(vel.texto).join(" ");
  if (!vel.compuesta || !vel.compuesta.length) return [null, [], [`velocidad «${texto}» sin interpretar`]];
  const clase = ruta.tren.clase;
  const propia = SUFIJO_CLASE[clase || ""];
  const partes = {};
  for (const p of vel.compuesta) partes[p.sufijo] = p.valor;
  if (propia && propia in partes) return [partes[propia], [`velocidad «${texto}» → ${partes[propia]} (${clase})`], []];
  const dudas = [];
  if ("*" in partes) dudas.push(`velocidad «${texto}»: el * remite a observaciones «${str(ltv.observaciones)}»`);
  else if (clase === null) dudas.push(`velocidad «${texto}»: no se sabe si el tren es de viajeros o mercancías`);
  else dudas.push(`velocidad «${texto}»: no indica velocidad para ${clase}`);
  return [null, [], dudas];
}

const resultado = (ltv, res, evidencia, extra = {}) => ({
  ltv,
  resultado: res,
  evidencia,
  pk_acum_ini: null,
  pk_acum_fin: null,
  velocidad: null,
  via_afectada: null,
  ...extra,
});

export function cruzarLtv(ltv, r, ruta, segs, ignorarFechas = false) {
  const linea = lineaNormalizada(r.linea);
  if (linea === null) return resultado(r.id, "INCIERTA", ["la LTV no tiene línea"]);
  const deLinea = segs.filter((s) => s.linea === linea);
  if (!deLinea.length) {
    // Si parte de la ruta no tiene línea conocida, una LTV que nombra sus dependencias podría
    // estar ahí: no se descarta en silencio.
    for (const s of segs) {
      if (s.linea !== null) continue;
      const nombres = ruta.puntos.slice(s.iIni, s.iFin + 1).filter((p) => p.nombre).map((p) => p.nombre);
      const hits = r.trayecto.filter((t) => nombres.some((n) => mismaDependencia(t, n)));
      if (hits.length)
        return resultado(r.id, "INCIERTA", [
          `línea ${r.linea}; el trayecto nombra ${hits.join(", ")}, que está en un tramo de la ruta sin línea conocida (${s.nombre})`,
          "a revisar: completar la línea de ese tramo en la tabla de tramos",
        ]);
    }
    return resultado(r.id, "NO_APLICA", [`línea ${r.linea} no está en la ruta`]);
  }
  // Vigencia (fechas ISO: se comparan como texto)
  const fecha = ruta.tren.fecha;
  const vig = r.vigencia;
  if (!ignorarFechas && fecha !== null && (vig.desde || vig.hasta)) {
    if ((vig.desde && fecha < vig.desde) || (vig.hasta && fecha > vig.hasta))
      return resultado(r.id, "NO_APLICA", [`vigencia ${vig.desde || "…"}–${vig.hasta || "…"} no incluye el ${fecha}`]);
  }
  // PK dentro de algún tramo de esa línea
  if (r.pk_ini === null || r.pk_fin === null) return resultado(r.id, "INCIERTA", ["la LTV no tiene los dos PK"]);
  const lo = Math.min(r.pk_ini, r.pk_fin), hi = Math.max(r.pk_ini, r.pk_fin);
  let seg = null;
  for (const s of deLinea) {
    const rango = s.rangoPk;
    if (!rango) continue;
    const solapa = lo < rango[1] && hi > rango[0];
    const puntual = lo === hi && rango[0] <= lo && lo <= rango[1];
    if (solapa || puntual) {
      seg = s;
      break;
    }
  }
  if (seg === null) {
    const rangos = deLinea.map((s) => `${s.nombre} PK ${fmt((s.rangoPk || [null, null])[0])}–${fmt((s.rangoPk || [null, null])[1])}`).join(", ");
    return resultado(r.id, "NO_APLICA", [`línea ${r.linea}: PK ${fmtG(lo)}–${fmtG(hi)} fuera de la ruta (${rangos})`]);
  }
  const [rLo, rHi] = seg.rangoPk;
  const evidencia = [`línea ${r.linea} = tramo ${seg.nombre}`];
  const recortada = lo < rLo || hi > rHi;
  evidencia.push(
    `PK ${fmtG(r.pk_ini)}–${fmtG(r.pk_fin)} ` + (recortada ? `solapa el tramo (PK ${fmtG(rLo)}–${fmtG(rHi)}); se recorta` : "dentro del tramo"),
  );
  const dudas = [];
  // Nombres del trayecto
  const nombres = ruta.puntos.slice(seg.iIni, seg.iFin + 1).filter((p) => p.nombre).map((p) => p.nombre);
  const encontrados = r.trayecto.filter((t) => nombres.some((n) => mismaDependencia(t, n)));
  if (encontrados.length) evidencia.push(`trayecto ${r.trayecto.join(" – ")}: ${encontrados.join(", ")} en la hoja`);
  else if (r.trayecto.length) {
    const enRuta = r.trayecto.filter((t) => ruta.puntos.some((p) => mismaDependencia(t, p.nombre)));
    if (!enRuta.length)
      // Misma línea y PK, pero el trayecto está en otra parte de la línea (kilometrajes repetidos).
      return resultado(r.id, "NO_APLICA", [...evidencia, `ninguna dependencia de «${r.trayecto.join(" – ")}» está en la ruta`]);
    dudas.push(`el trayecto «${r.trayecto.join(" – ")}» está en la ruta, pero fuera del tramo ${seg.nombre}`);
  }
  const a = seg.acumRecortado(r.pk_ini);
  const b = seg.acumRecortado(r.pk_fin);
  // Horario: se compara con la hora de paso que da la hoja (confirmado por el usuario).
  if (r.horario) {
    const paso = a !== null ? horaEstimada(ruta, a) : null;
    const dentro = paso ? enHorario(r.horario, paso) : null;
    if (dentro === false)
      return resultado(r.id, "NO_APLICA", [...evidencia, `según la hoja el tren pasa hacia las ${paso}, fuera del horario ${r.horario}`]);
    if (dentro) evidencia.push(`el tren pasa hacia las ${paso}, dentro del horario ${r.horario}`);
    else dudas.push(`solo en horario ${r.horario}; no se sabe a qué hora pasa el tren`);
  }
  // Vía
  const desc = Object.hasOwn(ltv.leyenda_vias, r.via || "") ? ltv.leyenda_vias[r.via || ""] : "sin leyenda";
  let viaAfectada = null;
  if (VIAS_SEGURAS.has(r.via)) evidencia.push(`vía ${r.via} (${desc})`);
  else {
    // Decisión de Joan: una LTV de una sola vía se aplica siempre, avisando de la vía afectada.
    viaAfectada = r.via && desc !== "sin leyenda" ? desc : `${r.via || "?"}`;
    if (BANALIZADA.test(desc))
      evidencia.push(
        `vía ${str(r.via)} (${desc}): vía banalizada; se aplica aunque no se sepa por qué vía circula el tren, avisando de la vía afectada`,
      );
    else if (r.via === "E") {
      const para = paradas(ruta, seg, a, b);
      evidencia.push(
        `vía E (${desc}): vía de estación, no afecta a las vías generales; se aplica siempre avisando de que es vía de estación` +
          (para.length ? `; el tren para en ${para.join(", ")}` : ""),
      );
    } else {
      const bloqueo = bloqueoEn(ruta, seg, a);
      evidencia.push(
        `vía ${r.via || "?"} (${desc}): la hoja no dice por qué vía circula el tren` +
          (bloqueo ? ` (bloqueo ${bloqueo})` : "") +
          "; se aplica siempre avisando de la vía afectada",
      );
    }
  }
  // Velocidad
  const [v, evV, dudasV] = velocidadPara(r, ruta);
  evidencia.push(...evV);
  dudas.push(...dudasV);
  // Condiciones
  if (r.observaciones && RE_CONDICION.test(r.observaciones) && !(r.velocidad.compuesta || []).some((p) => p.sufijo === "*"))
    dudas.push(`condición en observaciones: «${r.observaciones}»`);
  if (fecha === null && !ignorarFechas) dudas.push("la hoja no tiene fecha: no se comprueba la vigencia");
  // Posición en la ruta
  const [ini, fin] = a === null || b === null ? [null, null] : [Math.min(a, b), Math.max(a, b)];
  if (ini !== null && ini === fin) dudas.push("la LTV queda en un solo punto de la ruta");
  const res = dudas.length || v === null || ini === null ? "INCIERTA" : "APLICA";
  return resultado(r.id, res, [...evidencia, ...dudas.map((d) => `a revisar: ${d}`)], {
    pk_acum_ini: ini,
    pk_acum_fin: fin,
    velocidad: v,
    via_afectada: viaAfectada,
  });
}

/** @returns {[{ruta, ltv, tramos, resultados}, avisos]} */
export function cruzar(ruta, ltv, tramos, ignorarFechas = false) {
  const [segs, avisos] = segmentos(ruta, tramos);
  const resultados = ltv.registros.map((r) => cruzarLtv(ltv, r, ruta, segs, ignorarFechas));
  return [{ ruta: ruta.fuente.archivo, ltv: ltv.fuente.archivo, tramos: tramos.ruta, resultados }, avisos];
}
