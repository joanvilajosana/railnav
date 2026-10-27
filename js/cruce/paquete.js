// Paquete de ruta: el único archivo que necesita la app (traducción de cruce/paquete.py).
// Reúne la hoja original, los eventos, la Vmax efectiva, la radiotelefonía, los bloqueos, el
// horario y las LTV del DLTV que afectan a la ruta.

import { generar } from "./eventos.js";
import { textoVia } from "./vias.js";
import { palabras, redondear } from "../pdf/py.js";

export const FORMATO = "railnav-ruta";
export const VERSION = 1;

const km = (v) => redondear(v, 2);

// `{k: v ... if v not in (None, [], False)}` de Python: también quita los 0 (0 == False).
const sinVacios = (f) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => !(v === null || v === undefined || v === false || v === 0 || (Array.isArray(v) && !v.length))));

/** Todas las filas de la hoja tal y como se leyeron (claves cortas, ver paquete.py). */
export function hojaOriginal(ruta) {
  const cv = new Set(ruta.csv.filter((m) => m.columna === "vmax").map((m) => m.punto));
  const cn = new Map();
  for (const m of ruta.csv)
    if (m.columna === "nota" && m.texto) {
      if (!cn.has(m.punto)) cn.set(m.punto, []);
      cn.get(m.punto).push(m.texto);
    }
  return ruta.puntos.map((p, i) =>
    sinVacios({
      pk: p.pk,
      pka: p.pk_acum === null ? null : km(p.pk_acum),
      pkl: p.pk_linea_anterior,
      lin: p.linea,
      nom: p.nombre,
      tipo: p.tipo,
      hora: p.hora,
      v: p.vmax,
      tec: p.tecn_min,
      conc: p.conc_min,
      tcop: p.tc_op,
      radio: p.radio,
      bq: p.bloqueo,
      notas: p.notas,
      cv: cv.has(i),
      cn: cn.get(i) ?? [],
      pag: p.origen.pagina,
    }),
  );
}

/** LTV del documento que afectan o pueden afectar a la ruta (APLICA e INCIERTA). */
export function dltvDeLaRuta(ltv, cruce) {
  const porId = new Map(ltv.registros.map((r) => [r.id, r]));
  const filas = [];
  for (const res of cruce.resultados) {
    if (res.resultado === "NO_APLICA") continue;
    const r = porId.get(res.ltv);
    const vig = r.vigencia;
    filas.push(
      sinVacios({
        cod: r.id.replace(/^ltv-/, ""),
        res: res.resultado,
        lin: r.linea,
        via: r.via,
        via_txt: Object.hasOwn(ltv.leyenda_vias, r.via || "") ? ltv.leyenda_vias[r.via || ""] : null,
        pki: r.pk_ini,
        pkf: r.pk_fin,
        pkai: res.pk_acum_ini === null ? null : km(res.pk_acum_ini),
        pkaf: res.pk_acum_fin === null ? null : km(res.pk_acum_fin),
        vel: r.velocidad.texto,
        v: res.velocidad,
        mot: r.motivo,
        tray: r.trayecto,
        desde: vig.desde || null,
        hasta: vig.hasta || null,
        vig: vig.tipo,
        csv: r.csv,
        hor: r.horario,
        obs: r.observaciones,
        ev: res.evidencia,
        va: res.via_afectada ? textoVia(r.via, res.via_afectada) : null,
      }),
    );
  }
  const clave = (f) => [f.pkai === undefined ? 1 : 0, f.pkai ?? 0, f.cod];
  filas.sort((x, y) => {
    const a = clave(x), b = clave(y);
    return a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  });
  const sem = ltv.semana;
  return { numero: ltv.numero, desde: sem?.desde ?? null, hasta: sem?.hasta ?? null, ltv: filas };
}

/** [pk_acum, valor] cada vez que cambia la columna (radio o bloqueo); el primero en 0. */
function cambios(ruta, campo) {
  const lista = [];
  for (const p of ruta.puntos) {
    const valor = p[campo] ? palabras(p[campo]).join(" ") : null;
    if (p.pk_acum !== null && valor && (!lista.length || lista.at(-1)[1] !== valor)) lista.push([!lista.length ? 0.0 : km(p.pk_acum), valor]);
  }
  return lista;
}

export function construir(ruta, ltv, cruce, tramos, pictos) {
  const eventos = generar(ruta, ltv, cruce, tramos, pictos);
  const t = ruta.tren;
  const conAcum = ruta.puntos.filter((p) => p.pk_acum !== null);
  const sem = ltv ? ltv.semana : null;
  return {
    formato: FORMATO,
    version: VERSION,
    id: t.fecha ? `${t.numero}-${t.fecha}` : t.numero,
    tren: t,
    fuentes: {
      hoja: ruta.fuente.archivo,
      ltv: ltv ? ltv.fuente.archivo : null,
      ltv_numero: ltv ? ltv.numero : null,
      ltv_desde: sem ? sem.desde : null,
      ltv_hasta: sem ? sem.hasta : null,
    },
    fin: conAcum.length ? km(conAcum.at(-1).pk_acum) : 0.0,
    horario: conAcum.filter((p) => p.hora).map((p) => [km(p.pk_acum), p.hora.slice(0, 5)]),
    radios: cambios(ruta, "radio"),
    bloqueos: cambios(ruta, "bloqueo"),
    vmax: eventos.vmax_efectiva,
    eventos: eventos.eventos,
    hoja: hojaOriginal(ruta),
    dltv: ltv && cruce ? dltvDeLaRuta(ltv, cruce) : null,
    geo: null, // trazado para el GPS: lo añade la app después (js/geo/preparar.js)
  };
}
