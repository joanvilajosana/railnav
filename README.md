# RailNav

Ayuda de consulta para maquinistas: lee la **hoja de ruta** y el **documento semanal de
limitaciones temporales de velocidad (DLTV)** de ADIF, los cruza y muestra la marcha en una
pantalla de estilo DMI: la velocidad máxima vigente, la siguiente, las LTV y los avisos por
proximidad.

**Abrir la app:** https://joanvilajosana.github.io/railnav/

> **Servicio no oficial ni homologado por la AESF.** RailNav es una herramienta de estudio y
> consulta. No forma parte de ningún sistema de seguridad del tren y no sustituye a la
> documentación reglamentaria ni a la señalización. Ante cualquier diferencia, prevalecen
> siempre la documentación oficial y las señales.

---

## Índice

1. [Qué hace](#qué-hace)
2. [Instalación](#instalación)
3. [Primeros pasos](#primeros-pasos)
4. [Guía de uso](#guía-de-uso)
5. [Preguntas frecuentes](#preguntas-frecuentes)
6. [Condiciones de uso](#condiciones-de-uso)
7. [Privacidad](#privacidad)
8. [Licencias](#licencias)
9. [Contacto](#contacto)
10. [Sobre este repositorio](#sobre-este-repositorio)

---

## Qué hace

- **Lee los PDF de ADIF en el propio dispositivo:** la hoja de ruta del tren, el DLTV de la
  semana y, si quieres, el cuadro de velocidades máximas (CVM). No se envían a ningún sitio.
- **Cruza la hoja con el DLTV** por línea, estación, punto kilométrico (PK) y vía, nunca por
  proximidad numérica.
- **Muestra la marcha:** velocidad máxima vigente, el siguiente cambio, las LTV y los avisos
  con pictogramas, a medida que avanza el tren.
- **Marca lo dudoso como «a revisar»:** una LTV que no ha podido situar con seguridad no
  cambia la velocidad, pero aparece en pantalla para que la compruebes.
- **Funciona sin conexión** una vez instalada.
- **Sin cuentas, analíticas ni publicidad.**

Está pensada para iPad y también se adapta al iPhone.

## Instalación

RailNav es una aplicación web instalable (PWA): no está en la App Store, se instala desde el
navegador.

### iPad e iPhone (Safari)

1. Abre https://joanvilajosana.github.io/railnav/ en **Safari**.
2. Pulsa **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **«Añadir a pantalla de inicio»** y confirma.
4. Abre RailNav desde el icono nuevo. A partir de aquí funciona sin conexión.

### Otros dispositivos

En Android o en el ordenador, ábrela con Chrome o Edge y usa «Instalar aplicación» en el
menú del navegador. También funciona sin instalar, en una pestaña normal.

### Actualizaciones

La app se actualiza sola: al abrirla con conexión descarga la versión nueva, que se aplica la
siguiente vez que la abres. La versión instalada aparece en Ajustes.

### Desinstalar

Mantén pulsado el icono y elige «Eliminar app». Así se borra también todo lo que la app
guardaba en el dispositivo.

## Primeros pasos

Para ver cómo funciona sin documentos propios: **Ajustes → Rutas guardadas → «Ruta de
demostración»**. Es una ruta sintética (inventada), solo para probar la pantalla.

## Guía de uso

### 1. Generar una ruta

En **Ajustes → Nueva ruta**:

1. **DLTV de la semana:** elige el PDF. Basta una vez por semana: queda leído y guardado.
2. **Hoja de ruta:** elige el PDF del día.
3. **CVM** (opcional): el cuadro de velocidades máximas de ADIF. Con él, cada ruta se
   compara con el CVM y las diferencias quedan «a revisar». En **«Si la hoja y el CVM no
   coinciden»** eliges qué rige al generar la ruta: la más restrictiva (por defecto), la hoja
   o el CVM.
4. Pulsa **«Generar ruta»**.

**Tablas de tramos:** para cruzar la hoja con el DLTV, RailNav necesita saber a qué línea de
ADIF pertenece cada tramo de la ruta. La app trae las de rutas conocidas. Si la ruta es
nueva, propone las líneas a partir del DLTV: compruébalas, corrígelas si hace falta y
confírmalas. La tabla queda guardada para la próxima vez (Ajustes → Tablas de tramos).

Las rutas generadas aparecen en **Ajustes → Rutas guardadas**. También se puede cargar un
paquete de ruta (`.railnav.json`) preparado en otro dispositivo.

### 2. La pantalla de marcha

- **Velocidad máxima vigente** y **siguiente cambio**, con la distancia hasta él.
- **LTV** del DLTV que afectan a la ruta, con su tramo de PK y su vía.
- **CSV** (señalados en azul en la hoja de ADIF): RailNav respeta lo que marca la hoja, no
  los calcula.
- **Avisos** con pictogramas a la distancia configurada. Se pueden editar en Ajustes →
  Pictogramas (forma, colores, distancia y mensaje).
- **«A revisar»:** todo lo que la app no ha podido leer o situar con seguridad. Compruébalo
  siempre en la documentación oficial.

En la vista **Datos** tienes la ficha del tren, la hoja de ruta original, el DLTV y, si lo has
cargado, el cotejo con el CVM.

### 3. Posición del tren

En **Ajustes → Posición del tren**:

- **Manual:** avanzas tú la posición.
- **Simulación:** el tren avanza solo según el horario, a la velocidad que elijas.
- **GPS:** la posición sale del GPS del dispositivo, ajustada al trazado de la vía. Para una
  ruta nueva, pulsa **«Preparar el GPS de esta ruta»** una vez con conexión; después
  funciona sin ella. Si las lecturas no son buenas, la app avisa de que la posición no es
  fiable. Un iPad solo Wi-Fi no tiene GPS: se sitúa por las redes Wi-Fi cercanas, con mucha
  menos precisión.

Para probar sin tren: **GPS simulado** (un tren ficticio con errores y túneles). **Grabar
recorrido** guarda la posición durante un viaje para medir la precisión.

### 4. Durante la marcha

- **Avisos sonoros:** se activan o silencian en Ajustes → Durante la marcha.
- **Adelanto o retraso** respecto al horario de la hoja.
- **Longitud del tren:** para que los avisos tengan en cuenta la cola del tren.
- **Pantalla:** disposición automática, de teléfono o de tablet, tamaño de los paneles y
  pantalla siempre encendida.

### 5. Telefonemas

Puedes registrar los telefonemas del viaje (número, hora, emisor, receptor, mensaje y
firma). Se exportan en CSV para la empresa y se borran solos a los 30 días.

### 6. Tus datos

En **Ajustes → Tus datos**:

- **Descargar copia de seguridad:** un solo archivo con todo lo guardado. Sirve para cambiar
  de dispositivo o pasar rutas, DLTV, CVM o tablas de tramos a un compañero.
- **Importar una copia:** eliges qué se incorpora.
- **Borrar todos los datos.**

## Preguntas frecuentes

**¿Necesito conexión?** Solo para instalarla, actualizarla y preparar el GPS de una ruta
nueva. Lo demás funciona sin conexión.

**¿Envía mis documentos o mi posición a algún sitio?** No. Los PDF se leen en el
dispositivo y la posición se usa solo en él. Ver [Privacidad](#privacidad).

**Una velocidad o una LTV no coincide con el documento.** Prevalece siempre el documento
oficial. Avisa del error (ver [Contacto](#contacto)) con el número de tren, la fecha y lo que
esperabas ver.

**El CVM avisa de páginas que no puede leer.** Algunas páginas de ciertos CVM son dibujos
sin texto y no se pueden leer en el dispositivo. En esos tramos vale la hoja de ruta.

**¿Las rutas de prueba desde el CVM sirven para circular?** No. No llevan hoja de ruta,
horario ni paradas: son solo para probar el GPS.

## Condiciones de uso

Resumen (el texto completo está en la app, Ajustes → Información legal, y en
[legal.html](https://joanvilajosana.github.io/railnav/legal.html)):

1. **No es un sistema de seguridad.** Servicio no oficial ni homologado por la AESF. No
   sustituye a la hoja de ruta, el libro horario, el DLTV, los avisos, las órdenes, las
   consignas ni las señales.
2. **La responsabilidad de la conducción es del maquinista**, que debe cumplir el Reglamento
   General de Circulación y las normas de su empresa, también las del uso de dispositivos
   electrónicos en cabina.
3. **Puede contener errores** de lectura, de cruce o de posición. Lo dudoso se marca «a
   revisar», pero no se garantiza detectarlo todo.
4. **Sin garantía.** Se ofrece gratis y «tal cual». En la medida en que la ley lo permite,
   el autor no responde de los daños derivados de su uso.
5. **Tus documentos:** eres responsable de tener derecho a usar los PDF que cargas.
6. RailNav lo desarrolla Joan Vilajosana Quesada a título particular, sin relación con ADIF,
   Renfe, la AESF ni ninguna empresa ferroviaria.
7. Las condiciones pueden cambiar con nuevas versiones y se rigen por la legislación
   española.

## Privacidad

**RailNav no recoge ni envía tus datos.** No hay cuentas, servidor propio, analíticas,
publicidad, informes de errores ni cookies.

- **Qué se guarda y dónde:** las rutas, DLTV, CVM, tablas de tramos, trazados, grabaciones
  de recorrido, telefonemas y preferencias se guardan solo en el almacenamiento del
  navegador de tu dispositivo (IndexedDB y localStorage). Nadie más puede verlos, tampoco el
  autor.
- **Ubicación:** solo se pide si eliges la posición por GPS o grabas un recorrido, siempre
  con el permiso del sistema. No sale del dispositivo, salvo que tú compartas una grabación.
- **Plazos:** rutas, DLTV y telefonemas se borran solos a los 30 días. Los CVM y las
  grabaciones se guardan hasta que los borras.
- **Terceros:**
  - **GitHub Pages** aloja la app y, como cualquier web, recibe tu dirección IP y datos
    técnicos del navegador al abrirla o actualizarla
    ([privacidad de GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement)).
  - **OpenStreetMap (servidores Overpass)**, solo al preparar el GPS de una ruta que no trae
    el trazado: reciben tu IP y la zona de la ruta, no tu posición.
- **Tus derechos:** en Ajustes → Tus datos puedes descargar una copia de todo y borrarlo.
  Si escribes al autor, lo que envíes se usa solo para responderte y mejorar la app.
  Responsable: Joan Vilajosana Quesada (joanvi.quesada@gmail.com). Puedes reclamar ante la
  [Agencia Española de Protección de Datos](https://www.aepd.es).

## Licencias

- **Código de RailNav:** licencia [MIT](LICENSE). © 2026 Joan Vilajosana Quesada.
- **pdf.js** (lectura de PDF): Apache 2.0, ver `vendor/pdfjs/LICENSE`.
- **Trazado de la vía:** datos © colaboradores de
  [OpenStreetMap](https://www.openstreetmap.org/copyright), licencia ODbL.
- Este repositorio **no contiene documentos de ADIF**. La licencia MIT cubre solo el código
  de RailNav, no los documentos que cada usuario carga.

## Contacto

- Errores, mejoras o consultas (también de privacidad): **joanvi.quesada@gmail.com**
- O abre una incidencia en [GitHub Issues](https://github.com/joanvilajosana/railnav/issues).

Si avisas de un error de lectura, indica el número de tren, la fecha y qué esperabas ver.
No envíes documentos que no tengas derecho a compartir.

## Sobre este repositorio

Contiene la app publicada tal como se sirve en GitHub Pages (HTML, CSS y JavaScript, sin
paso de compilación). Para probarla en local:

```
python -m http.server 8000
```

y abre http://localhost:8000.

---

Desarrollado por Joan Vilajosana Quesada. Servicio no oficial ni homologado por la AESF.
