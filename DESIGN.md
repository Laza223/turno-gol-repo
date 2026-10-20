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

**Creative North Star: "El Mostrador y La Reserva"**

> La Reserva está en revisión por [`docs/decisions/2026-10-20-portal-con-taste.md`](docs/decisions/2026-10-20-portal-con-taste.md).

TurnoGol es un solo sistema con dos personalidades. Comparten el verde de marca, las tipografías, el logo y las primitivas de `src/components/ui/`; cada una tiene su mundo. **El Mostrador** es el panel del complejo: una herramienta que el encargado usa toda la noche en una notebook con mouse, mientras atiende gente y contesta el WhatsApp. Es denso pero obvio, con los datos primero, un solo verde que grita por vista y movimiento corto. **La Reserva** es el portal del jugador: el estándar de las apps de reservas de canchas, con el flujo de ATC y una terminación más linda y moderna, sin perder accesibilidad (compromiso de marca de `PRODUCT.md`). Es plano: fondo blanco en claro, bordes de 1 px, un solo verde para lo elegido y la acción principal, títulos en Archivo 800 recta. Sin mundo temático, sin resplandores y sin vidrio.

El mundo del panel es césped de noche sobre slate. En claro, tarjetas blancas que flotan con sombras en capas sobre un fondo slate frío; en oscuro, losas slate-950 con superficies de vidrio (relleno blanco al 3 %, desenfoque y un resplandor esmeralda). Los dos temas son de primera: ninguna vista se diseña para uno y "después se verá" el otro; arranca el del sistema (`next-themes`, `defaultTheme="system"`). El estado nunca se comunica solo con color: siempre va color, ícono y texto, y lo resuelve una sola tabla de tonos.

Este documento describe el estilo tal como está en el código al 2026-09-23 y es la única autoridad de diseño del repo. El panel se **refina** sobre este estilo; no se reemplaza. Donde los documentos anteriores (hoy en `docs/archive/design-system/`) y el código no coincidían, ganó el código. Rechazo confirmado por el dueño el 2026-09-23: cambiar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas"). Ese rechazo es del panel; el portal plano es otra decisión del dueño (2026-10-15) y no lo reabre.

**La Reserva reemplaza a "La Previa"** (la vidriera con resplandores, vidrio, fotos de fondo y titulares en negra itálica) y se migra página por página. Hoy están en el mundo nuevo `/ingresar`, `/aceptar-terminos` y los estados de jugador de `/verify` (PR 2.1), el cromo de todo el portal (PR 2.2; la barra, el pie, la barra inferior y el menú de cuenta), la página pública del complejo `/[slug]` con su reserva de horas (PR 2.3a), la pantalla de confirmar `/[slug]/reservar` con el ingreso del jugador adentro (PR 2.3b1) y la vuelta del ingreso directo a esa pantalla, sin pasar por `/verify` (PR 2.3b2), la vuelta de la reserva `/reserva/[bookingId]/{exito,pendiente,error}` (PR 2.3c) y todo el grupo del jugador `(player)`: Mis reservas `/mis-reservas` (PR 2.4a), Mi cuenta `/configuracion` y Eliminar la cuenta `/eliminar-cuenta` (PR 2.4b; `/perfil` ya no existe como pantalla, redirige a Mi cuenta). El cromo usa solo tokens semánticos y se ve igual con los del panel y con los del mundo, porque `PortalWorld` todavía se monta por página y no en el cascarón (la ficha lo monta en el layout de `(perfil)`, confirmar en `reservar/layout.tsx`, la vuelta en `reserva/layout.tsx` y el grupo del jugador en `(player)/layout.tsx`, que cubre sus páginas, sus `loading.tsx` y sus `error.tsx`). La home `/` está en el mundo nuevo desde el PR 2.5: vive en la raíz de `app/`, sin layout de grupo, así que `src/app/page.tsx` monta `PortalWorld` y el mismo cromo (`PortalShell`); la barra `overlay` (la pastilla de vidrio sobre el hero) y las recetas `.landing-hero`, `.overlay-nav` y `.cta-band` se eliminaron. El resto del portal conserva el aspecto saliente hasta su PR: Explorar (2.6). Las páginas de torneos (`/[slug]/torneos/*`) quedan afuera de `PortalWorld` a propósito. **El aspecto saliente no se extiende a nada nuevo**: una superficie o pieza nueva del portal se construye en La Reserva aunque la página que la rodea todavía no haya migrado. Las recetas de La Previa que siguen en el código (`PlayerHeroBand`, `.hero-accent-text`, la losa nocturna, el vidrio y los resplandores del portal) se describen acá solo como saliente, no como reglas.

**Key Characteristics:**

