// Confirmación en una ventana emergente de la app (#conf en index.html), no la del navegador.

const $ = (id) => document.getElementById(id);

/**
 * Confirmación en una ventana emergente de la app (no la del navegador): resuelve true si se
 * pulsa el botón de confirmar, false si se cancela (botón, fondo o Escape).
 */
export function confirmar({ titulo, mensaje, si = "Aceptar", no = "Cancelar" }) {
  $("conf-t").textContent = titulo;
  $("conf-m").textContent = mensaje;
  $("conf-si").textContent = si;
  $("conf-no").textContent = no;
  $("conf").hidden = false;
  $("conf-no").focus();
  return new Promise((ok) => {
    const fin = (v) => {
      $("conf").hidden = true;
      $("conf-si").onclick = $("conf-no").onclick = $("conf").onclick = null;
      removeEventListener("keydown", tecla);
      ok(v);
    };
    const tecla = (e) => e.key === "Escape" && fin(false);
    addEventListener("keydown", tecla);
    $("conf-si").onclick = () => fin(true);
    $("conf-no").onclick = () => fin(false);
    $("conf").onclick = (e) => e.target === $("conf") && fin(false);
  });
}
