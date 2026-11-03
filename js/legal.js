// Información legal de RailNav: condiciones de uso, privacidad y contacto. La muestran Ajustes →
// Información legal y la página legal.html (para enlazarla desde fuera de la app).
// Si cambia lo que hace la app con los datos (conexiones, lo que se guarda, plazos), hay que
// cambiar también este texto y la fecha.

export const ACTUALIZADO = "2 de noviembre de 2026";
export const CORREO = "joanvi.quesada@gmail.com";
export const REPOSITORIO = "https://github.com/joanvilajosana/railnav";

const correo = `<a href="mailto:${CORREO}">${CORREO}</a>`;

export const SECCIONES = [
  {
    id: "condiciones",
    titulo: "Condiciones de uso",
    html: `
<p>RailNav es una herramienta gratuita de ayuda para maquinistas. Muestra, en una pantalla de marcha, la información de la hoja de ruta y del documento de limitaciones temporales de velocidad (DLTV) que carga el propio usuario. La desarrolla Joan Vilajosana Quesada a título particular, sin relación con ADIF, Renfe, la Agencia Estatal de Seguridad Ferroviaria (AESF) ni ninguna empresa ferroviaria. Al usar RailNav aceptas estas condiciones.</p>
<h3>1. No es un sistema de seguridad</h3>
<p><b>RailNav es un servicio no oficial ni homologado por la AESF.</b> No forma parte de ningún sistema de protección o señalización del tren (ASFA, LZB, ERTMS u otros) y <b>no sustituye</b> la documentación reglamentaria (hoja de ruta, libro horario, DLTV, avisos, órdenes y consignas), ni las indicaciones de las señales, del puesto de mando o del responsable de circulación. Ante cualquier diferencia, <b>prevalecen siempre la documentación oficial y la señalización</b>.</p>
<h3>2. La responsabilidad de la conducción es del maquinista</h3>
<p>El maquinista sigue siendo el único responsable de la conducción y de cumplir el Reglamento General de Circulación y las normas de su empresa, incluidas las que regulan el uso de dispositivos electrónicos en cabina. Usa RailNav solo donde y cuando esté permitido, y nunca de forma que te distraiga de la conducción.</p>
<h3>3. Puede contener errores</h3>
<p>RailNav lee los PDF de forma automática y cruza sus datos. Puede leer mal, omitir o situar mal información: velocidades, limitaciones, puntos kilométricos, horarios o la posición del tren. Lo dudoso lo marca «a revisar», pero no garantiza detectar todos los errores. El trazado de la vía, la posición por GPS y las rutas de prueba salen de OpenStreetMap y del propio dispositivo, y también pueden ser inexactos.</p>
<h3>4. Sin garantía</h3>
<p>RailNav se ofrece gratis y «tal cual», sin garantía de exactitud, de disponibilidad ni de funcionamiento. En la medida en que la ley lo permite, el autor no responde de los daños que puedan derivarse de su uso.</p>
<h3>5. Tus documentos</h3>
<p>Los PDF que cargas se procesan solo en tu dispositivo (ver Privacidad). Eres responsable de tener derecho a usarlos. Las tablas de tramos que trae la app se basan en información pública.</p>
<h3>6. Licencias</h3>
<p>El código de RailNav es abierto, con licencia MIT (<a href="${REPOSITORIO}" target="_blank" rel="noopener">${REPOSITORIO.replace("https://", "")}</a>). Usa pdf.js (Apache 2.0) y datos de © colaboradores de OpenStreetMap (licencia ODbL).</p>
<h3>7. Cambios</h3>
<p>Estas condiciones pueden cambiar con nuevas versiones; las vigentes son las que muestra la app. Se rigen por la legislación española.</p>`,
  },
  {
    id: "privacidad",
    titulo: "Privacidad",
    html: `
<p><b>En resumen: RailNav no recoge ni envía tus datos.</b> No hay cuentas, ni servidor propio, ni analíticas, ni publicidad, ni informes de errores. Lo que cargas y lo que la app guarda se queda en tu dispositivo.</p>
<h3>Responsable</h3>
<p>Joan Vilajosana Quesada. Contacto: ${correo}.</p>
<h3>Qué se guarda en tu dispositivo</h3>
<ul>
<li>Las rutas generadas o cargadas, los DLTV leídos, las tablas de tramos que edites y los trazados de la vía.</li>
<li>Las grabaciones de recorrido, si las activas: la posición del dispositivo con la hora, segundo a segundo.</li>
<li>Los telefonemas que registres: número, hora, emisor, receptor, mensaje y firma (el apellido de quien lo da), y lo que prescriben. Solo salen del dispositivo si compartes el registro.</li>
<li>Tus preferencias: tema, volumen, disposición de la pantalla, modo de posición, avisos, longitud del tren, pictogramas editados.</li>
</ul>
<p>Se guardan en el almacenamiento del navegador (IndexedDB y localStorage) de este dispositivo. Nadie más puede verlos, tampoco el autor. Se borran desde Ajustes → Tus datos, o al eliminar la app del dispositivo.</p>
<h3>Ubicación</h3>
<p>RailNav solo pide la ubicación si eliges la posición por GPS o activas «Grabar recorrido», y siempre con el permiso del sistema. La usa en el dispositivo para situar el tren sobre la vía y <b>no la envía a ningún sitio</b>. Una grabación solo sale del dispositivo si tú la compartes (archivo GPX o JSON).</p>
<h3>Conexiones con terceros</h3>
<ul>
<li><b>GitHub Pages</b> (GitHub, Inc.) aloja la app. Al abrirla o actualizarla, como cualquier web, recibe tu dirección IP y datos técnicos del navegador. Consulta la <a href="https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">declaración de privacidad de GitHub</a>.</li>
<li><b>OpenStreetMap (servidores Overpass)</b>: solo al preparar el GPS de una ruta que no trae el trazado incluido. El dispositivo pide a overpass-api.de, overpass.kumi.systems u overpass.private.coffee las vías de la zona de la ruta; reciben tu dirección IP y la zona consultada, no tu posición.</li>
</ul>
<h3>Cookies</h3>
<p>RailNav no usa cookies. Usa el almacenamiento del navegador solo para funcionar y para recordar las preferencias que eliges; no hay rastreo ni publicidad, por eso no te pide consentimiento.</p>
<h3>Cuánto tiempo se guardan</h3>
<ul>
<li>Grabaciones de recorrido: se borran solas a los 30 días, salvo las que marques «Conservar».</li>
<li>Rutas y DLTV: se borran solos a los 30 días de guardarlos (una ruta cuenta desde la última vez que la abres; la que tienes abierta no se borra).</li>
<li>Telefonemas: se borran solos a los 30 días (antes puedes exportarlos en CSV para tu empresa).</li>
</ul>
<h3>Tus derechos</h3>
<p>En Ajustes → Tus datos puedes descargar una copia de todo lo guardado y borrarlo todo. Si escribes al autor (por ejemplo, para enviarle una grabación o avisar de un error), lo que mandes se usa solo para responderte y mejorar la app, y se borra cuando ya no hace falta; puedes pedir su supresión en ${correo}. También puedes reclamar ante la <a href="https://www.aepd.es" target="_blank" rel="noopener">Agencia Española de Protección de Datos</a>.</p>`,
  },
  {
    id: "contacto",
    titulo: "Contacto",
    html: `
<p>Para avisar de un error, proponer una mejora o cualquier consulta (también sobre privacidad):</p>
<p class="legal-correo">${correo}</p>
<p>También puedes abrir una incidencia en <a href="${REPOSITORIO}/issues" target="_blank" rel="noopener">GitHub</a>.</p>
<p>Si avisas de un error de lectura de una hoja o un DLTV, indica el número de tren, la fecha y qué esperabas ver. No envíes documentos que no tengas derecho a compartir.</p>`,
  },
];

/** HTML de una sección (o de todas) con su fecha. */
export function htmlLegal(id = null) {
  return (
    SECCIONES.filter((s) => !id || s.id === id)
      .map((s) => `<section class="legal" id="legal-${s.id}"><h2>${s.titulo}</h2>${s.html}</section>`)
      .join("") + `<p class="legal-fecha">Actualizado el ${ACTUALIZADO}.</p>`
  );
}
