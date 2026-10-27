// Compartir o guardar un archivo desde la app: en el iPad abre la hoja de compartir (AirDrop,
// Mensajes, Correo, Archivos…); donde no se puede, se descarga.

export async function compartirArchivo(nombre, contenido, tipo = "application/json") {
  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return "compartido";
    } catch (e) {
      if (e.name === "AbortError") return "cancelado";
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "descargado";
}