- Esmeralda sobre slate, con claro y oscuro como temas de primera.
- Panel: claro = elevación (sombras en capas), oscuro = vidrio (blanco al 3 % + blur + resplandor). Portal: plano en los dos temas.
- Inter trabaja; Archivo titula, pone las cifras clave y firma el logo. Toda cifra es tabular.
- Estado = color + ícono + texto, siempre desde `src/lib/status-tone.ts`.
- Panel denso y movimiento corto (200 ms en los controles). Lo único largo es un pulso de 600 ms, una sola vez: el turno que entra a la grilla.
- Un solo primario por vista.
- El portal se pinta con tokens propios, colgados de `html` cuando hay un `[data-world='portal']` en la página; el panel no cambia.

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
- **Losa nocturna** (`night-slab` #020617): el fondo de las superficies siempre oscuras de la web comercial (`(business)`) y de las pantallas del staff en `(auth)`. En el portal es aspecto saliente de La Previa: queda en las páginas que todavía no migraron y no se usa en nada nuevo. El fondo oscuro del portal es el `background-dark` del panel.
- **Superficie siempre oscura** (`.dark-surface`, en `globals.css`): una página que es oscura aunque el sitio esté en claro (hoy `/para-complejos`) envuelve su contenido en esta clase. La clase `.dark` sola no alcanza: Tailwind v4 resuelve los `--color-*` una vez en `:root`, y `text-foreground`, `bg-card` y compañía seguirían saliendo en claro. `.dark-surface` los vuelve a declarar.

### Portal (La Reserva)

El portal redeclara solo lo que cambia; `primary`, `foreground`, `card`, `destructive` y los tonos de estado se heredan del panel. Los valores viven en `src/components/world/portal-world.css`.

- **Blanco de página** (`portal-background`, en claro): el fondo del portal es blanco; en oscuro es el `background-dark` del panel. Se pinta con `bg-background`, nunca con `bg-white`.
- **Slate de superficie** (`portal-surface`, slate-100 #F1F5F9, en claro): superficies anidadas, avisos (`bg-muted`) y hover (`secondary`, `muted` y `accent` valen lo mismo).
- **Texto secundario** (`portal-muted-foreground`, slate-600 #475569, en claro): 7,6:1 sobre blanco y 6,9:1 sobre slate-100.
- **Línea de superficie** (`portal-border`, slate-200 #E2E8F0, en claro): separa superficies (divisores, bordes de tarjeta y de aviso). Con 1,2:1 sobre blanco no delimita un control.
- **Borde de campo** (`portal-input`, slate-500 #64748B, en claro · `portal-input-dark` #6B7C94 en oscuro): el borde de los campos, de la casilla y del botón `outline`. Llega a 3:1 contra el fondo (WCAG 1.4.11): 4,8:1 sobre blanco; en oscuro, 4,7:1 sobre el fondo, 4,3:1 sobre la tarjeta y 3,2:1 en hover (`border-input/80`). En el panel `input` vale lo mismo que `border`; en el portal son dos tokens distintos.
- **Ámbar de "Queda 1"** (`portal-last-fill` #FFFBEB, `portal-last-border` #FCD34D y `portal-last-text` #92400E en claro; en oscuro, ámbar al 10 % con borde al 40 % y texto #FCD34D): son las escalas amber 50, 300 y 800 de `globals.css`, escritas como clases de Tailwind en `HourGrid` y no por `status-tone.ts`. Solo la hora a la que queda una cancha; ver The Scarcity Amber Rule.
- **Foco** (`ring` = `primary`): emerald-700 en claro (5,6:1 sobre blanco; el emerald-500 del panel da 2,6:1) y emerald-500 en oscuro (7,8:1 sobre el fondo).
- **Selección de texto:** tinte `primary` al 25 % con el texto en `foreground`, en todo el mundo, puesto una vez en `PortalWorld` y no campo por campo.

En el oscuro el resto de los tokens es el del panel: el portal oscuro y el panel oscuro comparten fondo, tarjeta, línea y texto secundario.

### Status

- **Cobrado** (`success`: hsl(142 72% 29%) = green-700 · `success-dark`: hsl(142 70% 45%)): confirmado, jugado, cobrado, ingreso.
- **Pendiente** (`warning`: hsl(32 95% 44%) = amber-600 · `warning-dark`: hsl(38 92% 50%)): esperando seña, atención.
- **Informativo** (`info`: hsl(221 83% 53%) = blue-600 · `info-dark`: hsl(217 91% 60%) = blue-500): en proceso (MercadoPago), confirmado a cobrar, avisos neutros. El azul de MercadoPago se permite solo dentro del contexto de pago.
- **Peligro** (`destructive`: hsl(0 72% 51%) = red-600, igual en los dos temas): borrar, ausente, egreso, error y el turno jugado y no cobrado ("No cobrado", decisión del dueño del 2026-09-25: es plata que no entró).

Los rótulos sobre un tinte de estado usan la escala 800 en claro y 300 en oscuro (rojo: 700 y 300). Esas clases, los tintes al 10/15 % y el borde izquierdo de la grilla salen de `TONE_BADGE`, `TONE_TEXT`, `TONE_TINT` y `TONE_BORDER` en `src/lib/status-tone.ts`, con seis tonos: `success`, `warning`, `info`, `destructive`, `neutral` y `brand`.

### Named Rules

**The One Voice Rule.** Por vista, un solo elemento grita en verde sólido: el CTA primario o el dato clave. Los acentos susurran (texto o borde esmeralda) y todo lo demás calla en slate. En la grilla se invierte a propósito: el verde marca lo cobrado, no la acción.

**The Reserved Hues Rule.** `success`, `warning`, `info` y `destructive` son estado, no decoración. Lo que entra va en verde y lo que sale en rojo, siempre con signo y rótulo. La excepción es el libro de Caja › Cuentas, donde casi todo entra y cuarenta montos verdes por noche eran ruido: ahí el ingreso va en el color del texto con "+" y solo lo que sale va en rojo con "−" (decisión del dueño del 2026-09-25).

**The Component Border Rule.** En el portal, lo que delimita un control que se toca o se tipea (campo, casilla, botón `outline`) lleva `border-input` (3:1 o más contra el fondo); `border-border` es solo para separar superficies.

**The Scarcity Amber Rule.** En la reserva del portal, el ámbar es solo de "Queda 1": la única escasez que es un dato real. No se usa para "Señando" (es una espera y va con borde punteado), ni para avisos, ni para decorar. Va únicamente sobre la hora sin elegir: la elegida es verde.

**The Measured Contrast Rule.** Las escalas emerald, red y amber están fijadas en hex (valores de Tailwind 3) dentro del `@theme` de `globals.css`, porque las de Tailwind 4 en OKLCH rompían AA. Texto esmeralda: 700 sobre tarjeta clara, 800 sobre el fondo de página, 400 en oscuro. Nunca emerald-500 (2,5:1) ni emerald-600 (3,8:1) como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600 (3,8:1 y 3,2:1).

## Typography

**Display Font:** Archivo (variable, `font-display`, con fallback `ui-sans-serif, system-ui`)
**Body Font:** Inter (variable, `font-sans`, el default del `<body>`)
**Label/Mono Font:** Sora (`font-logo`), solo en microrrótulos de la web comercial y del login. La monoespaciada es la del sistema (`font-mono`, sin fuente propia) y solo muestra códigos que se copian o se tipean: la frase de `ConfirmDialog`, el código de referencia de `ErrorState`, el código de una reserva.

**Character:** Inter hace el trabajo: tablas, formularios, rótulos, montos dentro de una fila. Archivo habla: títulos de página, cifras clave, el logo en negra itálica mayúscula y los títulos del portal en 800 recta. Las tres se cargan con `next/font` en `src/app/layout.tsx`.

### Hierarchy

- **Display** (Archivo 800 recta, 28 px, interlineado 36 px, -0.01em): el título de cada pantalla del portal, uno por pantalla (`PORTAL_TITLE` en `src/components/world/PortalAuthFrame.tsx`; el nombre del complejo usa la misma voz). La home es la única con un titular más grande, en la misma voz: su h1 mide 32/36 px, 40/44 px desde `sm` y 44/48 px desde `lg`. El logo es lo único del portal que sigue en negra itálica. Saliente: los titulares en Archivo 900 itálica con `.hero-accent-text` (`PlayerHeroBand`, `/explorar`) quedan hasta que migre su página y no se usan en nada nuevo.
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

**The Upright Title Rule.** En el portal el título es Archivo 800 recta de 28 px con -0.01em; el h1 de la home cambia el tamaño (hasta 44 px), no la voz. La itálica es del logo; un título nuevo del portal en negra itálica es aspecto saliente. Las cifras que cuentan hacia atrás ("Reenviar en 42 s") y las horas y precios del portal van tabulares (The Tabular Rule).

**The 16px Field Rule.** Todo campo donde se tipea mide 16 px por debajo de 768 px y 14 px desde ahí (`text-base md:text-sm`); si no, iOS hace zoom al enfocar. No hay escape hacia abajo; hacia arriba existe `.field-lg` (18 px). `globals.css` tiene una red de seguridad fuera de `@layer`, que no reemplaza escribir la clase.

## Layout

El panel es un marco fijo con el contenido en el medio. En `lg` (1024 px) aparece el **riel** de 72 px a la izquierda; arriba va la **barra superior** de 60 px (más el safe-area de iOS) con el nombre del complejo, el **hueco de vista** (`AdminHeaderSlot`) y el menú de tema; debajo de `lg`, el riel se va y aparece la **barra inferior** con tres accesos directos y "Más".

- **Portal (La Reserva), la ficha del complejo (`ProfileLayout`):** en el DOM el orden es portada y datos, reserva y después canchas con foto, fotos, horarios, torneos y reseñas (orden de lectura y de tab: la reserva sube antes que las fotos). Contenedor `max-w-6xl`, margen de 16 px (24 px desde `sm`) y 16 px de aire arriba (32 px desde `lg`). **Desde `lg` (1024 px) son dos columnas:** el complejo a la izquierda (`minmax(0,1fr)`) y la reserva a la derecha en una columna fija de 24 rem (384 px), separadas 40 px. La reserva es pegajosa debajo de la barra (`top-14`, los 56 px de la barra), con tope de alto `100dvh − 3.5rem` y scroll interno si no entra; su relleno de 4 px, con margen negativo para no bajar la columna, deja lugar al anillo de foco que ese scroll recortaría. Debajo de `lg` es una sola columna, con 24 px entre el complejo y la reserva y 40 px entre bloques.
- **Portal, la home (`/`, `Hero`):** contenedor `max-w-6xl` con el margen del cromo (16/24/32 px), 24 px de aire arriba y 40 px al pie (48 y 64 px desde `lg`). En el celular es una sola columna en el orden de lectura: titular, buscador (24 px debajo) y canchas cerca (32 px debajo). **Desde `lg` son dos columnas:** titular y buscador a la izquierda en una columna de 28 rem (448 px, `minmax(0,28rem)`) y las canchas a la derecha (`minmax(0,1fr)`), alineadas arriba y separadas 48 px. Es un solo árbol para todos los anchos: dos árboles hermanos ocultos por CSS duplicaban el h1 y pedían la ubicación dos veces. Debajo, la franja de dueños a todo el ancho y el pie.
- **Portal, confirmar la reserva (`/[slug]/reservar`):** una sola columna de 560 px (`max-w-[35rem]`, `PORTAL_COLUMN`; `RESERVAR_COLUMN` es su alias) centrada, con 16 px de margen y 16 px de aire arriba, igual en el celular y en escritorio; 48 px de aire al pie. "Volver" arriba, el título 8 px debajo y el primer bloque 24 px después del título. **Ritmo:** 32 px entre bloques (aviso, resumen, pago, ingreso o botón), 12 px bajo cada título de sección y 8 px de las opciones de pago a la regla de cancelación; adentro del ingreso, 24 px entre la casilla, Google, el divisor y el email, 16 px entre campos y 8 px del rótulo al campo. Más aire arriba de un título que abajo.
- **Portal, la vuelta de la reserva (`/reserva/[bookingId]/*`):** la misma columna (`PORTAL_COLUMN`) con 48 px al pie y sin botón fijo. Los resultados (`PortalResult`) se centran en el alto con `min-h-[50dvh]`; el éxito arranca arriba, a 24 px (48 px desde `sm`). **Ritmo:** 16 px del ícono al título, 8 px al texto, 32 px a la salida y 12 px entre botones; en el éxito, 24 px del título al resumen y 32 px entre bloques (resumen, "Avisarle al grupo", secundarias y código).
- **Botón fijo abajo (portal, debajo de `md`):** una barra de 77 px (1 px de borde + 12 + 52 + 12) en `z-30`, apoyada SIEMPRE sobre la barra inferior del jugador (`bottom: 3.5rem + 1px + safe-area`): el área segura la pone la barra inferior, no esta. Su contenedor lleva `data-fixed-cta` y `PortalFrame` suma esos 77 px a su relleno inferior con `has-[[data-fixed-cta]]:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom)+77px)]`: sin JS que mida y sin depender de la sesión, así el último link del pie queda por encima al final del scroll y nada salta al hidratar. Desde `md` el botón vuelve al flujo y el marco a 0 con `md:has-[[data-fixed-cta]]:pb-0` (`:has()` pesa más que `md:pb-0`, por eso el `md:` también lleva el `has`). Con la misma cuenta, `html:has([data-fixed-cta])` lleva `scroll-padding-bottom` en `globals.css` (0 desde `md`), para que el foco tabulado no quede detrás de la barra (WCAG 2.4.11). Si cambia el relleno o el alto del botón, cambian las tres: `ConfirmBookingButton`, `PortalFrame` y `globals.css`.
- **Columnas por contenedor (portal):** las horas y el esqueleto de la reserva eligen sus columnas según el ancho del CONTENEDOR (`@container`), no del viewport, porque la reserva mide 384 px en escritorio y el ancho de la pantalla en el celular: 3 columnas bajo 20,5 rem (328 px, un celular de 360 menos el margen), 4 desde ahí y 6 desde 40 rem (640 px). La constante es `HOUR_COLUMNS` en `HourGrid.tsx` y la comparten grilla y esqueleto. En la columna lateral de escritorio son siempre 4. Los bloques de debajo usan breakpoints de viewport: canchas con foto en 2 columnas y 3 desde `sm`; torneos en 1 y 2 desde `sm`.
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

El portal (La Reserva) no tiene profundidad: superficies planas, sin sombras, sin levante, sin vidrio y sin resplandores, en los dos temas. Las superficies se separan con `portal-border` o con `portal-surface`. Las sombras del portal que siguen en las páginas no migradas son aspecto saliente. La ficha del complejo no usa ninguna: los botones de acción pisan la sombra del primitivo (`shadow-none`), la portada no lleva velo ni degradé y la jerarquía sale del borde de 1 px, del relleno verde de lo elegido y del tipo.

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

### Portal (La Reserva)

Primero en el ingreso del jugador (`PortalAuthFrame`, `IngresarForm`, `AceptarTerminosForm` y la rama de jugador de `VerifyView`) y en el cromo de todo el portal (`PortalHeader`, `SiteFooter`, `PlayerBottomNav`, `AccountMenu`). Las primitivas del panel no se tocan: el portal pasa sus clases por `className` (`PORTAL_BUTTON`, `PORTAL_TITLE`) y tailwind-merge las deja ganar.

- **Marco (`PortalAuthFrame`):** monta `PortalWorld` y pinta `bg-background`. Una columna centrada de 384 px (`max-w-sm`) con margen de 16 px; arriba, el logo horizontal en una franja de 56 px (link a la home con blanco táctil de 44 px); el contenido arranca 24 px abajo (48 px desde 640 px). Sin tarjeta, sin foto de fondo, sin halos ni vidrio. Ícono de estado (32 px) arriba del título cuando la pantalla es un resultado. `PortalWorld` se monta por página: `(auth)` mezcla staff y jugador, y en `/verify` solo lo lleva el público jugador.
- **Botones (`PORTAL_BUTTON`):** planos, de 48 px de alto mínimo a todo el ancho, 16 px en peso 500 y esquina de 12 px. Sin sombra, sin levante al hover y sin achicarse al apretar. Una sola acción verde (`primary`) por pantalla; la alternativa es `outline` (borde `input`) y la terciaria, `ghost`. El rótulo puede ir en dos líneas antes que cortarse.
- **Deshabilitado y pendiente:** sin opacidad. El `outline` deshabilitado (por ejemplo, "Reenviar en 42 s") lleva texto `muted-foreground` y borde `border`; el primario pendiente ("Enviando…") conserva su relleno y su etiqueta a contraste pleno. Nada queda deshabilitado sin decir por qué: la espera se dice en el rótulo.
- **Campos:** 48 px de alto, borde `input` (`portal-input`), fondo `card`, esquina de 12 px; 16 px de texto debajo de 768 px y 14 px desde ahí (The 16px Field Rule). Rótulo visible en 16 px y ayuda debajo en 14 px `muted-foreground`.
- **Casilla:** 24 px, borde de 2 px `input`, esquina de 6 px; marcada, relleno `primary` con tilde `primary-foreground`. La fila entera (48 px) es el blanco táctil.
- **Foco:** anillo de 2 px en `ring` (= `primary`) separado 2 px con el color del fondo (`ring-offset-background`), sin la banda blanca del `ring-offset` por defecto en oscuro. En el cromo el anillo es `ring-primary` y no `ring`, porque el cromo también corre con los tokens del panel, donde `ring` es emerald-500 (2,6:1 sobre blanco) y `primary` da 5,6:1; la separación es el color de la barra (`ring-offset-card dark:ring-offset-background`), porque en claro el `background` del panel es slate y dejaba un aro gris dentro de una barra blanca. Dentro de un panel que recorta (ítems del menú de cuenta, barra inferior, selector de tema) el anillo va inset.
- **Errores:** sobre el campo o la casilla que falló: borde `destructive` (`aria-invalid`) y el mensaje pegado debajo en 14 px `destructive` con `role="alert"`. El formulario no se deshabilita para evitar el error; se deja tocar y se marca.
- **Avisos:** `bg-muted` con borde `border`, esquina de 12 px e ícono con su tono; texto en `foreground` y `muted-foreground`.
- **Links:** `text-emerald-700 dark:text-emerald-400`, siempre subrayados, con 44 px de blanco táctil aunque vayan en línea. El foco de un link del portal es `PORTAL_LINK` (`PortalAuthFrame.tsx`): el anillo del mundo (2 px en `ring`, separado 2 px con el color del fondo, esquina `sm`) en lugar del contorno del navegador; solo el foco: el color y el blanco táctil los pone cada link. `/ingresar` conserva el suyo (decisión del 2.1). La excepción es la acción de la barra ("Ingresar", "Ir a mi panel"), que es navegación y se subraya solo al hover.
- **Barra (`PortalHeader`, sin variantes desde el 2.5):** a todo el ancho, 56 px de alto, pegada arriba (`z-50`), borde inferior de 1 px `border` y fondo `bg-card dark:bg-background`: en claro `card` es blanco con los dos juegos de tokens (no deja una franja slate sobre las páginas sin migrar) y en oscuro `background` es el color de la página con los dos. Sin pastilla, vidrio, desenfoque, sombra ni esquinas. El contenido va en `max-w-7xl` con 16/24/32 px de margen (`px-4 sm:px-6 lg:px-8`). A la izquierda, el logo horizontal (18 px debajo de `sm` y 24 px desde ahí, para que a 320 px entre la barra de un complejo) con 44 px de blanco táctil. A la derecha, separados 8 px (16 px desde `sm`): Explorar, "Para complejos" o "Mis reservas" desde `sm`, y la acción o el menú de cuenta. Los destinos van en 14 px semibold `muted-foreground` con ícono de 16 px, 44 px de alto y sin relleno; al hover pasan a `foreground`. Debajo de 375 px Explorar pierde el ícono. La acción ("Ingresar", "Ir a mi panel") es texto verde (`text-emerald-700 dark:text-emerald-400`) de 15 px semibold, de 44×44 px mínimo, sin borde ni relleno y a ras del margen derecho.
- **Menú de cuenta (`AccountMenu`, variante `solid`):** el disparador es una pastilla plana de 44 px (sin anillo, sombra ni fondo en reposo; hover `accent`) con avatar de 32 px (iniciales sobre `muted` en `foreground`), nombre en 14 px medium y chevron de 16 px. Debajo de `sm` quedan solo el avatar y el chevron; el nombre sigue en el `aria-label`. El panel mide 288 px: encabezado plano con avatar de 40 px (iniciales sobre `primary`), nombre en 14 px semibold y email en 13 px `muted-foreground`; divisores de 1 px `border`; ítems planos de 44 px en todos los anchos, en 14 px con ícono de 16 px `muted-foreground`, con hover y foco en fondo `accent` y sin corrimiento. El tema es `ThemeToggle variant="portal"`: rótulo "Tema" en 14 px `muted-foreground` y tres opciones planas de 44 px en 14 px, sin íconos; la elegida lleva borde `primary` y semibold, las otras borde transparente y hover `accent`.
- **"Ingresar" con `next` (`IngresarLink`):** todo "Ingresar" del cromo (barra y pie) lleva a `/ingresar?next=<página actual con su query>`, codificado entero, para que el jugador vuelva adonde estaba; `sanitizeNext` lo valida en el destino. El HTML estático trae solo el pathname y la query se suma al hidratar. Un link nuevo a `/ingresar` desde el portal usa `IngresarLink`, no un `Link` pelado.
- **Pie (`SiteFooter`):** plano, con borde superior de 1 px `border`, el mismo fondo que la barra y 24 px de margen vertical. Logo horizontal en 14 px y "© año · Argentina" en 14 px `muted-foreground`; Explorar, Ingresar, Privacidad y Términos en 14 px `muted-foreground` (hover `foreground`), de 44 px de alto en todos los anchos, y los canales de contacto en cuadrados de 44×44 px. Desde `sm` va en una fila; debajo, el logo arriba y después dos filas, los links juntos y los canales aparte, para que "Términos" no quede huérfano junto a los íconos.
- **Barra inferior (`PlayerBottomNav`, con sesión de jugador, debajo de `md`):** fija abajo (`z-40`), con borde superior de 1 px, el mismo fondo que la barra y el safe-area. Tres ítems a partes iguales de 56 px de alto mínimo: ícono de 20 px y rótulo de 13 px sin cortar. El inactivo va en `muted-foreground` medium; el activo no se dice solo con color: va en `text-emerald-700 dark:text-emerald-400`, semibold y con una marca `primary` de 2×40 px arriba del ícono (más `aria-current`). El cascarón (`PortalFrame`) reserva exactamente ese alto: 56 px + 1 px de borde + safe-area.

#### La ficha del complejo y su reserva (PR 2.3a)

`/[slug]`, en `src/app/(public)/[slug]/(perfil)/` y `components/`. `PortalWorld` se monta en `(perfil)/layout.tsx`, que cubre la página, su `loading.tsx` y el aviso de complejo no disponible, y también en `not-found.tsx`; `torneos/*` queda afuera a propósito y `reservar` monta el suyo en su propio layout (sección siguiente). Todo lo que depende del visitante (qué día es, si está abierto, qué horas quedan) se hidrata en el cliente porque la página es ISR (`revalidate = 300`): hasta entonces se ve el esqueleto, con la misma silueta, y nada salta.

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

#### Confirmar la reserva y el ingreso del jugador (PR 2.3b1 y 2.3b2)

`/[slug]/reservar`, en `src/app/(public)/[slug]/reservar/`. `PortalWorld` se monta en `reservar/layout.tsx`, que cubre la página y su `loading.tsx`. De `.reserva-*` solo queda `.reserva-receipt-card`, que usa el panel (la política de reservas); `ReservaDarkShell` y el resto se fueron con el 2.3c. Todo lo que sigue es plano, sin sombras, en los dos temas. La columna, el ritmo y el botón fijo están en Layout.

- **Arriba:** "Volver" es un link de 44 px en 16 px semibold `emerald` subrayado, con flecha de 16 px, a `/{slug}?date=&hora=` más `&formato=` si había uno; después "Confirmá tu reserva" con `PORTAL_TITLE`.
- **Qué elegiste va en la URL:** `formato` (el filtro de la ficha, solo si no es "Todos") y `pay` (`cash`, `transfer` o `mercadopago`, validado contra lo que acepta el complejo; inválido = el primero que acepta) viajan en la query. Los arma un solo helper (`buildReservarHref` en `src/lib/booking/reserve-url.ts`) para el link de la fila de cancha, el `next` del ingreso (email y Google) y el `backTo` de la action; elegir otra forma de pago lo escribe con `replaceState` (`replaceReserveUrl`, el mismo de la ficha).
- **Resumen (`BookingSummary`):** una sección plana de esquina de 12 px, borde de 1 px sobre `card` y 16 px de relleno. Arriba el complejo (`PORTAL_SECTION_TITLE`) y la dirección con la ciudad en 14 px `muted-foreground`, con pin de 16 px. Debajo, tras un divisor de 1 px con 16 px de aire, tres filas a 12 px con ícono de 20 px `muted-foreground` y 16 px de texto: el día ("Sábado, 14 de marzo"), la hora ("21:00 a 22:00", tabular) y "Cancha 2 · Fútbol 5" ("Fútbol 5" va en un tramo `whitespace-nowrap`: a 320 px no se parte en "Fútbol / 11"). El precio solo si se ve, tras otro divisor: "Precio del turno" (rótulo `muted-foreground`, cifra `foreground`), "Seña a pagar ahora" en semibold y "Resto en el complejo" en 14 px `muted-foreground`, con las cifras tabulares a la derecha. Con `hidePrices` no hay ningún monto en el DOM ni en un `aria-label`, con y sin seña, y el resumen tampoco dice cómo se paga: eso lo dice la sección de pago, que siempre está debajo.
- **Cómo pagás (`PaymentMethodSelector`):** sin seña y con efectivo y transferencia, "Cómo pagás en el complejo" y dos opciones de radio nativo, una debajo de la otra (lado a lado desde `sm`, a 8 px): fila de 48 px o más con esquina de 12 px, borde `input`, fondo `card` y 12×16 px de relleno; el control es un círculo de 24 px con borde de 2 px `input` que al elegirse se rellena de `primary` con tilde `primary-foreground`; la fila elegida lleva borde `primary` y fondo `muted`, y al hover `accent`. Rótulo en 16 px semibold y ayuda en 14 px `muted-foreground`. La fila entera es el blanco táctil. Con un solo método, "Cómo pagás" y una línea ("Pagás en el complejo, en efectivo."). Si el complejo no cargó ninguno, la sección se pinta igual con "Pagás en el complejo.", sin elegir. Con seña, una línea con MercadoPago y, 4 px debajo en 14 px `muted-foreground`, "La cancha es tuya cuando empezás a señar."; con la seña y los precios ocultos, la línea es "Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.", porque el resumen no puede decirlo sin montos. El estado vive en `CheckoutFlow`, un componente de cliente chico con la única copia de `pay`. Mientras la confirmación sola envía (`AutoConfirm`, abajo), los radios quedan `disabled` y la fila pasa a `opacity-60`, `cursor-default` y sin hover (`has-disabled:`): el método que viajó es el definitivo.
- **Regla de cancelación:** una línea de 14 px `muted-foreground` DENTRO de la sección de pago, a 8 px de lo de arriba, con el plazo del complejo (`cancellationHoursBefore`): con seña, "Si cancelás con más de 12 horas de anticipación, el complejo te devuelve la seña. Después, la seña queda en el complejo." (con 0 horas, "antes de que empiece el turno"; la devolución la hace el complejo: TurnoGol no reembolsa por API). Sin seña: "Podés cancelar desde Mis reservas."
- **Confirmar con sesión (`ConfirmBookingButton`):** debajo de `md`, la barra fija de Layout: borde superior de 1 px `border`, fondo `card` en claro y `background` en oscuro (el mismo par que la barra y la barra inferior), 12×16 px de relleno y el botón `PORTAL_BUTTON` de 52 px a todo el ancho. Solo existe para jugadores, que siempre tienen barra inferior, así que no espera a que la sesión se hidrate. Desde `md` es un botón de 52 px en la columna, sin barra. "Confirmar reserva" o "Pagar la seña"; pendiente, "Procesando…" con la pelotita, deshabilitado y a contraste pleno. **Confirmación sola (`AutoConfirm`, PR 2.3b2):** si el jugador vuelve del ingreso con un vínculo válido y el complejo no cobra seña, el form se envía solo, una vez. Dentro del form y antes del botón (en el flujo, nunca en la barra fija) va un `role="status"` de 16 px `muted-foreground` con 12 px abajo (`mb-3`), que sale vacío desde el servidor con su alto reservado (`min-h-6`, 24 px): sin JS no queda un aviso eterno y al montar entra "Confirmando tu reserva…" sin mover nada. El vínculo sale de la URL (`replaceState`) antes de enviar, y volver a montar la pantalla del mismo turno (recarga, Atrás) no reenvía. Mientras envía, el botón muestra su "Procesando…". Si vino un vínculo que no valió (vencido, de otro email o de otro turno) y no hay seña, en el mismo lugar va "Tocá Confirmar reserva para terminar." (16 px `muted-foreground`, `mb-3`). Con seña nunca se envía solo: el jugador vuelve a esta pantalla y toca "Pagar la seña".
- **Sin sesión (`LoginGate`):** "Entrá para reservar" (`PORTAL_SECTION_TITLE`). Primero la declaración del +18: la casilla del portal en una fila de 48 px con el texto en 16 px; debajo, alineado con el texto (36 px de sangría) y fuera del rótulo, "Leer los términos y condiciones" en 14 px semibold, de 44 px de alto, en otra pestaña. Sin seña, a 24 px (el ritmo de la sección, `space-y-6`), la promesa en 16 px `muted-foreground`: "Entrás y la reserva queda confirmada."; con seña no hay línea. Después "Continuar con Google" (`PORTAL_BUTTON_OUTLINE`, logo de Google de 20 px), un divisor "o" (14 px `muted-foreground` entre dos líneas de 1 px `border`) y el bloque de email (Nombre y Email con `PORTAL_INPUT` y rótulo de 16 px, sin Apellido) con "Continuar con mi email" (`primary`): uno debajo del otro y del mismo alto (48 px); el verde, uno solo, en el envío del email (una sola voz, como en `/ingresar`). En el navegador interno de Instagram, Facebook o TikTok el orden se invierte (email, "o", Google) y debajo de Google va, en 14 px `muted-foreground`, "Google puede no abrirse desde este navegador. Con tu email entrás igual.". Nada se deshabilita por la casilla: el error ("Tenés que aceptar los términos.", `TERMS_REQUIRED_MESSAGE`, el mismo texto en el cliente y en el servidor) sale debajo de la casilla, alineado con su texto, la casilla pasa a borde `destructive` (`aria-invalid`) y el foco va ahí. Google ataja la casilla en el cliente, al instante y sin vuelta al servidor, que igual la exige. Los errores de campo van junto a su campo (14 px medium, el rojo de `status-tone`), con foco en el primero inválido y lo tipeado intacto; una respuesta de Google nunca vacía Nombre ni Email. Un corte de red dice lo del botón que falló y va debajo de él: "No pudimos abrir Google. Revisá tu conexión y probá de nuevo." o, en el email, "No pudimos enviar el enlace. Revisá tu conexión e intentá de nuevo.". Pendientes: "Abriendo Google…" y "Enviando…".
- **Enviado (el panel de `LoginGate` más `MagicLinkSent`):** "Revisá tu email" (`PORTAL_SECTION_TITLE`) recibe el foco; 12 px debajo, "Te mandamos un enlace a **{email}**." en 16 px; después, en `muted-foreground`, qué pasa al tocar el enlace (16 px; sin seña, "Cuando lo toques, tu reserva queda confirmada."; con seña, "Cuando lo toques, volvés a esta pantalla con tu cuenta y ahí pagás la seña.") y qué revisar si no llegó (14 px). A 24 px, "Reenviar enlace" (`outline`; mientras espera dice "Reenviar en 42 s" con cifras tabulares, texto `muted-foreground` y borde `border`) y, 12 px debajo, "Usar otro email" (`ghost`). `src/components/world/MagicLinkSent.tsx` tiene lo compartido con `/ingresar`: el reenvío con su espera de 60 s contra el reloj, la red caída, la pestaña vieja tras un deploy y el tono de los errores (`MAIL_ERROR_CLASS`); cada pantalla pone su formulario y su texto de "enviado".
- **Vuelta del ingreso (PR 2.3b2):** con `next` en `/[slug]/reservar`, el callback y `/aceptar-terminos` llevan directo a esa pantalla, sin pasar por `/verify` ni su cuenta regresiva. La intención viaja firmada (`src/shared/security/booking-intent.ts`): en el enlace del mail vale 60 min, atada al `otp_expiry` de 3600 s de `supabase/config.toml` para que "queda confirmada" dure lo que dura el enlace; por Google, una cookie HttpOnly de 10 min en el mismo navegador. Solo cuenta con sesión de jugador y para el mismo turno; si no vale, la pantalla es la normal, con el botón.
- **Avisos (`CheckoutErrorBanner`):** un `Notice` arriba del resumen, con la receta de aviso del portal (`bg-muted`, borde `border`, esquina de 12 px, 16 px de relleno) y `role="alert"`: ícono de alerta de 20 px en el rojo de `status-tone` (red-700; red-300 en oscuro), el texto en 16 px `foreground` y una salida en link de 14 px semibold y 44 px. Todo lo que avisa acá frena la reserva, así que es un error y no una advertencia: el ámbar es de "Queda 1" y de nada más. "Elegir otro turno" lleva a la misma ficha que el "Volver", con el día, la hora y el formato elegidos (a esa hora puede haber otra cancha libre). El baneo ofrece "Buscar otro complejo" (otro turno del mismo complejo daría el mismo error) y dice "No podés reservar en este complejo hasta el 28 mar." o, sin fecha, "No podés reservar en este complejo."; el motivo, si lo hay, va después como "Motivo: …". El bloqueo es del complejo, no de TurnoGol.
- **Estados inválidos (`CheckoutInvalidState`):** "Este complejo no toma reservas online por ahora", "No pudimos abrir este turno", "No encontramos ese turno", "Ese turno ya no está disponible" y "Ese turno se ocupó mientras entrabas" (`taken-on-return`, PR 2.3b2) son pantallas de la misma columna, centradas en el alto (`min-h-[50dvh]`): ícono de alerta de 32 px en `muted-foreground` (no ámbar), título con `PORTAL_TITLE` y `text-balance` 16 px abajo, una línea de 16 px `muted-foreground` que dice qué pasó y, 32 px abajo, el botón verde de salida. "No encontramos ese turno" y "Ese turno ya no está disponible" vuelven a la ficha con lo elegido; los dos primeros, a la ficha sin nada. `taken-on-return` no lleva línea (el título lo dice) y su salida, "Ver otras horas del sábado 14 de marzo" (`formatDayHeader`), va a la ficha de ese día con el formato y sin la hora; sale cuando el jugador volvió con un vínculo válido y el turno ya no está libre, o cuando la action rebota con `error=taken_on_return`. Si el turno ocupado es una reserva viva del mismo jugador (Atrás, recarga, doble envío), no hay estado inválido: va a `/reserva/{id}/exito` o `/pendiente`, reemplazando la entrada del historial.
- **Carga (`loading.tsx`):** la silueta de la pantalla (Volver, título, resumen con su borde, pago y el botón de 52 px), plana, con la misma columna y el mismo ritmo que la página (32 px entre bloques, 12 bajo el título, 8 hasta la regla de cancelación y 48 al pie): al llegar los datos nada se estira. El botón va en el flujo aunque en el celular con sesión sea una barra fija.
- **Deuda conocida:** debajo de `md`, con sesión y mientras la sesión no se hidrata, la barra fija flota a la altura de una barra inferior que todavía no se pintó.

#### La vuelta de la reserva (PR 2.3c)

`/reserva/[bookingId]/{exito,pendiente,error}`, en `src/app/reserva/`. `PortalWorld` se monta en `reserva/layout.tsx` (dentro de `PortalShell`), que cubre las tres páginas, sus `loading.tsx` y `reserva/error.tsx`. La misma columna de 560 px que confirmar (`PORTAL_COLUMN`, 48 px al pie), plana, sin tarjeta alrededor, sin resplandores ni animación de entrada, en los dos temas. Sin sesión, las tres mandan a `/ingresar?next=/reserva/{id}/{vista}` (`buildIngresarForReservaHref`: MercadoPago puede devolver al jugador en otro navegador, sin la cookie) y el ingreso lo devuelve a donde iba. Una reserva que no existe, purgada o de otra cuenta (RLS) es `ReservaNotFound`.

- **Resultado (`PortalResult`, `src/components/world/PortalResult.tsx`):** la forma común de pendiente, error, el error de carga y "No encontramos tu reserva" (ícono `SearchX`, gris: no es una falla; salida "Ver mis reservas"). Centrada en el alto (`min-h-[50dvh]`, `aria-live="polite"`: un cambio de estado se anuncia sin mover el foco): ícono de 32 px, el título (`PORTAL_TITLE`, `text-balance`) 16 px debajo, qué pasó en uno o dos párrafos de 16 px `muted-foreground` a 8 px (8 px entre párrafos; una nota secundaria va en 14 px) y, 32 px más abajo, la salida: botones de 48 px a todo el ancho, uno debajo del otro a 12 px (`PortalResultLink`: el primario es `PORTAL_BUTTON` verde, el otro `PORTAL_BUTTON_OUTLINE`). Una sola salida verde por pantalla. **Color del ícono** (`TONE_TEXT` de `status-tone.ts`; solo el ícono lleva tono): rojo (`destructive`, red-700 / red-300) solo cuando algo falló (el pago no se procesó, no pudimos verificarlo, no cargó la pantalla); gris (`neutral`, `muted-foreground`) para lo que no es una falla (cancelada, expirada, ya pasó, "Se acabó el tiempo", no la encontramos); verde (`success`, emerald-800 / emerald-300) para confirmada. **Excepción:** en `/error`, fuera del hold o con la reserva expirada, el ícono es rojo: ahí el pago falló. Nunca ámbar: es de "Queda 1". Esperando, el ícono gira (`Loader2` con `animate-spin`, plano; la pelotita es del botón) y con reduce-motion queda quieto.
- **Éxito (`BookingSuccessCard`):** no va centrada en el alto: arranca a 24 px de la barra (48 px desde `sm`). Ícono `CheckCircle2` de 32 px verde, "¡Reserva confirmada!" (`PORTAL_TITLE`) 16 px debajo y, a 24 px, el resumen de confirmar (`BookingSummary`: complejo, dirección, día, hora, "Cancha 2 · Fútbol 5"). Con precios visibles muestra "Precio del turno" y, con seña, "Seña pagada" (en lugar de "Seña a pagar ahora") y "Resto en el complejo". Una fila más, con ícono `Wallet`, dice cómo se paga cuando los montos no lo dicen: "Pagás en el complejo" sin seña (con o sin precios) y "Seña pagada, el resto en el complejo" con seña y precios ocultos. **Una sola acción principal, a 32 px: "Avisarle al grupo"**, el botón verde de 48 px con ícono `MessageCircle` de 20 px a 8 px del texto (`<a href="https://wa.me/?text=…" target="_blank">`, sin número ni `window.open`: WhatsApp pide a quién mandarlo), con una línea de 14 px `muted-foreground` 8 px debajo, unida por `aria-describedby`: "Se abre WhatsApp con el turno escrito, para que lo mandes a tu grupo." El mensaje lo arma `src/lib/booking/group-share.ts` (día, hora, cancha con su formato, complejo con su dirección y, en la última línea para la vista previa, el link a su ficha, sacado del origen de la app) y **nunca lleva montos**, ni con los precios a la vista. A 32 px, las secundarias (Fila de acción secundaria, abajo) y, 32 px más abajo, tras un divisor de 1 px `border` con 24 px de aire, lo terciario: "Código de reserva" en 14 px `muted-foreground`, el código en `font-mono` de 20 px semibold con `tracking-widest`, una línea de 14 px que dice para qué sirve y "Descargar comprobante" (`DownloadReceiptButton`): un link de 14 px semibold `emerald-700` (`emerald-400` en oscuro) subrayado, de 44 px de alto, con ícono `FileDown` de 16 px y el foco de `PORTAL_LINK`; llama a `window.print()`, que solo imprime `#booking-receipt` (`BookingReceipt`, sin montos con los precios ocultos). No hay "Seguir explorando", ni mapa, ni QR.
- **Fila de acción secundaria (`BookingSuccessExtras`):** una lista plana dentro de un contenedor de esquina de 12 px, borde de 1 px `border`, fondo `card` y divisores de 1 px, que recorta el contenido. Cada fila es de 48 px o más, 12×16 px de relleno, ícono propio de 20 px `muted-foreground` a 12 px del texto y el rótulo en 16 px semibold `foreground`; al hover `accent`; el foco es un anillo de 2 px `ring` hacia adentro (`ring-inset`), porque el contenedor recorta. Las tres de hoy: "Cómo llegar" (`Navigation`, una búsqueda de Google Maps en otra pestaña, solo si hay coordenadas o dirección), "Agregar al calendario" (`CalendarPlus`, un `.ics` armado en el navegador) y "Ver mis reservas" (`Ticket`). Ninguna es verde ni compite con la principal.
- **Pendiente (`PaymentStatusWatcher` / `PaymentStatusView`):** "Confirmando tu pago…" con "Esto puede tardar unos segundos." y, pasados 30 s, una nota en 14 px: "¿Tarda? Si se confirma, te llega un email. También lo ves en Mis reservas." (no promete). **Sin cuenta regresiva**: quien llega ya pasó por MercadoPago, y un reloj que corre solo mete ansiedad; el corte por tiempo sigue andando por dentro (vencido el hold, más 5 s) y el polling (cada 3 s, con backoff hasta 30 s) se corta a los 5 fallos seguidos. Una reserva ya confirmada redirige desde el servidor a `/exito` (`RedirectType.replace`); si se confirma mientras espera, navega con `router.replace` (`router.refresh()` si ya estaba en `/exito`, que monta el mismo watcher cuando la reserva todavía no está confirmada). Los estados terminales dicen qué pasó y qué hacer: "La reserva expiró" (`XCircle`) con "Reservar de nuevo"; "Reserva cancelada" (`XCircle`) con "Ver mis reservas" y "Reservar de nuevo" en `outline`; "Esta reserva ya pasó" (`CalendarCheck`) con "Ver mis reservas"; y los dos cortes de la espera, con "Ver mis reservas" como salida: "Se acabó el tiempo" (`Clock`, gris) y, en rojo, "No pudimos verificar tu pago" (`AlertTriangle`). **Esos dos textos no prometen nada**: si el pago se aprueba pasado el hold la reserva no se confirma sola, no sale el mail de confirmación y TurnoGol no reembolsa, así que dicen dónde mirar ("En Mis reservas ves si el turno quedó confirmado.") y a quién escribir ("Si pagaste y no aparece, escribile al complejo."). "Reservar de nuevo" va siempre a la ficha del complejo en el día de la reserva (`buildReserveAgainHref`: `/{slug}?date=`; sin complejo, `/explorar`), nunca a la home.
- **Error (`BookingErrorCard`, vistas `retry` / `released` / `canceled` / `past`, elegidas por `errorViewFor`):** `retry`, con más de 90 s de hold por delante (`holdAllowsRetry`; con menos, la preferencia nueva se come el margen del webhook): "El pago no se procesó" (rojo), "El pago fue rechazado o cancelado." y "Tu turno sigue guardado por poco tiempo. Podés intentar de nuevo con otro medio de pago." (sin cuenta regresiva), y el turno guardado en 16 px medium `foreground`, en dos renglones (cuándo: "Lunes, 17 de junio · 20:00 a 21:00", con la hora sin partir; dónde: "Cancha 2"); la salida es "Reintentar pago" (`SubmitButton` con `PORTAL_BUTTON`, pendiente "Reintentando…"). `released`, con el hold vencido o a punto de vencer, o con la reserva expirada: el mismo título rojo, "El pago no se completó a tiempo y el turno ya no está guardado." (no "se liberó": la fila puede seguir ocupando la cancha hasta que la barra el worker) y "Elegí un horario de nuevo.", con "Reservar de nuevo". `canceled` (`XCircle`, gris) con "Ver mis reservas" y "Reservar de nuevo" en `outline`; `past` (`CalendarCheck`, gris) con "Ver mis reservas". Una reserva confirmada redirige a `/exito` (`RedirectType.replace`). Ningún texto le echa la culpa al jugador. **Los títulos van sin punto final**, todos igual (el "…" de lo que está en curso sí va).
- **Error de carga (`reserva/error.tsx`):** `PortalResult` rojo (`AlertTriangle`), "No pudimos cargar esta página" y "Fue un error de esta pantalla. Mirá en Mis reservas cómo quedó tu reserva.": no promete nada sobre el pago. Con `digest`, "Código de referencia" en 14 px con el código en `font-mono` tabular. Salidas: "Reintentar" (verde, `reset`) y "Ver mis reservas" en `outline`. Reporta a Sentry.
- **Carga (`loading.tsx`):** la silueta de cada pantalla en la misma columna y con el mismo ritmo, plana: éxito (ícono redondo de 32 px, título de 36 px, el resumen con su borde, el botón de 48 px y un bloque de 148 px por la lista de tres filas); pendiente y error, `PortalResultSkeleton` (ícono, título y dos líneas, centrados en el mismo alto que `PortalResult`).
- **Se borró con el 2.3c:** `ReservaDarkShell` (la losa nocturna de la vuelta), `.reserva-shell`, `.reserva-glow-top` / `.reserva-glow-bottom`, `.reserva-success-badge` (el resplandor esmeralda con el pulso de 600 ms), `BookingMiniMap`, `ExpiryCountdown` y `format-remaining.ts`. No vuelven: la vuelta no lleva mapa, ni cuenta regresiva, ni resplandor. De `.reserva-*` queda solo `.reserva-receipt-card`, que es del panel.

#### Mis reservas (PR 2.4a)

`/mis-reservas`, en `src/app/(player)/mis-reservas/`. `PortalWorld` se monta en `(player)/layout.tsx` (desde el 2.4b; en el 2.4a estaba en `mis-reservas/layout.tsx`, que se sacó) y cubre la page, su `loading.tsx` y su `error.tsx`; los diálogos de Radix, que montan en `<body>`, los alcanza el `html:has()`. La misma columna que el resto (`PORTAL_COLUMN`, 24 px arriba y 48 al pie), el título `PORTAL_TITLE` "Mis reservas" y, si hay turnos por jugar, una línea de 16 px `muted-foreground` tabular ("Tenés 2 turnos por jugar."). Plano, en los dos temas.

- **Pestañas (Próximos / Historial):** un `<nav aria-label="Tus reservas">` de dos links a partes iguales (no `tablist`: son navegación con `aria-current="page"`), 44 px de alto, 16 px, con un borde inferior de 2 px: `primary` y semibold la activa, transparente y `muted-foreground` la otra (hover `foreground`), sobre un filete de 1 px `border`. Foco: anillo de 2 px `ring` hacia adentro.
- **Tarjeta compacta (`BookingCard`):** `<li>` de esquina de 12 px, borde `border`, fondo `card`, 16 px de relleno, 12 px entre tarjetas. Arriba, a la izquierda, el día ("Hoy", "Mañana" o "vie 13 mar") en 14 px medium `muted-foreground` y, debajo, el rango "18:00 a 19:00" en 18 px semibold tabular; a la derecha, el chip "Turno fijo" (neutro, 13 px) si corresponde y el `StatusBadge` (13 px, sin cortar). Después, la cancha con su formato en 16 px medium ("Cancha 2 · Fútbol 5") y el complejo en 14 px `muted-foreground`.
- **Tarjeta destacada (la próxima):** la primera confirmada que todavía no terminó, solo en Próximos y en la página 1 (un turno de hoy ya jugado no lo es). Mismo molde, con la hora en 24 px y, bajo el complejo, la dirección en 14 px `muted-foreground`. Es la única que lleva "Avisarle al grupo" (botón verde de 44 px, `MessageCircle`, el `wa.me` sin montos de `group-share.ts`) y "Cómo llegar" (`outline`, `Navigation`, `buildDirectionsHref` de `src/lib/booking/directions.ts`: búsqueda de Google Maps con coordenadas o, sin ellas, la dirección; `null` sin ninguna de las dos y entonces el botón no se dibuja). Una sola verde por pantalla: las demás tarjetas no repiten esas acciones.
- **Vínculo extendido:** solo las confirmadas se abren (a `/reserva/{id}/exito`). El link vive en el título (día y hora) y su `::after` cubre la tarjeta entera; el foco es un anillo de 2 px `ring` sobre la tarjeta y el hover pinta `accent`. Lo interactivo de abajo (devolución, acciones) va en `relative z-10`, por encima del `::after`, así nunca hay un botón dentro de un `<a>`. "Esperando seña" no se abre (queda pendiente de producto adónde llevaría).
- **Línea de seña y pago (`payNote`):** 14 px `muted-foreground` tabular. Confirmada: "Señada, $ 15.000" (`deposit_status` `paid` o `captured`) o "Pagás en el complejo"; y "Turno $ 50.000" mientras el turno cuenta como plata a la vista (confirmada, esperando seña, jugada, ausente) y el complejo no oculta sus precios. Partes separadas por " · ", cada una sin cortarse. Con precios ocultos queda solo la seña propia. Debajo, en el mismo bloque, una nota de qué pasó (`statusNote`) para los estados que no se explican solos: "Falta pagar la seña. Si no se paga a tiempo, el turno se libera.", "No se pagó la seña a tiempo, así que el turno se liberó.", la ausencia explicada, "Este turno ya terminó." y, para las canceladas, **quién canceló**: "La cancelaste vos." o "La canceló el complejo." (sin dato en filas viejas, nada). Ninguna nota empieza con "Cancelada": el badge ya lo dice.
- **Tonos del jugador (`status-visual.ts`, sobre la tabla compartida de `slot-visual.ts`):** confirmada en verde (`success`, no el azul del panel); **"Ausente" y "Esperando seña" en neutro**, sin el rojo del panel ni ámbar (el ámbar es de "Queda 1"; la espera de la seña se dice con la nota). La cancelación con seña cobrada se lee "Cancelada (sin reembolso)"; sin seña paga, "Cancelada" a secas. Mismos rótulos de género que el complejo ("Confirmada", "Expirada").
- **Acciones sin borde (`GHOST`):** "Cancelar" (`red-700`/`red-300`), "Dejar reseña" (`emerald-700`/`emerald-400`, ícono `Star`) y **"Reservar de nuevo"** (`foreground`, ícono `RotateCcw`, link a la ficha del complejo en ese día y formato) no llevan borde ni relleno: 44 px de alto, 12 px laterales, 14 px medium, hover `accent`, foco con anillo `ring`, sin levante ni escala. La primera de la fila se corre 12 px a la izquierda (`data-ghost`) para alinearse con el borde de la tarjeta. "Reservar de nuevo" aparece en jugada, canceladas, expirada y ausente. "Cancelar" no aparece si el turno ya terminó. Las tres llevan `aria-describedby` al cuándo y dónde de la tarjeta, así se siguen llamando por su nombre. La fila de acciones va 12 px debajo del contenido, con filete de 1 px `border` y 12 px de relleno.
- **Devolución:** un bloque `muted` de 8 px de esquina con título de 16 px semibold ("Devolución pendiente" / "Devolución confirmada") y `RefundContactPanel`; sus tres canales (WhatsApp, teléfono, email) son botones `outline` iguales de 44 px: borde `input` sobre `card`, sin el verde sólido.
- **Diálogos de cancelar y reseña:** el motivo y el comentario son campos de 16 px (14 px desde `md`), borde `input` sobre `card`, foco con borde `primary` y anillo `ring`; los rótulos y el contador, 14 px; las estrellas, blancos de 44 px y rellenas con `primary` (no ámbar). El diálogo de cancelar dice la fecha como "vie 13 mar" y el rango como "de 18:00 a 19:00". El error del `ConfirmDialog` compartido va en 13 px (ver Dialogs, Sheets and Toasts).
- **Vacío y página inexistente (`EmptyCard`):** tarjeta de 12 px de esquina con título en Archivo 800 de 20 px y un párrafo de 16 px; la salida es el verde del portal ("Explorar complejos" o "Volver al principio" si el link pide una página que ya no existe). El paginador es el compartido (`Pager`), con el total.
- **Carga (`loading.tsx`):** título, línea, pestañas y tres tarjetas en la misma columna. Las alturas son las medidas de las reales y se vuelven a medir si cambia la tarjeta: la próxima, 339 px a 320, 307 hasta unos 470 px y 255 desde ahí; la compacta, 231 px.
- **Error (`mis-reservas/error.tsx`):** `PortalResult` rojo (`AlertTriangle`), "No pudimos cargar tus reservas" y "Fue un error de nuestro lado, ya lo tenemos en la mira."; con `digest`, el código de referencia en 14 px `font-mono` tabular. Salidas: "Reintentar" (verde) y "Explorar complejos" (`outline`). Reporta a Sentry. El `error.tsx` de `(player)` es el de Cuenta y Eliminar la cuenta ("No pudimos cargar tu cuenta").

**The Quiet Ghost Rule.** Las acciones de una tarjeta del portal que no son la principal (Cancelar, Dejar reseña, Reservar de nuevo) van sin borde ni relleno: 44 px de alto, 14 px medium, hover `accent`. Solo la próxima lleva verde ("Avisarle al grupo") y una `outline` ("Cómo llegar"). "Ausente" y "Esperando seña" son neutros: el rojo del panel y el ámbar de "Queda 1" no se prestan.

#### Mi cuenta y Eliminar la cuenta (PR 2.4b)

`/configuracion`, en `src/app/(player)/configuracion/`, es **la** Cuenta del jugador, en una sola página (antes eran Configuración y Perfil con cuatro pestañas). `/perfil` redirige ahí desde el servidor y sin pedir sesión: `?tab=datos` a `#tus-datos`, `?tab=favoritos` a `#favoritos`, `?tab=actividad` a `#actividad`; `?tab=notificaciones` o sin pestaña, a `/configuracion` (sin sesión, el guard de `/configuracion` manda a `/ingresar` y el ancla se pierde). Los bloques con ancla llevan `scroll-mt-20` para no quedar bajo la barra. El mundo viene de `(player)/layout.tsx`. La misma columna (`PORTAL_COLUMN`, 24 px arriba y 48 al pie), h1 `PORTAL_TITLE` "Mi cuenta", "Quién sos" 16 px debajo y seis bloques más, cada uno con su `h2` (`PORTAL_SECTION_TITLE`, Archivo 800 de 20 px) detrás de un filete de 1 px `border` con 32 px de aire a cada lado. Sin banda hero ni avatar (la receta `.hero-avatar-fallback` se borró de `globals.css`), sin tarjetas, sin sombra ni levante, sin itálica negra.

- **Quién sos:** nombre completo (18 px semibold), el email (16 px `muted-foreground`, `break-all`: un email largo se corta en cualquier carácter) y "El email no se puede cambiar." (14 px). El `h2` es solo para lectores de pantalla.
- **Tus datos (`#tus-datos`):** nombre (obligatorio) y apellido, con "(opcional)" en el rótulo en `muted-foreground` (lado a lado desde `sm`), teléfono (`PhoneInput`, con el código de país en 14 px) y zona preferida. Rótulos de 16 px. Campos de 44 px (también desde `md`), con el molde de `Input` (16 px en el celular, borde `input`) y el placeholder en `muted-foreground` pleno. El form va con `noValidate`: todo error pasa por el mensaje de Zod. Los errores van **pegados a su campo** (13 px `red-700`/`red-300`, `role="alert"`; nombre, apellido y zona además marcan el campo con `aria-invalid` y `aria-describedby`); uno que no es de un campo va una vez debajo del botón. "Guardar cambios" es la **única acción verde** de la página (44 px, plana, a todo el ancho debajo de `sm`; pendiente dice "Guardando…" sin desvanecerse) y al lado, en una región `role="status"` siempre montada, "Guardado" (14 px medium, `emerald-700`/`emerald-400`) que desaparece al volver a editar. Al fallar no se pisa lo escrito (la action se llama desde `onSubmit` dentro de `startTransition`, no con `<form action>`, porque React 19 resetea los campos no controlados al terminar una action). Debajo del form, una línea de 14 px `muted-foreground`: "Te mandamos siempre un mail cuando se confirma o se cancela una reserva, cuando cambia el horario y cuando se vence la seña." No hay interruptores de avisos: no gobernaban ningún envío; las columnas `notify_email` y `notify_push` siguen en la base.
- **Favoritos (`#favoritos`):** una lista entre dos filetes con divisores de 1 px `border`; cada fila es un link a `/{slug}` de 56 px de alto mínimo (nombre 16 px medium, localidad 14 px `muted-foreground`) y "Quitar" a la derecha, sin borde (44 px, 14 px medium, hover `accent`: la receta de The Quiet Ghost Rule), con `aria-label` "Quitar {nombre} de favoritos". Al quitar, la fila desaparece al instante, una región `role="status"` dice "Quitaste {nombre} de tus favoritos." y el foco vuelve al `h2` (`tabIndex={-1}`); el error va en 13 px `red-700`/`red-300`. Sin precios ni fotos ni `TenantCard`. Vacío: "Todavía no guardaste ningún complejo. Tocá el corazón en la página de un complejo para tenerlo acá." y "Explorar complejos" (`outline`, 44 px).
- **Tu actividad (`#actividad`):** una lista de definición entre dos filetes, tres renglones de 44 px (Partidos jugados, Complejos visitados, Racha "N semanas"): el rótulo en 16 px `muted-foreground` y el valor en 16 px semibold tabular a la derecha. Neutro: sin íconos de color, sin puntajes ni rankings. Con cero partidos, los renglones siguen y debajo van "Cuando juegues tu primer partido, lo vas a ver acá." y "Reservar una cancha" (`outline`, a `/explorar`).
- **Tema y sesión:** `ThemeToggle` en su variante `portal` (Sistema, Claro, Oscuro) y "Salir" (`outline` con `LogOut` de 16 px, 44 px, a todo el ancho debajo de `sm`; `signOutAction`).
- **Tus datos personales:** "Bajá una copia de lo que guardamos de vos en TurnoGol: tu perfil, tus reservas y tus pagos.", "Descargar mis datos" (`outline`, 44 px, a todo el ancho debajo de `sm`) y, al final, en 14 px, "Es tu derecho de acceso, según la Ley 25.326." Pendiente, el botón dice "Generando…" con el texto en `muted-foreground` y sin desvanecerse; una región `role="status"` siempre montada anuncia "Estamos armando tu archivo." y "Listo, se descargó {archivo}."; el error va en 13 px `red-700`/`red-300`. El formato del JSON no cambió.
- **Darte de baja:** "Si ya no vas a usar TurnoGol, podés borrar tu cuenta." y un link sobrio "Eliminar la cuenta" (16 px medium `foreground`, subrayado, 44 px) a `/eliminar-cuenta`. Sin tarjeta roja.
- **Carga (`loading.tsx`):** cubre los siete bloques (título, quién sos y los seis con filete) con las alturas medidas del real; la story `AlturaDelEsqueleto` lo compara con `ConfiguracionView` y se vuelve a medir si cambia un bloque.
- **Error (`(player)/error.tsx`):** el de Cuenta y Eliminar la cuenta. `PortalResult` rojo (`AlertTriangle`), "No pudimos cargar tu cuenta" y "Fue un error de nuestro lado, ya lo tenemos en la mira. Probá de nuevo en un toque."; con `digest`, el código de referencia en 14 px `font-mono` tabular. Salidas: "Reintentar" (verde, `PORTAL_BUTTON`) y "Mis reservas" (`outline`). Sin `<main>` propio: lo pone el cascarón. Reporta a Sentry.

**Eliminar la cuenta (`/eliminar-cuenta`).** Misma columna. Arriba, el link "Volver a Mi cuenta" (16 px medium `foreground`, subrayado, 44 px). h1 "Eliminar mi cuenta" y "Esta acción es irreversible: una vez eliminada, no podemos recuperar tu cuenta." (16 px `foreground`). Después, secciones con `h2` y 32 px entre ellas, sin filetes. "Qué se borra y qué queda": dos viñetas en 16 px `muted-foreground` con el verbo en `foreground` ("Borramos tu nombre, tu email, tu teléfono y tu vínculo con los complejos." / "Quedan tus reservas y tus pagos, en el registro de cada complejo, sin tu nombre.") y, al pie de esa sección, en 14 px, "Lo hacemos según la Ley 25.326 (derecho de supresión)." (la única vez que la página nombra la ley). Si hay reservas confirmadas por jugar, "Tenés 1 reserva confirmada por jugar" / "Tenés 3 reservas confirmadas por jugar" (la concordancia va con el número), por qué conviene cancelarlas antes y el link subrayado "Ver mis reservas". Después, "¿Querés una copia de tus datos?" con el mismo `DataExportButton` de Mi cuenta. **Un solo color de alarma:** el botón "Eliminar mi cuenta" (`destructive`, 44 px, plano, del ancho de su texto), detrás de un filete con 40 px arriba y 32 abajo; sin tarjetas roja, naranja ni ámbar. Su `loading.tsx` dibuja título, línea, un `h2`, la explicación y el botón.

**Confirmar con el email (`ConfirmDialog` con `phraseMatch="email"`).** El diálogo "¿Eliminar tu cuenta TurnoGol?" pide escribir el email. El modo `email` compara sin distinguir mayúsculas y sin los espacios de los bordes, y arma el campo para tipear un email (`inputMode="email"`, `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`). Además: el rótulo "Escribí {email} para confirmar" va en 14 px (no en 12) y el email, en `font-mono` semibold con `break-all`, se corta en cualquier carácter para no desbordar a 320 px; mientras no coincide, una línea de ayuda de 14 px `muted-foreground` ("El botón se activa cuando escribís el email completo.") enlazada al campo con `aria-describedby`; el confirmar deshabilitado **no se desvanece** (`disabled:opacity-100`, cursor `not-allowed`, sin cambio al hover) porque el 50 % medía menos de 4,5:1; y debajo de `sm` el pie se apila con los dos botones a todo el ancho, el rojo arriba y "No, volver" abajo. Sin `phraseMatch`, `ConfirmDialog` sigue igual que antes (comparación exacta, rótulo de 12 px, deshabilitado al 50 %, pie en fila): es el del panel.

#### La home (PR 2.5)

`/`, en `src/app/page.tsx` y `src/app/home/`. La página vive en la raíz de `app/`, fuera de `(public)`, así que monta ella misma `PortalWorld` y `PortalShell` (la barra, el pie, la barra inferior del jugador con sesión y el único `<main id="main-content">`). Es ISR (`revalidate = 300`): lo que depende del visitante (su ubicación, los turnos de hoy) se hidrata en el cliente (`NearbyProvider`) detrás de esqueletos del mismo alto. Plana en los dos temas: sin resplandor, foto de fondo, vidrio ni texto con gradiente.

- **Titular (`HeroHeadline`):** h1 fijo "Tu partido empieza en TurnoGol" en Archivo 800 recta, -0.01em y `text-balance`: 32/36 px, 40/44 px desde `sm` y 44/48 px desde `lg`. Debajo, a 12 px, el subtítulo en 16 px `muted-foreground` con tope de 34 rem. Sin acento de color: la distancia la dice la tarjeta de al lado.
- **Buscador (`HeroSearch`):** un `<form>` "Buscar canchas de fútbol" con Zona (combobox), Día y Hora (menús) y "Buscar canchas". En el celular va sin tarjeta, sobre el fondo; desde `lg`, en una tarjeta de 12 px de esquina, borde `border`, fondo `card` y 24 px de relleno. Los campos miden 48 px, con borde `input`, fondo `card`, esquina de 12 px, ícono de 20 px a la izquierda y chevron de 20 px a la derecha, los dos en `muted-foreground`; el foco pone el borde en `primary` y el anillo `ring`. El rótulo es un `<label>` real en 16 px medium, 6 px arriba del campo, y hay 16 px entre renglones. Día y Hora van en dos columnas desde 375 px, para que el primer horario de "Libre hoy" quede arriba del pliegue. El botón es `PORTAL_BUTTON` (48 px, a todo el ancho): la única acción verde de la página.
- **Canchas cerca (`NearbyPanel`):** la más cercana en una tarjeta y las dos que siguen en filas, a 12 px entre sí; todas con esquina de 12 px, borde `border` y fondo `card`. El nombre es un vínculo extendido a `/{slug}` (`::after` sobre la tarjeta y lo tocable de adentro en `z-10`, el mismo patrón que Mis reservas). Qué canchas entran y en qué orden lo decide `nearby.ts`, no el diseño.
  - **Tarjeta principal:** 12 px de relleno (16 px desde `sm`) y portada 3:1 de 12 px de esquina; sin foto, `muted` con las dos primeras letras del nombre en Archivo 800 de 24 px `muted-foreground`. El nombre va con `PORTAL_SECTION_TITLE` (20 px). Debajo, en 14 px `muted-foreground`: pin de 16 px, localidad, la distancia en `foreground` medium y los formatos, separados con "·". "Turno desde $ X" (14 px, el monto semibold tabular con `formatArs`) aparece solo si el complejo muestra precios: con `hide_public_prices` no hay `$`en el DOM ni en un`aria-label`. Después, "Libre hoy" en 14 px semibold y, 8 px abajo, los horarios.
  - **Horario de hoy:** link de reserva de 44 px de alto y 72 px de ancho mínimo, esquina de 12 px, borde `input`, fondo `card`, 16 px semibold tabular, hover `accent` y foco `PORTAL_LINK`, con `aria-label` "Reservar hoy a las 20:00". No es verde: el verde es de la búsqueda.
  - **Fila:** 12 px de relleno, miniatura de 72×64 px con esquina de 12 px, nombre en 16 px semibold con `line-clamp-2` y distancia en 14 px `muted-foreground` con pin; a la derecha, el próximo horario libre con la misma receta, o "Sin turnos hoy" en 14 px `muted-foreground`.
  - **Más canchas:** con más de tres en la zona, "Ver las N canchas cerca tuyo" ("Ver todas las canchas cerca tuyo" desde 30), link de texto de 16 px semibold con flecha, centrado, a `/explorar` ordenado por distancia.
- **Estados de "cerca tuyo" (`FallbackCard`):** una tarjeta de 12 px de esquina, borde `border`, fondo `card` y 16 px de relleno (24 px desde `sm`), con `aria-live="polite"`: título con `PORTAL_SECTION_TITLE` que dice la causa, un párrafo de 16 px `muted-foreground` y una salida.
  - **Buscando:** arriba, la silueta de la portada 3:1; abajo, cuatro horarios en esqueleto de 44×72 px, así no salta el alto cuando llegan las canchas. La salida es "Usar mi ubicación", `outline` de 48 px (`PORTAL_BUTTON_OUTLINE`, ícono `LocateFixed`), a todo el ancho en el celular y a su medida desde `sm`.
  - **Sin permiso, sin soporte, con error y nada a 40 km:** chips de zona con las seis localidades que más canchas tienen. Son pastillas de 44 px (`rounded-full`), con borde `input` y fondo `card`, en 14 px semibold y el conteo en 400 tabular `muted-foreground`, con hover `accent`, y van a `/explorar?city=…`. Sin localidades queda el link "Ver todas las canchas".
  - **Sin turnos hoy (tarjeta principal):** "Hoy no le quedan turnos libres." en 14 px `muted-foreground` y el link "Ver otros días" a la ficha.
  - **Horarios que no cargaron** (429, 4xx o red): "No pudimos cargar los horarios." en 14 px `muted-foreground`; nunca "no hay turnos". En la tarjeta se suma "Ver el complejo"; en la fila no, porque la fila entera ya lleva a la ficha.
  - **Cargando los horarios:** cuatro horarios en esqueleto en la tarjeta y uno de 44×64 px en la fila.
- **Franja de dueños (`OwnersStrip`):** a todo el ancho, entre el contenido y el pie, con filete superior de 1 px `border`; adentro, `max-w-6xl` con el margen del cromo y 24 px arriba y abajo. Una línea de 16 px `muted-foreground` ("¿Tenés un complejo? Llevá tus reservas y tu grilla en TurnoGol.") y el link "Conocé TurnoGol para complejos" en 16 px semibold con 44 px de blanco táctil; en fila desde `sm`, apilados debajo. Sin foto, gradiente ni tarjeta.
- **Links de texto:** todos subrayados, en verde y con 44 px de blanco táctil ("Ver otros días", "Ver el complejo", más canchas, la franja de dueños). Los horarios y los chips de zona son controles con borde y no se subrayan.

### Chips

- **Alcance:** lo que sigue es del Mostrador. Los chips de la reserva del portal están en Components › La ficha del complejo y su reserva.
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
- **Portal:** la barra, el pie, la barra inferior y el menú de cuenta del jugador están en Components › Portal (La Reserva).
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

- **Entra entera:** a 1280×650 entran 12 canchas sin scroll horizontal (columnas de 4,75rem mínimo desde `lg`, 3rem en el teléfono) y las horas estiran la fila hasta llenar el alto (`minmax(3.5rem, 1fr)`). La mañana sin turnos se pliega en una línea: "09:00–17:00 · Sin turnos · Mostrar". Si igual hay scroll horizontal (teléfono con más de 6 canchas, escritorio angosto), un degradé en el borde derecho y la pastilla "N canchas →" avisan que hay más.
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

`/super-admin`, solo para el dueño de la plataforma. Se rehizo el 2026-10-16, el día en que El Vagón publicó su link de reservas y el panel no mostró ni uno de los 10 jugadores ni de las 9 reservas online. Contesta "¿cómo viene la plataforma hoy y esta semana?" antes que "¿cuánto factura?". Va en el mismo mundo que el panel del complejo (esmeralda sobre slate): el violeta propio se eliminó y "SuperAdmin" en la barra alcanza para saber dónde estás. La navegación tiene tres entradas: Pulso, Complejos y Jugadores.

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
- **Do** construir todo lo nuevo del portal en La Reserva, aunque la página que lo rodea todavía no haya migrado: superficies planas, fondo `background`, bordes de 1 px, botones planos de 48 px y una sola acción verde por pantalla.
- **Do** colgar los tokens del portal de `html:has([data-world='portal'])` (`portal-world.css` + `PortalWorld`), para que alcancen a los portales de Radix en `body` (diálogos, Toaster). Un token del portal nunca se escribe en `:root`, `.dark`, `.dark-surface` ni `src/components/ui/*`.
- **Do** mantener las compuertas del portal en verde: `tests/unit/portal-world-tokens.test.ts` hashea los tokens del panel (cambiarlos a propósito actualiza el hash en el mismo PR) y la story de `PortalWorld` mide 9 tokens en claro y en oscuro.
- **Do** marcar el error en el campo o la casilla que falló, con el mensaje debajo.
- **Do** decir lo elegido en la reserva con relleno verde y tilde (chips de día y de formato, horas): nunca solo color. Es la excepción a The One Voice Rule que fija el brief de la ficha (2026-10-15): lo elegido es un estado, no una acción. Cada estado de una hora se dice con palabra ("N libres", "Queda 1", "Libre", "Señando", "Completo") y lo que no se puede elegir se ve y se explica en vez de desaparecer.
- **Do** resolver las columnas de una pieza que vive en una columna angosta con `@container`, no con un breakpoint de viewport.
- **Do** darle a cada vacío o error del portal su causa, qué hacer y una salida (reintentar, otro día, hablar con el complejo) arriba del pliegue.
- **Do** marcar con `data-fixed-cta` todo botón fijo abajo del portal y sumar su alto real a la cuenta de `PortalFrame` en el mismo PR; nunca medirlo con JS ni colgarlo de la sesión.
- **Do** dejar el estado que depende del reloj del visitante (hoy, abierto o cerrado, qué horas quedan) en una isla de cliente con un esqueleto del mismo alto, y marcar la sección de reserva con `data-state`.
- **Do** montar `PortalWorld` en el layout de la ruta que migra (`(perfil)`, `reservar`, `reserva`, `(player)`) y en su `not-found`, o en la página cuando no tiene layout propio (la home, `src/app/page.tsx`). Solo ahí la regla `html:has([data-world='portal']) .player-shell-bg` de `globals.css` apaga el fondo de cancha de La Previa y pinta `--color-background`; sin el marcador el cascarón conserva su fondo.

### Don't:

- **Don't** reemplazar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas", descartada por el dueño el 2026-09-23).
- **Don't** llamar "deuda" a un turno no cobrado, ni pintar de rojo un turno que todavía se está jugando: el rojo es de lo jugado y no cobrado (principio 3 de `PRODUCT.md`). La urgencia se dice con color y texto; el único movimiento es el punto que late en el botón "Cobrar $X" de Hoy (pedido del dueño, 2026-09-25). El anillo que respiraba alrededor de toda la celda de la Grilla (`.slot-alarm-ring`) se eliminó el 2026-09-24 y no vuelve.
- **Don't** usar emerald-500 o emerald-600 como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600.
- **Don't** escribir hex inline en JSX, ni sombras, degradés o vidrio inline; tampoco `dark:` sueltos para arreglar una primitiva: se arregla el token.
- **Don't** poner `bg-white` como fondo de página, ni `text-black`/`bg-black`. El blanco del portal sale del token (`bg-background` bajo `PortalWorld`), no de la clase.
- **Don't** extender La Previa: nada nuevo del portal con resplandores, vidrio, fotos de fondo, sombras de color, levante al hover, titulares en negra itálica ni disfraz temático.
- **Don't** deshabilitar un botón del portal con opacidad ni dejarlo deshabilitado sin explicación.
- **Don't** delimitar un campo, una casilla o un `outline` del portal con `border-border`: con 1,2:1 no llega a los 3:1 de WCAG 1.4.11.
- **Don't** poner dos acciones verdes en una pantalla del portal. La hora o el chip elegidos son estado y no cuentan; el botón verde de confirmar vive en `reservar` y, en la vuelta de la reserva, el verde es la salida principal ("Avisarle al grupo" en el éxito; las secundarias son filas planas).
- **Don't** mostrar una cuenta regresiva ni prometer una confirmación a quien vuelve de pagar: los cortes de la espera dicen dónde mirar (Mis reservas) y a quién escribir (el complejo). Lo que el jugador comparte (el mensaje al grupo) nunca lleva montos.
- **Don't** usar ámbar en la reserva del portal para otra cosa que "Queda 1": ni "Señando", ni "Libre", ni un aviso, ni la hora elegida.
- **Don't** esconder las horas completas ni los días cerrados: se ven, deshabilitados y dichos ("Completo" tachado, "Cerrado").
- **Don't** usar `CourtCard` en una página del portal: es la tarjeta del panel y del onboarding; la ficha usa `CourtTile`.
- **Don't** elegir las columnas de las horas con `md:grid-cols-*`: la reserva mide 384 px en escritorio y seis columnas no entran.
- **Don't** agregar librerías de animación (la única excepción es `/onboarding`, con `motion` en `LazyMotion`) ni loops infinitos fuera del skeleton, de la web comercial y del punto de "Cobrar $X" en Hoy.
- **Don't** usar el placeholder como rótulo, emojis como íconos estructurales ni fechas ISO o anglicismos de dashboard ("Revenue", "Booking") frente al usuario.
- **Don't** mostrar un número verificable que no salga de datos reales (prueba social, escasez, contadores): lo trucho descubierto destruye la confianza para pagar la seña y es publicidad engañosa (Ley 24.240).
