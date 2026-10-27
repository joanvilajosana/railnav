// Pequeñas equivalencias de Python para que los lectores en JavaScript den exactamente lo
// mismo que los de Python (redondeos, normalización de textos, \w de Unicode).

// round(x, n) de Python: se redondea el valor decimal exacto del número y, solo en un
// empate exacto, al par. toFixed() trabaja con el valor exacto; el empate se mira en su
// desarrollo decimal completo (13.315 es en realidad 13.31499…: no es empate).
export function redondear(x, n = 0) {
  if (x == null || !Number.isFinite(x)) return x;
  const exacto = Math.abs(x).toFixed(Math.min(100, n + 80));
  const [ent, dec = ""] = exacto.split(".");
  const resto = dec.slice(n);
  if (/^50*$/.test(resto)) {
    const ultimo = Number((n === 0 ? ent : dec[n - 1]) ?? 0);
    const base = Number(ent + "." + dec.slice(0, n));
    const v = ultimo % 2 === 0 ? base : base + 10 ** -n;
    return Math.sign(x) * Number(v.toFixed(n)) + 0;
  }
  return Number(x.toFixed(n)) + 0;
}

// normalizar() del lector de hojas: sin acentos, minúsculas, solo [a-z0-9].
export function normalizar(texto) {
  return texto
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// \w de Python (Unicode): letras, números y guion bajo.
export const W = "[\\p{L}\\p{N}\\p{Mn}\\p{Pc}]";

// str.split() sin argumentos.
export const palabras = (s) => s.split(/\s+/).filter(Boolean);

// min(xs, key=...) de Python: el primero de los mínimos.
export function minPor(xs, clave) {
  let mejor, v = Infinity, hay = false;
  for (const x of xs) {
    const k = clave(x);
    if (!hay || k < v) {
      mejor = x;
      v = k;
      hay = true;
    }
  }
  return mejor;
}

// sorted(xs, key=...) con claves tupla (números o textos), estable.
export function ordenar(xs, clave) {
  const cmp = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  };
  return xs
    .map((x, i) => [clave(x), i, x])
    .sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1])
    .map((p) => p[2]);
}

// float("2,5") del lector: admite coma decimal.
export const numero = (t) => {
  const v = Number(t.replace(",", "."));
  if (t.trim() === "" || Number.isNaN(v)) throw new Error(`no es un número: «${t}»`);
  return v;
};

export async function sha256(datos) {
  const h = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// f"{v:g}" de Python: 6 cifras significativas, sin ceros a la derecha.
export function fmtG(v) {
  if (v === 0) return Object.is(v, -0) ? "-0" : "0";
  if (!Number.isFinite(v)) return Number.isNaN(v) ? "nan" : v > 0 ? "inf" : "-inf";
  const [m, e] = v.toExponential(5).split("e");
  const exp = Number(e);
  if (exp < -4 || exp >= 6) {
    const man = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    return `${man}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const s = v.toPrecision(6);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// str(x) de Python para un float («6.0», «6.4»).
export const strFloat = (v) => {
  const s = String(v);
  return Number.isInteger(v) && !/e/i.test(s) ? s + ".0" : s;
};

// f"{x}" de Python para un valor que puede ser None.
export const str = (v) => (v === null || v === undefined ? "None" : typeof v === "number" ? strFloat(v) : String(v));
