// Iconos de la propia app (barra superior). Los de la ficha del tren están en datos.js.

export const ICO = {
  marcha: '<path d="M3 11L12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
  datos: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l1.5-4M16 21l-1.5-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
  ajustes:
    '<circle cx="12" cy="12" r="3.2"/>' +
    [...Array(8).keys()]
      .map((i) => {
        const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
        return `<line x1="${12 + 7 * c}" y1="${12 + 7 * s}" x2="${12 + 10 * c}" y2="${12 + 10 * s}"/>`;
      })
      .join("") +
    '<circle cx="12" cy="12" r="7"/>',
  sol:
    '<circle cx="12" cy="12" r="4"/>' +
    [...Array(8).keys()]
      .map((i) => {
        const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
        return `<line x1="${12 + 7 * c}" y1="${12 + 7 * s}" x2="${12 + 10 * c}" y2="${12 + 10 * s}"/>`;
      })
      .join(""),
  luna: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};

export const linea = (k, tam = 26) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

export const LOGO = (alto) =>
  `<img class="lg-d" src="img/logo_horizontal_dia.png" alt="RailNav" style="height:${alto}px"><img class="lg-n" src="img/logo_horizontal_noche.png" alt="RailNav" style="height:${alto}px">`;
