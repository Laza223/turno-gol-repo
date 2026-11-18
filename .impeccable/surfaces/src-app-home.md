---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: ["src/app/page.tsx"]
---

# Home (src/app/page.tsx y src/app/home/)

Modo: Persuade, con la sobriedad de Operate. El visitante es el futbolero que quiere jugar, casi siempre desde el celular, a veces ya con sesión. Su trabajo es buscar canchas por zona y reservar un turno sin llamar a nadie. El complejo tiene su página (`/para-complejos`): en la home le queda el link de la cabecera y el cierre de la página.

Mundo: portal de vidrio (DESIGN.md, Colors › Portal de vidrio), decisión del 2026-11-13 ([`docs/decisions/2026-11-13-portal-vidrio.md`](../../docs/decisions/2026-11-13-portal-vidrio.md)). La Previa (la home del 2026-10-20) se reemplazó por el vidrio el 2026-11-13: ya no hay `.landing-hero`, `PitchLines`, `.hero-accent-text` ni partículas. Referencia: el mockup `home.html` de [`docs/planning/mockups/2026-11-13-portal-vidrio/`](../../docs/planning/mockups/2026-11-13-portal-vidrio/README.md) y la [dirección de diseño y movimiento](../../docs/planning/2026-11-13-portal-vidrio-direccion.md).

## Decisiones del dueño

**2026-09-27:** las reglas de "cerca tuyo" (solo complejos con reserva online, orden por perfil completo y distancia, radio de 5 a 40 km) quedaron sin pantalla. **Sigue vigente: no hay datos inventados.** La ventana de la home muestra complejos reales de la localidad y, si no hay para mostrar, no aparece.

**2026-10-29 (la puerta del complejo en el celu):** "Para complejos" entra en el pie y, bajo `sm`, hay una línea de texto hacia `/para-complejos`, porque la cabecera lo esconde en el celu. En `/ingresar`, "Entrar a mi panel" (`/login`) y "Registrar mi complejo" (`/register`).

**2026-11-13 (portal de vidrio):**
- **Titular nuevo: "Tu cancha, a un toque."**, con "a un toque." en verde. Sale la pastilla de arriba del titular y sale "Tu partido empieza en TurnoGol".
- **El hero lleva foto de fondo** (`HeroBackdrop`): de noche en oscuro y de día en claro, desenfocada detrás del titular, el subtítulo y el buscador y nítida abajo.
- **Buscador de vidrio:** la cancha se elige de Fútbol 4 a Fútbol 11, de a varias, en una hoja; la localidad se resuelve por IP y se cambia en otra hoja.
- **2026-11-14:** Lazar aprobó usar en la home las dos fotos CC0 de Wikimedia del mockup hasta tener fotos propias. El crédito queda en el código (`HeroBackdrop.tsx`) y no se muestra en la web.

## Qué tiene la página, en orden

1. **El cromo del portal.** La cabecera `overlay` de `PortalHeader` (píldora de vidrio flotante sobre el hero), el pie y la barra de abajo del celu, que se ve también sin sesión (Explorar, Rival con el flag, Reservas, Cuenta). La home vive en la raíz de `app/` y arma su propio cromo en `src/app/page.tsx`, con `data-portal-glass` y `PortalMotionProvider`. Hay un solo `<main id="main-content">` y un solo skip link.
2. **El hero** (`Hero.tsx`): `HeroBackdrop` con prioridad (es el LCP), h1 "Tu cancha, a un toque.", subtítulo, el buscador (`HeroSearch` / `HomeSearch`, con las hojas de `SearchSheets.tsx`) y la ventana de complejos (`ComplexWindow`). Vidrio real: el buscador y la ventana; el resto va pintado.
3. **"Reservás en una pantalla"** (`ReservaDibujo`): la ficha nueva dibujada, con los días de la semana.
4. **Rival** (`RivalSection`), solo con el flag `rival`.
5. **El cierre para complejos** (`ClosingCta`).
6. **El pie.**

Tipografía: Archivo, titulares en 700 con `font-stretch: 104%`. Los anchos de línea de la home van en `em` (el `ch` de Archivo con `next/font` mide un 6 % más que en el mockup).

## Movimiento (dirección §4.5)

La foto está visible desde el primer cuadro y se asienta de escala 1,06 a 1; el titular entra por línea sin arrancar con opacidad cero; "a un toque." florece una vez; subtítulo, buscador y ventana suben escalonados; a los 900 ms un reflejo cruza la tarjeta del buscador (una vez por visita). Al bajar, la foto se mueve más lenta y el velo se cierra (atado al scroll, sin JavaScript). Decidido en F9: brillo que sigue al puntero en el borde del buscador (solo compu) y grano sobre el vidrio real. Con "reducir movimiento", todo aparece directo.

## Contratos que se conservan o cambian a propósito

**Se conservan:**
- el form "Buscar canchas de fútbol" y su salida a `/explorar?…`;
- "Ingresar" → `/ingresar?next=%2F`;
- el link "Para complejos";
- el JSON-LD (Organization y WebSite) y la metadata;
- la ISR (`revalidate = 300`, sin `headers()` ni `cookies()` en el server): la localidad por IP la pide el cliente (`/api/public/zona`);
- el piso de 16 px en los campos;
- `formatsLabel`, importado por `[slug]/components/ComplexHero.tsx`.

**Cambiaron a propósito:** el h1 (el titular viejo no aparece en ningún lado: buscar "Tu partido empieza"), el buscador (Localidad y Cancha en lugar de Zona, Día y Hora), las stories de la home y `HAPPY_PATHS_MASTER` TG-HP-001.

**Un gasto a tener en cuenta:** todo `/api/public/*` comparte el balde `publicAvailability` (30 pedidos por minuto por IP). La ventana pide la búsqueda y los horarios solo de las tarjetas que entran a ese ancho: 3 pedidos en el celu y 5 en la compu, más `/api/public/zona` si no hay zona guardada.

## Fuera de alcance

- "Tu próximo turno" y "Repetir" en la home: la barra de abajo ya deja "Reservas" a un toque.
- Videos de dueños y tira de logos: solo con material real.
- `src/app/home/nearby.ts`: de la lógica de "cerca tuyo" solo queda `formatsLabel`.
