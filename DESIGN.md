---
name: TurnoGol
description: El sistema con el que un complejo de fútbol lleva su día (grilla, cobro, cantina y caja) y el portal donde el jugador reserva.
colors:
  primary: 'hsl(163 94% 24%)'
  primary-foreground: 'hsl(0 0% 100%)'
  background: 'hsl(214 25% 91%)'
  foreground: 'hsl(224 71% 4%)'
  card: 'hsl(0 0% 100%)'
  secondary: 'hsl(214 32% 85%)'
  muted-foreground: 'hsl(215 20% 36%)'
  border: 'hsl(214 32% 83%)'
  ring: 'hsl(160 84% 39%)'
  success: 'hsl(142 72% 29%)'
  warning: 'hsl(32 95% 44%)'
  info: 'hsl(221 83% 53%)'
  destructive: 'hsl(0 72% 51%)'
  primary-dark: 'hsl(160 84% 39%)'
  primary-foreground-dark: 'hsl(224 71% 4%)'
  background-dark: 'hsl(224 71% 4%)'
  foreground-dark: 'hsl(210 40% 98%)'
  card-dark: 'hsl(222 33% 9%)'
  secondary-dark: 'hsl(217 33% 14%)'
  accent-dark: 'hsl(217 33% 17%)'
  muted-foreground-dark: 'hsl(215 20% 65%)'
  border-dark: 'hsl(217 33% 17%)'
  success-dark: 'hsl(142 70% 45%)'
  warning-dark: 'hsl(38 92% 50%)'
  info-dark: 'hsl(217 91% 60%)'
  brand-text: '#047857'
  brand-text-strong: '#065f46'
  brand-text-dark: '#34d399'
  brand-label-dark: '#6ee7b7'
  night-slab: '#020617'
  portal-background: 'hsl(0 0% 100%)'
  portal-surface: 'hsl(210 40% 96.1%)'
  portal-muted-foreground: 'hsl(215.3 19.3% 34.5%)'
  portal-border: 'hsl(214.3 31.8% 91.4%)'
  portal-input: 'hsl(215.4 16.3% 46.9%)'
  portal-input-dark: 'hsl(215.4 16.3% 50%)'
  portal-last-fill: '#fffbeb'
  portal-last-border: '#fcd34d'
  portal-last-text: '#92400e'
  portal-last-text-dark: '#fcd34d'
typography:
  display:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '28px'
    fontWeight: 800
    lineHeight: '36px'
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: '-0.025em'
  numeral:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.875rem'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '-0.025em'
    fontFeature: 'tnum'
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.43
  caption:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.333
  microlabel:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.06em'
  portal-body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  portal-label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
    lineHeight: 1.5
  portal-section:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 800
    lineHeight: '28px'
    letterSpacing: '-0.01em'
  portal-hour:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: '20px'
    fontFeature: 'tnum'
  portal-note:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '16px'
  portal-strong:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '12px'
  2xl: '16px'
  full: '9999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '12': '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '8px 16px'
    height: '40px'
  button-primary-hover:
    backgroundColor: 'hsl(163 94% 24% / 0.9)'
  button-outline:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '8px 16px'
    height: '40px'
  button-ghost:
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '8px 16px'
    height: '40px'
  button-destructive:
    backgroundColor: '{colors.destructive}'
    textColor: '#ffffff'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '8px 16px'
    height: '40px'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.lg}'
    padding: '8px 14px'
    height: '40px'
  status-badge:
    typography: '{typography.caption}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  card-premium:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.xl}'
    padding: '20px'
  nav-rail-item:
    textColor: '{colors.muted-foreground}'
    rounded: '10px'
    height: '52px'
    width: '60px'
  nav-rail-item-active:
    backgroundColor: 'hsl(163 94% 24% / 0.1)'
    textColor: '{colors.brand-text-strong}'
  dialog:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.2xl}'
    padding: '24px'
  tooltip:
    backgroundColor: '{colors.foreground}'
    textColor: '{colors.background}'
    typography: '{typography.caption}'
    rounded: '{rounded.md}'
    padding: '6px 10px'
  nav-tab-active:
    textColor: '{colors.brand-text-strong}'
    typography: '{typography.label}'
    height: '36px'
  grid-slot:
    rounded: '{rounded.md}'
    padding: '6px 8px'
  button-portal-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.portal-label}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
    height: '48px'
    width: '100%'
  button-portal-outline:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-label}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
    height: '48px'
    width: '100%'
  button-portal-outline-disabled:
    backgroundColor: '{colors.card}'
    textColor: '{colors.portal-muted-foreground}'
  nav-portal-header:
    backgroundColor: '{colors.card}'
    textColor: '{colors.muted-foreground}'
    height: '56px'
  nav-portal-bottom-item:
    textColor: '{colors.muted-foreground}'
    height: '56px'
  nav-portal-bottom-item-active:
    textColor: '{colors.brand-text}'
  input-portal:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-body}'
    rounded: '{rounded.xl}'
    padding: '8px 14px'
    height: '48px'
  chip-portal:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '0 16px'
    height: '44px'
  chip-portal-selected:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.full}'
  hour-slot:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-hour}'
    rounded: '{rounded.xl}'
    padding: '4px'
    height: '50px'
  hour-slot-selected:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
  hour-slot-last:
    backgroundColor: '{colors.portal-last-fill}'
    textColor: '{colors.portal-last-text}'
  hour-slot-held:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
  hour-slot-full:
    backgroundColor: '{colors.portal-surface}'
    textColor: '{colors.portal-muted-foreground}'
  court-row:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
    padding: '8px 16px'
    height: '64px'
  notice-portal:
    backgroundColor: '{colors.portal-surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
    padding: '16px'
  summary-portal:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-body}'
    rounded: '{rounded.xl}'
    padding: '16px'
  pay-option:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-body}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
    height: '48px'
  pay-option-selected:
    backgroundColor: '{colors.portal-surface}'
    textColor: '{colors.foreground}'
  button-portal-fixed:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.portal-label}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
    height: '52px'
    width: '100%'
  result-portal:
    textColor: '{colors.foreground}'
    typography: '{typography.display}'
    padding: '16px 16px 48px'
    width: '560px'
  action-row-portal:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.portal-strong}'
    rounded: '{rounded.xl}'
    padding: '12px 16px'
    height: '48px'
    width: '100%'
---

# Design System: TurnoGol

## Overview

**Creative North Star: "El Mostrador y La Previa"**

> **El portal es La Previa** (decisión del 2026-10-20, [`docs/decisions/2026-10-20-vuelve-la-previa.md`](docs/decisions/2026-10-20-vuelve-la-previa.md)): reemplaza a "La Reserva", el portal plano de las PRs #424 a #451. **Excepción del dueño del 2026-10-21: la ficha del complejo `/[slug]` se queda en La Reserva** (Components › La ficha del complejo la describe). Cómo se ejecutó, fase por fase, está en la sección "Ejecución" de esa decisión.

TurnoGol es un solo sistema con dos personalidades. Comparten el verde de marca, las tipografías, el logo y las primitivas de `src/components/ui/`; cada una tiene su mundo. **El Mostrador** es el panel del complejo: una herramienta que el encargado usa toda la noche en una notebook con mouse, mientras atiende gente y contesta el WhatsApp. Es denso pero obvio, con los datos primero, un solo verde que grita por vista y movimiento corto. **La Previa** es el portal del jugador: una vidriera oscura y premium, con vidrio, resplandores esmeralda, fotos de fondo y titulares en Archivo negra itálica, que se siente como la previa de un partido. Cero fricción, tipo ecommerce, sin perder accesibilidad (compromiso de marca de `PRODUCT.md`). La única parte del portal que no es La Previa es la ficha del complejo (`/[slug]`): ahí rige **La Reserva**, plana (fondo blanco en claro, bordes de 1 px, un solo verde para lo elegido, títulos en Archivo 800 recta, sin resplandores ni vidrio).

El mundo del panel es césped de noche sobre slate. En claro, tarjetas blancas que flotan con sombras en capas sobre un fondo slate frío; en oscuro, losas slate-950 con superficies de vidrio (relleno blanco al 3 %, desenfoque y un resplandor esmeralda). Los dos temas son de primera: ninguna vista se diseña para uno y "después se verá" el otro; arranca el del sistema (`next-themes`, `defaultTheme="system"`). El estado nunca se comunica solo con color: siempre va color, ícono y texto, y lo resuelve una sola tabla de tonos.

Este documento describe el estilo tal como está en el código al 2026-10-21 y es la única autoridad de diseño del repo. El panel se **refina** sobre este estilo; no se reemplaza. Donde los documentos anteriores (hoy en `docs/archive/design-system/`) y el código no coincidían, ganó el código. Rechazo confirmado por el dueño el 2026-09-23: cambiar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas"). Ese rechazo es del panel. El portal pasó por dos rediseños que el dueño rechazó el 2026-10-20 (La Reserva y las direcciones de taste, `docs/decisions/2026-10-20-portal-con-taste.md`): "prefiero mil veces el diseño que tenía antes".

