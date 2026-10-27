// Línea de cada parte de la ruta y paso de PK a distancia en la ruta (`pk_acum`)
// (traducción de cruce/lineas.py).
//
// La ruta se parte en segmentos donde el PK es continuo: se corta en cada cambio de línea de
// la hoja (doble PK) y en cada frontera de la tabla de tramos. Cada segmento toma la línea de
// su tramo. Dentro de un segmento, un PK de esa línea se convierte en `pk_acum` interpolando
// entre los dos puntos de la hoja que lo rodean.

import { lineaNormalizada, mismaDependencia, normalizar } from "./nombres.js";
import { redondear, strFloat } from "../pdf/py.js";

export class Segmento {
  constructor(iIni, iFin, tramo) {
    this.iIni = iIni;
    this.iFin = iFin;
    this.tramo = tramo;
    this.perfil = []; // [pk en la línea del segmento, pk_acum]
  }
  /** Línea del tramo; null si no hay tramo o su línea está por decidir («?»). */
  get linea() {
    if (!this.tramo || ["", "?"].includes(this.tramo.linea.trim())) return null;
    return lineaNormalizada(this.tramo.linea);
  }
  get nombre() {
    return this.tramo ? `${this.tramo.desde}–${this.tramo.hasta}` : "tramo sin línea";
  }
  get rangoPk() {
    if (!this.perfil.length) return null;
    const pks = this.perfil.map((p) => p[0]);
    return [Math.min(...pks), Math.max(...pks)];
  }
  /** `pk_acum` de un PK de la línea del segmento, o null si cae fuera. */
  acum(pk) {
    for (let k = 0; k + 1 < this.perfil.length; k++) {
      const [pkA, acA] = this.perfil[k], [pkB, acB] = this.perfil[k + 1];
      const lo = Math.min(pkA, pkB), hi = Math.max(pkA, pkB);
      if (lo <= pk && pk <= hi) {
        if (pkA === pkB) return acA;
        return redondear(acA + ((pk - pkA) / (pkB - pkA)) * (acB - acA), 3);
      }
    }
    if (this.perfil.length === 1 && this.perfil[0][0] === pk) return this.perfil[0][1];
    return null;
  }
  /** Como `acum`, pero un PK fuera del segmento se lleva a su extremo más cercano. */
  acumRecortado(pk) {
    const exacto = this.acum(pk);
    if (exacto !== null || !this.perfil.length) return exacto;
    const [pk0, ac0] = this.perfil[0], [pk1, ac1] = this.perfil.at(-1);
    return Math.abs(pk - pk0) <= Math.abs(pk - pk1) ? ac0 : ac1;
  }
}

function indice(ruta, nombre, desde) {
  const buscado = normalizar(nombre);
  for (const criterio of [
    (p) => normalizar(p.nombre) === buscado,
    (p) => p.tipo === "cambio_linea" && mismaDependencia(p.nombre, nombre),
    (p) => mismaDependencia(p.nombre, nombre),
  ])
    for (let i = desde; i < ruta.puntos.length; i++) if (criterio(ruta.puntos[i])) return i;
  return null;
}

const etiqueta = (p) => p.nombre || (p.pk === null ? "None" : strFloat(p.pk));

/** @returns {[Segmento[], {codigo, mensaje, origen}[]]} */
export function segmentos(ruta, tramos) {
  const avisos = [];
  const aviso = (codigo, mensaje) => avisos.push({ codigo, mensaje, origen: null });
  const n = ruta.puntos.length;
  const tramoDe = new Array(n).fill(null);
  const cortes = new Set([0, n - 1]);
  if (tramos) {
    let pos = 0;
    for (const t of tramos.tramos) {
      const a = indice(ruta, t.desde, pos);
      const b = indice(ruta, t.hasta, (a !== null ? a : pos) + 1);
      if (a === null || b === null) {
        aviso("TRAMO_NO_ENCONTRADO", `tramo ${t.desde}–${t.hasta}: «${a === null ? t.desde : t.hasta}» no está en la hoja`);
        continue;
      }
      for (let i = a; i < b; i++) tramoDe[i] = t;
      cortes.add(a).add(b);
      pos = b;
    }
  }
  ruta.puntos.forEach((p, i) => {
    if (p.tipo === "cambio_linea") {
      cortes.add(i);
      if (tramos && tramoDe[i] === tramoDe[Math.max(i - 1, 0)] && i > 0)
        aviso("CAMBIO_LINEA_DENTRO_DE_TRAMO", `la hoja cambia de PK en ${etiqueta(p)} pero la tabla de tramos no tiene frontera ahí`);
    }
  });
  const orden = [...cortes].sort((x, y) => x - y);
  const resultado = [];
  for (let k = 0; k + 1 < orden.length; k++) {
    const a = orden[k], b = orden[k + 1];
    const seg = new Segmento(a, b, tramoDe[a]);
    for (let i = a; i <= b; i++) {
      const p = ruta.puntos[i];
      if (p.pk_acum === null) continue;
      let pk = p.pk;
      if (i === b && i !== a && p.pk_linea_anterior !== null) pk = p.pk_linea_anterior;
      if (pk !== null) seg.perfil.push([pk, p.pk_acum]);
    }
    resultado.push(seg);
    if (seg.tramo === null && tramos)
      aviso("SEGMENTO_SIN_LINEA", `entre ${etiqueta(ruta.puntos[a])} y ${etiqueta(ruta.puntos[b])} no hay línea en la tabla`);
  }
  return [resultado, avisos];
}

/** Segmento que sigue al punto `i` (o el que acaba en él si es el último). */
export function segmentoDePunto(segs, i) {
  for (const s of segs) if (s.iIni <= i && i < s.iFin) return s;
  return segs.length && segs.at(-1).iFin === i ? segs.at(-1) : null;
}
