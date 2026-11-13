# Decisión: el portal del jugador pasa a plano y limpio, en claro y oscuro

> **Superada en parte el 2026-11-13** por [`2026-11-13-portal-vidrio.md`](2026-11-13-portal-vidrio.md): el look pasa a vidrio y las fases P1 a P4 se reemplazan por el plan nuevo. Siguen los dos temas, el buscador de Localidad y Cancha, la localidad por IP, Archivo y los precios ocultos por complejo.

**Fecha:** 2026-11-08. **Decide:** Lazar (founder), con el mockup a la vista ("me encantó"). **Insumo:** el análisis de DeporTurnos (`docs/planning/2026-11-08-referencia-deporturnos.md`, todavía sin commitear en el checkout principal) y el mockup de [`docs/planning/mockups/2026-11-08-portal-plano/`](../planning/mockups/2026-11-08-portal-plano/README.md), aprobado con un solo cambio: la barra inferior flotante.

## Qué se decide

- **Los dos temas, planos y limpios.** Cada jugador ve el tema de su celular (`prefers-color-scheme`). El nivel de prolijidad de referencia es deporturnos.com, pero con la marca de TurnoGol: verde de marca, nunca su violeta ni su Poppins.
- **Sale lo que ensuciaba La Previa:** el vidrio decorativo, los resplandores, las partículas y el texto en degradé (`.hero-accent-text`).
- **El oscuro se queda.** Es la esencia de la marca: el fútbol 5 se juega de noche.
- **Una sola tipografía: Archivo.** Salen Inter y Sora. El titular va en Archivo 800 recta. El logo no cambia.
- **Superficies planas.** Fondo liso, borde de 1 px y una sola sombra, la de la tarjeta del buscador que monta sobre la foto. Los chips y los botones van en píldora.
- **Barra inferior del celular flotante**, estilo Liquid Glass de iOS 26: una píldora translúcida con desenfoque, despegada del borde, con el ítem activo resaltado adentro. Las secciones no cambian: Explorar, Reservas y Cuenta. Es el único vidrio del portal, y se justifica porque deja ver el contenido que pasa por debajo.
- **La home tiene más que el hero de agosto.** En orden:
  1. foto de fondo con el buscador en una tarjeta que monta sobre el corte;
  2. la tira de logos de complejos;
  3. "Los dueños lo cuentan", con videos cortos verticales;
  4. la banda verde para complejos, "Tus jugadores reservan solos. Tu noche se ordena sola.", que lleva a `/para-complejos`.

  El titular "Tu partido empieza en TurnoGol" y el subtítulo se conservan.
- **El buscador pide solo Localidad y Cancha** (Fútbol 5, 6, 7, 8 y 11, de a varias). Fecha y hora salen porque la tarjeta del complejo ya muestra los turnos "Libres hoy". La localidad viene por defecto según la IP (headers de Vercel), sin pedir permiso. Se puede cambiar en una hoja que tiene buscador, "Usar mi ubicación exacta" (ese sí pide permiso) y las localidades con su cantidad de complejos.
- **La tarjeta del complejo es plana.** Los formatos van en píldora gris y los turnos libres en píldoras verdes suaves de 40 px. Salen el borde superior verde y el efecto de elevarse al pasar el mouse.

Los valores concretos (colores, tamaños, radios) son los del mockup (`portal.css`). Pasan a `DESIGN.md` en la última fase.

## Qué reemplaza

- [`2026-10-20-vuelve-la-previa.md`](2026-10-20-vuelve-la-previa.md) en el look del portal. Su lógica y sus flujos siguen: estado en la URL, ingreso dentro de confirmar, +18 en el servidor, precios ocultos, `IngresarLink` con `?next=` y la barra inferior también sin sesión.
- En la home, la regla "solo el hero de agosto" (brief `.impeccable/surfaces/src-app-home.md`). Vuelven la tira de logos, los videos de dueños y la banda para complejos.

## Qué sigue vigente

- Contraste AA en claro y en oscuro, foco visible y objetivos táctiles de 44 px.
- **La ficha del complejo (`/[slug]`) ya es plana (La Reserva)**, así que esta decisión la alinea en lugar de contradecirla. La excepción del 2026-10-21 deja de ser excepción.
- El panel (El Mostrador) no cambia.
- No se inventan datos. La tira de logos y los videos se publican **solo con logos y videos reales**. Hasta que existan, esas secciones no se muestran.

## Fases

Un PR por fase. Hasta la última, `DESIGN.md` y `PRODUCT.md` llevan solo un puntero a esta decisión.

| Fase | Qué |
|---|---|
| P0 | Este PR: decisión, mockup y punteros en `CLAUDE.md`, `PRODUCT.md` y `DESIGN.md`. |
| P1 | Home y cromo del portal: hero plano, tarjeta del buscador, banda para complejos, barra superior y pie, y la barra inferior flotante. |
| P2 | Buscador `/explorar`: barra de Localidad y Cancha, localidad por IP y hoja para cambiarla, y la tarjeta del complejo plana. |
| P3 | El resto del portal en el mismo lenguaje: ingreso, confirmar y la vuelta de la reserva, Mis reservas y Cuenta. |
| P4 | Reescribir `DESIGN.md`, `PRODUCT.md` y los briefs de `.impeccable/surfaces/` del portal; limpiar las clases de La Previa que queden sin uso. |

## Riesgos y pendientes

- **La localidad por IP y la ISR de la home.** `headers()` en el servidor saca a la home de la ISR (`revalidate = 300`). Se resuelve en el middleware o en el cliente. Se decide en P1 y P2.
- **Los logos y los videos dependen de material real** de los complejos.
- `backdrop-filter` está bien soportado en Safari y Chrome móviles. Donde no lo esté, la barra queda con fondo casi opaco y sigue siendo legible.
