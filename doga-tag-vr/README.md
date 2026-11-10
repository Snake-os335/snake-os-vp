# Doga Tag VR

Gorilla-Tag-style tag ("pilla-pilla") in the Doganiero forest. Three.js + WebXR, no build step; three.js is vendored in `lib/` so it works offline.

## Run

En Snake OS VP (producción) el juego se sirve ya montado, sin servidor aparte:

- <https://snake-os-vp.softportweb.com/doga-gorilla> (y `/doga-tag-vr`)
- <https://doga-gorilla.softportweb.com> (subdominio del túnel de Cloudflare, si está publicado)

En local, sin el servidor de Snake OS:

    cd doga-tag-vr && python3 -m http.server 8000

Open http://localhost:8000/ (desktop), or on a Quest browser via HTTPS / `adb reverse tcp:8000 tcp:8000` and press "ENTER VR".


## Controls
- VR: **left stick walks** where you look (push it all the way to run at 12 m/s), plus arm locomotion — press your hands against the ground, trunks, rocks or platforms and push; let go to fling yourself (`VR_WALK`, `VR_RUN`, `STICK_DEAD`, `xrSticks`, `applyStickWalk`).
- Desktop: WASD move (8.2 m/s by default), mouse look (pointer lock), Space jump, Shift run (12.5 m/s), click to swipe an arm.
- Mobile: left half drag = move, right half drag = look/swipe.

## Doganiero features
- Avatar: low-poly faceted gorilla built from three.js primitives (dark charcoal/navy body with a procedural mottled CanvasTexture, heart-shaped grey face mask, big round eyes, grey snout, large grey chest patch with a blue Doganiero "</>" emblem, very long thick arms, blocky low-poly hands, no legs). The player's VR/desktop hands use the same dark blocky hands.
- Doga-huesos (bones): 24 floating bones around the map, respawning 18-28 s after pickup; counter in the HUD.
- Power-ups (8 s, respawn 25 s): Salto Snake 🐍 (jump x1.8 on desktop, VR fling x1.8 with cap 20 m/s, green glowing hands) and Turbo Doga ⚡ (speed x1.55, bigger VR arm reach, blue glow).
- Tienda Doganiero in the clearing: hats (Gorra Doga, Chistera Snake, Hoja, Corona) and fur colours (Carbón, Verde Doga, Azul noche, Coral, Dorado). Press buttons with your hand in VR or click/tap on desktop/mobile. A preview avatar shows your look; bots wear cosmetics too. Bones, owned items and your choice are saved in localStorage (`dogaTag.v1`).
- Green Doganiero burst (particles + ring) on every tag.
- Ciudad Doganiero (north): low-poly town with rooftops, clock tower, plaza, shops/awnings, lamps, crates/dumpsters, concrete/metal footsteps; bots and collectibles play there too.
- Title-screen song (procedural WebAudio loop ~116 BPM, mute toggle, fades out on play/VR).
- Procedural WebAudio: desktop knuckle-thump footsteps (faster when running, silent in air), surface variants (grass/wood/rock), heavier landing thumps, VR hand-impact taps scaled by speed/surface, quieter distance-attenuated bot footsteps (PannerNode). Audio unlocks on first play click.
- Quest performance: bones are one InstancedMesh, pooled tag particles, shared geometries/materials, flat shading, no per-frame allocations in hot loops.

Whoever is "it" (la lleva) glows red; touching someone passes it on (2 s no-tag-back). Scoreboard in the Doganiero clearing + HUD.

## Test URL params
`?autostart` skip menu · `&view=forest|doganiero|arms|tienda|avatar|ciudad` camera presets · `&freeze` stop sim after 0.6 s · `&seed=N`.
