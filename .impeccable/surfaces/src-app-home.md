---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: ["src/app/page.tsx"]
---

# Home (src/app/page.tsx y src/app/home/)

Modo: Persuade, con la sobriedad de Operate. El visitante es el futbolero que quiere jugar, casi siempre desde el celular, a veces ya con sesión. Su trabajo es buscar canchas por zona, día y hora y reservar un turno sin llamar a nadie. El complejo tiene su página (`/para-complejos`, que no se toca): en la home le queda el link de la barra.

Mundo: La Previa (DESIGN.md, sección del portal), re-aplicada el 2026-10-20 ([`docs/decisions/2026-10-20-vuelve-la-previa.md`](../../docs/decisions/2026-10-20-vuelve-la-previa.md)). Este brief reemplaza al de La Reserva del 2026-10-20. Vuelven a la home el resplandor, la foto de fondo (solo en oscuro), `PitchLines` en claro, el titular en negra itálica con `.hero-accent-text` y la barra `overlay`.

## Decisiones del dueño

**2026-09-27:** las reglas de "cerca tuyo" (solo complejos con reserva online, orden por perfil completo y distancia, radio de 5 a 40 km) quedaron sin pantalla con el hero de agosto. **Sigue vigente: no hay datos inventados.**

**2026-10-20 (La Previa):**
- **La home queda en solo el hero de agosto** (#129): titular, subtítulo y buscador. No vuelven "cerca tuyo" (`NearbyPanel`), "Los mejor valorados", "Cómo funciona" ni la franja de dueños (`OwnersStrip`). "Para complejos" sigue en la barra.
- Se conservan el titular "Tu partido empieza en TurnoGol", el subtítulo "Mirá los turnos libres de hoy y reservá sin llamar a nadie." y la ausencia de "confirmación inmediata".

## Qué tiene la página, en orden

1. **El cromo del portal.** La barra `overlay` de `PortalHeader` (pastilla `.overlay-nav` flotante sobre el hero), el pie y la barra inferior del celular, que se ve también sin sesión (Explorar, Reservas, Cuenta). La home vive en la raíz de `app/` y arma su propio cromo en `src/app/page.tsx`. Hay un solo `<main id="main-content">` y un solo skip link.
2. **El hero**, sobre `.landing-hero`, dos árboles hermanos gateados por CSS: `HeroMobile` (< `lg`) y `HeroDesktop` (`lg` en adelante).
   - El h1 vive en `HeroDesktop`: "Tu partido empieza en **TurnoGol**" en negra itálica, con "TurnoGol" en `.hero-accent-text`; `HeroMobile` usa un `<p role="heading">` para no duplicarlo. Debajo, el subtítulo.
   - El buscador `HeroSearch` (Zona, Día, Hora y "Buscar canchas") y "Sin descargar ninguna app".
   - Ambiente: foto de estadio solo en oscuro (con el velo `.hero-desktop-scrim` en escritorio), líneas de cal en claro, resplandores `.hero-glow-blob` y partículas solo en oscuro.
3. **El pie.**

## Contratos que se conservan o cambian a propósito

**Se conservan:**
- h1 "Tu partido empieza en TurnoGol";
- el form "Buscar canchas de fútbol" con "Zona", "Día", "Hora" y `/Buscar canchas/i` → `/explorar?…`;
- "Ingresar" → `/ingresar?next=%2F`;
- el link "Para complejos";
- el JSON-LD (Organization y WebSite);
- la metadata;
- la ISR (`revalidate = 300`, sin `headers()` ni `cookies()` en el server);
- el piso de 16 px en los campos;
- `formatsLabel`, importado por `[slug]/components/ComplexHero.tsx`.

**Cambian en el mismo PR:**
- las stories de la home y de `PortalHeader` `Overlay*`;
- `HAPPY_PATHS_MASTER` TG-HP-001.

## Fuera de alcance

- "Tu próximo turno" y "Repetir" en la home: la barra inferior ya deja "Reservas" a un toque. Queda para cuando haya uso que lo pida.
- `/explorar` (nunca migró: siempre estuvo en La Previa), `/para-complejos`, `/precios`, la OG image y `llms.txt`.
- `src/app/home/nearby.ts`: de la lógica de "cerca tuyo" solo queda `formatsLabel`, que usa la ficha (`ComplexHero`).
