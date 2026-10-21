# Apps de código abierto de la Doganiero Store (Snake OS)

Estas apps se sirven tal cual desde `/static/assets/sra-*` (archivos planos, sin subcarpetas) y se abren
dentro de una ventana de Snake OS en un `<iframe srcdoc>` con una política CSP que solo permite cargar
recursos del propio Snake OS: **sin peticiones a internet, sin analíticas, sin anuncios, sin cuentas ni claves**.
El cargador es `snake-store-real.js`. Los textos completos de licencia están en `*-LICENSES.txt` de esta carpeta
y también se pueden ver desde la Store (botón «Licencia» de cada app).

| App | Versión | Licencia | Origen |
|---|---|---|---|
| Excalidraw | @excalidraw/excalidraw 0.17.6 (+ React 18.2.0) | MIT | https://github.com/excalidraw/excalidraw |
| miniPaint | 4.14.3 (dist/bundle.js) | MIT | https://github.com/viliusle/miniPaint |
| x-spreadsheet | x-data-spreadsheet 1.1.9 | MIT | https://github.com/myliang/x-spreadsheet |
| PDF.js | pdfjs-dist 4.10.38 + visor genérico oficial 4.10.38 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| Toast UI Editor | @toast-ui/editor 3.2.2 (all-in-one + es-ES) | MIT | https://github.com/nhn/tui.editor |
| Ace | ace-builds 1.36.5 | BSD-3-Clause | https://github.com/ajaxorg/ace-builds |
| Ajedrez Stockfish | stockfish.js 10.0.2 (asm.js), chess.js 0.10.3, chessboard.js 1.0.0, jQuery 3.7.1, piezas cburnett | GPL-3.0, BSD-2, MIT, MIT, GPLv2+ | https://github.com/nmrugg/stockfish.js · https://github.com/jhlywa/chess.js · https://github.com/oakmac/chessboardjs |
| 2048 | gabrielecirulli/2048 (master) | MIT (fuente Clear Sans: Apache-2.0) | https://github.com/gabrielecirulli/2048 |
| Hextris | Hextris/hextris (gh-pages) | GPL-3.0 (fuente Exo 2: OFL 1.1) | https://github.com/Hextris/hextris |
| A Dark Room | doublespeakgames/adarkroom (master) | MPL-2.0 | https://github.com/doublespeakgames/adarkroom |
| Códigos QR | qrcode-generator 1.4.4, jsQR 1.4.0 + interfaz propia | MIT, Apache-2.0 | https://github.com/kazuhikoarase/qrcode-generator · https://github.com/cozmo/jsQR |

## Cambios hechos para Snake OS (resumen)

Comunes: rutas de archivos renombradas a `sra-<app>-*` (el servidor solo sirve archivos planos), fuentes y
recursos incluidos en local (woff2), datos guardados por perfil (localStorage y cookies con prefijo propio,
IndexedDB `snkRealAppsV1`), idioma tomado de Snake OS (español / inglés).

- **Excalidraw**: rutas de fuentes/locales renombradas; menú sin enlaces externos ni selector de idioma; la escena se guarda sola.
- **miniPaint**: quitados «Abrir URL», «Plantilla de prueba», búsqueda de imágenes (Pixabay), enlaces externos y la lista de fuentes de Google; vaciadas las claves de API; corregidas 2 traducciones al español.
- **x-spreadsheet**: interfaz propia (nuevo, CSV, copia de seguridad) y traducción al español.
- **PDF.js**: visor oficial con `?file=` desactivado, scripting y `eval` desactivados, sin texto alternativo por IA, fuentes estándar y CMaps renombrados a `.ttf` (sólo cambia la extensión).
- **Toast UI Editor**: estadísticas de uso (Google Analytics) desactivadas y URL eliminada; barra propia (abrir/guardar .md, exportar HTML).
- **Ace**: módulos, temas y workers con rutas locales; interfaz propia con pestañas.
- **Ajedrez**: interfaz propia; Stockfish en Web Worker (asm.js), 10 niveles.
- **2048**: textos en español; quitado el aviso de «versión oficial».
- **Hextris**: quitados Google Analytics, el envío de la puntuación a un servidor, un script remoto, anuncios y botones para compartir; textos en español; fuentes Exo 2 convertidas a woff2.
- **A Dark Room**: quitados Google Analytics (gtag), promociones («get the app», Penrose), compartir, GitHub y redirecciones de móvil; audio FLAC convertido a AAC (.m4a, 48 kbps); traducción española oficial + algunos textos que faltaban.
- **Códigos QR**: interfaz nueva para Snake OS sobre las dos bibliotecas.

El código fuente original de cada app está en los repositorios enlazados (GPL/MPL: el código entregado aquí
no está minificado por nosotros; los archivos JavaScript servidos son la forma preferida para modificarlos o
los paquetes publicados por sus autores).
