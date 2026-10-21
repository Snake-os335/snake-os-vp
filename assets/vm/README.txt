Máquinas virtuales de Snake OS · archivos de terceros:
- libv86.js, v86.wasm: v86 0.5.472 (npm "v86", https://github.com/copy/v86), licencia BSD-2 (LICENSE-v86.txt).
- seabios.bin, vgabios.bin: SeaBIOS / VGA BIOS del repositorio de v86 (bios/), licencia LGPLv3.
- linux-bzimage.bin: imagen Linux de Buildroot (kernel 6.8 + BusyBox) que publica v86 (i.copy.sh/buildroot-bzImage68.bin),
  GPLv2; código fuente en kernel.org y buildroot.org.
- ../snkvm-xterm.js, ../snkvm-xterm.css, ../snkvm-xterm-fit.js: xterm.js 5.3.0 y @xterm/addon-fit 0.8.0
  (https://github.com/xtermjs/xterm.js), licencia MIT (LICENSE-xterm.txt). Solo se ha quitado el comentario sourceMappingURL.
El escritorio de Snake OS! Pro (snake-vm.js y snake-os-pro.html: barra de tareas, menú Inicio, ventanas, logotipo,
iconos y fondos) es obra propia de Snake OS; usa las letras Inter y Outfit de Snake OS (SIL OFL 1.1, ../fonts/OFL-*.txt).
Por debajo funciona el Linux ligero de arriba.
Todo se ejecuta en el navegador de cada usuario (sin red); el servidor solo sirve estos archivos.
