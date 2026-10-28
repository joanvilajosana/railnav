// Iconos de la propia app (barra superior). Los de la ficha del tren están en datos.js.

export const ICO = {
  marcha: '<path d="M3 11L12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
  datos: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l1.5-4M16 21l-1.5-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
  // Engranaje de 8 dientes (perfil cerrado y eje), bien distinto del sol del modo día/noche.
  ajustes:
    '<path d="' +
    [...Array(8).keys()]
      .flatMap((i) => {
        const a = i * 45, p = (r, g) => {
          const t = ((a + g) * Math.PI) / 180;
          return `${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`;
        };
        return [p(7.6, -14), p(10.6, -8.5), p(10.6, 8.5), p(7.6, 14)];
      })
      .map((q, k) => (k ? "L" : "M") + q)
      .join("") +
    'Z"/><circle cx="12" cy="12" r="3"/>',
  sol:
    '<circle cx="12" cy="12" r="4"/>' +
    [...Array(8).keys()]
      .map((i) => {
        const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
        return `<line x1="${12 + 7 * c}" y1="${12 + 7 * s}" x2="${12 + 10 * c}" y2="${12 + 10 * s}"/>`;
      })
      .join(""),
  luna: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  // secciones de Ajustes
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  ltv: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 8v5M12 16v.01"/>',
  rutas: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  pantalla: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  tabla: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  pictos: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><circle cx="17" cy="7" r="4"/><path d="M7 14l4 7H3zM14 14h7v7h-7z"/>',
  // sonido
  volumen: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  volumen_bajo: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
  silencio: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  // simulación
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  pausa: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  inicio: '<path d="M6 5v14"/><path d="M19 5.5v13L9 12z" fill="currentColor"/>',
};

export const linea = (k, tam = 26) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;

export const LOGO = (alto) =>
  `<img class="lg-d" src="img/logo_horizontal_dia.png" alt="RailNav" style="height:${alto}px"><img class="lg-n" src="img/logo_horizontal_noche.png" alt="RailNav" style="height:${alto}px">`;
