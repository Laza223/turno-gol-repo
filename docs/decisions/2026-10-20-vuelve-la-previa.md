# Decisión: el portal vuelve a La Previa, conservando la lógica

**Fecha:** 2026-10-20. **Decide:** Lazar (founder). Motivo: rechazó los dos rediseños del portal del jugador, "La Reserva" (impeccable, PRs #424 a #451) y las direcciones de taste ([`2026-10-20-portal-con-taste.md`](2026-10-20-portal-con-taste.md)). Sus palabras: "prefiero mil veces el diseño que tenía antes".

## Qué se decide

- **Vuelve La Previa en todo el portal:** el look de `9d155ed8` (#423). Oscuro premium, vidrio, resplandores, fotos de fondo y titulares en Archivo negra itálica. Alcance: home, ingreso, cromo (barra, pie, menú de cuenta, barra inferior), ficha del complejo, confirmar, la vuelta de la reserva, Mis reservas y Cuenta. `/explorar` nunca migró y ya está en La Previa.
- **Es un re-skin, no un `git revert`.** Se conservan los flujos, la lógica y los arreglos de los PRs #424 a #451: el estado en la URL y hora-y-después-cancha, el ingreso dentro de confirmar con +18 validado en el servidor, la confirmación automática (`booking-intent.ts`), "Avisarle al grupo", los precios ocultos, la a11y (foco visible, targets de 44 px) y `IngresarLink` con su `?next=`. A los componentes nuevos se les devuelven las clases y las recetas de La Previa.
- **La home queda en solo el hero de agosto** (#129, versión `6781ed03^`): foto full-bleed con el buscador. No vuelven "cerca tuyo", "Los mejor valorados", "Cómo funciona" ni el banner de dueños. Se conservan el titular "Tu partido empieza en TurnoGol", el subtítulo "Mirá los turnos libres de hoy y reservá sin llamar a nadie." y la ausencia de "confirmación inmediata" (#401/#451).
- **Se conserva la barra inferior del celular visible también sin sesión** (Explorar · Reservas · Cuenta). Es lo único nuevo que se queda de La Reserva. Sin sesión, Reservas y Cuenta redirigen a `/ingresar?next=...` por el guard de cada página.

## Qué reemplaza

- [`2026-10-20-portal-con-taste.md`](2026-10-20-portal-con-taste.md), completa.
- El compromiso del 2026-10-15: "el portal sigue el estándar de las apps de reservas de canchas, plano y sin mundo temático" (`PRODUCT.md`, Brand Commitments; `DESIGN.md`, Overview). Reabre y revierte la decisión de reemplazar a "La Previa" del F3 de [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md); la autorización del rediseño del portal de F3 no cambia.

## Qué sigue vigente

- Contraste AA en claro y en oscuro (borde de campo `border-input` a 3:1, foco visible), aunque el look vuelva.
- Los precios ocultos, los vetos de producto de `CLAUDE.md` y el feature freeze.

## Fases

Un PR por fase. R1 (este): home, cromo y barra inferior. R2 ingreso, R3 ficha, R4 confirmar y vuelta, R5 jugador (Mis reservas y Cuenta), R6 limpieza (`PortalWorld`, `portal-world.css`) y reescritura de `PRODUCT.md` y `DESIGN.md`. Hasta R6 los dos documentos llevan solo un puntero a esta decisión. Hasta que llegue cada fase, esas pantallas siguen en La Reserva.

## Consecuencia asumida

La barra inferior sin sesión suma una barra fija a las pantallas públicas del celular. El botón fijo de confirmar (`[data-fixed-cta]`) ya se ubica por encima de la barra; su alto (56 px + 1 px de borde + área segura) está reservado en `PortalFrame`, el `scroll-padding-bottom` de `globals.css` y `ConfirmBookingButton`.