**Qué es La Previa y dónde rige.** Es el look del portal de `9d155ed8` (#423), re-aplicado como re-skin sobre la lógica y los flujos de La Reserva (que se conservan). Rige en la home `/` (solo el hero, con el buscador), el cromo (barra, pie, menú de cuenta, barra inferior), `/ingresar`, `/aceptar-terminos` y los estados de jugador de `/verify` (`PortalAuthFrame`), `/explorar`, confirmar `/[slug]/reservar` con el ingreso en un modal, la vuelta de la reserva `/reserva/[bookingId]/*` (`ReservaDarkShell`) y el grupo del jugador `(player)`: Mis reservas, Mi cuenta y Eliminar la cuenta (`PlayerHeroBand`). **La excepción es la ficha del complejo** `/[slug]` y su `not-found`: `PortalWorld` (`src/components/world/PortalWorld.tsx` + `portal-world.css`) sigue montado en `(perfil)/layout.tsx` y en `not-found.tsx`; allí valen los tokens `portal-*` y la regla `html:has([data-world='portal']) .player-shell-bg` de `globals.css` apaga el fondo de cancha. Las páginas de torneos (`/[slug]/torneos/*`) quedan afuera de `PortalWorld`. **Una pantalla nueva del portal se construye en La Previa**, salvo que sea parte de la ficha.

**Key Characteristics:**

- Esmeralda sobre slate, con claro y oscuro como temas de primera.
- Panel: claro = elevación (sombras en capas), oscuro = vidrio (blanco al 3 % + blur + resplandor). Portal: oscuro premium con vidrio, resplandores y fotos; en claro, el mismo lenguaje sobre crema esmeralda (`.player-shell-bg`, `.landing-hero`). Excepción: la ficha del complejo, plana en los dos temas.
- Inter trabaja; Archivo titula, pone las cifras clave y firma el logo. En el portal el titular es Archivo negra itálica (`font-display font-black italic`) con un tramo en degradé esmeralda (`.hero-accent-text`). Toda cifra es tabular.
- Estado = color + ícono + texto, siempre desde `src/lib/status-tone.ts`.
- Panel denso y movimiento corto (200 ms en los controles). Lo único largo es un pulso de 600 ms, una sola vez: el turno que entra a la grilla (y, en el portal, el aro de la reserva confirmada).
- Un solo primario por vista.
- El portal de La Previa usa los tokens del panel, con una sola subida de contraste: el grupo del jugador marca `data-portal-fields` y `globals.css` sube `--input` y `--ring` a 3:1. Los tokens propios `portal-*` (colgados de `html` cuando hay un `[data-world='portal']`) son solo de la ficha.

## Colors

Esmeralda de cancha sobre slate frío: un solo protagonista verde, neutros que callan y cuatro tonos reservados para el estado. Los valores normativos son los HSL de `src/app/globals.css` (`:root` y `.dark`), que Tailwind v4 expone como `bg-primary`, `text-muted-foreground`, etc., vía `@theme`.

### Primary

- **Esmeralda de marca** (`primary`: hsl(163 94% 24%) = emerald-700 en claro · `primary-dark`: hsl(160 84% 39%) = emerald-500 en oscuro): relleno del CTA, tinte del ítem activo de la navegación (`bg-primary/10`), selección de chips y radios, borde activo. El texto encima es blanco en claro (5,5:1) y slate-950 en oscuro (7,9:1).
- **Esmeralda de texto** (`brand-text` #047857 sobre tarjetas claras, 5,5:1 · `brand-text-strong` #065f46 sobre el fondo de página y en rótulos sobre tinte, 6,0:1 · `brand-text-dark` #34d399 y `brand-label-dark` #6ee7b7 en oscuro): links, rótulos de estado, el "GOL" del logo. El par estándar es `text-emerald-700 dark:text-emerald-400`.
- **Esmeralda de foco** (`ring`: hsl(160 84% 39%) = emerald-500, igual en los dos temas): anillo de foco y resplandores. Nunca como texto sobre claro.

### Neutral

- **Slate frío de fondo** (`background`: hsl(214 25% 91%), ≈ #DDE3EC · `background-dark`: hsl(224 71% 4%) = slate-950): el fondo de página. No es blanco en ningún tema; las tarjetas flotan encima.
- **Blanco de tarjeta** (`card`: hsl(0 0% 100%) · `card-dark`: hsl(222 33% 9%)): superficies de trabajo, popovers, diálogos.
- **Tinta** (`foreground`: hsl(224 71% 4%) = slate-950 · `foreground-dark`: hsl(210 40% 98%) = slate-50): texto principal.
- **Slate anidado** (`secondary`: hsl(214 32% 85%), el mismo valor que `muted` y `accent` en claro · `secondary-dark`: hsl(217 33% 14%), `accent-dark`: hsl(217 33% 17%)): hover de menús, superficies anidadas, base del skeleton.
- **Texto secundario** (`muted-foreground`: hsl(215 20% 36%) · `muted-foreground-dark`: hsl(215 20% 65%) = slate-400): subtítulos, ayudas, rótulos inactivos. Está en 36 % y no en 40 % a propósito: con 40 % no llegaba a 4,5:1 sobre `bg-muted`.
- **Línea** (`border`: hsl(214 32% 83%), igual que `input` · `border-dark`: hsl(217 33% 17%)): todos los bordes. `globals.css` la aplica por defecto a todo elemento.
- **Losa nocturna** (`night-slab` #020617): el fondo de las superficies siempre oscuras: la web comercial (`(business)`), las pantallas del staff en `(auth)` y, en el portal, el marco de ingreso (`PortalAuthFrame`), la vuelta de la reserva (`.reserva-shell`) y el hero de la home (`.landing-hero`) en oscuro. El fondo del resto del portal en oscuro es `.player-shell-bg` (slate-950 con resplandor y la cancha vectorial).
- **Superficie siempre oscura** (`.dark-surface`, en `globals.css`): una página que es oscura aunque el sitio esté en claro (hoy `/para-complejos`) envuelve su contenido en esta clase. La clase `.dark` sola no alcanza: Tailwind v4 resuelve los `--color-*` una vez en `:root`, y `text-foreground`, `bg-card` y compañía seguirían saliendo en claro. `.dark-surface` los vuelve a declarar.

### Portal (La Previa y La Reserva)

**La Previa usa los tokens del panel** (`primary`, `foreground`, `card`, `border`, `destructive` y los tonos de estado) sin redeclarar ninguno. Lo propio del portal son recetas de superficie en `src/app/globals.css`, cada una con su variante clara y su variante `.dark`:

- **Fondo del portal (`.player-shell-bg`):** lo pone `PortalFrame` a todo el cascarón. En claro, emerald-50 con un degradé #f0fdf4 → #e6fced y las líneas de una cancha vectorial al 15 %; en oscuro, #020617 con un resplandor esmeralda arriba a la derecha y las mismas líneas al 6 %. Fijo (`background-attachment: fixed`).
- **Hero de la home (`.landing-hero`):** crema esmeralda en claro (#f0fdf4 → blanco → #ecfdf5) y #020617 en oscuro. La foto de ambiente (`/bg-hero-desktop.png`, `/bg-hero-2.png`) es solo de oscuro, con el velo `.hero-desktop-scrim` en escritorio; en claro firman las líneas de cal (`PitchLines`).
- **Resplandor (`.hero-glow-blob`, `.reserva-glow-top`, `.reserva-glow-bottom`):** manchas radiales esmeralda con desenfoque; más fuertes en claro que en oscuro para no fundirse con el campo.
- **Banda del jugador (`.player-hero-band`):** degradé crema (#ecfdf5 → blanco) con borde esmeralda al 18 % y elevación suave en claro; #07131d → #020617 con borde blanco al 8 % en oscuro. Lleva la grilla decorativa `.player-hero-grid`.
- **Vidrio de ingreso (`AUTH_CARD_STYLE`, en `PortalAuthFrame.tsx`):** degradé rgba(15,23,42,.72) → rgba(2,6,23,.85), borde blanco al 10 % y resplandor esmeralda; lo usan la card de `/ingresar` y el modal de confirmar.
- **Tarjeta-comprobante (`.reserva-receipt-card`):** blanco → #f0fdf4 con borde esmeralda en claro; vidrio slate en oscuro. La usan el resumen de la reserva (`BookingSummary`) y la política de reservas del panel.
- **Titular con degradé (`.hero-accent-text`):** en claro, #047857 → #059669 → #065f46 (3,6:1 o más sobre #ecfdf5, el extremo más oscuro de la banda; el texto es grande y pide 3:1; lo fija `tests/unit/hero-accent-contrast.test.ts`); en oscuro, #6ee7b7 → #34d399 → #10b981 sobre slate-950.
- **Borde de campo y foco del jugador (`data-portal-fields`):** el grupo `(player)` envuelve sus páginas en `<div data-portal-fields className="contents">` y `globals.css` cuelga de `html` (para alcanzar a los portales de Radix en `body`) `--input` slate-500 (4,8:1 sobre blanco) y `--ring` = `primary` en claro, y `--input` #6B7C94 en oscuro (4,3:1 sobre la tarjeta, 4,7:1 sobre el fondo). Los marcos siempre oscuros (ingreso y modal de confirmar) lo resuelven con `[--input:215.4_16.3%_50%]` en su propio contenedor.
- **Siempre oscuro:** `PortalAuthFrame` y el modal de ingreso llevan `dark dark-surface`, para que los tokens y los `dark:` de los hijos resuelvan en oscuro también con el tema claro.

**La Reserva (solo la ficha del complejo).** `PortalWorld` redeclara lo que cambia, colgado de `html:has([data-world='portal'])`; `primary`, `foreground`, `card`, `destructive` y los tonos de estado se heredan. Los valores viven en `src/components/world/portal-world.css`.

- **Blanco de página** (`portal-background`, en claro): el fondo es blanco; en oscuro es el `background-dark` del panel. Se pinta con `bg-background`, nunca con `bg-white`.
- **Slate de superficie** (`portal-surface`, slate-100 #F1F5F9, en claro): superficies anidadas, avisos (`bg-muted`) y hover (`secondary`, `muted` y `accent` valen lo mismo).
- **Texto secundario** (`portal-muted-foreground`, slate-600 #475569, en claro): 7,6:1 sobre blanco y 6,9:1 sobre slate-100.
- **Línea de superficie** (`portal-border`, slate-200 #E2E8F0, en claro): separa superficies. Con 1,2:1 sobre blanco no delimita un control.
- **Borde de campo** (`portal-input`, slate-500 #64748B, en claro · `portal-input-dark` #6B7C94 en oscuro): el borde de los campos y del botón `outline`. Llega a 3:1 contra el fondo (WCAG 1.4.11): 4,8:1 sobre blanco; en oscuro, 4,7:1 sobre el fondo, 4,3:1 sobre la tarjeta y 3,2:1 en hover (`border-input/80`).
- **Ámbar de "Queda 1"** (`portal-last-fill` #FFFBEB, `portal-last-border` #FCD34D y `portal-last-text` #92400E en claro; en oscuro, ámbar al 10 % con borde al 40 % y texto #FCD34D): escalas amber 50, 300 y 800, escritas como clases de Tailwind en `HourGrid`. Solo la hora a la que queda una cancha; ver The Scarcity Amber Rule.
- **Foco** (`ring` = `primary`): emerald-700 en claro (5,6:1 sobre blanco; el emerald-500 del panel da 2,6:1) y emerald-500 en oscuro (7,8:1 sobre el fondo).
- **Selección de texto:** tinte `primary` al 25 % con el texto en `foreground`, puesto una vez en `PortalWorld`.

### Status

- **Cobrado** (`success`: hsl(142 72% 29%) = green-700 · `success-dark`: hsl(142 70% 45%)): confirmado, jugado, cobrado, ingreso.
- **Pendiente** (`warning`: hsl(32 95% 44%) = amber-600 · `warning-dark`: hsl(38 92% 50%)): esperando seña, atención.
- **Informativo** (`info`: hsl(221 83% 53%) = blue-600 · `info-dark`: hsl(217 91% 60%) = blue-500): en proceso (MercadoPago), confirmado a cobrar, avisos neutros. El azul de MercadoPago se permite solo dentro del contexto de pago.
- **Peligro** (`destructive`: hsl(0 72% 51%) = red-600, igual en los dos temas): borrar, ausente, egreso, error y el turno jugado y no cobrado ("No cobrado", decisión del dueño del 2026-09-25: es plata que no entró).

Los rótulos sobre un tinte de estado usan la escala 800 en claro y 300 en oscuro (rojo: 700 y 300). Esas clases, los tintes al 10/15 % y el borde izquierdo de la grilla salen de `TONE_BADGE`, `TONE_TEXT`, `TONE_TINT` y `TONE_BORDER` en `src/lib/status-tone.ts`, con siete tonos: `success`, `warning`, `info`, `destructive`, `neutral`, `brand` y `plus` (este último no es un estado: ver TurnoGol Plus).

### TurnoGol Plus

- **Violeta = lo pago con IA, y nada más.** Hoy es el asistente de WhatsApp (flag `whatsapp_bot`). Token `--plus`: violet-600 hsl(262 83% 58%) en claro y violet-500 hsl(258 90% 66%) en oscuro; está también en `.dark-surface`. Texto sobre tinte: violet-700 en claro (6,1:1) y violet-300 en oscuro (8,5:1); botón sólido con texto blanco en claro (5,7:1) y slate-950 en oscuro (4,8:1). Medido, no estimado.
- **Nunca es un estado.** Lo que anda, falta o falló sigue siendo `success`, `warning` o `destructive`; el violeta solo marca de qué paquete es el renglón. Un renglón Plus lleva `PlusBadge` y la pastilla de estado va al lado, en su tono.
- **Dónde se usa:** ítem y página de Ajustes del asistente, y su botón de prender (variante `plus` de `Button`). Nada del resto del panel ni del portal; el asistente de alta del onboarding no es Plus.
- **Distinto del violeta del super-admin**, que se eliminó (ver Superadmin): aquel identificaba un panel, este identifica un producto pago.

### Named Rules

**The One Voice Rule.** Por vista, un solo elemento grita en verde sólido: el CTA primario o el dato clave. Los acentos susurran (texto o borde esmeralda) y todo lo demás calla en slate. En la grilla se invierte a propósito: el verde marca lo cobrado, no la acción.

**The Reserved Hues Rule.** `success`, `warning`, `info` y `destructive` son estado, no decoración. Lo que entra va en verde y lo que sale en rojo, siempre con signo y rótulo. La excepción es el libro de Caja › Cuentas, donde casi todo entra y cuarenta montos verdes por noche eran ruido: ahí el ingreso va en el color del texto con "+" y solo lo que sale va en rojo con "−" (decisión del dueño del 2026-09-25).

**The Component Border Rule.** En el portal, lo que delimita un control que se toca o se tipea (campo, casilla, botón `outline`) lleva `border-input` (3:1 o más contra el fondo); `border-border` es solo para separar superficies. En La Previa lo garantizan `data-portal-fields` en el grupo del jugador y el `[--input]` de los marcos siempre oscuros; en la ficha, `portal-input`.

**The Scarcity Amber Rule.** En la reserva de la ficha, el ámbar es solo de "Queda 1": la única escasez que es un dato real. No se usa para "Señando" (es una espera y va con borde punteado), ni para avisos, ni para decorar. Va únicamente sobre la hora sin elegir: la elegida es verde.

**The Measured Contrast Rule.** Las escalas emerald, red y amber están fijadas en hex (valores de Tailwind 3) dentro del `@theme` de `globals.css`, porque las de Tailwind 4 en OKLCH rompían AA. Texto esmeralda: 700 sobre tarjeta clara, 800 sobre el fondo de página, 400 en oscuro. Nunca emerald-500 (2,5:1) ni emerald-600 (3,8:1) como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600 (3,8:1 y 3,2:1).

## Typography

**Display Font:** Archivo (variable, `font-display`, con fallback `ui-sans-serif, system-ui`)
**Body Font:** Inter (variable, `font-sans`, el default del `<body>`)
**Label/Mono Font:** Sora (`font-logo`), solo en microrrótulos de la web comercial y del login. La monoespaciada es la del sistema (`font-mono`, sin fuente propia) y solo muestra códigos que se copian o se tipean: la frase de `ConfirmDialog`, el código de referencia de `ErrorState`, el código de una reserva.

**Character:** Inter hace el trabajo: tablas, formularios, rótulos, montos dentro de una fila. Archivo habla: títulos de página, cifras clave, el logo en negra itálica mayúscula, los titulares de La Previa en negra itálica y los títulos de la ficha en 800 recta. Las tres se cargan con `next/font` en `src/app/layout.tsx`.

### Hierarchy

- **Display** (Archivo 900 itálica, `font-display font-black italic`, interlineado cerrado, -0.03em): el titular de cada pantalla de La Previa, con un tramo en `.hero-accent-text` ("Mis **reservas**", "Confirmá tu **reserva**"). Tamaños: `AUTH_TITLE` 30 px en el ingreso, `text-3xl` en confirmar y en la vuelta, `clamp(26px, 6vw, 36px)` en `PlayerHeroBand`, `text-2xl` en Eliminar la cuenta y `clamp(48px, 5.6vw, 88px)` en el h1 de la home. En la ficha del complejo (La Reserva) el título es Archivo 800 recta de 28 px, interlineado 36 px, -0.01em (`PORTAL_TITLE` en `src/components/world/PortalAuthFrame.tsx`; el nombre del complejo usa la misma voz).
- **Headline** (Archivo 700, 24 px y 30 px desde 640 px, -0.025em): el título de página del panel (`PageHeader`).
- **Numeral** (Archivo 700, 30 px, tabular, -0.025em): la cifra de un KPI (`StatCard`) y los totales destacados.
- **Title** (Inter 600, 18 px, interlineado 1): título de diálogo y de sheet. Los títulos de sección (`SectionHeader`) van en Inter 600 de 16 px.
- **Body** (Inter 400, 14 px): el mínimo del panel. En el portal el cuerpo es `portal-body` (Inter 400, 16 px) y las ayudas van en 14 px; nada baja de 13 px.
- **Portal label** (Inter 500, 16 px): botones y rótulos de campo del portal.
- **Portal section** (Archivo 800 recta, 20 px, interlineado 28 px, -0.01em; `PORTAL_SECTION_TITLE`): el título de cada bloque de una página del portal (Canchas libres a las 20:00, Canchas, Fotos, Horarios, Servicios, Reseñas). El conteo que lo acompaña ("Canchas (5)") va en Inter 400 de 13 px, tabular y `muted-foreground`.
- **Portal hour** (Inter 600, 16 px, interlineado 20 px, tabular): la hora dentro de su botón; el estado va debajo en 13 px (interlineado 16 px). El nombre de una cancha y su precio van en 16 px semibold (el precio, tabular y con `formatArs`); el formato y los datos de apoyo, en 13 px.
- **Label** (Inter 500, 14 px): botones, rótulos de formulario, ítems de menú.
- **Caption** (Inter 500, 12 px): badges, ayudas debajo de un campo, encabezados de tabla (en mayúsculas con `tracking-wide`).
- **Microlabel** (Inter 600, 12 px, mayúsculas, 0.06em): el nombre del complejo en la barra superior. El rótulo del riel de navegación va en 10 px semibold.

### Named Rules

**The Tabular Rule.** Toda cifra que se compara o cambia (plata, horas, contadores, columnas) lleva `tabular-nums`. La plata se muestra `$ 12.500`, sin decimales, siempre con `formatArs` de `src/lib/format.ts` (el espacio después del `$` es uno duro, U+00A0; nada de formateadores propios con `Intl.NumberFormat` o `toLocaleString`); la hora, en 24 h (`18:00`); los rangos, con raya y sin espacios (`17:00–18:00`; excepción del portal: el turno del jugador se dice "21:00 a 22:00", con cifras tabulares, porque se lee en voz alta mejor que la raya). Nada de fechas ISO frente al usuario: "vie 3 jul", "mié 1 de julio".

**The Display Discipline Rule.** `font-display` solo en títulos, cifras clave, el logo y los títulos del portal. Nunca en párrafos, tablas ni formularios.

**The Slanted Title Rule.** En La Previa el titular va en Archivo negra itálica, y un tramo (una o dos palabras) lleva el degradé esmeralda de `.hero-accent-text`. En la ficha del complejo (La Reserva) el título es recto (Archivo 800, 28 px, -0.01em) y sin degradé. Las cifras que cuentan hacia atrás ("Reenviar en 42 s") y las horas y precios del portal van tabulares (The Tabular Rule).

**The 16px Field Rule.** Todo campo donde se tipea mide 16 px por debajo de 768 px y 14 px desde ahí (`text-base md:text-sm`); si no, iOS hace zoom al enfocar. No hay escape hacia abajo; hacia arriba existe `.field-lg` (18 px). `globals.css` tiene una red de seguridad fuera de `@layer`, que no reemplaza escribir la clase.

## Layout

El panel es un marco fijo con el contenido en el medio. En `lg` (1024 px) aparece el **riel** de 72 px a la izquierda; arriba va la **barra superior** de 60 px (más el safe-area de iOS) con el nombre del complejo, el **hueco de vista** (`AdminHeaderSlot`) y el menú de tema; debajo de `lg`, el riel se va y aparece la **barra inferior** con tres accesos directos y "Más".

- **Portal (La Reserva), la ficha del complejo (`ProfileLayout`):** en el DOM el orden es portada y datos, reserva y después canchas con foto, fotos, horarios, torneos y reseñas (orden de lectura y de tab: la reserva sube antes que las fotos). Contenedor `max-w-6xl`, margen de 16 px (24 px desde `sm`) y 16 px de aire arriba (32 px desde `lg`). **Desde `lg` (1024 px) son dos columnas:** el complejo a la izquierda (`minmax(0,1fr)`) y la reserva a la derecha en una columna fija de 24 rem (384 px), separadas 40 px. La reserva es pegajosa debajo de la barra (`top-14`, los 56 px de la barra), con tope de alto `100dvh − 3.5rem` y scroll interno si no entra; su relleno de 4 px, con margen negativo para no bajar la columna, deja lugar al anillo de foco que ese scroll recortaría. Debajo de `lg` es una sola columna, con 24 px entre el complejo y la reserva y 40 px entre bloques.
- **Portal, la home (`/`, `Hero`):** solo el hero, sin nada debajo salvo el pie. `HeroMobile` (debajo de `lg`) y `HeroDesktop` (`lg` en adelante) son dos árboles hermanos gateados por CSS (`lg:hidden` / `hidden lg:flex`); el `<h1>` real vive en `HeroDesktop` y el de `HeroMobile` es un `<p role="heading">`, para no duplicarlo en el HTML. Sobre `.landing-hero`: titular "Tu partido empieza en TurnoGol" (`font-display font-black italic`, `clamp(48px, 5.6vw, 88px)` en escritorio) con "TurnoGol" en `.hero-accent-text`, el subtítulo "Mirá los turnos libres de hoy y reservá sin llamar a nadie." y el buscador `HeroSearch` (horizontal en escritorio), con "Sin descargar ninguna app" debajo. La barra es la `overlay` de `PortalHeader` (pastilla `.overlay-nav` flotante). Es ISR (`revalidate = 300`).
- **Portal, confirmar la reserva (`/[slug]/reservar`):** una sola columna de 560 px (`max-w-[35rem]`, `PORTAL_COLUMN`; `RESERVAR_COLUMN` es su alias) centrada, con 16 px de margen, igual en el celular y en escritorio, sobre `ReservaDarkShell`, con 48 px de aire al pie (`pb-12`). "Volver" arriba, el título 8 px debajo y el primer bloque 24 px después; 32 px entre bloques (aviso, resumen, botón).
- **Portal, la vuelta de la reserva (`/reserva/[bookingId]/*`):** la misma columna (`PORTAL_COLUMN`) sobre `ReservaDarkShell`, con 48 px al pie y sin botón fijo. Los resultados (`PortalResult`) se centran en el alto con `min-h-[50dvh]`; el éxito arranca arriba, a 24 px (48 px desde `sm`).
- **Botón fijo abajo (portal, debajo de `md`):** una barra de 77 px (1 px de borde + 12 + 52 + 12) en `z-30`, apoyada SIEMPRE sobre la barra inferior del jugador (`bottom: 3.5rem + 1px + safe-area`): el área segura la pone la barra inferior, no esta. Su contenedor lleva `data-fixed-cta` y `PortalFrame` suma esos 77 px a su relleno inferior con `has-[[data-fixed-cta]]:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom)+77px)]`: sin JS que mida y sin depender de la sesión, así el último link del pie queda por encima al final del scroll y nada salta al hidratar. Desde `md` el botón vuelve al flujo y el marco a 0 con `md:has-[[data-fixed-cta]]:pb-0` (`:has()` pesa más que `md:pb-0`, por eso el `md:` también lleva el `has`). Con la misma cuenta, `html:has([data-fixed-cta])` lleva `scroll-padding-bottom` en `globals.css` (0 desde `md`), para que el foco tabulado no quede detrás de la barra (WCAG 2.4.11). Si cambia el relleno o el alto del botón, cambian las tres: `ConfirmBookingButton`, `PortalFrame` y `globals.css`.
- **Columnas por contenedor (ficha):** las horas y el esqueleto de la reserva eligen sus columnas según el ancho del CONTENEDOR (`@container`), no del viewport, porque la reserva mide 384 px en escritorio y el ancho de la pantalla en el celular: 3 columnas bajo 20,5 rem (328 px, un celular de 360 menos el margen), 4 desde ahí y 6 desde 40 rem (640 px). La constante es `HOUR_COLUMNS` en `HourGrid.tsx` y la comparten grilla y esqueleto. En la columna lateral de escritorio son siempre 4. Los bloques de debajo usan breakpoints de viewport: canchas con foto en 2 columnas y 3 desde `sm`; torneos en 1 y 2 desde `sm`.
- **Contenedor de página:** lo pone `admin-layout-shell.tsx` y la página no agrega margen propio: `mx-auto w-full px-4 sm:px-6 lg:px-8`, tope de 1600 px (`max-w-[1600px]`) y `pt-8`. `/grilla` y `/reservas` son de ancho completo, con alto de pantalla y scroll interno. Un `max-w-*` en la página solo se justifica en un formulario o una lectura angosta.
- **Hueco de vista:** las vistas del mostrador (Hoy, Grilla, Agenda, Caja y Configuración) y Métricas cuelgan ahí sus controles (segmentos, filtros, búsqueda, las flechas de día o de mes) en vez de abrir filas de encabezado propias. Lo que va al hueco es el control, no el título: el `<h1>` queda en el contenido, `sr-only`. Lo portalizado existe recién después de hidratar: un test o una foto de regresión tiene que esperarlo. Clientes, Turnos fijos, Canchas, Torneos y el super admin todavía abren con `PageHeader`.
- **Medidas por CSS, superficies por hook:** un cambio de disposición se resuelve con clases responsive o `@container`. Un hook de viewport (`useIsDesktop`) solo se justifica cuando el contenido se portaliza fuera del subárbol que el CSS oculta (un popover de Radix), y nunca para el estado inicial. "Escritorio" es `lg` (1024 px) en el CSS y en el hook.
- **Listas anchas:** una lista de una fila por elemento que a 1600 px queda estirada pasa a dos columnas en `lg` (`grid grid-cols-1 lg:grid-cols-2`, con `grid-cols-1` explícito) o a tabla.
- **Ritmo:** grilla de 4 px. Padding de tarjeta 20 a 24 px, separación entre secciones de 24 px (`space-y-6`), celdas de tabla con `p-3`. Sin aire decorativo en tablas ni en la grilla.
- **Breakpoints:** los de Tailwind v4 (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536). En `md` los campos bajan a 14 px y los botones a 40 px; en `lg` aparece el riel.
- **Piso:** el panel se diseña para la notebook del mostrador (ver `PRODUCT.md`) y no debe tener scroll horizontal a 375 px. En el teléfono, todo blanco táctil mide 44 px o más.
- **Capas (z-index):** barra superior 20 · riel 30 · barra inferior y velo de diálogo 40 · diálogo, sheet, popover, menú y tooltip 50 · toasts 100.
- **Scroll interno:** una lista que scrollea adentro de una tarjeta (el catálogo y el ticket de Vender) lleva barra fina con las utilidades nativas de Tailwind: `scrollbar-thin scrollbar-thumb-muted-foreground/45 scrollbar-track-transparent`. La barra del sistema, en oscuro, es un bloque gris claro que pesa más que la lista. No se define una utilidad propia con un nombre que Tailwind ya usa.
- **Bandas de estado:** la banda a lo ancho de arriba (`StatusBanner`) es solo para lo que afecta el servicio: pago vencido, cuenta suspendida o cancelada, servicio degradado. El período de prueba no es una banda: vive en el riel (ver Navigation).

## Elevation & Depth

Híbrido y adaptativo. En claro la profundidad es **elevación**: sombras suaves en capas y un borde superior esmeralda tenue; las superficies de trabajo son opacas. En oscuro es **vidrio**: relleno blanco al 3 %, `backdrop-filter: blur(12px)`, sombra honda y, al pasar el mouse por algo clickeable, un resplandor esmeralda. Los fondos del marco (`.shell-bg`, `.content-area-gradient`) llevan degradés slate con resplandores esmeralda muy bajos y, en el marco, una retícula de 60 px que evoca una cancha.

El portal (La Previa) es el mundo del vidrio y el resplandor, en los dos temas. En oscuro: losas #020617 / slate-950, vidrio (`AUTH_CARD_STYLE`, `.reserva-receipt-card`), sombras hondas y resplandores esmeralda (`.hero-glow-blob`, `.reserva-glow-*`). En claro: crema esmeralda con elevación suave y un tinte esmeralda en la sombra (`.player-hero-band`, `.reserva-receipt-card`). Las tarjetas del grupo del jugador son `bg-card` con borde `border` y `shadow-xs`. La excepción es la ficha del complejo (La Reserva): no usa ninguna profundidad, los botones de acción pisan la sombra del primitivo (`shadow-none`), la portada no lleva velo ni degradé y la jerarquía sale del borde de 1 px, del relleno verde de lo elegido y del tipo.

### Shadow Vocabulary

- **Tarjeta en claro** (`box-shadow: 0 1px 2px rgba(2,6,23,.05), 0 4px 12px -4px rgba(2,6,23,.08), 0 12px 32px -12px rgba(2,6,23,.12)`, más `border-top: 2px solid rgba(5,150,105,.2)`): `.card-premium`, la superficie destacada por defecto.
- **Tarjeta en oscuro** (`box-shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 24px 50px -34px rgba(0,0,0,.9)` sobre `rgba(255,255,255,.03)` con `blur(12px)`): la misma receta en vidrio.
- **Tarjeta con levante** (`.card-premium-interactive`: al hover sube 4 px en 250 ms y suma un resplandor esmeralda): la llevan las tarjetas clickeables, que además suman `cursor-pointer`, y los KPI de `StatCard`, que levantan sin cursor de clic.
- **Tarjeta de trabajo** (`shadow-xs`): formularios, tablas y listas sobre `bg-card` con borde. Es la sombra más usada del panel; el botón `outline` lleva la misma.
- **Botones con relleno** (`shadow-md shadow-primary/20`, al hover `shadow-lg shadow-primary/30` y sube 2 px; el destructivo, `shadow-red-600/20`): las únicas sombras de color en un control.
- **Capas flotantes** (`shadow-lg` popover, `shadow-xl` menú, `shadow-2xl` diálogo y sheet): sobre un velo negro al 50 % (70 % en oscuro) con `backdrop-blur-xs`. El diálogo va al 95 % de opacidad con `backdrop-blur-md` y el menú al 90 %.

### Named Rules

**The Recipe Rule.** Una vista no inventa su sombra, su degradé ni su vidrio inline. Si la receta no existe, se agrega a `globals.css` con su par claro/oscuro y se documenta acá.

**The Opaque Work Rule.** En claro, lo que se trabaja (tarjetas, tablas, formularios) es opaco. La translucidez es del tema oscuro y de piezas flotantes puntuales (diálogo, menú).

## Shapes

Los escalones chicos salen del radio base `--radius: 0.5rem`: `sm` 4 px, `md` 6 px (ítems chicos, skeleton, tooltip) y `lg` 8 px (botones, campos, chips de opción). `xl` 12 px (tarjetas destacadas, popovers, menús, estados vacíos) y `2xl` 16 px (diálogos, la banda del `PageHeader`, la esquina superior de la hoja inferior) son los de Tailwind y no se mueven si cambia `--radius`; `.card-premium` calcula sus 12 px como `--radius` + 4 px. Pastillas y avatares van en `rounded-full`. Los ítems del riel usan 10 px. En la ficha del portal, la portada va en `2xl` (16 px); las horas, las filas de cancha, las fotos, los avisos y las listas, en `xl` (12 px); y los chips de día, de formato y de servicio, en `full`. En la home, las tarjetas de canchas cerca, el buscador de escritorio, los campos, los horarios, la portada y la miniatura van en 12 px, y los chips de zona en `full`. En el portal `--radius` pasa a 12 px (`0.75rem`), así que `lg` mide 12, `md` 10 y `sm` 8: botones, campos y horas van en 12 px.

El borde es de 1 px en `border-border` y lo aplica `globals.css` a todo. Tres firmas de forma se repiten: el **borde izquierdo de 3 px** que identifica el estado de un turno en la grilla (legible en densidad alta y para daltónicos, porque la posición no cambia), el **rayado diagonal** (135°, cada 6 px sobre `muted`) de lo bloqueado a propósito, y el **anillo inset** de 1 px de los badges.

## Components

Todas las primitivas viven en `src/components/ui/` y consumen solo tokens semánticos: por eso el cambio de tema no necesita parches por vista. Los íconos son Lucide, la única librería: 16 px en controles, 14 px al lado de texto de 12 px (avisos, variaciones, links en línea), 12 px dentro de un badge y 20 px en la navegación.

### Buttons

- **Shape:** esquina de 8 px (`rounded-lg`); el tamaño `sm` baja a 6 px.
- **Primary:** relleno `primary` con texto `primary-foreground`, 14 px en peso 500, alto de 44 px en el teléfono y 40 px desde 768 px (`h-11 md:h-10`), `px-4`. Uno por vista; si hay dos acciones importantes, la segunda es `outline`. Un botón que mueve plata es siempre `<Button>` (o `bg-primary text-primary-foreground`) y su rótulo dice el efecto y el monto: "Cobrar $ 12.500", no "Confirmar" (excepción del portal, fijada en el brief de la reserva: "Pagar la seña" no lleva el monto, que está en el resumen justo arriba; con los precios ocultos no se puede decir, y el rótulo es el mismo en los dos casos para que el botón no cambie según el complejo). `bg-emerald-600` está bloqueado por ESLint (con texto blanco no llega a AA).
- **Hover / Focus:** el primario baja al 90 %, sube 2 px y agranda la sombra; al apretar se achica al 97 %. El foco es un anillo de 2 px en `ring` con 2 px de separación, que aparece sin transición. Los asíncronos usan `isLoading`: pelotita `TgBallSpinner` de 16 px más `disabled`, nunca un doble envío silencioso.
- **Secondary / Ghost / Tertiary:** `outline` (borde `input`, fondo `card`, hover `accent`), `secondary`, `ghost` (solo hover `accent`), `destructive` (rojo, se separa del cancelar) y `link` (`text-emerald-700 dark:text-emerald-400`, subrayado al hover). Un botón que es solo ícono (`size="icon"`, 44/40 px) lleva `aria-label` y `Tooltip`.

### Portal (La Previa)

Las primitivas del panel no se tocan: el portal les pasa sus clases por `className` (`PORTAL_BUTTON`, `AUTH_INPUT`) y tailwind-merge las deja ganar. Las constantes viven en `src/components/world/PortalAuthFrame.tsx`.

- **Marco de ingreso (`PortalAuthFrame`):** siempre oscuro (`dark dark-surface`, fondo #020617, `[--input]` a 3:1). Dos resplandores esmeralda (arriba a la derecha de 440 px, abajo a la izquierda de 420 px), el logo horizontal arriba (link a la home, 44 px de alto) y el contenido en una card de vidrio (`AUTH_CARD_STYLE`, esquina de 16 px, `p-6` / `sm:p-8`) de `max-w-md`. `/ingresar` pasa `aside` (`ImagePane`, la foto) y desde `lg` el marco es de dos columnas. Lo usan `/ingresar`, `/aceptar-terminos` y la rama de jugador de `/verify`.
- **Titular de ingreso (`AUTH_TITLE`):** Archivo negra itálica, 30 px, siempre blanco, con un tramo en degradé esmeralda (`AUTH_ACCENT_STYLE`, #6ee7b7 → #34d399 → #10b981). `PORTAL_TITLE` y `PORTAL_SECTION_TITLE` (Archivo 800 recta) siguen existiendo para la ficha y para los títulos de sección del grupo del jugador.
- **Campos de ingreso (`AUTH_INPUT`):** 48 px, `text-base` en mobile (menos de 16 px dispara el zoom de iOS), fondo `white/4`, texto blanco, placeholder en `muted-foreground` pleno, borde `input` (3:1). El error marca el campo con `aria-invalid` (borde `destructive`) y el mensaje va pegado debajo.
- **Botones (`PORTAL_BUTTON`):** de 48 px de alto mínimo a todo el ancho, 16 px, sin sombra ni levante al hover ni al apretar, con el foco separado por el color del fondo (`focus-visible:ring-offset-background`). Deshabilitado o pendiente no se desvanece (`disabled:opacity-100`): "Enviando…" conserva su relleno y su etiqueta. `PORTAL_BUTTON_OUTLINE` para el `outline` deshabilitado ("Reenviar en 42 s"). Una sola acción verde por pantalla.
- **Links (`PORTAL_LINK`):** el foco del link es el anillo del mundo (2 px en `ring`, separado 2 px con el color del fondo); el color, el subrayado y los 44 px de blanco táctil los pone cada link. Texto de link: `text-emerald-700 dark:text-emerald-400`, subrayado.
- **Barra (`PortalHeader`):** pegada arriba (`z-50`). La `solid` (todo el portal salvo la home) es una pastilla `rounded-full` de 56 px dentro de `max-w-7xl`, con borde `border`, fondo `bg-card/80` y `backdrop-blur-md`. La `overlay` (la home) es la pastilla flotante `.overlay-nav` sobre el hero (blanco elevado en claro, vidrio oscuro en oscuro). A la izquierda el logo; a la derecha Explorar, "Mis reservas" (con sesión) o "Para complejos" (sin sesión) desde `sm`, y la acción ("Ingresar", "Ir a mi panel") en una pastilla de 44 px, o el menú de cuenta. Todos los destinos miden 44 px de alto como mínimo.
- **Menú de cuenta (`AccountMenu`, variantes `solid` y `overlay`):** disparador de 44 px con avatar, en pastilla con `ring-1`; en `overlay`, fondo `foreground/6` en claro y `white/15` en oscuro. Adentro, `ThemeToggle variant="portal"`. El foco del disparador es `ring-primary`.
- **"Ingresar" con `next` (`IngresarLink`):** todo "Ingresar" del cromo (barra y pie) lleva a `/ingresar?next=<página actual con su query>`, codificado entero; `sanitizeNext` lo valida en el destino. Un link nuevo a `/ingresar` desde el portal usa `IngresarLink`, no un `Link` pelado.
- **Pie (`SiteFooter`):** `border-t border-border`, fondo `bg-card/60` (`dark:bg-slate-950`), con el logo, Explorar, Ingresar, Privacidad, Términos y los canales de contacto.
- **Barra inferior (`PlayerBottomNav`, debajo de `md`, con y sin sesión):** fija abajo (`z-40`), `bg-card` con borde superior de 1 px y safe-area. Tres ítems a partes iguales de 56 px de alto mínimo: Explorar, Reservas y Cuenta, con ícono de 20 px y rótulo de 13 px. Sin sesión, Reservas y Cuenta redirigen a `/ingresar?next=…` por el guard de cada página. El activo no se dice solo con color: va en `text-emerald-700 dark:text-emerald-400`, semibold, con una marca `primary` de 2×40 px arriba y `aria-current`. No se muestra en `/suspended`, `/reactivar` ni con sesión de complejo (`useBottomNavVisible`). `PortalFrame` reserva exactamente su alto: 56 px + 1 px de borde + safe-area.
- **Fondo del cascarón (`PortalFrame`):** `.player-shell-bg` en toda página del portal (ver Colors › Portal).

#### Confirmar la reserva y el ingreso del jugador

`/[slug]/reservar`, en `src/app/(public)/[slug]/reservar/`. Decisión de flujo: [`docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md`](docs/decisions/2026-10-21-confirmar-sin-casilla-y-modal.md). La columna, el ritmo y el botón fijo están en Layout.

- **Arriba:** "Volver" es un link de 44 px en 16 px semibold `text-emerald-700 dark:text-emerald-400` subrayado, con flecha de 16 px, a la ficha con `?date=&hora=` (y `&formato=` si había uno); después "Confirmá tu **reserva**" en Archivo negra itálica de `text-3xl`, con el tramo en `.hero-accent-text`.
- **Qué elegiste va en la URL:** `formato` y un `pay` heredado de un link viejo viajan en la query; los arma un solo helper (`buildReservarHref` en `src/lib/booking/reserve-url.ts`). Ninguna pantalla ofrece elegir `pay`.
- **Resumen (`BookingSummary`):** una tarjeta-comprobante (`.reserva-receipt-card`, esquina de 16 px, `p-5`): el complejo en Archivo, la dirección con la ciudad en 14 px `muted-foreground` con pin y, tras un divisor, tres filas con ícono (día, hora tabular, "Cancha 2 · Fútbol 5"). El precio solo si se ve: "Precio del turno", "Seña a pagar ahora" (la cifra en Archivo tabular, esmeralda) y "Resto en el complejo". Con `hidePrices` no hay ningún monto en el DOM ni en un `aria-label`.
- **Un solo botón de acción (`CheckoutFlow`):** "Pagar seña · $ X" con seña (sin el monto si el complejo oculta precios: "Pagar seña") y "Reservar" sin ella. Ya no se elige cómo se paga en el complejo: no existen la sección "Cómo pagás" ni `PaymentMethodSelector`. Debajo, la regla de cancelación del complejo en 14 px `muted-foreground` (con seña: "Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña. Después, la seña queda en el complejo."; sin seña: "Podés cancelar desde Mis reservas."); con seña y precios ocultos, antes: "Pagás una seña online con MercadoPago; el resto, en el complejo."
- **Con sesión (`ConfirmBookingButton`):** envía la reserva. Debajo de `md` va en la barra fija de Layout (`FixedCta`, `data-fixed-cta`); desde `md`, en el flujo. Pendiente, "Procesando…" deshabilitado y a contraste pleno. **Confirmación sola (`AutoConfirm`):** si el jugador vuelve del enlace del email con una intención válida y el complejo no cobra seña, el form se envía solo, una vez.
- **Sin sesión (`LoginGate`):** el mismo botón abre un diálogo de ingreso (hoja que sube desde abajo en el celular, tarjeta centrada desde `md`), siempre oscuro y con el vidrio de La Previa: "Entrá para **reservar**" (`AUTH_TITLE`), "Continuar con Google" (`outline`), un divisor "o" y el email (`AUTH_INPUT`) con "Continuar con mi email" (`primary`). **Sin casilla ni campo Nombre:** el +18 es clickwrap, con la frase "Al continuar declarás que sos mayor de 18 años y aceptás los Términos y condiciones" (el link abre `/terminos` en otra pestaña, 44 px de alto) debajo de los botones; el servidor sigue exigiendo `terms` y registrándolo (ADR-012). El nombre se deriva del email en el servidor. En el navegador interno de Instagram, Facebook o TikTok el orden se invierte (email antes que Google).
- **Enviado:** el mismo diálogo pasa a "Revisá tu **email**", con lo que pasa al tocar el enlace, "Reenviar enlace" (con su espera de 60 s) y "Usar otro email". Lo compartido con `/ingresar` está en `src/components/world/MagicLinkSent.tsx`.
- **Vuelta del ingreso:** con `next` en `/[slug]/reservar`, el callback y `/aceptar-terminos` llevan directo a esa pantalla, sin pasar por `/verify`. La intención viaja firmada (`src/shared/security/booking-intent.ts`): 60 min en el enlace del mail; por Google, una cookie HttpOnly de 10 min.
- **Avisos (`CheckoutErrorBanner`):** un aviso arriba del resumen con `role="alert"`, ícono de alerta y una salida en link ("Elegir otro turno"; "Buscar otro complejo" para un baneo). Todo lo que avisa acá frena la reserva: es un error, no una advertencia.
- **Estados inválidos (`CheckoutInvalidState`, en `CheckoutStates.tsx`):** "Este complejo no toma reservas online por ahora", "No pudimos abrir este turno", "No encontramos ese turno", "Ese turno ya no está disponible" y "Ese turno se ocupó mientras entrabas", sobre `ReservaDarkShell`, con título, qué pasó y la salida.
- **Carga (`loading.tsx`):** la silueta de la pantalla sobre `ReservaDarkShell`, en la misma columna.

#### La vuelta de la reserva

`/reserva/[bookingId]/{exito,pendiente,error}`, en `src/app/reserva/`. `reserva/layout.tsx` monta `PortalShell`; cada página y cada `loading.tsx` pone su propio `ReservaDarkShell` (`src/components/booking/ReservaDarkShell.tsx`): `.reserva-shell` (transparente en claro, #020617 en oscuro) con dos resplandores (`.reserva-glow-top` de 560 px arriba a la derecha y `.reserva-glow-bottom` de 480 px abajo a la izquierda). Sin sesión, las tres mandan a `/ingresar?next=/reserva/{id}/{vista}`. Una reserva que no existe, purgada o de otra cuenta (RLS) es `ReservaNotFound`.

- **Resultado (`PortalResult`, `src/components/world/PortalResult.tsx`):** la forma común de pendiente, error, el error de carga y "No encontramos tu reserva". Centrada en el alto (`min-h-[50dvh]`, `aria-live="polite"`): ícono, título, qué pasó y la salida. El color del ícono sale de `TONE_TEXT` de `status-tone.ts`: rojo solo cuando algo falló, gris para lo que no es una falla, verde para confirmada. Una sola salida verde por pantalla.
- **Éxito (`BookingSuccessCard`):** arranca a 24 px de la barra (48 px desde `sm`). El aro de éxito (`.reserva-success-badge`, con el pulso `animate-slot-pulse` una sola vez, congelado con `prefers-reduced-motion`), "¡Reserva **confirmada!**" en Archivo negra itálica con `.hero-accent-text`, el resumen (`BookingSummary` con la seña pagada) y **una sola acción principal: "Avisarle al grupo"** (`<a href="https://wa.me/?text=…">`; el mensaje lo arma `src/lib/booking/group-share.ts` y nunca lleva montos). Después `BookingSuccessExtras`: "Cómo llegar", "Agregar al calendario" y "Ver mis reservas" como filas planas dentro de un contenedor con borde.
- **Pendiente (`PaymentStatusWatcher` / `PaymentStatusView`):** "Confirmando tu pago…" sin cuenta regresiva (quien llega ya pasó por MercadoPago); pasados 30 s, una nota con dónde mirar. Una reserva ya confirmada redirige a `/exito`. Los estados terminales ("La reserva expiró", "Reserva cancelada", "Esta reserva ya pasó", "Se acabó el tiempo", "No pudimos verificar tu pago") dicen qué pasó y qué hacer.
- **Error (`BookingErrorCard`, vistas `retry` / `released` / `canceled` / `past`):** "El pago no se procesó" con "Reintentar pago" mientras el hold lo permite; si no, "Reservar de nuevo"; cancelada y pasada, "Ver mis reservas".
- **Error de carga (`reserva/error.tsx`):** `PortalResult` rojo, "No pudimos cargar esta página", con "Reintentar" y "Ver mis reservas". Reporta a Sentry.

#### El grupo del jugador: Mis reservas, Mi cuenta y Eliminar la cuenta

`src/app/(player)/`. `(player)/layout.tsx` monta `PortalShell` y envuelve las páginas en `data-portal-fields` (bordes de campo y foco a 3:1, diálogos incluidos). Columna `max-w-lg` con `px-4 py-6` y `space-y-5`. Mis reservas y Mi cuenta abren con **`PlayerHeroBand`** (`src/components/site/PlayerHeroBand.tsx`): la banda `.player-hero-band` (esquina de 24 px, `px-6 py-7`) con el resplandor `.hero-glow-blob`, la grilla `.player-hero-grid` con máscara, un eyebrow de 12 px (`font-logo`, mayúsculas, `text-emerald-700 dark:text-emerald-400`: 5,2:1 sobre el extremo de la banda), el titular en Archivo negra itálica con un tramo en `.hero-accent-text`, un subtítulo opcional y `children` (en Mi cuenta, el avatar y el nombre).

- **Mis reservas (`/mis-reservas`):** banda "Tu actividad · Mis **reservas**" con una línea de turnos por jugar. Pestañas Próximos / Historial como píldora segmentada (`<nav aria-label="Tus reservas">` de dos links con `aria-current`, `rounded-full`, 44 px; la activa, con relleno `primary`). Cada reserva es una tarjeta `rounded-2xl` con borde `border`, fondo `card` y `shadow-xs`; la próxima confirmada se destaca y es la única con "Avisarle al grupo" y "Cómo llegar". Acciones sin borde ("Cancelar", "Dejar reseña", "Reservar de nuevo") de 44 px. Los tonos del jugador salen de `status-visual.ts`: confirmada en verde; "Ausente" y "Esperando seña" en neutro. Vacío con `EmptyCard`; paginador compartido (`Pager`). `error.tsx` y `loading.tsx` en la misma columna.
- **Mi cuenta (`/configuracion`):** banda "Tu cuenta · Mi **cuenta**" con el avatar (`.hero-avatar-fallback`, iniciales en Archivo negra itálica), el nombre y el email. Debajo, una tarjeta por tema (`SectionCard`: `rounded-2xl`, borde, `bg-card`, un cuadrado de 40 px con ícono esmeralda): Tus datos (`#tus-datos`), Favoritos, Tu actividad, Tema y sesión (`ThemeToggle variant="portal"` y "Salir"), descargar tus datos (Ley 25.326) y darte de baja. `/perfil` redirige a `/configuracion`.
- **Eliminar la cuenta (`/eliminar-cuenta`):** sin banda: "Volver a Mi cuenta", el h1 "Eliminar mi cuenta" en Archivo negra itálica y avisos de colores por gravedad (rojo para lo irreversible, naranja y ámbar para el resto), cada uno con borde, tinte e ícono; la confirmación es un `ConfirmDialog` con `phraseMatch="email"` (escribir el email).
- **Errores (`(player)/error.tsx`, `mis-reservas/error.tsx`):** `PortalResult` rojo con "Reintentar" y la salida del grupo; con `digest`, el código de referencia. Reportan a Sentry.

**The Quiet Ghost Rule.** Las acciones de una tarjeta del portal que no son la principal (Cancelar, Dejar reseña, Reservar de nuevo) van sin borde ni relleno: 44 px de alto, 14 px medium, hover `accent`. Solo la próxima lleva verde ("Avisarle al grupo") y una `outline` ("Cómo llegar"). "Ausente" y "Esperando seña" son neutros: el rojo del panel y el ámbar de "Queda 1" no se prestan.

#### La ficha del complejo y su reserva (La Reserva, excepción del 2026-10-21)

`/[slug]`, en `src/app/(public)/[slug]/(perfil)/` y `components/`. Es **la única parte del portal que sigue en La Reserva**, por decisión del dueño del 2026-10-21 (la fase R3 de La Previa se cerró sin mergear). `PortalWorld` se monta en `(perfil)/layout.tsx`, que cubre la página, su `loading.tsx` y el aviso de complejo no disponible, y también en `not-found.tsx`; `torneos/*` queda afuera. Plana en los dos temas: botones de acción con `shadow-none`, sin vidrio, resplandores ni foto de fondo. Todo lo que depende del visitante (qué día es, si está abierto, qué horas quedan) se hidrata en el cliente porque la página es ISR (`revalidate = 300`): hasta entonces se ve el esqueleto, con la misma silueta.

- **Portada y datos (`ComplexHero`):** portada de 160 px de alto a todo el ancho con esquina de 16 px (sin portada no hay bloque). Nombre del complejo con `PORTAL_TITLE` (28 px) hasta tres líneas con `text-balance`; debajo, dirección y ciudad y una línea apagada de datos ("5 canchas · Fútbol 5 y 7") en 14 px `muted-foreground`; sin dato no se pinta. Después el estado de apertura y, si hay reseñas, la valoración. Los accesos son botones `outline` de 44 px: "Cómo llegar" (siempre) y "WhatsApp" o, si no hay, "Llamar"; el ícono se guarda debajo de 400 px porque el texto ya dice qué hace. Compartir y guardar van a la derecha, solo ícono de 44×44, transparentes, sin sombra, vidrio ni levante.
- **Estado de apertura (`OpenStatus`):** una línea de 14 px, siempre en palabras: "Abierto · hasta la 01:00" en verde semibold (`text-emerald-700 dark:text-emerald-400`), "Cerrado · abre a las 18:00", "Cerrado hoy" o "Cerró por hoy · abre mañana a las 09:00" en `muted-foreground`. Antes de hidratar deja una línea vacía del mismo alto (`min-h-5`). Los cálculos (cierre pasada la medianoche incluido) salen de `src/lib/schedule/open-status.ts`. `OpeningHoursList` repite los horarios por día en una lista con borde; hoy va en fondo `muted`, semibold, con la palabra "hoy" y `aria-current="date"`, y el cierre a medianoche se dice "00:00".
- **Reserva (`ReserveSection`):** una sección "Reservá tu turno" con orden fijo: días, formato (solo si el complejo tiene más de un formato), horas y, al elegir una, las canchas libres. Elegir un día borra la hora; elegir un formato filtra del lado del cliente. Lo elegido vive en la URL (`?date=&formato=&hora=`, con `replaceState`, que conserva el resto de los parámetros): el link compartido y "Volver" lo guardan. Al elegir una hora la lista de canchas se acerca lo justo con scroll suave (sin animar con reduce-motion) y sin mover el foco. Una línea de 13 px dice la ventana ("Reservás hasta 6 días antes" o "Reservás solo para hoy").
- **`data-state` de la sección:** el `<section aria-label="Reservá tu turno">` lleva `data-state` con `loading` (esqueleto, hasta que el primer estado se resolvió o mientras se busca el próximo día), `ready`, `closed` o `error`; `aria-busy` es verdadero solo en `loading`. Es el gancho de los tests y de las capturas y no cambia el aspecto. Un `<p role="status" class="sr-only">` anuncia el cambio ("20:00: 3 canchas libres" o "Jueves 15: 9 horarios con lugar").
- **Chips de día y de formato (`ChipGroups`):** grupos de opción única con `RadioGroup` de Radix (flechas del teclado, un solo tab stop). Pastilla de 44 px de alto, `full`, borde `border`, fondo `card`, 14 px medium, 16 px de margen lateral. **La elegida** va con relleno `primary`, texto `primary-foreground`, semibold y un tilde de 16 px: nunca solo color. El día se rotula "Hoy jue 15" y "Vie 16"; **un día cerrado se ve, deshabilitado** (fondo `muted`, texto `muted-foreground`), con "Cerrado" en 13 px debajo. Los formatos van con palabras, "Todos · Fútbol 5 · Fútbol 7", y el grupo no se pinta con un solo formato. En el celular es una fila que se desplaza y se corta en el borde para avisar que hay más (la elegida se trae a la vista); desde `lg` el grupo de días pasa a varias filas si son 8 o menos. El foco necesita lugar: la fila lleva 4 px de relleno con margen negativo, y quien la monta separa con `gap` y no con `space-y`.
- **Grilla de horas (`HourGrid`):** `RadioGroup` de botones de 50 px de alto mínimo, esquina de 12 px, borde `border`, fondo `card`, con la hora arriba (portal hour) y el estado debajo (13 px); columnas por contenedor (ver Layout). Solo aparecen las horas que todavía no pasaron y, con `closes_next_day`, la madrugada va al final del mismo día operativo. Cinco estados, cada uno con palabra:
  - **"N libres"** (dos o más canchas): neutro, con la cuenta en `muted-foreground`.
  - **"Queda 1"** (una sola libre de varias): fondo ámbar 50, borde ámbar 300 y texto ámbar 800 semibold (en oscuro, ámbar al 10 %, borde al 40 % y texto ámbar 300). Es la única escasez real y el único ámbar de la reserva.
  - **"Libre"** (el filtro deja una sola cancha y está libre): neutro. No es escasez, es la única que hay, así que no se pinta de ámbar.
  - **"Señando"**: ninguna libre pero alguien está pagando la seña y puede liberarse (decisión v2 D1). Borde punteado `muted-foreground` sobre `card`, texto en `foreground`, deshabilitada. No es una alerta: es una espera. Se explica con una ayuda visible de 13 px debajo de la grilla (enlazada con `aria-describedby`, no un `title`) y el día se refresca solo cada 30 s mientras haya una hora así y la pestaña esté a la vista.
  - **"Completo"**: fondo `muted`, hora tachada y en `muted-foreground`, deshabilitada, pero a la vista y dicha.
  - **La elegida** va con relleno `primary`, texto `primary-foreground`, un tilde de 16 px antes de la hora y el estado en semibold. El color de estado (ámbar) se aplica solo a la hora sin elegir (`data-[state=unchecked]`): en oscuro la variante `dark:` le ganaba al relleno verde y dejaba texto oscuro sobre ámbar (1,1:1). Al hover el borde pasa a `input`, sin levante.
- **Filas de cancha (`CourtRows`):** el título es "Canchas libres a las 20:00" (Portal section). Una lista de filas tocables de 64 px de alto mínimo, borde `border`, fondo `card` y esquina de 12 px: el nombre en 16 px semibold (una línea, con corte) y debajo el formato en 13 px `muted-foreground`; a la derecha el precio tabular en semibold y un chevron de 20 px. Tocar una fila lleva a confirmar (`/reservar?court&date&time&dur`). Con `hidePrices` el servidor manda `null` y el componente lo vuelve a chequear: la fila no deja hueco. Sin reserva online la fila abre WhatsApp con el pedido escrito y muestra "WhatsApp" en verde de texto, o "Llamar" si solo hay teléfono; sin ninguno queda apagada y sin acción.
- **Vacíos y errores por causa (`DayEmptyState`):** un aviso `bg-muted` con borde `border`, esquina de 12 px y 16 px de relleno, con el título en 16 px semibold y la ayuda en 14 px `muted-foreground`. Siempre dice qué pasó y deja una salida arriba del pliegue, con botones `outline` de 48 px (a todo el ancho en el celular, del ancho del texto desde `sm`). La fila de acciones reserva 44 px de alto, para que "Buscando…" y el botón no muevan la página. Una causa, un texto:
  - `closed`: "Cerrado el jueves 15", con "Ver el viernes 16" (el próximo día abierto dentro de la ventana) o "No hay otros días abiertos para reservar".
  - `none` y `full`: "No quedan horarios el jueves 15", con el botón al próximo día con lugar (una sola consulta a la semana que sigue) o "No hay lugar en los próximos N días". Con el día lleno y otro día al que ir, la grilla de "Completo" se oculta y la reemplaza el botón; con el día lleno y nada que ofrecer, la grilla queda debajo.
  - `noCourts`: "Este complejo todavía no tiene canchas para reservar", con "Consultar por WhatsApp" o "Llamar al complejo".
  - `error`, por causa (`role="alert"`): la red ("No pudimos cargar los horarios del jueves 15"), el servidor ("Falló algo de nuestro lado"), el límite de pedidos ("Hubo demasiadas consultas seguidas") y el complejo que ya no existe ("Este complejo ya no está disponible", con "Buscar otro complejo" en vez de reintentar). Las tres primeras traen "Reintentar" y la frase "Tu elección sigue guardada".
- **Canchas con foto (`CourtTile`):** foto 4:3 de esquina 12 px sobre `muted`, nombre en 16 px semibold, "Fútbol 5 · Sintético" en 13 px y, si el precio se ve, "Desde $ 60.000" con la cifra en semibold tabular. Plana: sin tarjeta, sombra ni levante; la foto manda. Una cancha sin foto no se pinta en este bloque, y una foto que ya se vio en una cancha no se repite en la galería.
- **Detalles, servicios, torneos y reseñas:** la descripción en 16 px con tope de ancho de lectura; los servicios son pastillas de 32 px con ícono de 16 px, borde `border` y 13 px medium; los torneos, filas de 64 px como las de cancha (máximo 4 y el enlace "Ver los N torneos"); las reseñas, una lista con divisores de 1 px (no una tarjeta), el texto en 16 px, la fecha en 13 px tabular y "Ver más reseñas" como botón `outline`. Cada bloque desaparece sin dejar hueco cuando no hay dato; sin reseñas no se monta ni un vacío.
- **Redirección:** `/[slug]/disponibilidad` (la vista semanal y su modal) ya no existe: `next.config.ts` la redirige con un 308 a `/[slug]`, y la query (`?date=`) llega sola a la ficha. `profile.viewed` pasó a emitirse desde `ReserveSection`, una vez por pestaña y complejo, cuando el primer estado queda resuelto (horas cargadas o día cerrado; un error no cuenta).
- **Deuda conocida:** `CourtCard` sigue siendo la tarjeta de cancha del panel (la vista previa "Así la ve el jugador" del editor de Canchas) y del onboarding, con el aspecto viejo (tarjeta con borde y sombra); la ficha pública ya no la usa, usa `CourtTile`. Hasta que se decida unificarlas, esa vista previa no es lo que el jugador ve.

### Chips

- **Alcance:** lo que sigue es del Mostrador. Los chips de la reserva de la ficha están en Components › La ficha del complejo y su reserva.
- **Style:** el badge de estado (`StatusBadge`) es una pastilla con tinte del tono al 10 % (15 % en oscuro), rótulo 800/300, anillo inset al 25 % (40 % en oscuro) e ícono de 12 px. El ícono, el rótulo y el tono de cada estado salen de una tabla única por dominio: `src/lib/booking/slot-visual.ts` para los turnos (grilla, reservas y detalle) y un `status-visual.tsx` por módulo para canchas, turnos fijos y equipo. Así el panel y el portal dicen lo mismo, y un badge nuevo no inventa su propio mapa de colores.
- **State:** las opciones elegibles (`RadioChip`) son tarjetas de 44 px de alto con borde `border`; la elegida pasa a borde `primary` y fondo `primary` al 5 % (10 % en oscuro).

### Cards / Containers

- **Corner Style:** 12 px en las destacadas (`.card-premium`), 8 a 12 px en las de trabajo. `.card-premium` vive fuera de `@layer`, así que su radio, fondo, borde y sombra le ganan a cualquier utilidad (`rounded-lg`, `bg-*`, `shadow-*`) que se le sume; el padding sí lo pone cada uso.
- **Background:** `card` sobre el fondo slate; en oscuro, vidrio. No hay primitiva `Card`: la superficie es `.card-premium` o `bg-card` con borde.
- **Shadow Strategy:** ver Elevation & Depth. Una tarjeta de trabajo (formulario, tabla, lista) es `bg-card` con borde y `shadow-xs`; `.card-premium` es para lo destacado.
- **Border:** 1 px `border`; la destacada suma el borde superior esmeralda de 2 px.
- **Internal Padding:** 20 px (`p-5`) en `StatCard`, 24 px (`p-6`) en diálogos y tarjetas de formulario.
- **KPI:** `StatCard` es el único formato de KPI: rótulo, cifra en Archivo tabular, ícono en cuadrado tintado y variación opcional. El total que resume una noche o un mes (Caja › Cuentas, Métricas) no es un KPI suelto: va como cifra en `font-display` de 30 px arriba de su tarjeta, sin ícono.
- **Encabezado de página (`PageHeader`):** banda de esquina 16 px con el degradé `.page-header-band`, ícono en cuadrado de 48 px con halo esmeralda, título en Archivo y acciones a la derecha. Es el encabezado de las vistas que no usan el hueco de la barra superior (ver Layout).
- **Estados:** el vacío (`EmptyState`) es didáctico (ícono, qué es esto, una acción) con borde punteado, y ofrece la misma acción que la pantalla que lo rodea. El error dice qué pasó, qué podés hacer y qué hace el sistema mientras tanto; nunca "Algo salió mal" solo. `ErrorState` trae "Reintentar", y el 404 y el error de cada grupo de rutas se dibujan dentro de su marco, no en el 404 pelado de Next. La carga es un `.skeleton` con la silueta del contenido final, no un spinner de página.
- **Aviso en línea:** no hay primitiva y hoy conviven recetas a mano. El error lleva tinte `destructive` al 10 %, borde al 30 % y texto `red-700`/`red-300`; la atención, fondo `amber-50` (ámbar al 10 % en oscuro) con anillo o borde ámbar. Unificarlas es trabajo del refinamiento.

### Tables

- **Encabezado:** 12 px, peso 500, mayúsculas con `tracking-wide`, en `muted-foreground`.
- **Filas:** celdas con `p-3`, separadas con `divide-y divide-border` y hover `bg-accent/50`. Nunca `slate-*` fijo: desaparece en oscuro.
- **Cifras:** alineadas a la derecha y tabulares. Si la fila abre un detalle, la fila entera es el blanco de clic, con foco visible.
- **Listas en el teléfono:** `ResponsiveList` muestra tarjetas apiladas debajo de `lg` y la tabla desde `lg`.

### Inputs / Fields

- **Style:** borde de 1 px `input` (en el panel vale lo mismo que `border`; en el portal es el borde de 3:1), fondo `card`, esquina de 8 px, 44/40 px de alto, `px-3.5`, placeholder en `muted-foreground` al 60 %.
- **Focus:** anillo de 2 px en `ring` con separación y el borde pasa a `primary`.
- **Error / Disabled:** el error va debajo del campo en 12 px `destructive` con `role="alert"`; deshabilitado baja al 50 %. El rótulo es siempre visible (el placeholder es un ejemplo, "Ej: …", y tiene que entrar completo).
- **Plata:** todo campo de pesos es `MoneyInput`, que trabaja en centavos (controlado con `valueCents`/`onValueChange`, o no controlado con `defaultValueCents` + `name`, que viaja en un `<input type="hidden">`). Nunca `type="number"` ni `parseFloat` para plata; lo que no es plata (goles, stock, días, porcentajes, minutos) sigue con `type="number"`.

### Navigation

- **Riel (`AdminSidebar`, `lg` en adelante):** 72 px de ancho sobre `card` con borde derecho. En touch (sin hover) cada ítem mide 60×52 px: ícono de 20 px arriba y rótulo de 10 px abajo, siempre visible — en una tablet no hay hover y un ícono solo es una adivinanza. Con mouse (`pointer-fine`) el riel es solo íconos, y al pasar el mouse o tener el foco adentro se despliega en overlay a ~224 px (no empuja el contenido) mostrando el rótulo a la derecha de cada ícono, que no se mueve de su columna; abre en 200 ms con un delay de 120 ms para que cruzarlo con el mouse no lo dispare, cierra sin delay; `motion-reduce` no anima. Activo: fondo `primary` al 10 %, rótulo `emerald-800`/`emerald-300` e ícono `emerald-700`/`emerald-400`. Configuración va aparte, al pie, rotulada "Ajustes"; más abajo, el avatar de 44 px con la cuenta (no se despliega: no tiene ícono+rótulo). Durante la prueba, arriba de Ayuda va un ítem de 60×52 con anillo de 1 px: "Prueba" y los días que quedan, ya en dos líneas de texto y sin cambios al desplegar; los últimos 7 días pasa a ámbar. Al dueño lo lleva a Facturación ("Elegir plan"); al encargado solo le informa. En el cajón es una fila de dos renglones, para que los días no se corten. Un espacio puede agrupar varias rutas y resuelve su estructura interna con pestañas, nunca con submenús.
- **Barra superior (`AdminHeader`):** 60 px sobre `card` con borde inferior. Nombre del complejo en microrrótulo a la izquierda, hueco de vista en el medio, tema a la derecha.
- **Barra inferior (`AdminBottomNav`, debajo de `lg`):** fija, cuatro accesos de al menos 56 px de alto con ícono y rótulo de 11 px; el cuarto, "Más", abre el cajón (`Sheet` lateral) con todos los espacios.
- **Pestañas (`ScrollTabs`):** subrayado de 2 px; la activa lleva borde `emerald-600` y texto `emerald-800`/`emerald-400`. Se deslizan en horizontal si no entran.
- **Paginación (`Pager`):** una sola para todo el panel: "Mostrando 26–50 de 312", números con la primera y la última a mano, la actual en `foreground` sólido, "Anteriores"/"Siguientes" apagados en su lugar cuando no hay adónde ir. Nada de scroll infinito en el panel.
- **Portal:** la barra, el pie, la barra inferior y el menú de cuenta del jugador están en Components › Portal (La Previa).
- **Candado de rol:** lo que el encargado no puede usar se ve con candado y el tooltip "Solo el dueño" en vez de desaparecer (hoy, Configuración).

### Dialogs, Sheets and Toasts

- **Diálogo:** esquina de 16 px, `p-6`, 576 px de ancho por defecto (`max-w-xl`); `ConfirmDialog`, el más usado, va en 448 px (`max-w-md`), y el modal de cobro de un turno en 672 px (`max-w-2xl`), para que los dos equipos entren lado a lado. Arriba en el teléfono y centrado desde 768 px. Entra con fade y zoom de 95 a 100 % en 200 ms. Escape y la X cierran. El error de la acción va en `role="alert"`, 13 px, `red-700`/`red-300` (no `text-destructive`: sobre la superficie oscura da 3.87:1), el mismo piso de 13 px del portal.
- **Confirmar o deshacer:** la fricción crece con el costo, en tres escalones. Lo reversible y barato se hace ya y ofrece "Deshacer" en el toast, solo si existe la acción inversa de verdad. Lo costoso pero explicable pasa por `ConfirmDialog` con sus consecuencias listadas. Lo irreversible con plata real suma tipear una frase (`confirmationPhrase`); borrar la cuenta del jugador pide tipear su email (`phraseMatch="email"`, ver Components › Mi cuenta y Eliminar la cuenta). En el diálogo destructivo el botón rojo va separado del cancelar. Nunca `window.confirm()` ni `alert()`.
- **Sheet:** lateral derecho de 384 px para detalle, izquierdo de 288 px para el cajón de navegación, inferior con esquinas de 16 px en el teléfono.
- **Toast:** abajo a la derecha, tarjeta con una barra de acento a la izquierda (esmeralda a teal, o roja). Éxito se va a los 4 s; error queda hasta que se cierra; con acción, 10 s. El texto dice qué pasó y qué sigue.
- **Tooltip:** pastilla `foreground` sobre `background` (se invierte con el tema), 12 px, aparece a los 300 ms con el mouse y enseguida con el foco. Obligatorio en íconos solos, candados de rol y botones deshabilitados ("¿por qué no puedo?").
- **Guía en contexto:** como mucho un elemento de guía visible por pantalla (`Coachmark` o una pista), que se descarta con un clic y no vuelve. Nada de tours modales de bienvenida.

### Grilla de turnos

La pieza propia del panel (`BookingCard` + `gridMoneyVisual` en `slot-visual.ts`). Variante "Entra entera", elegida por el dueño el 2026-09-25 (`docs/decisions/2026-09-25-grilla-entera-y-agenda.md`).

- **Entra entera:** a 1280×650 entran 12 canchas sin scroll horizontal (columnas de 4,75rem mínimo desde `lg`, 3rem entre `md` y `lg`) y las horas estiran la fila hasta llenar el alto (`minmax(3.5rem, 1fr)`). La mañana sin turnos se pliega en una línea: "09:00–17:00 · Sin turnos · Mostrar". Si igual hay scroll horizontal (tablet con muchas canchas, escritorio angosto), un degradé en el borde derecho y la pastilla "N canchas →" avisan que hay más.
- **En el teléfono (debajo de `md`), lista por hora** (`GridHourList`, decisión del dueño 2026-10-22: `docs/decisions/2026-10-22-grilla-celular-por-hora.md`). Es una sola tarjeta que baja hora por hora. Cada hora lleva un encabezado pegajoso: la hora en Archivo de 17 px, "Ahora" en rojo con un punto en la hora actual, y "N libres" o "Completo" a la derecha mientras no empezó.
  - **Fila por turno, de 52 px:** el mismo borde izquierdo de 3 px y el mismo tinte de plata que la celda. Lleva la cancha a la izquierda (13 px, entera, en los renglones que haga falta: nunca se corta), el nombre en 15 px semibold con el estado abajo ("No cobrado" en rojo, "Se juega", "Evento · 15:00–18:00") y la plata a la derecha.
  - **Horas siguientes de un evento:** una fila punteada, "Cumple Tomi · sigue hasta 18:00". Si no entra, se corta el nombre y nunca la hora de fin.
  - **Libres:** botones "+ Cancha N" de 44 px, neutros (borde punteado slate, texto `foreground` y el `+` en `muted-foreground`: el verde es lo cobrado, no la acción), que bajan de renglón. Nada horizontal.
  - **Horas pasadas sin turnos:** no se muestran. Las primeras del día se resumen en "09:00–17:00 · Sin turnos".
- **Turno:** bloque de esquina de 6 px sobre `card`, con el **borde izquierdo de 3 px** y el tinte de su tono. **El color es de la plata**, como en Hoy: rojo "No cobrado" lo que ya terminó con saldo (por `ends_at`, esté `confirmed` o `completed`; nunca "deuda"), verde "Pagado", ámbar "Esperando seña". Lo que todavía no se jugó va neutro (`bg-secondary`, borde `slate`) con el monto en gris; ausente, sin cargo y bloqueo también (el bloqueo, rayado). El contenido responde al ancho de la celda con container queries: nombre en una o dos líneas (12 px, 14 px en celdas anchas), "Evento · N h" si entra, monto corto o "Falta $ X".
- **Ahora:** la línea roja pasa por debajo de las tarjetas (no tacha nombres) y la hora actual va en negrita con un punto rojo.
- **Libre:** solo las líneas de la grilla y un `+` tenue en lo que todavía no pasó. La reserva que entra por Realtime pulsa una vez (600 ms).
- **Encabezado:** la fecha centrada en la barra superior, "‹ Viernes 25 de septiembre · Hoy · calendario ›" (corta debajo de `xl`); tocarla abre la semana y un selector de fecha, y fuera de hoy aparece "Hoy" para volver. A la derecha, el chip rojo "N sin cobrar · $ X": cuenta solo lo jugado, igual que la celda y que Hoy, y al encenderse pone el único anillo de la grilla (2 px rojo) sobre esos turnos.

### Agenda

`/reservas`, que en pantalla se llama Agenda desde el 2026-09-25 (la URL no cambió). Es un buscador con la lista de turnos, para contestar el WhatsApp ("¿a qué hora tenía?", "cancelá lo mío"); no se cobra desde acá, cobrar es de Hoy.

- **Barra superior:** "Grilla | Agenda", el buscador (nombre, teléfono o nº de reserva), "Próximos | Pasados" y la cancha. Próximos y pasados se cortan por el instante de fin: lo que se está jugando es próximo; lo que terminó hoy ya es pasado.
- **Chips:** Todos · Esperando seña · Ausentes · Cancelados. "Todos" no muestra cancelados ni expirados.
- **Lista:** una sola, a todo el ancho, agrupada por día con encabezado pegajoso ("Hoy · viernes 25 de septiembre"). Cada renglón es un link al detalle: hora (con "Se juega" en verde si está en juego), cancha, nombre y teléfono, un chip neutro de tipo (Fijo, Evento · N h) y una sola lectura de la plata a la derecha, con el mismo color que la Grilla. En el teléfono, dos renglones.

### Tablero de Hoy

La otra pieza del mostrador (`CourtBoard` + el modal `VenderDialog`), rehecha el 2026-09-25 para que Hoy sea una pantalla de acción (`docs/decisions/2026-09-25-hoy-cobrar-ahora.md`). El dueño eligió el diseño de las filas y el del modal de Vender entre variantes ese mismo día.

- **Turnos de hoy:** UNA tarjeta con una fila por cancha en servicio (en el orden de la Grilla; una pausada aparece solo si debe plata), 1 columna en el teléfono y 2 desde 40 rem de ancho. Cada fila es UN botón con UN turno: la cancha, el nombre en 15 px con "cuándo · detalle" debajo (`MetaLine`, que nunca deja un "·" colgando), la plata a la derecha y abajo el reloj del turno: hora de inicio, una barra de 4 px y hora de fin. Con menos de 25 rem de fila el nombre de la cancha sube arriba del turno para que "Cobrar $X" no aplaste el nombre. El tablero va a todo el ancho: doce canchas miden 662 px de alto en la notebook (806 px con 682 px de ancho).
- **Qué turno muestra:** el que terminó sin cobrarse (el más reciente; los otros de esa cancha se cuentan: "+1 más por cobrar"); si no, el que se juega ("Termina en 25 min", lo que falta y la barra llenándose en verde); si no, el próximo ("Empieza en 25 min" o "Empieza a las 23:00", barra vacía); si no, "Sin más turnos hoy" con borde punteado.
- **Cobrar ahora:** la fila del turno jugado y no cobrado va en rojo (borde al 40 %, fondo al 5 % en claro y 10 % en oscuro), con "Terminó hace N min" en rojo, la barra llena en rojo y el botón rojo "Cobrar $X" con un punto que late (`animate-ping`, congelado con `prefers-reduced-motion`). El encabezado del tablero dice "N sin cobrar · $X" en rojo, o "Todo cobrado" en verde.
- **Pagado:** la fila de un turno pagado entero se tiñe de verde igual que la roja (borde al 40 %, fondo al 5 % y 10 %), con "Pagado" a la derecha (pedido del dueño, 2026-09-25). Un torneo no se cobra por turno y va sin color.
- **Turnos no cobrados de días anteriores:** UN renglón debajo del tablero, con la cantidad y el total en rojo y "Ver y cobrar", que abre la lista en un diálogo; cada turno se cobra con el mismo modal. Nunca una lista en la pantalla.
- **Vender (modal):** lo abre el botón "Vender" de la barra superior, a todos los anchos, o la tecla V (salvo escribiendo en un campo o con otro diálogo abierto). Mide hasta 1120×640 px y tiene tres columnas desde `lg`: los rubros ("Más vendidos" con estrella, cada categoría, "Otros" para lo que no tiene y "Todos"; sin categorías quedan solo "Más vendidos" y "Todos"), la lista del rubro y la venta a la derecha. Debajo de `lg` los rubros pasan a una tira de chips y, en el teléfono, la venta baja al pie. El catálogo son renglones con nombre y precio, no tarjetas (el stock solo cuando avisa: "Quedan 3" en ámbar o "Agotado" en rojo); lo que ya está en la venta muestra la cantidad en una pastilla `primary`. El buscador busca en todo el catálogo, ↑↓ eligen, Enter suma y F2 cobra; la ayuda de teclas va al pie. La venta: renglones con − cantidad +, el total en `font-display` de 28 px, el método de pago, "Cobrar $X" y "Anotar como fiado" sin borde. Después de cobrar el modal se cierra solo; con una venta sin confirmar no se cierra.

### Canchas

`/canchas` (`CourtList` + `CourtForm` + `price-setup/`), refinada el 2026-09-25: el dueño eligió "la tabla de B con el editor de A" entre tres variantes (`docs/decisions/2026-09-25-canchas-tabla-y-precio-simple.md`). Se toca en el alta del complejo y cuando algo cambia; lo que tiene que salir sin ayuda es cargar el precio.

- **Lista:** una tabla dentro de una tarjeta, una fila por cancha: miniatura y nombre ("Fútbol 5 · Sintético"), el precio del turno, "En tu perfil" (el badge Activa/Pausada con lo que ve el jugador: "Los jugadores la ven y la reservan" / "Los jugadores no la ven") y "Pausar"/"Reactivar" + "Editar". Desde `lg` es fila con encabezado de columnas; en el teléfono, la misma fila apilada (un solo DOM, sin `ResponsiveList`). Sin foto, la miniatura es un hueco punteado "Sin foto" que abre el editor en Fotos; el precio también es botón y abre el editor.
- **Precio en una línea:** "$ 60.000 hasta las 18:00 · $ 84.000 desde las 18:00", con los días en su propia columna cuando algún día cobra distinto ("Lun a Vie", "Sáb"). Lo que se edita hora por hora se resume como rango ("$ 70.000 a $ 110.000 según la hora"). Sin precio, "Sin precio" en ámbar.
- **Editor:** reemplaza a la lista (volver a "Canchas" arriba, nombre de la cancha como título), en `max-w-3xl` y una sola tarjeta con tres secciones: La cancha, Precio del turno y Fotos (con "Así la ve el jugador", la misma `CourtCard` del portal). "Guardar" va en una barra pegajosa al pie, arriba de la barra inferior en el teléfono.
- **Precio del turno:** dos preguntas por sí o no ("¿Cobrás distinto a la noche?" con "desde las", "¿Algún día cobrás distinto?" con los días en chips) y hasta cuatro precios; lo que se tipea ya vale, no hay "Aplicar". Debajo, "Así queda la semana": una barra por día con los tramos teñidos de verde según el precio (más caro, más oscuro), lo que falta en ámbar punteado y los días cerrados. "Igual que Cancha 1 y Cancha 2" copia el precio de otra cancha (las que cobran igual son una sola opción) y queda marcado mientras coincide. "Ajustar hora por hora" abre la grilla día × hora, plegada; si lo cargado no entra en las dos preguntas se edita solo ahí, nunca se pisa en silencio, y "Pasar a un precio simple" ofrece "Deshacer". Con un solo día abierto no se pregunta por otro día, y el "Sí" siempre deja al menos un día con el precio de siempre.
- **Pausar:** `ConfirmDialog` destructivo que dice qué deja de pasar (no se ve en el perfil, no entran turnos nuevos) y lista los turnos por delante y los fijos. Reactivar es un clic con "Deshacer", salvo que suba la cuota: ahí va el aviso de facturación, sin suavizar.

### Caja › Cuentas (libro de la noche)

La pantalla donde el dueño mira la noche, casi siempre desde el celular (`/caja/cuentas`), rehecha el 2026-09-25 porque los movimientos quedaban escondidos detrás de la tabla de lo sin cobrar (`docs/decisions/2026-09-25-caja-libro-de-la-noche.md`). El dueño eligió la variante entre tres ese día. De arriba a abajo:

- **Día:** flechas ‹ › con "Hoy · jue 24 sep", "Ayer · …" o la fecha corta; desde `lg` cuelgan del hueco de la barra y en el teléfono bajan arriba del contenido. En hoy la flecha de adelante se apaga. El resumen y los movimientos son de ese día operativo (`?dia=`); lo sin cobrar no depende del día.
- **Resumen (el cierre automático):** una tarjeta con "Entró hoy" y el total en `font-display` de 30 px; al lado, efectivo, MercadoPago y transferencia siempre (aunque den cero) y, separados por una línea, turnos, cantina, otros y los gastos en rojo con "−". No se cuentan billetes.
- **Lo sin cobrar:** una tarjeta clickeable por tipo, "N fiados sin cobrar · $X" y "N turnos no cobrados · $X" (el monto de los turnos en rojo), con "Ver y cobrar ›". Cada una abre su diálogo con la lista: nombre, "jue 17 sep · Cancha 2 · 19:00–20:00" (el día primero, para que en el teléfono se corte la hora y no cuándo se jugó) o "Anotado hace 2 días", el monto, WhatsApp si hay teléfono, "Anular" en los fiados y "Cobrar". El cobro se abre encima con el modal de siempre y la lista queda abierta para el siguiente. Nunca una tabla en la pantalla.
- **Movimientos:** UNA tarjeta a todo el ancho, del más nuevo al más viejo y agrupada por hora, con una fila "21 h · 6 movimientos" y el neto de esa hora. Los chips "Todo / Turnos / Cantina" (y "Gastos" si hay alguno) filtran en el lugar. Cada fila: hora, ícono del tipo con nombre accesible, quién pagó o qué se vendió, el método y el monto. El ticket de cantina pierde el "Cantina: " y el turno se nombra por quién pagó, nunca por la descripción guardada (que puede decir "deuda"). Desde `lg` es una tabla; debajo, una lista. "Registrar movimiento" es un botón sin borde en el encabezado y solo aparece en hoy (en el Vagón se usó cero veces en diez noches).

### Caja › Productos (reponer primero)

Lo semanal de la cantina (`/caja/productos`), rehecho el 2026-09-26 con el mismo estilo que Cuentas (`docs/decisions/2026-09-26-caja-productos-reponer-primero.md`). El dueño eligió la variante entre tres. Todo va en tarjetas. De arriba a abajo:

- **Para reponer:** solo si hay algo en su mínimo, por debajo o agotado. El título en ámbar con la cantidad y una fila por producto, del que se acaba primero al último: "Imperial quedan 55 (mínimo 60) · al ritmo de esta semana alcanza 8 noches" (o "agotado" en rojo) y "Reponer" con borde.
- **Catálogo y lo que más salió:** desde `lg`, lado a lado (3 a 2). El catálogo es una fila por producto con el precio y el stock en palabras ("Stock 252 · mín 100", "Quedan 55" en ámbar, "Agotado" en rojo, "No lleva stock", "Pausado") y Reponer, Editar y "⋯" sin borde; en el teléfono esos dos pasan al menú. "Lo que más salió" son los 8 que más plata hicieron, con una barra `primary` sobre `muted`, "48 u · $336.000", el total arriba y los chips de 7 y 30 días; el resto, detrás de "Ver los otros N".
- **Movimientos de stock:** plegado, una tarjeta más al pie.

### Métricas (el mes y sus canchas)

`/analiticas` (`/metricas` redirige), solo del dueño. Rehecha el 2026-09-26 porque eran dos páginas pegadas: 30 días corridos arriba y el mes abajo, con "Ingresos" dos veces y cada uno en su ventana (`docs/decisions/2026-09-26-metricas-canchas-primero.md`). El dueño eligió la variante "Canchas primero" entre tres. Tiene que contestar en el celular, en cinco segundos, "¿cómo me fue?" y "¿qué cancha rinde?". De arriba a abajo:

- **Mes:** flechas ‹ › con "Septiembre de 2026" (`MonthStepper`). Desde `lg` cuelgan del hueco de la barra, con "Exportar CSV" a la derecha; en el teléfono bajan arriba del contenido y el CSV va al pie. En el mes en curso la flecha de adelante se apaga. Todo es de ese mes, salvo "Últimos 30 días".
- **El mes y sus canchas:** una tarjeta. Arriba "Entró en septiembre, hasta hoy" ("Entró en agosto" si ya cerró), el total en `font-display` de 30 px y "N turnos en el mes". A la derecha va la comparación con el mes anterior: con el mes en curso, el total del anterior como referencia ("En todo agosto: $ X"), sin porcentaje, porque un mes a medias contra uno completo daba "−83%" el día 5; con el mes cerrado, el porcentaje ("↗ 8% vs julio ($ X)"). "Ajustes −$ X · Con ajustes $ Y" aparece solo si hubo ajustes; dice "Con ajustes" y no "Saldo" porque no resta los gastos de Caja. Debajo, las canchas de la que más cobró a la que menos: nombre, el monto en `font-display` de 18 px, una barra `primary` contra la que más cobró (la de "Lo que más salió") y "N turnos · X% ocupada". Una columna en el teléfono, dos desde `sm` y tres desde `xl`: a 1280×650 entran doce canchas sin scrollear.
- **Por dónde entró:** efectivo, MercadoPago y transferencia siempre, aunque den cero, y "Otro" si hubo, igual que en el resumen de Caja › Cuentas.
- **Últimos 30 días:** solo en el mes en curso, al lado de "Por dónde entró" desde `lg`. Los cinco horarios más pedidos con barra y las ausencias con su tendencia, sin flecha ni color con menos de 30 turnos terminados. Se refresca solo cada minuto. En un mes cerrado no aparece, porque los 30 días corridos son de ahora.
- **Vacío:** uno solo y honesto, `EmptyState` "Todavía no hay cobros en septiembre" con "Ir a la Grilla" ("En agosto no hubo cobros" en un mes pasado). Nada de números de ejemplo: se fueron los KPI fantasma, las barras fantasma y el "3,2%".
- **Sin librería de gráficos:** una barra horizontal hecha con un `div` alcanza para comparar, y recharts se sacó del proyecto con este cambio.
- **Ocupación por cancha:** minutos reservados sobre minutos que la cancha estuvo abierta, en el mismo tramo. En el mes en curso el tramo va del 1 a hoy inclusive (día operativo del complejo): un turno de mañana todavía no suma, y los días que faltan tampoco cuentan en el total. Un mes cerrado cuenta entero; uno que no empezó marca 0%.
- El estado del sistema, que solo ve el superadmin de la plataforma, sigue al pie.

### Placa para historias (turnos libres del día)

Una imagen 9:16 (1080×1920, PNG) que el dueño sube a una historia de Instagram o a un estado de WhatsApp. Sale del botón de compartir de la barra de la Grilla (un ícono con tooltip en escritorio; en el teléfono va en la fila de abajo, con el rótulo "Compartir turnos" cuando no hay chip de "sin cobrar") y la dibuja `GET /api/public/story` (`src/lib/story-image/`). Lo hacían a mano con ChatGPT; acá sale con los datos reales y la paleta de la marca. No es una pantalla del panel: es una pieza de marketing con su propio mundo visual, siempre oscura (azul noche `#020617` con haces esmeralda y una cancha vertical en trazo finísimo), sin importar el tema del panel. De arriba a abajo:

- **Fecha → titular → complejo:** "HOY · MARTES", el titular "HOY SE JUEGA." (el día cambia: "MAÑANA SE JUEGA.", "SÁBADO SE JUEGA."; el punto va en esmeralda), el nombre del complejo y la pastilla "TURNOS DISPONIBLES". Archivo 900 itálica para los números y el titular, Inter 600 para el resto.
- **Horarios:** hasta cuatro, cada uno con la hora y "N canchas" libres. Con más de cuatro se muestran los primeros y una línea "y N horarios más": la tipografía **no se achica** para meterlos todos (una historia se lee a un tercio de su tamaño).
- **Llamado y URL:** "RESERVÁ TU CANCHA" ("MIRÁ LOS HORARIOS" si el complejo no toma reservas online) y la URL real del portal, sin esquema. El logo de TurnoGol (`logo_principal.png`, el de fondos oscuros del manual de marca) es la única marca de agua, chico, al pie.
- **Margen seguro:** 250 px arriba y abajo, donde la interfaz de Instagram tapa la imagen. Todo lo que se lee vive en el medio; el fondo sale a sangre.
- **Ni hora de actualización, ni WhatsApp, ni "con TurnoGol":** el pedido del dueño los sacó a los tres. Nada que no venga de los datos del complejo.
- **Excepción a "nada de hex inline":** satori (el motor de `next/og`) no lee variables CSS ni tokens de Tailwind, así que los colores de marca se repiten en `render.tsx`, en un solo lugar. Si cambia un token de marca, hay que cambiarlo ahí también.
- **El enlace dibujado no se toca:** por eso el diálogo ofrece "Copiar link" aparte (para el sticker "Link" de Instagram o el mensaje de WhatsApp).

### Superadmin (Pulso, Complejos y Jugadores)

`/super-admin`, solo para el dueño de la plataforma. Se rehizo el 2026-10-16, el día en que El Vagón publicó su link de reservas y el panel no mostró ni uno de los 10 jugadores ni de las 9 reservas online. Contesta "¿cómo viene la plataforma hoy y esta semana?" antes que "¿cuánto factura?". Va en el mismo mundo que el panel del complejo (esmeralda sobre slate): el violeta propio del super-admin se eliminó ("SuperAdmin" en la barra alcanza para saber dónde estás). No confundir con el violeta de TurnoGol Plus (ver Colors), que es otro uso y no identifica al panel. La navegación tiene tres entradas: Pulso, Complejos y Jugadores.

- **Pulso (portada):** "Hoy · 7 días · 30 días" en el encabezado (links, la ventana va en la URL). De arriba a abajo: cuatro `StatCard` (jugadores nuevos, reservas online, cargadas por el complejo, complejos con movimiento) con la ventana anterior como referencia en el subtítulo, sin porcentaje (mismo criterio que Métricas); los últimos 14 días en dos barras diarias (`DailyBars`); "Pide atención" solo si hay algo (pruebas que vencen, cobro trabado, tareas fallidas); "Lo último" (reservas online y jugadores nuevos, con link a cada uno); después Plata, Alta de complejos y la salud técnica plegada.
- **Cada bloque carga solo:** la actividad y el resto son dos lecturas con su propio `Suspense`, tope y aviso "No se pudo leer a tiempo". Una lectura lenta no tira la página.
- **Jugadores:** altas por día (30 días), lista con búsqueda y chips (Todos · Nuevos esta semana · Con reservas · Bloqueados) y el detalle con sus datos, sus complejos (etiquetas del enum y bloqueos) y sus reservas con el origen (Online / Cargada por el complejo). Nunca se muestra texto libre sobre una persona (ni el motivo de un bloqueo), y un jugador anonimizado aparece como "Jugador anonimizado", sin contacto.
- **Complejos:** la lista dice si el complejo está vivo (última reserva, reservas de 7 días con cuántas online, jugadores) en vez del slug. El detalle es `PageHeader` plano con pestañas Resumen · Suscripción · Historial · Acciones, y los enums se muestran traducidos.
- **Vocabulario:** Complejos, Altas, Ingreso mensual, Prueba, Perdido, Ajustes, Historial. Nada de Tenants, MRR, Signups, Trial, Churned ni Audit trail en pantalla.

## Do's and Don'ts

### Do:

- **Do** usar solo tokens semánticos en las primitivas (`bg-card`, `text-foreground`, `border-border`, `bg-primary`, `ring-ring`). La paleta cruda de Tailwind entra solo para semántica de dominio, y a través de `src/lib/status-tone.ts`.
- **Do** pintar cada estado con color, ícono y texto (`StatusBadge`, `slot-visual.ts`), con el vocabulario único de estados: el panel y el portal dicen lo mismo. La excepción son Hoy, la Grilla y la Agenda: ahí el color es de la plata (rojo lo jugado y no cobrado, verde lo pagado) y lo que todavía no se jugó va en gris, sin pastilla.
- **Do** ponerle tope de alto y scroll propio a una lista que puede ser larga (`ScrollRegion`, o `scrollLabel` en `ResponsiveList`): hasta 36 rem o el 65 % de la pantalla, con el encabezado de la tabla pegado arriba y el paginador afuera, a la vista. Una página que se estira con cuarenta filas deja lo que viene abajo a metros (pedido del dueño, 2026-09-26). Hoy lo tienen el catálogo, lo que más salió y los movimientos de stock de Productos, los movimientos de Cuentas, Personas, Turnos fijos y el historial de un jugador; la Agenda scrollea adentro desde `lg` con su propio armado.
- **Do** probar cada pantalla en claro y en oscuro, con contraste medido: 4,5:1 en texto y 3:1 en componentes (la suite a11y de Storybook corre en los dos temas).
- **Do** mantener el movimiento de los controles del panel en 200 ms o menos, animando transform, opacidad, color o sombra, nunca ancho, alto ni posición. Las excepciones de hoy: la sheet al abrir (300 ms), el levante de `.card-premium-interactive` (250 ms), el pulso de un turno nuevo (600 ms, una vez) y el punto que late en el botón "Cobrar $X" de Hoy (pedido del dueño, 2026-09-25). `prefers-reduced-motion` congela todo desde `globals.css`: una animación nueva tiene que verse bien congelada.
- **Do** colgar los controles de una vista en el hueco de la barra superior (`AdminHeaderSlot`) en vez de sumar filas de encabezado.
- **Do** reservar 44 px de blanco táctil debajo de 768 px (`h-11 md:h-10`) y dejar la fila entera clickeable cuando abre un detalle.
- **Do** escribir en voseo, en sentence case y con el vocabulario de pantalla de `PRODUCT.md`; mayúsculas solo en microrrótulos de una o dos palabras con `tracking`.
- **Do** construir todo lo nuevo del portal en La Previa (oscuro premium, vidrio, resplandores, fotos de fondo, titulares en Archivo negra itálica con un tramo en `.hero-accent-text`), con las recetas que ya existen en `globals.css` y `PortalAuthFrame.tsx`, y una sola acción verde por pantalla. La única excepción es la ficha del complejo, que sigue en La Reserva.
- **Do** montar `PortalWorld` solo en la ficha (`(perfil)/layout.tsx` y `[slug]/not-found.tsx`). Sus tokens cuelgan de `html:has([data-world='portal'])` (`portal-world.css`) para alcanzar a los portales de Radix en `body`; un token del portal nunca se escribe en `:root`, `.dark`, `.dark-surface` ni `src/components/ui/*`.
- **Do** mantener las compuertas del portal en verde: `tests/unit/portal-world-tokens.test.ts` hashea los tokens del panel (cambiarlos a propósito actualiza el hash en el mismo PR), `tests/unit/portal-shell-bg.test.ts` fija la regla que apaga el fondo de cancha en la ficha, `tests/unit/hero-accent-contrast.test.ts` fija el contraste de `.hero-accent-text` y del eyebrow de `PlayerHeroBand`, y la story de `PortalWorld` mide 9 tokens en claro y en oscuro.
- **Do** marcar el error en el campo o la casilla que falló, con el mensaje debajo.
- **Do** decir lo elegido en la reserva con relleno verde y tilde (chips de día y de formato, horas): nunca solo color. Es la excepción a The One Voice Rule que fija el brief de la ficha (2026-10-15): lo elegido es un estado, no una acción. Cada estado de una hora se dice con palabra ("N libres", "Queda 1", "Libre", "Señando", "Completo") y lo que no se puede elegir se ve y se explica en vez de desaparecer.
- **Do** resolver las columnas de una pieza que vive en una columna angosta con `@container`, no con un breakpoint de viewport.
- **Do** darle a cada vacío o error del portal su causa, qué hacer y una salida (reintentar, otro día, hablar con el complejo) arriba del pliegue.
- **Do** marcar con `data-fixed-cta` todo botón fijo abajo del portal y sumar su alto real a la cuenta de `PortalFrame` en el mismo PR; nunca medirlo con JS ni colgarlo de la sesión.
- **Do** dejar el estado que depende del reloj del visitante (hoy, abierto o cerrado, qué horas quedan) en una isla de cliente con un esqueleto del mismo alto, y marcar la sección de reserva con `data-state`.
- **Do** marcar con `data-portal-fields` el grupo de páginas del jugador que tiene campos, y dejar los marcos siempre oscuros (`PortalAuthFrame`, el modal de ingreso) con su `[--input:215.4_16.3%_50%]`, para que el borde de un control llegue a 3:1.

### Don't:

- **Don't** reemplazar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas", descartada por el dueño el 2026-09-23).
- **Don't** llamar "deuda" a un turno no cobrado, ni pintar de rojo un turno que todavía se está jugando: el rojo es de lo jugado y no cobrado (principio 3 de `PRODUCT.md`). La urgencia se dice con color y texto; el único movimiento es el punto que late en el botón "Cobrar $X" de Hoy (pedido del dueño, 2026-09-25). El anillo que respiraba alrededor de toda la celda de la Grilla (`.slot-alarm-ring`) se eliminó el 2026-09-24 y no vuelve.
- **Don't** usar emerald-500 o emerald-600 como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600.
- **Don't** escribir hex inline en JSX, ni sombras, degradés o vidrio inline; tampoco `dark:` sueltos para arreglar una primitiva: se arregla el token.
- **Don't** poner `bg-white` como fondo de página, ni `text-black`/`bg-black`. En el portal el fondo sale de `.player-shell-bg` (o de `bg-background` en la ficha), no de la clase.
- **Don't** llevar a la ficha del complejo las recetas de La Previa (vidrio, resplandores, foto de fondo, titular en negra itálica) ni a La Previa el aplanado de la ficha: cada mundo en su ruta, hasta que el dueño decida unificarlos.
- **Don't** deshabilitar un botón del portal con opacidad ni dejarlo deshabilitado sin explicación.
- **Don't** delimitar un campo, una casilla o un `outline` del portal con `border-border`: con 1,2:1 no llega a los 3:1 de WCAG 1.4.11.
- **Don't** poner dos acciones verdes en una pantalla del portal. La hora o el chip elegidos son estado y no cuentan; el botón verde de confirmar vive en `reservar` y, en la vuelta de la reserva, el verde es la salida principal ("Avisarle al grupo" en el éxito; las secundarias son filas planas).
- **Don't** mostrar una cuenta regresiva ni prometer una confirmación a quien vuelve de pagar: los cortes de la espera dicen dónde mirar (Mis reservas) y a quién escribir (el complejo). Lo que el jugador comparte (el mensaje al grupo) nunca lleva montos.
- **Don't** usar ámbar en la reserva de la ficha para otra cosa que "Queda 1": ni "Señando", ni "Libre", ni un aviso, ni la hora elegida.
- **Don't** esconder las horas completas ni los días cerrados: se ven, deshabilitados y dichos ("Completo" tachado, "Cerrado").
- **Don't** usar `CourtCard` en una página del portal: es la tarjeta del panel y del onboarding; la ficha usa `CourtTile`.
- **Don't** elegir las columnas de las horas con `md:grid-cols-*`: la reserva mide 384 px en escritorio y seis columnas no entran.
- **Don't** agregar librerías de animación (la única excepción es `/onboarding`, con `motion` en `LazyMotion`) ni loops infinitos fuera del skeleton, de la web comercial y del punto de "Cobrar $X" en Hoy.
- **Don't** usar el placeholder como rótulo, emojis como íconos estructurales ni fechas ISO o anglicismos de dashboard ("Revenue", "Booking") frente al usuario.
- **Don't** mostrar un número verificable que no salga de datos reales (prueba social, escasez, contadores): lo trucho descubierto destruye la confianza para pagar la seña y es publicidad engañosa (Ley 24.240).
