// Manual de instrucciones de Snake OS · texto en español.
// Cada capítulo: { id, ico, title, intro, s: [ { h, p: [], ul: [], img, cap, tip, warn, cols } ] }
// **negrita**, `tecla`. Las imágenes son capturas reales (capture.mjs) o archivos de /assets (asset:...).
export default {
  lang: 'es',
  docTitle: 'Manual de instrucciones de Snake OS!',
  cover: { kicker: 'Manual de instrucciones', title: 'Snake OS!', sub: 'Aprende a usar tu sistema operativo en el navegador: el escritorio, los ajustes y todas las apps.', ver: 'Versión', powered: 'powered by Doganiero OS! 3' },
  tocTitle: 'Índice',
  footer: 'Snake OS! · Manual de instrucciones',
  page: 'Página',
  chapters: [
    { id: 'bienvenida', ico: '👋', title: 'Bienvenida', intro: 'Snake OS! es un sistema operativo completo que funciona dentro del navegador. No hay que instalar nada en el ordenador: entras con tu cuenta Dogaemail y tienes tu escritorio, tus archivos y tus apps en cualquier ordenador o móvil.',
      s: [
        { h: 'Qué puedes hacer con Snake OS', ul: [
          '**Trabajar**: Notas, Calendario, Explorador de archivos, Calculadora, Code Lab, Terminal y Navegador.',
          '**Comunicarte**: Doganiero Chat (mensajes, fotos, llamadas y videollamadas), Teléfono con tu número DOG y Doganiero Desk para controlar otro escritorio.',
          '**Usar la inteligencia artificial**: Doganiero AI responde, genera imágenes y abre apps; Doganiero Bots trabaja por ti.',
          '**Jugar y divertirte**: Doganiero Store, Snake, Snake Racing 3D, Los Snakes, Doganiero TV y Doganiero Metaverse.',
          '**Probar otro sistema**: Máquinas virtuales, un Linux de verdad con escritorio estilo Ubuntu 26.10 dentro del navegador.'
        ] },
        { h: 'Cómo está organizado este manual', p: ['Empieza por **Primeros pasos** si acabas de crear tu cuenta. Después, los capítulos del escritorio, la barra de tareas, las ventanas y los Ajustes te enseñan a moverte por el sistema. Al final tienes una guía de cada app, trucos, atajos de teclado y preguntas frecuentes.'],
          tip: 'Puedes volver a descargar este manual cuando quieras: **Ajustes › Acerca de › Manual de instrucciones**, el botón **Manual de instrucciones** del menú Inicio o el de la pantalla de inicio de sesión.' },
        { h: 'Qué necesitas', ul: [
          'Un navegador moderno (Chrome, Edge, Firefox o Safari) en el ordenador o en el móvil.',
          'Una cuenta de Dogaemail (tu correo@dogaemail.com). Se crea en un minuto desde la pantalla de inicio.',
          'Conexión a internet. Algunas cosas funcionan sin red dentro del navegador, como las Máquinas virtuales.'
        ] }
      ] },

    { id: 'primeros-pasos', ico: '🚀', title: 'Primeros pasos', intro: 'Así se crea la cuenta, se instala Snake OS por primera vez y se entra y sale del sistema.',
      s: [
        { h: 'La pantalla de inicio de sesión', p: ['Al abrir Snake OS verás la hora, la fecha, un saludo y el próximo festivo. Escribe tu correo de Dogaemail y tu contraseña y pulsa **Iniciar sesión**. Si todavía no tienes cuenta, pulsa **Crear cuenta**. El botón **Manual de instrucciones** descarga este manual sin iniciar sesión.'], img: 'login', cap: 'Pantalla de inicio de sesión.' },
        { h: 'Crear una cuenta', p: ['Escribe tu nombre y tu correo (por ejemplo tu correo@dogaemail.com), elige una imagen de perfil y escribe dos veces una contraseña de al menos 4 caracteres. Pulsa **Crear cuenta**.'],
          ul: ['No se pueden crear cuentas nuevas con Gmail: usa otro correo, como uno de Dogaemail.', 'Cada correo solo puede tener una cuenta.', 'La foto o el emoji de perfil se pueden cambiar después en **Mi perfil**.'],
          img: 'signup', cap: 'Formulario para crear una cuenta.' },
        { h: 'La instalación de Snake OS', p: ['La primera vez que entras con una cuenta nueva, Snake OS termina de instalarse:'],
          ul: [
            '**Bienvenida**: pulsa **Iniciar tutorial**.',
            '**Tutorial**: un recorrido de 9 pasos (escritorio, barra de inicio, Doganiero AI, Chat, Store, Metaverse, contraseña, brillo y Ajustes) con voz. Pulsa **Siguiente** para avanzar o **Saltar** para terminarlo.',
            '**Terminar de instalar Snake OS**: después del tutorial, en el escritorio solo hay un icono. Púlsalo y Snake OS se reinicia con todas las apps.',
            '**Snake OS Kids**: te pregunta si quieres activar el modo para niños en ese perfil. Si dices que no, no vuelve a preguntar.',
            '**Manual de instrucciones**: te pregunta «¿Quieres descargar el manual de instrucciones de Snake OS?». Solo se descarga si pulsas **Sí**, y no vuelve a preguntar.'
          ], imgs: ['welcome', 'tutorial', 'finish-install', 'manual-ask'], caps: ['Bienvenida.', 'Tutorial: paso de la barra de inicio.', 'Icono «Terminar de instalar Snake OS».', 'Pregunta del manual al terminar la instalación.'] },
        { h: 'Perfiles: cada cuenta tiene lo suyo', p: ['Cada cuenta de Dogaemail es un **perfil**. Tus ajustes (tema, fondo, brillo, salvapantallas, modo trabajo, emojis, cursor, apps fijadas y recientes…), tus notas, archivos y partidas se guardan en tu perfil. Si en el mismo navegador entra otra persona con su cuenta, verá lo suyo, no lo tuyo.'] },
        { h: 'Contraseña, bloquear y cerrar sesión', ul: [
          '**Cambiar la contraseña**: abre **Mi perfil**, escribe la nueva contraseña dos veces y pulsa **Guardar cambios**. Tu contraseña no se comparte con nadie.',
          '**Bloquear la cuenta**: en **Ajustes rápidos** (⚙️) pulsa **Bloquear cuenta**. La cuenta se bloquea en todos tus dispositivos sin cerrar la sesión; para volver escribe tu contraseña y pulsa **Desbloquear**.',
          '**Cerrar sesión**: en el menú Inicio pulsa **Cerrar sesión**.',
          '**Apagar**: en el menú Inicio pulsa **Apagar**. Snake OS se apaga y aparece el botón **Volver a iniciar equipo**.'
        ] },
        { h: 'Idioma', p: ['Snake OS se pone en español automáticamente en España. Para cambiar entre español e inglés pulsa el botón **🌐 Idioma** de **Ajustes rápidos**. Los nombres propios, como los de tus serpientes de Los Snakes, nunca se traducen.'] }
      ] },

    { id: 'escritorio', ico: '🖥️', title: 'El escritorio', intro: 'El escritorio es tu pantalla principal: los iconos abren las apps y puedes ordenarlo a tu gusto.',
      s: [
        { h: 'Iconos', img: 'desktop', cap: 'El escritorio con el fondo «Minimal».', ul: [
          'Un clic en un icono abre su app.',
          'Arrastra los iconos para moverlos; Snake OS recuerda dónde los dejas. **Ajustes › Escritorio › Ordenar iconos** los vuelve a poner en su cuadrícula.',
          'Las apps que instalas desde Doganiero Store se pueden arrastrar a la Papelera para quitarlas. Las de Snake OS no.'
        ] },
        { h: 'Menú del clic derecho', p: ['Haz clic derecho en una zona vacía del escritorio para cambiar el fondo, cambiar el tema claro/oscuro, ordenar los iconos, crear una carpeta o una nota, abrir el Explorador, buscar apps, hacer una captura de pantalla o abrir los Ajustes rápidos.'], img: 'context', cap: 'Menú del clic derecho.', small: true },
        { h: 'Fondo de pantalla', p: ['Pulsa el botón 🎨 de la barra de tareas (o **Cambiar fondo** en el clic derecho). Elige uno de los fondos de Snake OS (bosque, océano, atardecer, nebulosa y varios de serpientes) o pulsa **Subir imagen o GIF** para usar tu propia imagen o un GIF animado de hasta 10 MB. El fondo solo cambia en tu cuenta.'], img: 'wallpaper', cap: 'Elegir fondo de pantalla.', small: true },
        { h: 'Más cosas del escritorio', ul: [
          '**Búsqueda global** (`Ctrl+K` o `Ctrl+Espacio`): busca apps, notas, archivos, eventos, contactos de Chat y ajustes.',
          '**Escritorios virtuales**: los botones 1, 2, 3 y 4 de la barra de tareas. `Ctrl+Alt+←/→` cambia de escritorio y `Ctrl+Alt+Mayús+←/→` mueve la ventana.',
          '**Widgets**: reloj, próximos eventos, notas fijadas y saldo de huesitos y monedas. Se activan en **Ajustes › Escritorio** y se pueden mover.',
          '**Portapapeles**: `Alt+V` muestra lo que has copiado dentro de Snake OS para volver a pegarlo.',
          '**Captura de pantalla**: botón 📸 o `Ctrl+Shift+S`. Las capturas se guardan en la app Capturas.'
        ] }
      ] },

    { id: 'barra', ico: '🧭', title: 'Barra de tareas y menú Inicio', intro: 'La barra de tareas de cristal está abajo. Desde ella abres el menú Inicio, cambias entre apps y llegas a los ajustes rápidos y a las notificaciones.',
      s: [
        { h: 'Partes de la barra de tareas', ul: [
          '**Tu perfil** a la izquierda y, a su lado, **las apps abiertas** (con su nombre si cabe). Clic: traer al frente, restaurar o minimizar. Clic central o clic derecho: cerrar.',
          '**Botón de Snake OS** (el logo) en el centro: abre el menú Inicio.',
          '**Escritorios 1–4** y botones rápidos: 💼 modo trabajo, 🔎 buscar, 📸 captura, 🎨 fondo y ⚙️ ajustes rápidos.',
          'A la derecha: **batería** del dispositivo (si el navegador la indica), la **campana** de notificaciones y el **reloj** con la fecha.'
        ] },
        { h: 'El menú Inicio', p: ['Pulsa el logo de Snake OS. Arriba hay un buscador (escribe y pulsa `Intro` para abrir la primera app). Debajo están las apps **Fijadas**, tus **Recientes** (las últimas 6 de tu perfil) y, abajo, tu nombre, **Cerrar sesión** y **Apagar**. El botón **Manual de instrucciones** descarga este manual. **Más opciones ›** abre el menú clásico con la lista de todas las apps.'],
          imgs: ['start', 'start-classic'], caps: ['Menú Inicio.', 'Más opciones: menú clásico.'] },
        { h: 'Ajustes rápidos', p: ['El botón ⚙️ abre interruptores que se guardan en tu cuenta: **Modo trabajo**, **Texto** (tamaño), **Sonidos**, **Animaciones reducidas**, **🌐 Idioma**, **No molestar**, **Modo foco**, **Rendimiento**, **Compacto**, **Cerrar apps**, **Pantalla completa**, **Bloquear cuenta** y **Código Desk**.'], img: 'quick', cap: 'Ajustes rápidos.', small: true },
        { h: 'Modo teléfono', p: ['En el móvil Snake OS cambia solo al **modo teléfono**: iconos grandes, apps a pantalla completa y botones **Atrás**, **Inicio** (minimiza la app, que sigue en Recientes) y **Recientes** abajo. Desliza hacia abajo desde la barra superior para abrir el centro de control.'], img: 'phone-mode', cap: 'Snake OS en un móvil.', phone: true }
      ] },

    { id: 'ventanas', ico: '🪟', title: 'Ventanas', intro: 'Cada app se abre en su propia ventana, que puedes mover, cambiar de tamaño, minimizar y cerrar.',
      s: [
        { img: 'windows', cap: 'Dos ventanas abiertas: Notas y Calculadora.', ul: [
          '**Mover**: arrastra la barra de título.',
          '**Botones de la barra de título**: **–** minimiza, **⛶** maximiza (o haz doble clic en la barra) y **✕** cierra.',
          '**Cambiar el tamaño**: arrastra los bordes o las esquinas. Cada ventana recuerda su tamaño y su sitio en tu perfil.',
          '**Media pantalla**: lleva la ventana contra un lado de la pantalla para ajustarla a esa mitad.',
          '**Minimizar y volver**: una ventana minimizada sigue en la barra de tareas; púlsala para traerla de nuevo.',
          '**Cambiar de app**: `Alt+Q` muestra el selector de apps abiertas.',
          '**Cerrar todo**: **Ajustes rápidos › Cerrar apps**.'
        ] }
      ] },

    { id: 'ajustes', ico: '⚙️', title: 'Ajustes', intro: 'La app Ajustes reúne todas las opciones de Snake OS. Todo se guarda en tu perfil y se aplica nada más entrar. Arriba tienes un buscador para encontrar cualquier ajuste.',
      s: [
        { h: 'Apariencia', img: 'settings-apariencia', cap: 'Ajustes › Apariencia.', ul: ['**Tema**: automático, claro u oscuro.', '**Fondo de pantalla**.', '**Tamaño del texto**: normal, grande o muy grande.', '**Animaciones reducidas**: menos movimiento.', '**Emojis**: los dibujados para Snake OS o los del sistema.', '**Snakemoji**: abre la galería de emojis Snake.', '**Modo compacto**: ventanas y barra más compactas.'] },
        { h: 'Pantalla y salvapantallas', ul: ['**Brillo**: con la barra o con las teclas `F5` (bajar) y `F6` (subir).', '**Salvapantallas**: elige cuándo se activa (1, 2, 5, 10, 15 o 30 minutos, o nunca; 5 minutos de serie) y el estilo: ventana con serpientes, reloj grande, burbujas, serpientes de colores o degradado, con vista previa y botón para probarlo.', 'Cualquier tecla, clic o toque lo quita. No salta mientras ves un vídeo, estás en una llamada, tienes un juego abierto o un Doganiero Bot está trabajando.'], img: 'settings-salvapantallas', cap: 'Ajustes › Salvapantallas.' },
        { h: 'Modo trabajo', p: ['Pone un fondo negro con grises (bloqueado mientras está activo), quita los sonidos y cierra los juegos. El diseño Liquid Glass, las animaciones y tus ajustes no cambian: Snake OS va más ligero por dentro. Aquí eliges las **apps del dock de trabajo** que salen en la barra, conectas herramientas web (Gmail, Drive, Notion, Calendar, Outlook, Teams, GitHub…) y añades tus propios enlaces. También se activa con el botón 💼 de la barra.'], imgs: ['settings-trabajo', 'workmode'], caps: ['Ajustes › Modo trabajo.', 'Escritorio con el modo trabajo activado.'] },
        { h: 'Snake OS Kids', p: ['Un modo para niños y niñas con **control parental y PIN**: apps por edad, tiempo de pantalla, horario de descanso, chat seguro, Doganiero Bots con filtro, navegador con lista de webs permitidas, juegos online, tienda, archivos, cámara y micrófono, e informe semanal a la cuenta Dogaemail del adulto. Un adulto lo configura en 7 pasos y crea el PIN. Para cambiar algo o desactivarlo hace falta el PIN.'] },
        { h: 'Sonido, notificaciones y rendimiento', ul: ['**Sonidos del sistema**: melodía de bienvenida, avisos y llamadas.', '**Avisos con Snake OS! cerrado**, **No molestar** y **Modo foco** (ver el capítulo Notificaciones).', '**Modo rendimiento**: menos efectos para equipos lentos.'] },
        { h: 'Escritorio y accesibilidad', ul: ['**Ordenar iconos**, **Widgets de escritorio**, **Nombres de las apps abiertas en la barra**, **Búsqueda global**, **Historial del portapapeles**, **Captura de pantalla** y **Pantalla completa**.', '**Alto contraste**: fondos negros, texto blanco y bordes marcados.', '**Cursor grande**: puntero más grande y fácil de ver.', '**Foco visible**: marca en amarillo dónde estás al moverte con `Tab`.'] },
        { h: 'Askbox (IA), cuenta y almacenamiento', ul: ['**Clave de Askbox**: la usan Doganiero AI, Code Lab, Snake Racing (comentarista), Los Snakes y Doganiero Bots. Puedes guardar tu propia clave, probar la conexión o quitarla. Si no pones ninguna, se usa la del sistema si existe. La clave guardada nunca se muestra completa.', '**Cuenta**: compartir tu ubicación con tus contactos, sesión iniciada, Mi perfil y Bloquear cuenta.', '**Almacenamiento**: espacio usado y restablecer las preferencias de las apps (no borra notas, archivos ni eventos).', '**Atajos**: la lista de atajos de teclado.'] },
        { h: 'Acerca de', p: ['Muestra la versión de Snake OS, las novedades y el botón **Manual de instrucciones › Descargar PDF** para descargar este manual cuando quieras.'], img: 'settings-acerca', cap: 'Ajustes › Acerca de, con el manual de instrucciones arriba.' }
      ] },

    { id: 'personaliza', ico: '🐍', title: 'Puntero, emojis, GIFs y salvapantallas', intro: 'Snake OS tiene su propio estilo: puntero de serpiente, emojis dibujados para Snake OS y fondos animados.',
      s: [
        { h: 'El puntero Snake', p: ['En el ordenador con ratón, el puntero es siempre el de Snake OS: una flecha verde con ojo y una cabeza de serpiente para pulsar enlaces y botones. Hay un dibujo Snake para cada situación (escribir, esperar, mover, redimensionar, ayuda, prohibido, copiar, zoom, cruz…), así que nunca aparece el cursor del sistema. Funciona con **Cursor grande** y con **Alto contraste**. En el modo teléfono no hay puntero.'],
          cursors: [['arrow', 'Normal'], ['hand', 'Enlaces y botones'], ['text', 'Escribir'], ['wait', 'Esperar'], ['move', 'Mover'], ['nwse', 'Redimensionar'], ['help', 'Ayuda'], ['notallowed', 'Prohibido'], ['copy', 'Copiar'], ['zoomin', 'Acercar'], ['crosshair', 'Cruz']] },
        { h: 'Snakemoji y emojis Snake', p: ['Snake OS dibuja sus propios emojis (caras de serpiente, corazones, gestos, animales, comida, naturaleza, objetos, símbolos y banderas) y los muestra en Chat, Metaverse, Notas, títulos y en todo el sistema. Los que no tienen dibujo Snake se ven como los del sistema. Si prefieres los del sistema: **Ajustes › Apariencia › Emojis**.', 'La app **Snakemoji** es la galería: busca, filtra por categoría y pulsa un emoji para copiarlo. Se abre con la tecla `S` cuando no estás escribiendo en un campo de texto ni usando Code Lab, Terminal, un juego o el Metaverse.'], img: 'snakemoji', cap: 'Snakemoji (tecla S).', small: true },
        { h: 'GIFs', ul: ['**Foto de perfil animada**: en **Mi perfil › Subir imagen o GIF**. Los GIF se animan para los demás en el chat, las llamadas, etc. (máx. 10 MB).', '**Fondo de pantalla animado**: botón 🎨 › **Subir imagen o GIF** (máx. 10 MB).'] },
        { h: 'Salvapantallas', p: ['Tras el tiempo que elijas sin usar Snake OS aparece el salvapantallas, por ejemplo el logo de Snake OS con sus serpientes moviéndose. Se cambia en **Ajustes › Salvapantallas**.'], img: 'screensaver', cap: 'Salvapantallas.' }
      ] },

    { id: 'notificaciones', ico: '🔔', title: 'Notificaciones', intro: 'Los avisos de mensajes, llamadas y apps llegan a la campana de la barra de tareas.',
      s: [
        { p: ['Pulsa la **campana** para abrir el centro de notificaciones. Los avisos se agrupan por app; puedes descartarlos uno a uno o marcarlos todos como leídos. Cuando no queda nada verás «Todo al día».'], img: 'notifications', cap: 'Centro de notificaciones.', small: true,
          ul: ['**No molestar**: silencia los avisos mientras trabajas (en la campana o en Ajustes rápidos).', '**Avisos con Snake OS! cerrado**: en **Ajustes › Notificaciones** pulsa **Activar avisos** y acepta el permiso del navegador. Así recibes notificaciones aunque Snake OS esté cerrado, **siempre que el navegador siga abierto**.', 'Si el navegador bloqueó los avisos, permítelos en el candado de la barra de direcciones. En iPhone, añade Snake OS! a la pantalla de inicio para poder recibirlos.', 'La campanilla suena aunque la pestaña esté en segundo plano.'] }
      ] },

    { id: 'apps-diarias', ico: '🗂️', title: 'Apps del día a día', intro: 'Las apps para organizarte, guardar tus cosas y navegar.',
      s: [
        { h: 'Explorador (tus archivos)', p: ['Sube archivos desde tu ordenador con **Subir archivo(s) de tu ordenador** o arrastrándolos. Pulsa una carpeta o un archivo para abrirlo. Con clic derecho creas carpetas, y puedes arrastrar archivos y carpetas para moverlos. Tienes vista de cuadrícula o lista, orden, búsqueda, renombrar y detalles. Tus archivos son privados y se guardan en tu cuenta (128 GB).'], img: 'app-explorer', cap: 'Explorador.', small: true },
        { h: 'Papelera', p: ['Lo que borras del Explorador va a la Papelera. Desde ahí puedes restaurarlo, borrarlo para siempre o vaciar la papelera entera.'] },
        { h: 'Doganiero Cloud', p: ['Muestra el espacio usado de tu cuenta. Con **Suscribirse Gratis** consigues almacenamiento ilimitado sin coste; se cancela con el mismo botón.'] },
        { h: 'Notas', p: ['Escribe arriba y pulsa **Añadir nota** (o `Ctrl+Intro`). Las notas se guardan solas en tu cuenta. Tienen buscador, fijadas, colores, listas con casillas y **Exportar**.'], img: 'app-notes', cap: 'Notas.', small: true },
        { h: 'Calendario', p: ['Elige un día, escribe el evento, la hora y el color y pulsa **Añadir**. Los eventos tienen recordatorios y se guardan en tu cuenta, así que los ves en todos tus dispositivos.'], img: 'app-calendario', cap: 'Calendario.', small: true },
        { h: 'Calculadora y Capturas', ul: ['**Calculadora**: operaciones, porcentajes, teclado e historial.', '**Capturas**: tus capturas de pantalla. Pulsa **Nueva captura**, el botón 📸 de la barra o `Ctrl+Shift+S`.'] },
        { h: 'Navegador', p: ['Abre webs dentro de una ventana de Snake OS. Escribe una dirección o una búsqueda en la barra; la página de inicio es **Doganiero Search**. Tienes botones de atrás, adelante e inicio. Algunas webs no dejan mostrarse dentro de otras páginas.'], img: 'app-browser', cap: 'Navegador con Doganiero Search.' },
        { h: 'Mapas', p: ['Busca un lugar real o toca el mapa y pulsa **Llévame** para ver la ruta en coche, bus o a pie desde tu ubicación. Si tus contactos comparten su ubicación (Ajustes › Cuenta) los ves en el mapa mientras tienen Snake OS abierto.'], img: 'app-maps', cap: 'Mapas.' },
        { h: 'Mi perfil', p: ['Cambia tu nombre, tu foto (imagen, GIF o foto con la cámara) o emoji de perfil y tu contraseña. Verás también tus notas, archivos y espacio usado. Al final está la zona de peligro para eliminar la cuenta.'] },
        { h: 'Bluetooth', p: ['Conecta Snake OS con dispositivos Bluetooth de bajo consumo cercanos (relojes, sensores, mandos, placas). Necesita Chrome o Edge; los altavoces de audio clásico no aparecen.'] }
      ] },

    { id: 'comunicacion', ico: '💬', title: 'Comunicación', intro: 'Habla con otras personas que usan Snake OS.',
      s: [
        { h: 'Doganiero Chat', p: ['Escribe el correo de otra cuenta y pulsa **Añadir**. La otra persona tiene que aceptar la solicitud. Después podéis enviaros mensajes, fotos y ubicaciones, y hacer **llamadas** y **videollamadas**. En el ordenador puedes **compartir pantalla** durante una llamada.'], img: 'app-chat', cap: 'Doganiero Chat.' },
        { h: 'Teléfono', p: ['Tienes un **número Doganiero** propio (DOG-XXXXXX). Es ficticio: solo sirve para llamar a otros perfiles de Snake OS. Usa el **Teclado** para marcar y pulsa **Llamar** o **Vídeo**. También tienes **Favoritos**, **Contactos** y **Recientes**. Clic derecho o mantener pulsado un contacto copia su número.'], img: 'app-phone', cap: 'Teléfono.', small: true },
        { h: 'Doganiero Desk', p: ['Para ver y controlar otro escritorio de Snake OS. Cada cuenta tiene un **código de escritorio** único: compártelo para que te ayuden, o escribe el código de otra persona en **Conectar a otro escritorio**. Verás su escritorio en calidad alta y podrás usar ratón y teclado.'] }
      ] },

    { id: 'ia', ico: '✨', title: 'Inteligencia artificial', intro: 'Dos asistentes: Doganiero AI para preguntar y crear, y Doganiero Bots para que trabajen por ti.',
      s: [
        { h: 'Doganiero AI', p: ['Escribe tu pregunta y pulsa ➤ (o usa **Voz**). Doganiero AI responde sobre Snake OS y sobre cualquier tema, **genera imágenes** (se guardan en el Explorador), **abre apps y archivos**, **programa** y guarda el código en archivos, y **busca en internet**. Puedes elegir el modelo (Star 1.1 rápido, Star 1.2 equilibrado o Star 1.3 potente), copiar respuestas, borrar la conversación y exportarla. Si das permiso de ubicación, la usa para responder «¿dónde estoy?».'], img: 'app-ai', cap: 'Doganiero AI.', small: true, warn: 'Ahora mismo Doganiero AI no puede ver las imágenes que adjuntas: descríbelas con palabras.' },
        { h: 'Doganiero Bots', p: ['Crea un bot (nombre, avatar, color y función) y dale tareas. Varios bots pueden trabajar a la vez y ves su progreso paso a paso. Cada bot tiene **su propio Snake OS Lite** (una pantallita con Navegador y Terminal) donde busca y trabaja.'],
          ul: ['Si quieres que actúe en **tu** escritorio, termina la petición con **«/en mi escritorio»**. Verás su puntero moverse por tu Snake OS.', 'Para pararlo: botón **Cancelar**, tecla `Esc` o escribe «para» en su chat.', 'Los bots pueden crear eventos en tu Calendario.'], img: 'app-dbots', cap: 'Doganiero Bots.' },
        { h: 'La clave de Askbox', p: ['La IA de Snake OS funciona con Askbox. Puedes poner tu propia clave en **Ajustes › Askbox (IA)**; si no, se usa la del sistema si existe.'] }
      ] },

    { id: 'programar', ico: '💻', title: 'Programar y la Terminal', intro: 'Herramientas para crear y aprender.',
      s: [
        { h: 'Code Lab', p: ['Editor para programar en JavaScript, HTML, CSS, Python o texto. **Vista previa** ejecuta JS/HTML en un entorno seguro. Puedes **Guardar** en el Explorador, **Abrir**, **Descargar** y **Copiar**, cambiar el tamaño de letra, mostrar números de línea y elegir tema (automático, noche, claro, Monokai u océano). **Generar código** le pide código a la IA.'], img: 'app-code', cap: 'Code Lab.' },
        { h: 'Terminal', p: ['La Terminal de Snake OS trabaja con tus archivos del Explorador. Escribe `help` para ver todos los comandos: `ls`, `cd`, `pwd`, `cat`, `echo`, `touch`, `mkdir`, `rm` (envía a la Papelera), `mv`, `cp`, `head`, `whoami`, `date`, `uname`, `ps`, `kill`, `open`, `neofetch`, `nano`… `Tab` autocompleta y `↑`/`↓` recorren el historial. El botón **🎨 Estilo** cambia los colores (Snake, Clásico, Hacker, Retro ámbar, Océano o Claro).'], img: 'app-terminal', cap: 'Terminal.' },
        { h: 'Prism', p: ['Un lenguaje para programar un cubo en 3D: muévelo con las flechas o escribe un programa (tiene que incluir d2, d3 y d4) y pulsa **Ejecutar**. Añade obstáculos (muro, pinchos, trampolín, moneda, cinta, portal) y elige la piel del cubo.'] }
      ] },

    { id: 'ocio', ico: '🎮', title: 'Tienda, juegos y diversión', intro: 'Todo lo que tiene Snake OS para jugar y pasarlo bien.',
      s: [
        { h: 'Doganiero Store', p: ['La tienda de Snake OS: mini-apps y juegos para tu escritorio. Busca, ordena (destacadas, mejor valoradas, A–Z), filtra por categoría y pulsa **Descargar**. Las apps instaladas se quedan en tu escritorio aunque reinicies Snake OS y se pueden tirar a la Papelera. Todos los juegos se juegan dentro de Snake OS.'], img: 'app-store', cap: 'Doganiero Store.' },
        { h: 'Juegos y Snake', ul: ['**Juegos**: Tres en raya (dos jugadores en el mismo dispositivo) y Memoria (encontrar parejas).', '**Snake**: la serpiente clásica. Se juega con las flechas o con los botones de la pantalla y guarda tu récord.'] },
        { h: 'Snake Racing 3D', p: ['Carreras de karts en 3D con pilotos serpiente en el Circuito Doganiero, con rampas, saltos, placas de turbo y derrapes. Elige 2, 3 o 5 vueltas y la dificultad (Fácil, Normal o Pro), y juega solo o **online**. Tiene comentarista con voz y subtítulos y gráficos automáticos (alta, media o baja).'], ul: ['`↑`/`W` acelerar, `↓`/`S` frenar, `←`/`→` girar.', '`Espacio` derrapa; mantenlo girando para el mini-turbo azul → naranja → morado. `Espacio` en el aire tras una rampa: truco y turbo.', '`R` vuelve a la pista, `V` voz y `P`/`Esc` pausa.'], img: 'app-snake-racing', cap: 'Snake Racing 3D.' },
        { h: 'Los Snakes', p: ['Un simulador de vida de serpientes. Crea tu familia (apellido, nombres, edades, colores y hasta 3 rasgos como Glotón, Dormilón o Genio), cuida sus necesidades (hambre, energía, higiene, diversión, social, vejiga y calor), decora la casa y visita a tus amigos con toda la familia. Las serpientes **crecen poco a poco con la edad**: cría, joven, adulta y anciana; en su ficha ves la etapa y la barra de crecimiento.'], imgs: ['app-los-snakes', 'app-los-snakes-house'], caps: ['Crear la familia.', 'La casa de la familia.'] },
        { h: 'Doganiero TV', p: ['Historias en episodios con imagen, voz y subtítulos. La suscripción cuesta **5 huesitos** y dura 30 días.'] },
        { h: 'Doganiero Metaverse', p: ['Un mundo en 3D con otras personas de Snake OS y personajes con IA que hablan. Hay tres mundos (Plaza, Parque y Ciudad) y salas de eventos (Sala Central y Anfiteatro). Muévete con `WASD`, salta con `Espacio`, cambia entre primera persona y vista desde arriba, usa gestos (`G`), el mapa (`M`), chat y voz, y choca los cinco. Hay ciclo de día y noche y fiestas programadas. También se puede jugar con el móvil como mando (**Mando Pro**).'], img: 'app-metaverse', cap: 'Doganiero Metaverse.' },
        { h: 'Coins y huesitos', ul: ['**Huesitos** 🦴: se recogen por el Metaverse. Sirven, por ejemplo, para suscribirte a Doganiero TV.', '**Coins** 🪙: empiezas con 100 y cada huesito que recoges suma 1. Se gastan en la ropa y los accesorios de tu avatar del Metaverse.', 'Tu saldo aparece en el widget de saldo del escritorio.'] }
      ] },

    { id: 'vm', ico: '🖥️', title: 'Máquinas virtuales: Ubuntu 26.10 (estilo)', intro: 'Un Linux ligero de verdad con un escritorio de Snake OS inspirado en Ubuntu 26.10, dentro de tu navegador. No es Ubuntu.',
      s: [
        { p: ['Abre **Máquinas virtuales**: la máquina ya está instalada y lista para configurar. Es un **Linux ligero de verdad** (Buildroot y BusyBox) emulado en tu navegador, **sin red**, con un escritorio **estilo Ubuntu 26.10**: barra superior con **Actividades**, reloj y ajustes rápidos, **dock** con las apps **Terminal**, **Archivos**, **Editor de texto**, **Monitor del sistema** y **Configuración**. En Configuración › Acerca de verás «Ubuntu 26.10 (estilo)»: es un Linux ligero, no Ubuntu.'],
          ul: ['Al configurarla eliges su nombre y su estilo. Después queda **fija en tu perfil**: no se puede quitar ni cambiar.', 'Todo funciona en tu navegador: el estado se guarda en tu navegador, por perfil.', 'Arranca en unos segundos y funciona también en el modo teléfono, con las ventanas a pantalla completa.'], imgs: ['app-maquinas-virtuales', 'app-vm-pro'], caps: ['Máquinas virtuales.', 'Escritorio Ubuntu 26.10 (estilo).'] },
        { h: 'Con Snake OS VP Pro', ul: ['En Configuración aparece la pestaña **Pro**: estilos de terminal e **instantánea** de la máquina para guardarla y restaurarla.', 'Las máquinas que se crearon con el escritorio anterior pasan solas al estilo Ubuntu 26.10 y **conservan sus archivos**.'] }
      ] },

    { id: 'trucos', ico: '⌨️', title: 'Trucos y atajos de teclado', intro: 'Para ir más rápido.',
      s: [
        { table: [['`Ctrl+K` o `Ctrl+Espacio`', 'Búsqueda global'], ['`Alt+V`', 'Historial del portapapeles'], ['`Alt+Q`', 'Cambiar de app'], ['`Ctrl+Shift+S`', 'Captura de pantalla'], ['`Ctrl+Alt+←/→`', 'Cambiar de escritorio virtual'], ['`Ctrl+Alt+Mayús+←/→`', 'Mover la ventana a otro escritorio'], ['`F5` / `F6`', 'Bajar / subir el brillo'], ['`S`', 'Abrir Snakemoji (fuera de campos de texto, Code Lab, Terminal, juegos y Metaverse)'], ['`Esc`', 'Cerrar menús · parar un Doganiero Bot'], ['Clic derecho', 'Menú del escritorio'], ['Doble clic en la barra de título', 'Maximizar la ventana'], ['Clic central en una app de la barra', 'Cerrarla']] },
        { h: 'Trucos', ul: ['Escribe en el buscador del menú Inicio y pulsa `Intro` para abrir la app sin usar el ratón.', 'Las ventanas recuerdan su tamaño y su sitio: colócalas una vez a tu gusto.', 'Activa **Widgets de escritorio** para ver de un vistazo tus próximos eventos y notas fijadas.', 'Con **Nombres de las apps abiertas en la barra** desactivado, la barra muestra solo iconos y cabe más.', 'En el móvil, desliza hacia abajo desde la barra superior para abrir el centro de control.'] }
      ] },

    { id: 'faq', ico: '❓', title: 'Preguntas frecuentes', intro: '',
      s: [
        { faq: [
          ['¿Tengo que instalar algo en mi ordenador?', 'No. Snake OS funciona en el navegador. Solo necesitas tu cuenta de Dogaemail.'],
          ['¿Dónde se guardan mis cosas?', 'Tus notas, archivos, eventos y ajustes se guardan en tu cuenta, así que los tienes en cualquier ordenador o móvil. Algunas cosas, como el estado de la máquina virtual, se guardan solo en tu navegador.'],
          ['¿Puedo crear la cuenta con Gmail?', 'No se pueden crear cuentas nuevas con Gmail. Usa otro correo, por ejemplo uno de Dogaemail.'],
          ['He olvidado mi contraseña.', 'Si sigues dentro, cámbiala en Mi perfil. Si no puedes entrar, pide ayuda a quien administra tu Snake OS.'],
          ['No me llegan las notificaciones con Snake OS cerrado.', 'Actívalas en Ajustes › Notificaciones › Activar avisos y acepta el permiso. El navegador tiene que seguir abierto. Si salen bloqueadas, permítelas en el candado de la barra de direcciones.'],
          ['¿Cómo cambio el idioma?', 'Con el botón 🌐 Idioma de Ajustes rápidos.'],
          ['¿Puedo poner GIFs?', 'Sí: como foto de perfil animada (Mi perfil) y como fondo de pantalla (botón 🎨 › Subir imagen o GIF), hasta 10 MB.'],
          ['¿Por qué no veo el cursor del sistema?', 'Snake OS usa siempre su propio puntero Snake. Si te cuesta verlo, activa Cursor grande o Alto contraste en Ajustes › Accesibilidad.'],
          ['¿Cómo quito una app que instalé de la Store?', 'Arrastra su icono a la Papelera. Las apps de Snake OS no se pueden quitar.'],
          ['¿Puedo usar apps de Android o de la Play Store?', 'No. Snake OS funciona en el navegador y no ejecuta apps de Android. Usa las apps de Snake OS y las de Doganiero Store.'],
          ['El salvapantallas no sale.', 'Revisa el tiempo en Ajustes › Salvapantallas. No sale mientras ves un vídeo, estás en una llamada, tienes un juego abierto o un bot está trabajando.'],
          ['Un Doganiero Bot está haciendo algo que no quiero.', 'Pulsa Esc, el botón Cancelar o escribe «para» en su chat. Solo toca tu escritorio si terminas la petición con «/en mi escritorio».'],
          ['¿Cómo vuelvo a descargar este manual?', 'Ajustes › Acerca de › Manual de instrucciones, el botón del menú Inicio o el de la pantalla de inicio de sesión.']
        ] }
      ] }
  ]
};
