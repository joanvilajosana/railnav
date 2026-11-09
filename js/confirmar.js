// Confirmación en una ventana emergente de la app (#conf en index.html), no la del navegador:
// sustituye a confirm(), prompt() y alert().

const $ = (id) => document.getElementById(id);

/**
 * Confirmación en una ventana emergente de la app (no la del navegador): resuelve true si se
 * pulsa el botón de confirmar, false si se cancela (botón, fondo o Escape).
 *
 * - `peligro`: el botón de confirmar en rojo (borrar).
 * - `no: null`: solo un botón (aviso, como alert()).
 * - `campo`: { valor, placeholder, inputmode } pide un texto (como prompt()): resuelve con el
 *   texto escrito, o null si se cancela.
 */
export function confirmar({ titulo, mensaje, si = "Aceptar", no = "Cancelar", peligro = false, campo = null }) {
  const inp = $("conf-in");
  $("conf-t").textContent = titulo;
  $("conf-m").textContent = mensaje;
  $("conf-si").textContent = si;
  $("conf-si").classList.toggle("peligro", peligro);
  $("conf-no").textContent = no || "";
  $("conf-no").hidden = no == null;
  $("conf").querySelector(".rev-b").classList.toggle("uno", no == null);
  inp.hidden = !campo;
  if (campo) {
    inp.value = campo.valor ?? "";
    inp.placeholder = campo.placeholder ?? "";
    inp.inputMode = campo.inputmode ?? "text";
  }
  $("conf").hidden = false;
  (campo ? inp : no == null ? $("conf-si") : $("conf-no")).focus();
  return new Promise((ok) => {
    const fin = (v) => {
      $("conf").hidden = true;
      $("conf-si").onclick = $("conf-no").onclick = $("conf").onclick = null;
      removeEventListener("keydown", tecla, true);
      inp.blur();
      ok(campo ? (v ? inp.value : null) : v);
    };
    // Escape cancela; Intro acepta cuando se pide un texto. En captura, para que Escape no
    // cierre también la ventana que hay debajo.
    const tecla = (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        fin(false);
      } else if (e.key === "Enter" && campo && e.target === inp) {
        e.preventDefault();
        fin(true);
      }
    };
    addEventListener("keydown", tecla, true);
    $("conf-si").onclick = () => fin(true);
    $("conf-no").onclick = () => fin(false);
    $("conf").onclick = (e) => e.target === $("conf") && fin(false);
  });
}
