<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/logo_horizontal_noche.png">
  <img src="img/logo_horizontal_dia.png" alt="RailNav" width="420">
</picture>

### 🚆 La hoja de ruta y las LTV, en una pantalla de marcha

Lee la **hoja de ruta** y el **DLTV semanal** de ADIF, los cruza y te muestra la velocidad
máxima vigente, la siguiente y los avisos a medida que avanza el tren.

<br>

[![Abrir la app](https://img.shields.io/badge/▶_Abrir_RailNav-joanvilajosana.github.io%2Frailnav-0A84FF?style=for-the-badge)](https://joanvilajosana.github.io/railnav/)

![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?style=flat-square)
![Sin conexión](https://img.shields.io/badge/funciona-sin_conexión-2EA043?style=flat-square)
![iPad · iPhone](https://img.shields.io/badge/iPad_·_iPhone-Safari-555?style=flat-square&logo=apple)
![Privacidad](https://img.shields.io/badge/datos-solo_en_tu_dispositivo-2EA043?style=flat-square)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-yellow?style=flat-square)](LICENSE)

</div>

<br>

> [!WARNING]
> **⚠️ Servicio no oficial ni homologado por la AESF.** RailNav es una herramienta de estudio y
> consulta. No forma parte de ningún sistema de seguridad del tren y **no sustituye** a la
> documentación reglamentaria ni a la señalización. Ante cualquier diferencia, **prevalecen
> siempre la documentación oficial y las señales.**

---

## 📑 Índice

| | | |
|---|---|---|
| ✨ [Qué hace](#-qué-hace) | 📲 [Instalación](#-instalación) | 🚀 [Primeros pasos](#-primeros-pasos) |
| 📖 [Guía de uso](#-guía-de-uso) | ❓ [Preguntas frecuentes](#-preguntas-frecuentes) | 📜 [Condiciones de uso](#-condiciones-de-uso) |
| 🔒 [Privacidad](#-privacidad) | ⚖️ [Licencias](#️-licencias) | ✉️ [Contacto](#️-contacto) |

---

## ✨ Qué hace

| | |
|---|---|
| 📄 **Lee los PDF en tu dispositivo** | Hoja de ruta, DLTV de la semana y, si quieres, el CVM. No se envían a ningún sitio. |
| 🔗 **Cruza hoja y DLTV** | Por línea, estación, PK y vía. Nunca por proximidad numérica. |
| 🖥️ **Pantalla de estilo DMI** | Velocidad máxima vigente, siguiente cambio, LTV y avisos con pictogramas. |
| 🔎 **Lo dudoso, a la vista** | Lo que no se ha podido situar con seguridad aparece «a revisar» y no cambia la velocidad. |
| 📡 **GPS opcional** | Sitúa el tren sobre el trazado de la vía. |
| ✈️ **Sin conexión** | Una vez instalada, funciona sin cobertura. |
| 🙅 **Sin cuentas** | Ni analíticas, ni publicidad, ni cookies. |

---

## 📲 Instalación

RailNav es una **aplicación web instalable (PWA)**: no está en la App Store, se instala desde
el navegador en menos de un minuto.

### 🍎 iPad e iPhone (Safari)

| Paso | |
|:---:|---|
| **1** | Abre **[joanvilajosana.github.io/railnav](https://joanvilajosana.github.io/railnav/)** en **Safari**. |
| **2** | Pulsa **Compartir** ⬆️ (el cuadrado con la flecha). |
| **3** | Elige **«Añadir a pantalla de inicio»** ➕ y confirma. |
| **4** | Abre RailNav desde el icono nuevo. ✅ Ya funciona sin conexión. |

### 🤖 Android y 💻 ordenador

Ábrela con **Chrome** o **Edge** y usa **«Instalar aplicación»** en el menú del navegador.
También funciona sin instalar, en una pestaña normal.

### 🔄 Actualizaciones

La app se actualiza sola: al abrirla con conexión descarga la versión nueva, que se aplica la
siguiente vez que la abres. La versión instalada aparece en **Ajustes**.

### 🗑️ Desinstalar

Mantén pulsado el icono y elige **«Eliminar app»**. Así se borra también todo lo que la app
guardaba en el dispositivo.

---

## 🚀 Primeros pasos

¿Quieres verla funcionar sin documentos propios?

> **Ajustes → Rutas guardadas → «Ruta de demostración»** 🎬
>
> Es una ruta sintética (inventada), solo para probar la pantalla.

---

## 📖 Guía de uso

### 1️⃣ Generar una ruta

En **Ajustes → Nueva ruta**:

```
 📄 DLTV de la semana  ──┐
 📄 Hoja de ruta del día ─┼──▶  ⚙️ Generar ruta  ──▶  🚆 Pantalla de marcha
 📄 CVM (opcional)  ─────┘
```

1. 📅 **DLTV de la semana:** elige el PDF. Basta una vez por semana: queda leído y guardado.
2. 🗒️ **Hoja de ruta:** elige el PDF del día.
3. 📊 **CVM** *(opcional)*: con él, cada ruta se compara con el cuadro de velocidades
   máximas y las diferencias quedan «a revisar». En **«Si la hoja y el CVM no coinciden»**
   eliges qué rige: **la más restrictiva** (por defecto), la hoja o el CVM.
4. ▶️ Pulsa **«Generar ruta»**.

> [!TIP]
> 🛤️ **Tablas de tramos.** Para cruzar la hoja con el DLTV, RailNav necesita saber a qué línea
> de ADIF pertenece cada tramo. La app trae las de rutas conocidas. Si la ruta es nueva,
> **propone las líneas** a partir del DLTV: compruébalas, corrígelas si hace falta y
> confírmalas. Quedan guardadas para la próxima vez (**Ajustes → Tablas de tramos**).

Las rutas generadas aparecen en **Ajustes → Rutas guardadas**. También se puede cargar un
paquete de ruta (`.railnav.json`) preparado en otro dispositivo.

### 2️⃣ La pantalla de marcha

| | |
|:---:|---|
| 🔢 | **Velocidad máxima vigente** y **siguiente cambio**, con la distancia hasta él. |
| 🚧 | **LTV** del DLTV que afectan a la ruta, con su tramo de PK y su vía. |
| 🟦 | **CSV**: lo que la hoja de ADIF marca en azul. RailNav lo respeta, no lo calcula. |
| 🔔 | **Avisos** con pictogramas a la distancia configurada (editables en **Ajustes → Pictogramas**). |
| 🔎 | **«A revisar»**: lo que la app no ha podido leer o situar con seguridad. Compruébalo siempre en la documentación oficial. |

En la vista **Datos** tienes la ficha del tren, la hoja de ruta original, el DLTV y, si lo
has cargado, el cotejo con el CVM.

### 3️⃣ Posición del tren

En **Ajustes → Posición del tren**:

| Modo | Cómo funciona |
|---|---|
| ✋ **Manual** | Avanzas tú la posición. |
| ⏱️ **Simulación** | El tren avanza solo según el horario, a la velocidad que elijas. |
| 📡 **GPS** | La posición sale del GPS del dispositivo, ajustada al trazado de la vía. |

> [!NOTE]
> 📡 Para una ruta nueva, pulsa **«Preparar el GPS de esta ruta»** una vez con conexión;
> después funciona sin ella. Si las lecturas no son buenas, la app avisa de que la **posición
> no es fiable**. Un iPad solo Wi-Fi no tiene GPS: se sitúa por las redes Wi-Fi cercanas, con
> mucha menos precisión.

🧪 **Para probar sin tren:** **GPS simulado** (un tren ficticio con errores y túneles).
🎙️ **Grabar recorrido** guarda la posición durante un viaje para medir la precisión.

### 4️⃣ Durante la marcha

- 🔊 **Avisos sonoros:** se activan o silencian en **Ajustes → Durante la marcha**.
- 🕐 **Adelanto o retraso** respecto al horario de la hoja.
- 📏 **Longitud del tren:** para que los avisos tengan en cuenta la cola.
- 🖥️ **Pantalla:** disposición automática, de teléfono o de tablet, tamaño de los paneles y
  pantalla siempre encendida.

### 5️⃣ Telefonemas ☎️

Registra los telefonemas del viaje: número, hora, emisor, receptor, mensaje y firma. Se
exportan en **CSV** para la empresa y se borran solos a los 30 días.

### 6️⃣ Tus datos 💾

En **Ajustes → Tus datos**:

| | |
|---|---|
| ⬇️ **Descargar copia de seguridad** | Un solo archivo con todo. Sirve para cambiar de dispositivo o pasar rutas, DLTV, CVM o tablas a un compañero. |
| ⬆️ **Importar una copia** | Eliges qué se incorpora. |
| 🗑️ **Borrar todos los datos** | Deja la app como recién instalada. |

---

## ❓ Preguntas frecuentes

<details>
<summary>📶 <b>¿Necesito conexión?</b></summary>

<br>

Solo para instalarla, actualizarla y preparar el GPS de una ruta nueva. Lo demás funciona
sin conexión.
</details>

<details>
<summary>🔒 <b>¿Envía mis documentos o mi posición a algún sitio?</b></summary>

<br>

No. Los PDF se leen en el dispositivo y la posición se usa solo en él. Ver
[Privacidad](#-privacidad).
</details>

<details>
<summary>⚠️ <b>Una velocidad o una LTV no coincide con el documento</b></summary>

<br>

Prevalece **siempre** el documento oficial. Avisa del error (ver [Contacto](#️-contacto)) con
el número de tren, la fecha y lo que esperabas ver.
</details>

<details>
<summary>📊 <b>El CVM avisa de páginas que no puede leer</b></summary>

<br>

Algunas páginas de ciertos CVM son dibujos sin texto y no se pueden leer en el dispositivo.
En esos tramos vale la hoja de ruta.
</details>

<details>
<summary>🧪 <b>¿Las rutas de prueba desde el CVM sirven para circular?</b></summary>

<br>

No. No llevan hoja de ruta, horario ni paradas: son solo para probar el GPS.
</details>

---

## 📜 Condiciones de uso

> 📄 Texto completo en la app (**Ajustes → Información legal**) y en
> **[legal.html](https://joanvilajosana.github.io/railnav/legal.html)**.

| | |
|:---:|---|
| 🚫 | **No es un sistema de seguridad.** Servicio no oficial ni homologado por la AESF. No sustituye a la hoja de ruta, el libro horario, el DLTV, los avisos, las órdenes, las consignas ni las señales. |
| 👷 | **La responsabilidad de la conducción es del maquinista**, que debe cumplir el Reglamento General de Circulación y las normas de su empresa, también las del uso de dispositivos electrónicos en cabina. |
| 🐞 | **Puede contener errores** de lectura, de cruce o de posición. Lo dudoso se marca «a revisar», pero no se garantiza detectarlo todo. |
| 🎁 | **Sin garantía.** Se ofrece gratis y «tal cual». En la medida en que la ley lo permite, el autor no responde de los daños derivados de su uso. |
| 📄 | **Tus documentos:** eres responsable de tener derecho a usar los PDF que cargas. |
| 🧑‍💻 | Desarrollada por Joan Vilajosana Quesada a título particular, **sin relación con ADIF, Renfe, la AESF ni ninguna empresa ferroviaria**. |
| 🇪🇸 | Las condiciones pueden cambiar con nuevas versiones y se rigen por la legislación española. |

---

## 🔒 Privacidad

> [!IMPORTANT]
> **RailNav no recoge ni envía tus datos.** Sin cuentas, sin servidor propio, sin analíticas,
> sin publicidad, sin informes de errores y sin cookies.

| | |
|---|---|
| 📱 **Dónde se guarda** | Rutas, DLTV, CVM, tablas de tramos, trazados, grabaciones, telefonemas y preferencias: **solo en el navegador de tu dispositivo** (IndexedDB y localStorage). Nadie más puede verlos, tampoco el autor. |
| 📍 **Ubicación** | Solo si eliges la posición por GPS o grabas un recorrido, siempre con el permiso del sistema. **No sale del dispositivo**, salvo que tú compartas una grabación. |
| ⏳ **Plazos** | Rutas, DLTV y telefonemas: se borran solos a los **30 días**. CVM y grabaciones: hasta que los borras. |
| 🧑‍⚖️ **Tus derechos** | En **Ajustes → Tus datos** descargas una copia de todo o lo borras. Puedes reclamar ante la [AEPD](https://www.aepd.es). |
| 👤 **Responsable** | Joan Vilajosana Quesada · joanvi.quesada@gmail.com |

**🌐 Conexiones con terceros**

- **GitHub Pages** aloja la app y, como cualquier web, recibe tu dirección IP y datos
  técnicos del navegador al abrirla o actualizarla
  ([privacidad de GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement)).
- **OpenStreetMap (servidores Overpass)**, solo al preparar el GPS de una ruta que no trae el
  trazado: reciben tu IP y la zona de la ruta, **no tu posición**.

Si escribes al autor, lo que envíes se usa solo para responderte y mejorar la app.

---

## ⚖️ Licencias

| Componente | Licencia |
|---|---|
| 🚆 Código de RailNav | [MIT](LICENSE) · © 2026 Joan Vilajosana Quesada |
| 📄 [pdf.js](https://mozilla.github.io/pdf.js/) (lectura de PDF) | Apache 2.0 · ver `vendor/pdfjs/LICENSE` |
| 🗺️ Trazado de la vía | © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright) · ODbL |

> [!NOTE]
> 📦 Este repositorio **no contiene documentos de ADIF**. La licencia MIT cubre solo el código
> de RailNav, no los documentos que cada usuario carga.

---

## ✉️ Contacto

<div align="center">

**🐞 Errores · 💡 Mejoras · 🔒 Privacidad**

📧 **joanvi.quesada@gmail.com**

[![Abrir una incidencia](https://img.shields.io/badge/GitHub-abrir_una_incidencia-181717?style=for-the-badge&logo=github)](https://github.com/joanvilajosana/railnav/issues)

</div>

> 💬 Si avisas de un error de lectura, indica el **número de tren**, la **fecha** y **qué
> esperabas ver**. No envíes documentos que no tengas derecho a compartir.

---

<details>
<summary>🛠️ <b>Sobre este repositorio</b></summary>

<br>

Contiene la app publicada tal como se sirve en GitHub Pages: HTML, CSS y JavaScript, sin paso
de compilación. Para probarla en local:

```
python -m http.server 8000
```

y abre http://localhost:8000.
</details>

<br>

<div align="center">
<sub>🚆 Desarrollado por <b>Joan Vilajosana Quesada</b> · Servicio no oficial ni homologado por la AESF</sub>
</div>
