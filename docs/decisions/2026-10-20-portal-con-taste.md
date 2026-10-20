# Decisión: la vidriera del portal se rehace con taste

**Fecha:** 2026-10-20. **Decide:** Lazar. Motivo: el rediseño de La Reserva con impeccable (PRs #424 a #452) le resultó aburrido. Frenó `/explorar` (fase 2.6) antes de mergearla y pidió rehacer la parte del portal que vende con la skill de diseño `design-taste-frontend` (taste).

## Qué pasa a taste: la vidriera

- La home `/`.
- `/explorar`.
- La ficha del complejo `/[slug]`.
- El cromo del portal: `PortalShell`, `PortalHeader`, `SiteFooter` y `PlayerBottomNav`.

## Qué sigue con impeccable

Mantienen su composición actual y heredan la paleta y la tipografía nuevas por tokens, sin rediseño propio:

- El flujo de reserva: `/[slug]/reservar` y `/reserva/[id]/*`.
- La autenticación del jugador: `/ingresar`, `/aceptar-terminos` y `/verify`.
- La cuenta del jugador: `/mis-reservas`, `/configuracion` y `/eliminar-cuenta`.
- Todo el panel admin.

## Marca

- La paleta del portal queda abierta: puede salir del verde.
- El logo, el nombre y el panel no cambian.

## Qué reemplaza

El compromiso del 2026-10-15: el portal sigue el estándar de las apps de reservas de canchas, plano y sin mundo temático. Está escrito en `PRODUCT.md` (Brand Commitments) y en `DESIGN.md` (Overview, "El Mostrador y La Reserva"). Los dos documentos llevan un puntero a esta decisión; la reescritura completa va en un PR posterior.

## Qué sigue vigente

- Contraste AA en claro y en oscuro.
- Los precios ocultos: el portal funciona sin mostrar precios.
- Los vetos de producto de `CLAUDE.md`.
- `(business)` y `/[slug]/torneos` quedan fuera de alcance.
- El F3 de [`2026-10-14-foco-jugador-rival.md`](2026-10-14-foco-jugador-rival.md), que libera el rediseño del portal del feature freeze. Esta decisión cambia la herramienta y el alcance visual, no la autorización.

## Qué sigue

1. Direcciones y mocks de taste (fase F1), sin tocar código de la app.
2. Reescritura de `PRODUCT.md` y `DESIGN.md` con la dirección elegida.
3. El WIP de `/explorar` con impeccable (rama `design/portal-explorar`, sin commitear) no se mergea. Lo no visual que tenía se rescató en el PR de esta decisión; qué hacer con el resto de la rama lo decide Lazar.
