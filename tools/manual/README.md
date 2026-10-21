# Manual de instrucciones de Snake OS (PDF)

Genera el manual en PDF, en español y en inglés, con capturas reales de Snake OS.

- `content-es.mjs` / `content-en.mjs`: los textos, uno por idioma.
- `capture.mjs`: crea una cuenta de PRUEBA nueva en un servidor de pruebas y hace las capturas.
- `build.mjs`: plantilla HTML y Chrome headless (print-to-PDF).
- Salida en el repo: `assets/snake-manual-es.pdf.js` y `assets/snake-manual-en.pdf.js`.
  - Contienen el PDF en base64, porque `/static` no sirve `.pdf`.
  - `snake-manual.js` los convierte en un PDF descargable: pregunta al terminar de crear una cuenta, y está en Ajustes › Acerca de, en el menú Inicio y en la pantalla de inicio de sesión.

Requisitos: Node 18+, `playwright-core` (`npm i playwright-core` en esta carpeta; `node_modules` está en `.gitignore`), Google Chrome y poppler-utils (`pdftotext`, `pdfinfo`).

```bash
# 1) Servidor de pruebas con datos vacíos (nunca contra datos reales)
python -m uvicorn main:app --host 127.0.0.1 --port 8899
# 2) Capturas (una cuenta de prueba nueva por idioma)
node tools/manual/capture.mjs --lang es --out /tmp/manual-shots/es
node tools/manual/capture.mjs --lang en --out /tmp/manual-shots/en
# 3) PDF + assets/snake-manual-*.pdf.js
node tools/manual/build.mjs --shots /tmp/manual-shots --out /tmp/manual-pdf
```

Después sube `?v=` de `snake-manual.js` (constante `VER`) para que se descargue el PDF nuevo. El generador no es Python a propósito: auto-deploy reinicia el contenedor cuando cambia un `.py`.
