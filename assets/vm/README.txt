Máquinas virtuales de Snake OS (2026.13) · archivos de terceros, sin modificar:
- libv86.js, v86.wasm: v86 0.5.472 (npm "v86", https://github.com/copy/v86), licencia BSD-2 (LICENSE-v86.txt).
- seabios.bin, vgabios.bin: SeaBIOS / VGA BIOS del repositorio de v86 (bios/), licencia LGPLv3.
- linux-bzimage.bin: imagen Linux de Buildroot (kernel 6.8 + BusyBox) que publica v86 (i.copy.sh/buildroot-bzImage68.bin),
  GPLv2; código fuente en kernel.org y buildroot.org.
Todo se ejecuta en el navegador de cada usuario (sin red); el servidor solo sirve estos archivos.
