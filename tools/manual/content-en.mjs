// Snake OS user manual · English text (same structure as content-es.mjs).
export default {
  lang: 'en',
  docTitle: 'Snake OS! user manual',
  cover: { kicker: 'User manual', title: 'Snake OS!', sub: 'Learn to use your operating system in the browser: the desktop, the settings and every app.', ver: 'Version', powered: 'powered by Doganiero OS! 3' },
  tocTitle: 'Contents',
  footer: 'Snake OS! · User manual',
  page: 'Page',
  chapters: [
    { id: 'bienvenida', ico: '👋', title: 'Welcome', intro: 'Snake OS! is a complete operating system that runs inside your browser. There is nothing to install on your computer: sign in with your Dogaemail account and you get your desktop, your files and your apps on any computer or phone.',
      s: [
        { h: 'What you can do with Snake OS', ul: [
          '**Work**: Notes, Calendar, the Explorer for your files, Calculator, Code Lab, Terminal and Browser.',
          '**Keep in touch**: Doganiero Chat (messages, photos, voice and video calls), Phone with your DOG number and Doganiero Desk to control another desktop.',
          '**Use artificial intelligence**: Doganiero AI answers, creates images and opens apps; Doganiero Bots work for you.',
          '**Play and have fun**: Doganiero Store, Snake, Snake Racing 3D, Los Snakes, Doganiero TV and Doganiero Metaverse.',
          '**Try another system**: Virtual machines with Snake OS! Pro, a real Linux inside your browser.'
        ] },
        { h: 'How this manual is organised', p: ['Start with **Getting started** if you have just created your account. Then the chapters on the desktop, the taskbar, windows and Settings show you how to find your way around. At the end there is a guide to every app, tips, keyboard shortcuts and frequently asked questions.'],
          tip: 'You can download this manual again at any time: **Settings › About › User manual**, the **User manual** button in the Start menu or the one on the sign-in screen.' },
        { h: 'What you need', ul: [
          'A modern browser (Chrome, Edge, Firefox or Safari) on a computer or phone.',
          'A Dogaemail account (your name@dogaemail.com). You can create one in a minute from the sign-in screen.',
          'An internet connection. Some things work offline inside the browser, such as Snake OS! Pro.'
        ] }
      ] },

    { id: 'primeros-pasos', ico: '🚀', title: 'Getting started', intro: 'How to create your account, install Snake OS for the first time, and sign in and out.',
      s: [
        { h: 'The sign-in screen', p: ['When you open Snake OS you see the time, the date, a greeting and the next public holiday. Type your Dogaemail address and your password and press **Sign in**. If you do not have an account yet, press **Create account**. The **User manual** button downloads this manual without signing in.'], img: 'login', cap: 'Sign-in screen.' },
        { h: 'Creating an account', p: ['Type your name and your email (for example name@dogaemail.com), pick a profile picture and type a password of at least 4 characters twice. Press **Create account**.'],
          ul: ['New accounts cannot be created with Gmail: use another address, such as a Dogaemail one.', 'Each email address can only have one account.', 'You can change your photo or emoji later in **My profile**.'],
          img: 'signup', cap: 'Create account form.' },
        { h: 'Installing Snake OS', p: ['The first time you sign in with a new account, Snake OS finishes installing:'],
          ul: [
            '**Welcome**: press **Start tutorial**.',
            '**Tutorial**: a 9-step tour (desktop, Start bar, Doganiero AI, Chat, Store, Metaverse, password, brightness and Settings) with voice. Press **Next** to continue or **Skip** to finish it.',
            '**Finish installing Snake OS**: after the tutorial there is only one icon on the desktop. Press it and Snake OS restarts with all the apps.',
            '**Snake OS Kids**: you are asked whether to turn on kids mode for that profile. If you say no, you are not asked again.',
            '**User manual**: you are asked «Do you want to download the Snake OS user manual?». It is only downloaded if you press **Yes**, and you are not asked again.'
          ], imgs: ['welcome', 'tutorial', 'finish-install', 'manual-ask'], caps: ['Welcome.', 'Tutorial: the Start bar step.', '«Finish installing Snake OS» icon.', 'The manual question at the end of the installation.'] },
        { h: 'Profiles: every account has its own things', p: ['Each Dogaemail account is a **profile**. Your settings (theme, wallpaper, brightness, screensaver, work mode, emojis, cursor, pinned and recent apps…), your notes, files and games are saved in your profile. If someone else signs in on the same browser with their account, they see their things, not yours.'] },
        { h: 'Password, locking and signing out', ul: [
          '**Change your password**: open **My profile**, type the new password twice and press **Save changes**. Your password is never shared.',
          '**Lock your account**: in **Quick settings** (⚙️) press **Lock account**. The account is locked on all your devices without signing out; to come back, type your password and press **Unlock**.',
          '**Sign out**: in the Start menu press **Sign out**.',
          '**Power off**: in the Start menu press **Power off**. Snake OS shuts down and shows the **Restart computer** button.'
        ] },
        { h: 'Language', p: ['Snake OS switches to Spanish automatically in Spain. To switch between Spanish and English press the **🌐 Language** button in **Quick settings**. Proper names, such as your snakes in Los Snakes, are never translated.'] }
      ] },

    { id: 'escritorio', ico: '🖥️', title: 'The desktop', intro: 'The desktop is your main screen: its icons open the apps and you can arrange it the way you like.',
      s: [
        { h: 'Icons', img: 'desktop', cap: 'The desktop with the «Minimal» wallpaper.', ul: [
          'One click on an icon opens its app.',
          'Drag icons to move them; Snake OS remembers where you leave them. **Settings › Desktop › Arrange icons** puts them back on the grid.',
          'Apps you install from Doganiero Store can be dragged to the Trash to remove them. Snake OS apps cannot.'
        ] },
        { h: 'Right-click menu', p: ['Right-click an empty part of the desktop to change the wallpaper, switch the light/dark theme, arrange the icons, create a folder or a note, open the Explorer, search apps, take a screenshot or open Quick settings.'], img: 'context', cap: 'Right-click menu.', small: true },
        { h: 'Wallpaper', p: ['Press the 🎨 button on the taskbar (or **Change wallpaper** in the right-click menu). Choose one of the Snake OS wallpapers (forest, ocean, sunset, nebula and several snake ones) or press **Upload image or GIF** to use your own picture or an animated GIF of up to 10 MB. The wallpaper only changes for your account.'], img: 'wallpaper', cap: 'Choosing a wallpaper.', small: true },
        { h: 'More desktop features', ul: [
          '**Global search** (`Ctrl+K` or `Ctrl+Space`): finds apps, notes, files, events, Chat contacts and settings.',
          '**Virtual desktops**: buttons 1, 2, 3 and 4 on the taskbar. `Ctrl+Alt+←/→` switches desktop and `Ctrl+Alt+Shift+←/→` moves the window.',
          '**Widgets**: clock, upcoming events, pinned notes and your bones and coins balance. Turn them on in **Settings › Desktop**; you can move them.',
          '**Clipboard**: `Alt+V` shows what you copied inside Snake OS so you can paste it again.',
          '**Screenshot**: the 📸 button or `Ctrl+Shift+S`. Screenshots are saved in the Screenshots app.'
        ] }
      ] },

    { id: 'barra', ico: '🧭', title: 'Taskbar and Start menu', intro: 'The glass taskbar sits at the bottom. From it you open the Start menu, switch between apps and reach Quick settings and notifications.',
      s: [
        { h: 'Parts of the taskbar', ul: [
          '**Your profile** on the left and, next to it, **your open apps** (with their names if they fit). Click: bring to front, restore or minimise. Middle click or right click: close.',
          '**Snake OS button** (the logo) in the middle: opens the Start menu.',
          '**Desktops 1–4** and quick buttons: 💼 work mode, 🔎 search, 📸 screenshot, 🎨 wallpaper and ⚙️ Quick settings.',
          'On the right: the device **battery** (if the browser reports it), the notifications **bell** and the **clock** with the date.'
        ] },
        { h: 'The Start menu', p: ['Press the Snake OS logo. At the top there is a search box (type and press `Enter` to open the first app). Below are the **Pinned** apps, your **Recent** apps (the last 6 of your profile) and, at the bottom, your name, **Sign out** and **Power off**. The **User manual** button downloads this manual. **More options ›** opens the classic menu with the list of every app.'],
          imgs: ['start', 'start-classic'], caps: ['Start menu.', 'More options: classic menu.'] },
        { h: 'Quick settings', p: ['The ⚙️ button opens toggles that are saved to your account: **Work mode**, **Text** size, **Sounds**, **Reduced animations**, **🌐 Language**, **Do not disturb**, **Focus mode**, **Performance**, **Compact**, **Close apps**, **Fullscreen**, **Lock account** and **Desk code**.'], img: 'quick', cap: 'Quick settings.', small: true },
        { h: 'Phone mode', p: ['On a phone Snake OS switches to **phone mode** by itself: big icons, full-screen apps and **Back**, **Home** (minimises the app, which stays in Recents) and **Recents** buttons at the bottom. Swipe down from the top bar to open the control centre.'], img: 'phone-mode', cap: 'Snake OS on a phone.', phone: true }
      ] },

    { id: 'ventanas', ico: '🪟', title: 'Windows', intro: 'Each app opens in its own window, which you can move, resize, minimise and close.',
      s: [
        { img: 'windows', cap: 'Two open windows: Notes and Calculator.', ul: [
          '**Move**: drag the title bar.',
          '**Title bar buttons**: **–** minimises, **⛶** maximises (or double-click the bar) and **✕** closes.',
          '**Resize**: drag the edges or corners. Every window remembers its size and position in your profile.',
          '**Half screen**: push the window against one side of the screen to snap it to that half.',
          '**Minimise and come back**: a minimised window stays on the taskbar; press it to bring it back.',
          '**Switch apps**: `Alt+Q` shows the open-apps switcher.',
          '**Close everything**: **Quick settings › Close apps**.'
        ] }
      ] },

    { id: 'ajustes', ico: '⚙️', title: 'Settings', intro: 'The Settings app gathers every Snake OS option. Everything is saved in your profile and applied as soon as you sign in. The search box at the top finds any setting.',
      s: [
        { h: 'Appearance', img: 'settings-apariencia', cap: 'Settings › Appearance.', ul: ['**Theme**: automatic, light or dark.', '**Wallpaper**.', '**Text size**: normal, large or extra large.', '**Reduced animations**: less movement.', '**Emojis**: the ones drawn for Snake OS or the system ones.', '**Snakemoji**: opens the Snake emoji gallery.', '**Compact mode**: more compact windows and taskbar.'] },
        { h: 'Display and screensaver', ul: ['**Brightness**: with the slider or the `F5` (down) and `F6` (up) keys.', '**Screensaver**: choose when it starts (1, 2, 5, 10, 15 or 30 minutes, or never; 5 minutes by default) and its style: window with snakes, big clock, bubbles, coloured snakes or gradient, with a preview and a button to try it.', 'Any key, click or tap removes it. It does not start while you watch a video, are on a call, have a game open or a Doganiero Bot is working.'], img: 'settings-salvapantallas', cap: 'Settings › Screensaver.' },
        { h: 'Work mode', p: ['Sets a black and grey wallpaper (locked while it is on), turns off sounds and closes games. The Liquid Glass design, animations and your settings stay the same: Snake OS simply runs lighter under the hood. Here you choose the **work dock apps** shown on the taskbar, connect web tools (Gmail, Drive, Notion, Calendar, Outlook, Teams, GitHub…) and add your own links. You can also turn it on with the 💼 button on the taskbar.'], imgs: ['settings-trabajo', 'workmode'], caps: ['Settings › Work mode.', 'The desktop with work mode on.'] },
        { h: 'Snake OS Kids', p: ['A mode for children with **parental controls and a PIN**: apps by age, screen time, bedtime, safe chat, filtered Doganiero Bots, a browser with a list of allowed websites, online games, store, files, camera and microphone, and a weekly report to the adult’s Dogaemail account. An adult sets it up in 7 steps and creates the PIN. Changing anything or turning it off requires the PIN.'] },
        { h: 'Sound, notifications and performance', ul: ['**System sounds**: welcome melody, alerts and calls.', '**Notifications with Snake OS! closed**, **Do not disturb** and **Focus mode** (see the Notifications chapter).', '**Performance mode**: fewer effects for slow computers.'] },
        { h: 'Desktop and accessibility', ul: ['**Arrange icons**, **Desktop widgets**, **Names of open apps on the taskbar**, **Global search**, **Clipboard history**, **Screenshot** and **Fullscreen**.', '**High contrast**: black backgrounds, white text and strong borders.', '**Big cursor**: a larger pointer that is easier to see.', '**Visible focus**: marks in yellow where you are when moving with `Tab`.'] },
        { h: 'Askbox (AI), account and storage', ul: ['**Askbox key**: used by Doganiero AI, Code Lab, Snake Racing (commentator), Los Snakes and Doganiero Bots. You can save your own key, test the connection or remove it. If you do not add one, the system key is used if there is one. The saved key is never shown in full.', '**Account**: share your location with your contacts, signed-in session, My profile and Lock account.', '**Storage**: space used and resetting app preferences (notes, files and events are not deleted).', '**Shortcuts**: the list of keyboard shortcuts.'] },
        { h: 'About', p: ['Shows the Snake OS version, what is new and the **User manual › Download PDF** button to download this manual whenever you want.'], img: 'settings-acerca', cap: 'Settings › About, with the user manual at the top.' }
      ] },

    { id: 'personaliza', ico: '🐍', title: 'Pointer, emojis, GIFs and screensaver', intro: 'Snake OS has its own style: a snake pointer, emojis drawn for Snake OS and animated wallpapers.',
      s: [
        { h: 'The Snake pointer', p: ['On a computer with a mouse, the pointer is always the Snake OS one: a green arrow with an eye and a snake head for links and buttons. There is a Snake drawing for every situation (typing, waiting, moving, resizing, help, not allowed, copy, zoom, crosshair…), so the system cursor never shows up. It works with **Big cursor** and **High contrast**. There is no pointer in phone mode.'],
          cursors: [['arrow', 'Normal'], ['hand', 'Links and buttons'], ['text', 'Typing'], ['wait', 'Waiting'], ['move', 'Move'], ['nwse', 'Resize'], ['help', 'Help'], ['notallowed', 'Not allowed'], ['copy', 'Copy'], ['zoomin', 'Zoom in'], ['crosshair', 'Crosshair']] },
        { h: 'Snakemoji and Snake emojis', p: ['Snake OS draws its own emojis (snake faces, hearts, gestures, animals, food, nature, objects, symbols and flags) and shows them in Chat, Metaverse, Notes, titles and across the system. Emojis without a Snake drawing look like the system ones. If you prefer the system ones: **Settings › Appearance › Emojis**.', 'The **Snakemoji** app is the gallery: search, filter by category and press an emoji to copy it. It opens with the `S` key when you are not typing in a text field or using Code Lab, Terminal, a game or the Metaverse.'], img: 'snakemoji', cap: 'Snakemoji (S key).', small: true },
        { h: 'GIFs', ul: ['**Animated profile picture**: in **My profile › Upload image or GIF**. GIFs play for everyone else in chat, calls, etc. (max. 10 MB).', '**Animated wallpaper**: 🎨 button › **Upload image or GIF** (max. 10 MB).'] },
        { h: 'Screensaver', p: ['After the time you choose without using Snake OS, the screensaver appears, for example the Snake OS logo with its snakes moving. Change it in **Settings › Screensaver**.'], img: 'screensaver', cap: 'Screensaver.' }
      ] },

    { id: 'notificaciones', ico: '🔔', title: 'Notifications', intro: 'Alerts for messages, calls and apps arrive at the bell on the taskbar.',
      s: [
        { p: ['Press the **bell** to open the notification centre. Alerts are grouped by app; you can dismiss them one by one or mark them all as read. When there is nothing left you will see «Everything up to date».'], img: 'notifications', cap: 'Notification centre.', small: true,
          ul: ['**Do not disturb**: silences alerts while you work (from the bell or Quick settings).', '**Notifications with Snake OS! closed**: in **Settings › Notifications** press **Turn on notifications** and accept the browser permission. You then get notifications even with Snake OS closed, **as long as the browser stays open**.', 'If the browser blocked notifications, allow them from the padlock in the address bar. On iPhone, add Snake OS! to the home screen to receive them.', 'The chime plays even when the tab is in the background.'] }
      ] },

    { id: 'apps-diarias', ico: '🗂️', title: 'Everyday apps', intro: 'Apps to get organised, keep your things and browse the web.',
      s: [
        { h: 'Explorer (your files)', p: ['Upload files from your computer with **Upload file(s) from your computer** or by dragging them in. Press a folder or file to open it. Right-click to create folders, and drag files and folders to move them. There is a grid or list view, sorting, search, rename and details. Your files are private and saved in your account (128 GB).'], img: 'app-explorer', cap: 'Explorer.', small: true },
        { h: 'Trash', p: ['Whatever you delete in the Explorer goes to the Trash. From there you can restore it, delete it forever or empty the whole trash.'] },
        { h: 'Doganiero Cloud', p: ['Shows the space used by your account. **Subscribe for free** gives you unlimited storage at no cost; the same button cancels it.'] },
        { h: 'Notes', p: ['Type at the top and press **Add note** (or `Ctrl+Enter`). Notes are saved to your account automatically. They have search, pinning, colours, checkbox lists and **Export**.'], img: 'app-notes', cap: 'Notes.', small: true },
        { h: 'Calendar', p: ['Pick a day, type the event, the time and the colour and press **Add**. Events have reminders and are saved to your account, so you see them on all your devices.'], img: 'app-calendario', cap: 'Calendar.', small: true },
        { h: 'Calculator and Screenshots', ul: ['**Calculator**: arithmetic, percentages, keyboard input and history.', '**Screenshots**: your screen captures. Press **New screenshot**, the 📸 button on the taskbar or `Ctrl+Shift+S`.'] },
        { h: 'Browser', p: ['Opens websites inside a Snake OS window. Type an address or a search in the bar; the home page is **Doganiero Search**. There are back, forward and home buttons. Some websites do not allow being shown inside other pages.'], img: 'app-browser', cap: 'Browser with Doganiero Search.' },
        { h: 'Maps', p: ['Search for a real place or tap the map and press **Take me** to see the route by car, bus or on foot from where you are. If your contacts share their location (Settings › Account) you see them on the map while they have Snake OS open.'], img: 'app-maps', cap: 'Maps.' },
        { h: 'My profile', p: ['Change your name, your photo (image, GIF or a photo with the camera) or profile emoji and your password. You also see your notes, files and space used. At the bottom is the danger zone to delete the account.'] },
        { h: 'Bluetooth', p: ['Connects Snake OS to nearby Bluetooth Low Energy devices (watches, sensors, controllers, boards). It needs Chrome or Edge; classic audio speakers do not show up.'] }
      ] },

    { id: 'comunicacion', ico: '💬', title: 'Keeping in touch', intro: 'Talk to other people who use Snake OS.',
      s: [
        { h: 'Doganiero Chat', p: ['Type another account’s email and press **Add**. The other person has to accept the request. Then you can send each other messages, photos and locations, and make **voice** and **video calls**. On a computer you can **share your screen** during a call.'], img: 'app-chat', cap: 'Doganiero Chat.' },
        { h: 'Phone', p: ['You have your own **Doganiero number** (DOG-XXXXXX). It is fictional: it only works to call other Snake OS profiles. Use the **Keypad** to dial and press **Call** or **Video**. There are also **Favourites**, **Contacts** and **Recents**. Right-click or long-press a contact to copy its number.'], img: 'app-phone', cap: 'Phone.', small: true },
        { h: 'Doganiero Desk', p: ['To see and control another Snake OS desktop. Every account has a unique **desktop code**: share it so someone can help you, or type someone else’s code in **Connect to another desktop**. You will see their desktop in high quality and can use the mouse and keyboard.'] }
      ] },

    { id: 'ia', ico: '✨', title: 'Artificial intelligence', intro: 'Two assistants: Doganiero AI to ask and create, and Doganiero Bots to work for you.',
      s: [
        { h: 'Doganiero AI', p: ['Type your question and press ➤ (or use **Voice**). Doganiero AI answers questions about Snake OS and any other topic, **creates images** (saved in the Explorer), **opens apps and files**, **writes code** and saves it to files, and **searches the internet**. You can pick the model (Star 1.1 fast, Star 1.2 balanced or Star 1.3 powerful), copy answers, clear the conversation and export it. If you allow location access, it uses it to answer «where am I?».'], img: 'app-ai', cap: 'Doganiero AI.', small: true, warn: 'Right now Doganiero AI cannot see the images you attach: describe them in words.' },
        { h: 'Doganiero Bots', p: ['Create a bot (name, avatar, colour and job) and give it tasks. Several bots can work at the same time and you see their progress step by step. Each bot has **its own Snake OS Lite** (a small screen with Browser and Terminal) where it searches and works.'],
          ul: ['If you want it to act on **your** desktop, end the request with **«/on my desktop»** (or «/en mi escritorio»). You will see its pointer move around your Snake OS.', 'To stop it: the **Cancel** button, the `Esc` key or type «para» (stop) in its chat.', 'Bots can create events in your Calendar.'], img: 'app-dbots', cap: 'Doganiero Bots.' },
        { h: 'The Askbox key', p: ['The AI in Snake OS works with Askbox. You can add your own key in **Settings › Askbox (AI)**; otherwise the system key is used if there is one.'] }
      ] },

    { id: 'programar', ico: '💻', title: 'Coding and the Terminal', intro: 'Tools to create and learn.',
      s: [
        { h: 'Code Lab', p: ['An editor to code in JavaScript, HTML, CSS, Python or plain text. **Preview** runs JS/HTML in a safe sandbox. You can **Save** to the Explorer, **Open**, **Download** and **Copy**, change the font size, show line numbers and pick a theme (automatic, night, light, Monokai or ocean). **Generate code** asks the AI for code.'], img: 'app-code', cap: 'Code Lab.' },
        { h: 'Terminal', p: ['The Snake OS Terminal works with your Explorer files. Type `help` to see every command: `ls`, `cd`, `pwd`, `cat`, `echo`, `touch`, `mkdir`, `rm` (sends to the Trash), `mv`, `cp`, `head`, `whoami`, `date`, `uname`, `ps`, `kill`, `open`, `neofetch`, `nano`… `Tab` autocompletes and `↑`/`↓` go through the history. The **🎨 Style** button changes the colours (Snake, Classic, Hacker, Retro amber, Ocean or Light).'], img: 'app-terminal', cap: 'Terminal.' },
        { h: 'Prism', p: ['A language to program a 3D cube: move it with the arrow keys or write a program (it must include d2, d3 and d4) and press **Run**. Add obstacles (wall, spikes, trampoline, coin, conveyor, portal) and choose the cube’s skin.'] }
      ] },

    { id: 'ocio', ico: '🎮', title: 'Store, games and fun', intro: 'Everything Snake OS has for playing and having a good time.',
      s: [
        { h: 'Doganiero Store', p: ['The Snake OS store: mini-apps and games for your desktop. Search, sort (featured, top rated, A–Z), filter by category and press **Download**. Installed apps stay on your desktop even if you restart Snake OS and can be thrown in the Trash. Every game is played inside Snake OS.'], img: 'app-store', cap: 'Doganiero Store.' },
        { h: 'Games and Snake', ul: ['**Games**: Tic-tac-toe (two players on the same device) and Memory (find the pairs).', '**Snake**: the classic snake. Play with the arrow keys or the on-screen buttons; it keeps your high score.'] },
        { h: 'Snake Racing 3D', p: ['3D kart races with snake drivers on the Doganiero Circuit, with ramps, jumps, boost pads and drifts. Choose 2, 3 or 5 laps and the difficulty (Easy, Normal or Pro), and race alone or **online**. It has a commentator with voice and subtitles, and automatic graphics (high, medium or low).'], ul: ['`↑`/`W` accelerate, `↓`/`S` brake, `←`/`→` steer.', '`Space` drifts; hold it while turning for the blue → orange → purple mini-turbo. `Space` in the air after a ramp: trick and turbo.', '`R` back to the track, `V` voice and `P`/`Esc` pause.'], img: 'app-snake-racing', cap: 'Snake Racing 3D.' },
        { h: 'Los Snakes', p: ['A snake life simulator. Create your family (surname, names, ages, colours and up to 3 traits such as Glutton, Sleepyhead or Genius), look after their needs (hunger, energy, hygiene, fun, social, bladder and warmth), decorate the house and visit your friends with the whole family. Snakes **grow little by little with age**: baby, young, adult and elder; their info card shows the stage and a growth bar.'], imgs: ['app-los-snakes', 'app-los-snakes-house'], caps: ['Creating the family.', 'The family’s house.'] },
        { h: 'Doganiero TV', p: ['Stories in episodes with pictures, voice and subtitles. The subscription costs **5 bones** and lasts 30 days.'] },
        { h: 'Doganiero Metaverse', p: ['A 3D world with other Snake OS people and AI characters who talk. There are three worlds (Plaza, Park and City) and event rooms (Central Hall and Amphitheatre). Move with `WASD`, jump with `Space`, switch between first person and top-down view, use gestures (`G`), the map (`M`), chat and voice, and high-five. There is a day and night cycle and scheduled parties. You can also use your phone as a controller (**Mando Pro**).'], img: 'app-metaverse', cap: 'Doganiero Metaverse.' },
        { h: 'Coins and bones', ul: ['**Bones** (huesitos) 🦴: you pick them up around the Metaverse. You use them, for example, to subscribe to Doganiero TV.', '**Coins** 🪙: you start with 100 and every bone you pick up adds 1. You spend them on clothes and accessories for your Metaverse avatar.', 'Your balance appears in the desktop balance widget.'] }
      ] },

    { id: 'vm', ico: '🖥️', title: 'Virtual machines and Snake OS! Pro', intro: 'Snake OS! Pro is another operating system of the Snake OS family that runs inside your browser.',
      s: [
        { p: ['Open **Virtual machines**: Snake OS! Pro is already installed and ready to set up. It is a **real lightweight Linux** (Buildroot and BusyBox) emulated in your browser, **offline**, with a Snake OS desktop: a glass taskbar, a Start menu and the **Terminal**, **Files**, **Text editor**, **System monitor** and **Settings** apps.'],
          ul: ['When you set it up you choose its name and style. After that it stays **fixed on your profile**: it cannot be removed or changed.', 'Everything runs in your browser: its state is saved in your browser, per profile.', 'It boots in a few seconds and also works in phone mode, with full-screen windows.'], imgs: ['app-maquinas-virtuales', 'app-vm-pro'], caps: ['Virtual machines.', 'Setting up Snake OS! Pro.'] }
      ] },

    { id: 'trucos', ico: '⌨️', title: 'Tips and keyboard shortcuts', intro: 'To get things done faster.',
      s: [
        { table: [['`Ctrl+K` or `Ctrl+Space`', 'Global search'], ['`Alt+V`', 'Clipboard history'], ['`Alt+Q`', 'Switch apps'], ['`Ctrl+Shift+S`', 'Screenshot'], ['`Ctrl+Alt+←/→`', 'Switch virtual desktop'], ['`Ctrl+Alt+Shift+←/→`', 'Move the window to another desktop'], ['`F5` / `F6`', 'Brightness down / up'], ['`S`', 'Open Snakemoji (outside text fields, Code Lab, Terminal, games and Metaverse)'], ['`Esc`', 'Close menus · stop a Doganiero Bot'], ['Right click', 'Desktop menu'], ['Double-click the title bar', 'Maximise the window'], ['Middle click an app on the taskbar', 'Close it']] },
        { h: 'Tips', ul: ['Type in the Start menu search box and press `Enter` to open an app without the mouse.', 'Windows remember their size and position: place them the way you like once.', 'Turn on **Desktop widgets** to see your upcoming events and pinned notes at a glance.', 'With **Names of open apps on the taskbar** off, the taskbar shows only icons and more fits.', 'On a phone, swipe down from the top bar to open the control centre.'] }
      ] },

    { id: 'faq', ico: '❓', title: 'Frequently asked questions', intro: '',
      s: [
        { faq: [
          ['Do I have to install anything on my computer?', 'No. Snake OS runs in the browser. You only need your Dogaemail account.'],
          ['Where are my things saved?', 'Your notes, files, events and settings are saved to your account, so you have them on any computer or phone. A few things, such as the state of Snake OS! Pro, are saved only in your browser.'],
          ['Can I create my account with Gmail?', 'New accounts cannot be created with Gmail. Use another address, for example a Dogaemail one.'],
          ['I forgot my password.', 'If you are still signed in, change it in My profile. If you cannot get in, ask whoever runs your Snake OS for help.'],
          ['I do not get notifications when Snake OS is closed.', 'Turn them on in Settings › Notifications and accept the permission. The browser has to stay open. If they show as blocked, allow them from the padlock in the address bar.'],
          ['How do I change the language?', 'With the 🌐 Language button in Quick settings.'],
          ['Can I use GIFs?', 'Yes: as an animated profile picture (My profile) and as a wallpaper (🎨 button › Upload image or GIF), up to 10 MB.'],
          ['Why can’t I see the system cursor?', 'Snake OS always uses its own Snake pointer. If it is hard to see, turn on Big cursor or High contrast in Settings › Accessibility.'],
          ['How do I remove an app I installed from the Store?', 'Drag its icon to the Trash. Snake OS apps cannot be removed.'],
          ['Can I use Android or Play Store apps?', 'No. Snake OS runs in the browser and does not run Android apps. Use the Snake OS apps and the ones in Doganiero Store.'],
          ['The screensaver does not appear.', 'Check the time in Settings › Screensaver. It does not appear while you watch a video, are on a call, have a game open or a bot is working.'],
          ['A Doganiero Bot is doing something I do not want.', 'Press Esc, the Cancel button or type «para» (stop) in its chat. It only touches your desktop if you end the request with «/on my desktop».'],
          ['How do I download this manual again?', 'Settings › About › User manual, the button in the Start menu or the one on the sign-in screen.']
        ] }
      ] }
  ]
};
