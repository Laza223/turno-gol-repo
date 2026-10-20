---
version: 1
slug: "src-app-home"
primary_target: "src/app/home"
related_targets: ["src/app/page.tsx"]
---

# Home (src/app/page.tsx y src/app/home/)

Modo: Persuade, con la sobriedad de Operate. El visitante es el futbolero que quiere jugar, casi siempre desde el celular, a veces ya con sesión. Su trabajo es ver que hay cancha cerca y cuándo está libre hoy, y reservar un turno sin llamar a nadie; si no, buscar por zona, día y hora. El complejo tiene su página (`/para-complejos`, que no se toca): en la home le queda una franja al pie.

Mundo: La Reserva (DESIGN.md, sección del portal), el mismo de la página del complejo, la reserva y la cuenta. Este brief reemplaza al de La Previa del 2026-09-27. Salen de la home el resplandor, los blobs, `PitchLines`, el texto con gradiente, la negra itálica, el vidrio, las fotos de fondo y la barra `overlay`.

## Decisiones del dueño

**2026-09-27 (siguen vigentes):**
- Solo entran complejos con reserva online.
- El orden pone primero el perfil completo y después la distancia; nunca un orden pagado.
- El radio crece de 5 a 40 km.
- No hay datos inventados.

**2026-10-20:**
- **Sale "Los mejor valorados".** Ordenaba por rating sin mínimo de reseñas.
- **Sale "Cómo funciona".** Prometía filtro por precio y confirmación inmediata, que no siempre son ciertos.
- **El banner de dueños pasa a una franja sobria al pie:** una línea y un link a `/para-complejos`, sin foto ni gradiente.

## Qué tiene la página, en orden

1. **El cromo del portal.** Es la misma barra sólida, el pie y la barra inferior del jugador con sesión que en el resto del portal (`PortalShell` / `PortalFrame`); "Para complejos" sigue en la barra. Hay un solo `<main id="main-content">` y un solo skip link.
2. **Primer viewport.**
   - El h1 queda como está: "Tu partido empieza en TurnoGol", sin acento de gradiente. El subtítulo se conserva.
   - El buscador (Zona, Día, Hora y "Buscar canchas") va antes de las canchas en el celular.
   - **Canchas cerca:** la más cercana con sus horarios libres de hoy, que se tocan y van a reservar, y dos filas más.
   - En escritorio, buscador a la izquierda y canchas a la derecha.
3. **Estados de "cerca tuyo", cada uno con salida:**
   - buscando: "Usar mi ubicación";
   - sin permiso, sin soporte o con error: chips de zona;
   - nada a 40 km: un vacío honesto;
   - **disponibilidad que no cargó** (429, 4xx o red): dice "No pudimos cargar los horarios" y ofrece la página del complejo. **No** dice "no hay turnos".
4. **La franja de dueños**, al final, antes del pie.

## Precios

"Turno desde" aparece solo si el valor no es `null` (`hide_public_prices`). Ningún `$` en el DOM ni en un `aria-label` cuando el complejo oculta precios.

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
- `theme-system.spec.ts` (`.landing-hero` desaparece);
- `landing.spec.ts`, si cambia algo de la barra;
- la baseline `landing.png`;
- las stories de la home y de `PortalHeader` `Overlay*`;
- `HAPPY_PATHS_MASTER` TG-HP-001 (ya estaba desactualizado);
- `DESIGN.md` y `design.json`.

## Fuera de alcance

- "Tu próximo turno" y "Repetir" en la home: la barra inferior ya deja "Reservas" a un toque y la ISR obliga a pedirlo desde el cliente. Queda para cuando haya uso que lo pida.
- `/explorar` (2.6), `/para-complejos`, `/precios`, la OG image y `llms.txt`.
- La lógica de `pickNearby` y del radio.
- Las clases de `globals.css` que comparten otras páginas (`.search-card`, `.hero-glow-blob`, `.hero-accent-text`, `.mockup-*`, `.player-hero-grid`, `.card-premium`).
