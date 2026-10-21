# Decisión: la home y /explorar se rehacen con taste

> **Reemplazada** por [`2026-10-20-vuelve-la-previa.md`](2026-10-20-vuelve-la-previa.md): el dueño rechazó La Reserva y taste; el portal vuelve a La Previa.

**Fecha:** 2026-10-20. **Decide:** Lazar. Motivo: el rediseño de La Reserva con impeccable (PRs #424 a #452) le resultó aburrido. Frenó `/explorar` (fase 2.6) antes de mergearla y pidió rehacer con la skill de diseño `design-taste-frontend` (taste) la parte del portal que vende.

## Qué pasa a taste

- La home `/`.
- `/explorar`.

Nada más. La ficha del complejo y el cromo del portal quedan afuera (ver abajo).

## Qué sigue en La Reserva (impeccable), tal como está

- La ficha del complejo `/[slug]`.
- El cromo del portal: `PortalShell`, `PortalHeader`, `SiteFooter` y `PlayerBottomNav`. Por ahora queda como está porque enmarca la ficha.
- El flujo de reserva: `/[slug]/reservar` y `/reserva/[id]/*`.
- La autenticación del jugador: `/ingresar`, `/aceptar-terminos` y `/verify`.
- La cuenta del jugador: `/mis-reservas`, `/configuracion` y `/eliminar-cuenta`.
- Todo el panel admin.

## Marca

- La paleta de taste vale solo para la home y `/explorar`, y puede salir del verde.
- El paso de `/explorar` a la ficha no puede sentirse como entrar a otro sitio: la paleta y la tipografía nuevas tienen que convivir con La Reserva, que sigue igual.
- El logo, el nombre y el panel no cambian.

## Qué reemplaza

En la home y en `/explorar`, el compromiso del 2026-10-15: el portal sigue el estándar de las apps de reservas de canchas, plano y sin mundo temático. Está escrito en `PRODUCT.md` (Brand Commitments) y en `DESIGN.md` (Overview, "El Mostrador y La Reserva"). Para el resto del portal sigue vigente. Los dos documentos llevan un puntero a esta decisión; la reescritura completa va en un PR posterior.

## Qué sigue vigente

- Contraste AA en claro y en oscuro.
- Los precios ocultos: el portal funciona sin mostrar precios.
- Los vetos de producto de `CLAUDE.md`.
- `(business)` y `/[slug]/torneos` quedan fuera de alcance.
- El F3 de [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md), que libera el rediseño del portal del feature freeze. Esta decisión cambia la herramienta y el alcance visual, no la autorización.

## Qué sigue

1. Direcciones y mocks de taste para la home y `/explorar` (fase F1), sin tocar código de la app.
2. Reescritura de `PRODUCT.md` y `DESIGN.md` con la dirección elegida.
3. El WIP de `/explorar` con impeccable (rama `design/portal-explorar`, sin commitear) no se mergea. Lo no visual que tenía se rescató en el PR de esta decisión; qué hacer con el resto de la rama lo decide Lazar.
