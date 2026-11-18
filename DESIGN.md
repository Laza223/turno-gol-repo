---
name: TurnoGol
description: El sistema con el que un complejo de fútbol lleva su día (grilla, cobro, cantina y caja) y el portal de vidrio donde el jugador reserva.
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
  portal-bg: '#f3f6f3'
  portal-bg-dark: '#020617'
  portal-ink: '#0b1220'
  portal-ink-dark: '#f8fafc'
  portal-muted: '#2c3848'
  portal-muted-dark: '#d5dce6'
  portal-soft: '#4d5868'
  portal-soft-dark: '#b6c0cf'
  portal-green: '#04775b'
  portal-green-dark: '#34d399'
  portal-btn-a: '#058467'
  portal-btn-a-dark: '#43e0a3'
  portal-btn-b: '#046b52'
  portal-btn-b-dark: '#10b981'
  portal-on-green: '#ffffff'
  portal-on-green-dark: '#022c22'
  portal-slot-bg: '#e4f3ed'
  portal-slot-line: '#a3d3c1'
  portal-slot-ink: '#04674f'
  portal-slot-ink-dark: '#6ee7b7'
  portal-glass: 'rgb(255 255 255 / 0.82)'
  portal-glass-dark: 'rgb(255 255 255 / 0.14)'
  portal-glass-line: 'rgb(255 255 255 / 0.95)'
  portal-glass-line-dark: 'rgb(255 255 255 / 0.17)'
  portal-inner: 'rgb(255 255 255 / 0.74)'
  portal-inner-dark: 'rgb(255 255 255 / 0.07)'
  portal-warn: '#7c4a03'
  portal-warn-dark: '#fcd34d'
  portal-bad: '#a3122d'
  portal-bad-dark: '#fda4af'
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
  portal-title:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '2.5rem'
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: '-0.035em'
  portal-body:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  portal-label:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.5
  portal-hour:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: '20px'
    fontFeature: 'tnum'
  portal-note:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '16px'
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
    backgroundColor: '{colors.portal-btn-a}'
    textColor: '{colors.portal-on-green}'
    typography: '{typography.portal-label}'
    rounded: '{rounded.full}'
    padding: '0 26px'
    height: '52px'
  button-portal-glass:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    typography: '{typography.portal-label}'
    rounded: '{rounded.full}'
    padding: '0 26px'
    height: '52px'
  nav-portal-header:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    rounded: '{rounded.full}'
    height: '60px'
  nav-portal-tabbar:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    rounded: '{rounded.full}'
    height: '66px'
  input-portal:
    backgroundColor: '{colors.portal-inner}'
    textColor: '{colors.portal-ink}'
    typography: '{typography.portal-body}'
    rounded: '18px'
    padding: '0 16px'
    height: '52px'
  hour-slot:
    backgroundColor: '{colors.portal-slot-bg}'
    textColor: '{colors.portal-ink}'
    typography: '{typography.portal-hour}'
    rounded: '20px'
    height: '64px'
  hour-slot-selected:
    backgroundColor: '{colors.portal-btn-a}'
    textColor: '{colors.portal-on-green}'
  hour-slot-last:
    textColor: '{colors.portal-warn}'
  glass-card:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    typography: '{typography.portal-body}'
    rounded: '28px'
    padding: '16px'
  glass-sheet:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    rounded: '32px'
    padding: '10px 20px 20px'
  reserve-bar:
    backgroundColor: '{colors.portal-glass}'
    textColor: '{colors.portal-ink}'
    rounded: '28px'
    padding: '12px'
---

# Design System: TurnoGol

> **El portal es de vidrio (decisión del 2026-11-13).** [`docs/decisions/2026-11-13-portal-vidrio.md`](docs/decisions/2026-11-13-portal-vidrio.md) reemplazó a La Previa (decisión del 2026-10-20) y a La Reserva, y supera el look de [`docs/decisions/2026-11-08-portal-plano-dos-temas.md`](docs/decisions/2026-11-08-portal-plano-dos-temas.md). Para las pantallas del portal mandan, en este orden, esa decisión, la [dirección de diseño y movimiento](docs/planning/2026-11-13-portal-vidrio-direccion.md) y el mockup [`docs/planning/mockups/2026-11-13-portal-vidrio/`](docs/planning/mockups/2026-11-13-portal-vidrio/README.md); este archivo los resume y nombra las piezas reales del código. Para el panel (El Mostrador) manda este archivo, sin cambios.

## Overview

**Creative North Star: "El Mostrador y el Vidrio"**

> **La Previa se reemplazó por el vidrio el 2026-11-13.** Cómo se ejecutó, fase por fase, está en el [plan](docs/planning/2026-11-13-portal-vidrio-plan.md).

TurnoGol es un solo sistema con dos personalidades. Comparten el verde de marca, el logo y las primitivas de `src/components/ui/`; cada una tiene su mundo. **El Mostrador** es el panel del complejo: una herramienta que el encargado usa toda la noche en una notebook con mouse, mientras atiende gente y contesta el WhatsApp. Es denso pero obvio, con los datos primero, un solo verde que grita por vista y movimiento corto. **El Vidrio** es el portal del jugador y la web para complejos: atrás está la cancha iluminada y adelante la app es una lámina de vidrio que responde al dedo (superficies translúcidas con desenfoque, borde claro de 1 px, brillo interior y radios grandes sobre un resplandor verde suave). Calmo, preciso, físico. Cero fricción, tipo ecommerce, sin perder accesibilidad (compromiso de marca de `PRODUCT.md`).

El mundo del panel es césped de noche sobre slate. En claro, tarjetas blancas que flotan con sombras en capas sobre un fondo slate frío; en oscuro, losas slate-950 con superficies de vidrio (relleno blanco al 3 %, desenfoque y un resplandor esmeralda). Los dos temas son de primera, en las dos superficies: ninguna vista se diseña para uno y "después se verá" el otro; arranca el del sistema (`next-themes`, `defaultTheme="system"`). El estado nunca se comunica solo con color: siempre va color, ícono y texto, y lo resuelve una sola tabla de tonos.

Este documento describe el estilo tal como está en el código al 2026-11-16 y es la única autoridad de diseño del repo. El panel se **refina** sobre este estilo; no se reemplaza. Donde los documentos anteriores (hoy en `docs/archive/design-system/`) y el código no coincidían, ganó el código. Rechazo confirmado por el dueño el 2026-09-23: cambiar el mundo del panel por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas"). Ese rechazo es del panel.

**Dónde rige el vidrio.** En todo lo que no es el panel del complejo: la home, `/explorar`, la ficha del complejo `/[slug]`, confirmar `/[slug]/reservar`, la vuelta de la reserva `/reserva/[bookingId]/*`, Mis reservas, Cuenta y Eliminar la cuenta (`(player)`), `/ingresar`, `/aceptar-terminos` y `/verify` (`PortalAuthFrame`), Rival, las páginas para complejos (`/para-complejos`, `/precios`, el blog y los legales, en `(business)`) y las pantallas de error. **Fuera del vidrio:** el panel (`(admin)`), el alta del complejo (`/onboarding` y `/register`, que conserva La Previa siempre oscura) y el super admin. **Una pantalla nueva del portal se construye en vidrio.**

**Key Characteristics:**

- Esmeralda sobre slate, con claro y oscuro como temas de primera.
- Panel: claro = elevación (sombras en capas), oscuro = vidrio (blanco al 3 % + blur + resplandor). Portal: vidrio en los dos temas sobre `.portal-ambient` y, en el hero, una foto (de noche en oscuro, de día en claro). La profundidad del portal es la receta `.glass`, no la del panel.
- Panel: Inter trabaja; Archivo titula, pone las cifras clave y firma el logo. Portal: Archivo en todo, titulares en 700 con `font-stretch: 104%`. Toda cifra es tabular.
- Estado = color + ícono + texto, siempre desde `src/lib/status-tone.ts`.
- Panel denso y movimiento corto (200 ms en los controles). Lo único largo es un pulso de 600 ms, una sola vez: el turno que entra a la grilla. El portal se mueve más (resortes, hojas, transiciones de vista) pero con reglas: Components › Portal de vidrio.
- Un solo primario por vista.
- El portal usa tokens propios `--portal-*` / `--glass-*`, que solo existen con el marcador `data-portal-glass` en la página. El grupo del jugador conserva `data-portal-fields` para subir `--input` y `--ring` a 3:1 en lo que todavía usa los tokens del panel (diálogos y primitivas compartidas).

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
- **Losa nocturna** (`night-slab` #020617): el fondo de las superficies siempre oscuras del panel y del alta: las pantallas del staff en `(auth)` y el alta del complejo. El portal ya no tiene superficies siempre oscuras: sigue el tema del visitante.
- **Superficie siempre oscura** (`.dark-surface`, en `globals.css`): una página del panel o del alta que es oscura aunque el sitio esté en claro envuelve su contenido en esta clase. La clase `.dark` sola no alcanza: Tailwind v4 resuelve los `--color-*` una vez en `:root`, y `text-foreground`, `bg-card` y compañía seguirían saliendo en claro. `.dark-surface` los vuelve a declarar.

### Portal de vidrio

Decisión: [`docs/decisions/2026-11-13-portal-vidrio.md`](docs/decisions/2026-11-13-portal-vidrio.md). Dirección de diseño y movimiento: [`docs/planning/2026-11-13-portal-vidrio-direccion.md`](docs/planning/2026-11-13-portal-vidrio-direccion.md). Mockup: [`docs/planning/mockups/2026-11-13-portal-vidrio/`](docs/planning/mockups/2026-11-13-portal-vidrio/README.md). **La Previa se reemplazó por el vidrio el 2026-11-13** (los dos temas, la foto del hero y la barra flotante vienen de ahí).

**La idea.** Vidrio de noche: atrás está la cancha iluminada y adelante, la app es una lámina de vidrio que responde al dedo. Calmo, preciso, físico.

**Dos temas completos**, oscuro y claro. Por defecto se ve el del sistema (`next-themes`); el botón de tema queda arriba a la derecha. En claro la foto del hero es de día: nunca una foto de noche aclarada.

**Tokens.** Viven en `src/app/globals.css`, bajo `html:has([data-portal-glass])` (claro) y `html.dark:has([data-portal-glass])` (oscuro). Los prefijos son `--portal-*` y `--glass-*` porque `--muted` y `--ease-out` ya existen en shadcn y Tailwind. En Tailwind son `portal-*`. Ningún token del panel cambia. Los más usados:

| Token                                                        | Oscuro                                  | Claro                           | Uso                                          |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------- | -------------------------------------------- |
| `--portal-bg`                                                | `#020617`                               | `#f3f6f3`                       | Fondo de página                              |
| `--portal-ink`                                               | `#f8fafc`                               | `#0b1220`                       | Texto principal                              |
| `--portal-muted`                                             | `#d5dce6`                               | `#2c3848`                       | Texto secundario                             |
| `--portal-soft`                                              | `#b6c0cf`                               | `#4d5868`                       | Texto terciario y borde de campo             |
| `--portal-green`                                             | `#34d399`                               | `#04775b`                       | Marca, acento, foco                          |
| `--portal-btn-a` → `--portal-btn-b`                          | `#43e0a3` → `#10b981`                   | `#058467` → `#046b52`           | Botón principal (degradé vertical)           |
| `--portal-on-green`                                          | `#022c22`                               | `#ffffff`                       | Texto sobre el botón                         |
| `--portal-slot-bg`, `-line`, `-ink`                          | verde al 14 %, verde al 46 %, `#6ee7b7` | `#e4f3ed`, `#a3d3c1`, `#04674f` | Horario libre, etiqueta positiva             |
| `--glass-a` → `--glass-b`                                    | blanco 14 % → 5 %                       | blanco 82 % → 58 %              | Relleno del vidrio                           |
| `--glass-line`, `--glass-hi`                                 | blanco 17 %, 26 %                       | blanco 95 %, 100 %              | Borde y brillo interior                      |
| `--portal-inner`, `--portal-inner-line`                      | blanco 7 %, 11 %                        | blanco 74 %, tinta 9 %          | Piezas dentro de un vidrio                   |
| `--portal-bar-a/b`, `--portal-sheet-a/b`, `--portal-win-a/b` | slate-800 a slate-950 translúcidos      | blanco 72 % a 97 %              | Barra de abajo, hojas y ventana del buscador |
| `--portal-warn`, `--portal-bad`                              | `#fcd34d`, `#fda4af`                    | `#7c4a03`, `#a3122d`            | Aviso ("Queda 1") y error                    |

El resto (velos, sombras, brillo de carga, resplandor del botón) está en el mismo bloque de `globals.css`. Los valores salen del mockup (`glass.css` y `glass-app.css`); no se inventan valores nuevos, se derivan de un token. Los de movimiento (`--dur-*`, `--spring-*`, `--ease-*`) están en Components › Portal de vidrio.

**La receta** (`.glass`, `.glass-painted`; `--tw-shadow` y no `box-shadow` pelado, para que el foco y las sombras de Tailwind se sumen en vez de borrarla):

```css
background: linear-gradient(180deg, var(--glass-a), var(--glass-b));
border: 1px solid var(--glass-line);
box-shadow:
  inset 0 1px 0 var(--glass-hi),
  var(--glass-shadow);
backdrop-filter: blur(26px) saturate(180%);
```

Radios: píldora para botones, chips y barras; 18 a 24 px para piezas internas; 28 a 36 px para tarjetas y hojas.

**Dos niveles de vidrio.** El desenfoque es caro: no todo lo que parece vidrio tiene que desenfocar.

- **Vidrio real** (`.glass`, con `backdrop-filter`): la barra de abajo, la cabecera en píldora, las hojas, la barra de "Reservar", las tarjetas del hero y la cabecera de la ficha. Son piezas con foto o contenido pasando por detrás.
- **Vidrio pintado** (`.glass-painted`, la misma receta sin `backdrop-filter`): todo lo que se repite en una lista (tarjetas de complejo, reservas, partidos, planes, preguntas). Detrás tienen el fondo liso con el resplandor, así que a la vista queda igual.
- **`.glass-pop`** no es un nivel: es la marca de un vidrio armado con utilidades (la barra fija de confirmar, el menú de la cuenta, el modal de ingreso de Rival) para que entre en las listas de respaldo de accesibilidad.
- **Presupuesto:** en el celu, tres capas de vidrio real visibles a la vez como máximo. La barra de abajo y la de "Reservar" nunca conviven: una reemplaza a la otra. Medido a 393 × 851, DPR 3 y CPU 4× más lenta: 60 cuadros por segundo con vidrio real y con pintado ([plan](docs/planning/2026-11-13-portal-vidrio-plan.md), Gotchas).
- **Grano (`--glass-grain`, F9):** un ruido muy fino sobre el vidrio real, que le saca el aspecto de plástico y se apaga con `--glass-grain: none` si en la medición cuesta.

**Fondo y foto.** Cada página lleva la luz de fondo `.portal-ambient`: tres resplandores radiales verdes (`--portal-glow`), fijos y muy suaves, sobre `--portal-bg`. `PortalFrame` la pone en todo el marco, cabecera y pie incluidos. Una pantalla que también la pone (para verse sola en una story) no suma otra: dentro de un marco con luz, la anidada queda transparente. El hero apila cuatro capas con `HeroBackdrop` (`src/components/world/HeroBackdrop.tsx`, `hero-backdrop.css`): la foto (`hero-noche.webp` en oscuro, `hero-claro.webp` en claro, ambas CC0 de Wikimedia aprobadas por Lazar el 2026-11-14 hasta tener fotos propias; el crédito queda en el código), un desenfoque que se apaga hacia abajo con máscara en degradé, el velo del color del tema (`--portal-veil`) y los resplandores. La foto queda nítida abajo, donde están los jugadores.

**Color.** El verde significa dos cosas: **acción** (la píldora principal) y **lugar disponible** (un horario libre, "Hay lugar"). No se usa verde para adornar texto ni bordes sin significado; el resplandor de fondo es la única decoración verde. El estado del panel (`success`, `warning`, `info`, `destructive`) no se usa en el portal: los avisos y errores son `--portal-warn*` y `--portal-bad*`, y al jugador no se le grita ("Jugada" va en verde, "Cancelada" apagada).

**Accesibilidad.** Contraste AA medido sobre el fondo real ya renderizado, en claro y oscuro; foco visible; objetivos de 44 px. Las tres preferencias del sistema y el respaldo sin `backdrop-filter` están en Components › Portal de vidrio.

**Oro de trofeo (solo RIVAL, no es vidrio).** `#FCD34D` y su luz `#FEF3C7`, solo en oscuro: únicamente en RIVAL, para las estrellas de un club, la Corona y la figurita Oro. Es un premio, no un estado ni escasez: no se usa en ningún otro lado, y el ámbar de "Queda 1" sigue siendo solo de la ficha (decisión del dueño del 2026-10-30).

**Restos de La Previa y La Reserva.** F9 borró el dibujo de cancha (`.player-shell-bg`) y las clases sin uso. Quedan `.overlay-nav` y `.dark-surface` (`SiteHeaderShell` y el alta del complejo), `.card-premium` (el panel) y `PortalWorld` con `portal-world.css`, que todavía da `--input`, `--ring` y `--radius` a los campos de la ficha. Una pantalla nueva del portal no los usa. Lo que no es el portal (el panel, el alta del complejo en `/onboarding` y `/register`, el super admin) no cambia.

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
- **Distinto del violeta del super-admin**, que se eliminó (ver [`src-app-super-admin-super-admin.md`](.impeccable/surfaces/src-app-super-admin-super-admin.md)): aquel identificaba un panel, este identifica un producto pago.

### Named Rules

**The One Voice Rule.** Por vista, un solo elemento grita en verde sólido: el CTA primario o el dato clave. Los acentos susurran (texto o borde esmeralda) y todo lo demás calla en slate. En la grilla se invierte a propósito: el verde marca lo cobrado, no la acción.

**The Reserved Hues Rule.** `success`, `warning`, `info` y `destructive` son estado, no decoración. Lo que entra va en verde y lo que sale en rojo, siempre con signo y rótulo. La excepción es el libro de Caja › Cuentas, donde casi todo entra y cuarenta montos verdes por noche eran ruido: ahí el ingreso va en el color del texto con "+" y solo lo que sale va en rojo con "−" (decisión del dueño del 2026-09-25).

**The Component Border Rule.** En el portal, lo que delimita un control que se toca o se tipea (campo, casilla) lleva `border-portal-soft/70` (`GLASS_INPUT`, 3:1 o más contra el panel: medido da 3,39:1 en claro y 5,47:1 en oscuro); `--portal-inner-line` es solo para separar piezas dentro de un vidrio (1,2:1 no delimita un control). En las primitivas del panel que el portal todavía comparte (diálogos), `data-portal-fields` en el grupo del jugador sube `--input` y `--ring` a 3:1.

**The Scarcity Amber Rule.** En la reserva de la ficha, el ámbar (`--portal-warn*`) es solo de "Queda 1": la única escasez que es un dato real. No se usa para "Señando" (es una espera y va con borde punteado), ni para decorar. Va únicamente sobre la hora sin elegir: la elegida es verde.

**The Measured Contrast Rule.** Las escalas emerald, red y amber están fijadas en hex (valores de Tailwind 3) dentro del `@theme` de `globals.css`, porque las de Tailwind 4 en OKLCH rompían AA. Texto esmeralda: 700 sobre tarjeta clara, 800 sobre el fondo de página, 400 en oscuro. Nunca emerald-500 (2,5:1) ni emerald-600 (3,8:1) como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600 (3,8:1 y 3,2:1).

## Typography

**Display Font:** Archivo (variable, `font-display`, con fallback `ui-sans-serif, system-ui`). La itálica es sintetizada.
**Body Font:** Inter (variable, `font-sans`, el default del `<body>`)
**Mono Font:** la monoespaciada es la del sistema (`font-mono`, sin fuente propia) y solo muestra códigos que se copian o se tipean: la frase de `ConfirmDialog`, el código de referencia de `ErrorState`, el código de una reserva.

**Character:** en el panel, Inter hace el trabajo (tablas, formularios, rótulos, montos dentro de una fila) y Archivo habla (títulos de página, cifras clave, el logo en negra itálica mayúscula). En el portal, **Archivo en todo**: `layout.tsx` la carga con el eje de ancho (`axes: ['wdth']`) para que el 104 % de los titulares se vea, y cada pantalla del portal pone `font-family: var(--font-display)` en su contenedor. Se cargan con `next/font` en `src/app/layout.tsx`; Inter sigue cargada para el panel (`font-sans`). Sora salió en F9: no la usaba nadie.

### Hierarchy

- **Display** (Archivo 900 itálica, `font-display font-black italic`, interlineado cerrado, -0.03em): el logo, las cifras del panel y el titular del alta del complejo y del panel. **El portal no la usa**: sus titulares son Portal title.
- **Headline** (Archivo 700, 24 px y 30 px desde 640 px, -0.025em): el título de página del panel (`PageHeader`).
- **Numeral** (Archivo 700, 30 px, tabular, -0.025em): la cifra de un KPI (`StatCard`) y los totales destacados.
- **Title** (Inter 600, 18 px, interlineado 1): título de diálogo y de sheet. Los títulos de sección (`SectionHeader`) van en Inter 600 de 16 px.
- **Body** (Inter 400, 14 px): el mínimo del panel. En el portal el cuerpo es Archivo (ver Portal body); nada baja de 13 px.
- **Portal title** (Archivo 700, `font-stretch: 104%`, -0,035 a -0,04 em, interlineado cerrado): el h1 de cada pantalla del portal. Tamaños por pantalla en los briefs; el de `/explorar` es `clamp(26px, 2.4vw + 16px, 40px)`.
- **Portal body** (Archivo 400, 16 px mínimo, 1,5) y **portal label** (Archivo 600, 16 px): cuerpo y botones del portal. Las etiquetas chicas bajan a 13 px y nada baja de ahí.
- **Portal hour** (Archivo 600, tabular): la hora dentro de su cuadrado de la ficha; debajo, cuántas canchas quedan (13 a 14 px). Los precios van en semibold tabular con `formatArs`.
- **Label** (Inter 500, 14 px): botones, rótulos de formulario, ítems de menú.
- **Caption** (Inter 500, 12 px): badges, ayudas debajo de un campo, encabezados de tabla (en mayúsculas con `tracking-wide`).
- **Microlabel** (Inter 600, 12 px, mayúsculas, 0.06em): el nombre del complejo en la barra superior. El rótulo del riel de navegación va en 10 px semibold.

### Named Rules

**The Tabular Rule.** Toda cifra que se compara o cambia (plata, horas, contadores, columnas) lleva `tabular-nums`. La plata se muestra `$ 12.500`, sin decimales, siempre con `formatArs` de `src/lib/format.ts` (el espacio después del `$` es uno duro, U+00A0; nada de formateadores propios con `Intl.NumberFormat` o `toLocaleString`); la hora, en 24 h (`18:00`); los rangos, con raya y sin espacios (`17:00–18:00`; excepción del portal: el turno del jugador se dice "21:00 a 22:00", con cifras tabulares, porque se lee en voz alta mejor que la raya). Nada de fechas ISO frente al usuario: "vie 3 jul", "mié 1 de julio".

**The Display Discipline Rule.** `font-display` solo en títulos, cifras clave, el logo y los títulos del portal. Nunca en párrafos, tablas ni formularios.

**The Glass Title Rule.** En el portal el titular va en Archivo 700 con `font-stretch: 104%` y `letter-spacing` de -0,035 a -0,04 em; un tramo (una o dos palabras) puede ir en verde ("a un toque.") y nunca en degradé de texto nuevo. Las horas, los precios y los contadores del portal van tabulares (The Tabular Rule); lo que se cuenta hacia atrás ("Reenviar en 42 s") también. La clase `.hero-accent-text` y el titular en negra itálica son de La Previa y del alta del complejo (`/onboarding`, `/register`), que no cambia.

**The 16px Field Rule.** Todo campo donde se tipea mide 16 px por debajo de 768 px y 14 px desde ahí (`text-base md:text-sm`); si no, iOS hace zoom al enfocar. No hay escape hacia abajo. `globals.css` tiene una red de seguridad fuera de `@layer`, que no reemplaza escribir la clase.

## Layout

El panel es un marco fijo con el contenido en el medio. En `lg` (1024 px) aparece el **riel** de 72 px a la izquierda; arriba va la **barra superior** de 60 px (más el safe-area de iOS) con el nombre del complejo, el **hueco de vista** (`AdminHeaderSlot`); debajo de `lg`, el riel se va y aparece la **barra inferior** con tres accesos directos y "Más".

- **Portal, la ficha del complejo (`ProfileLayout`, `/[slug]`):** en el DOM el orden es cabecera (portada de fondo y tarjeta de vidrio con el nombre, `ComplexHero`), reserva y el resto (canchas en `CourtTile`, fotos, horarios, partidos abiertos con el flag `rival`, torneos y reseñas). Desde `lg` (1024 px) son dos columnas: cabecera y resto a la izquierda y la reserva fija a la derecha, en una columna de 480 px debajo de la barra. Debajo de `lg`, una sola columna. La reserva es una pantalla (ver Components › Portal de vidrio y el brief): la fila de días arriba (desde 1024 px se ven 7 y el resto se desliza), las horas en cuadrados de 4 por fila y la barra de "Reservar".
- **Portal, la home (`/`, `Hero`, `src/app/home/`):** hero con `HeroBackdrop`, titular "Tu cancha, a un toque." (con "a un toque." en verde), subtítulo, el buscador de vidrio (`HeroSearch` / `HomeSearch`) y la ventana de complejos de la localidad (`ComplexWindow`), seguidos de "Reservás en una pantalla" (`ReservaDibujo`), Rival (`RivalSection`, solo con el flag) y el cierre para complejos (`ClosingCta`). Es ISR (`revalidate = 300`): la localidad por IP la pide el cliente.
- **Portal, confirmar la reserva (`/[slug]/reservar`) y la vuelta (`/reserva/[bookingId]/*`):** una sola columna de 480 px (`.rv-col`) sobre `ReservaDarkShell` (`.portal-ambient` + la columna), igual en el celular y en escritorio. Sin sesión, el ingreso es `LoginPanel`, una región de la misma pantalla, no un modal.
- **Botón fijo abajo (portal, debajo de `md`):** una barra de 78 px (1 px de borde + 12 + 52 + 12 + 1) en `z-30`, apoyada SIEMPRE sobre la barra de abajo (`bottom: var(--portal-tabbar-space)`): el área segura la pone la barra de abajo, no esta. Su contenedor lleva `data-fixed-cta` y `PortalFrame` suma esos 78 px a su relleno inferior con `has-[[data-fixed-cta]]:pb-[calc(var(--portal-tabbar-space)+78px)]`: sin JS que mida y sin depender de la sesión. Desde `md` el botón vuelve al flujo y el marco a 0 con `md:has-[[data-fixed-cta]]:pb-0` (`:has()` pesa más que `md:pb-0`, por eso el `md:` también lleva el `has`). Con la misma cuenta, `html:has([data-fixed-cta])` lleva `scroll-padding-bottom` en `globals.css` (0 desde `md`), para que el foco tabulado no quede detrás de la barra (WCAG 2.4.11). Si cambia el relleno o el alto del botón, cambian las tres: `ConfirmBookingButton`, `PortalFrame` y `globals.css`.
- **Hojas y áreas seguras:** la barra de abajo, la de "Reservar" y las hojas respetan `env(safe-area-inset-bottom)`. En el celu, la tarjeta de complejo del buscador va de a dos por fila; tres desde 768 px y cuatro desde 1200 px (`.ex-grid` de `explorar.css`).
- **Medidas por contenedor:** las columnas de una pieza que vive en una columna angosta se resuelven con `@container`, no con un breakpoint de viewport.
- **Contenedor de página:** lo pone `admin-layout-shell.tsx` y la página no agrega margen propio: `mx-auto w-full px-4 sm:px-6 lg:px-8`, tope de 1600 px (`max-w-[1600px]`) y `pt-8`. `/grilla` y `/reservas` son de ancho completo, con alto de pantalla y scroll interno. Un `max-w-*` en la página solo se justifica en un formulario o una lectura angosta.
- **Hueco de vista:** las vistas del mostrador (Hoy, Grilla, Agenda, Caja y Configuración) y Métricas cuelgan ahí sus controles (segmentos, filtros, búsqueda, las flechas de día o de mes) en vez de abrir filas de encabezado propias. Lo que va al hueco es el control, no el título: el `<h1>` queda en el contenido, `sr-only`. Lo portalizado existe recién después de hidratar: un test o una foto de regresión tiene que esperarlo. Clientes, Turnos fijos, Canchas, Torneos y el super admin todavía abren con `PageHeader`.
- **Medidas por CSS, superficies por hook:** un cambio de disposición se resuelve con clases responsive o `@container`. Un hook de viewport (`useIsDesktop`) solo se justifica cuando el contenido se portaliza fuera del subárbol que el CSS oculta (un popover de Radix), y nunca para el estado inicial. "Escritorio" es `lg` (1024 px) en el CSS y en el hook.
- **Listas anchas:** una lista de una fila por elemento que a 1600 px queda estirada pasa a dos columnas en `lg` (`grid grid-cols-1 lg:grid-cols-2`, con `grid-cols-1` explícito) o a tabla.
- **Ritmo:** grilla de 4 px. Desde `lg`: padding de tarjeta 20 a 24 px, separación entre secciones de 24 px (`space-y-6`). **Panel en mobile (<`lg`): 12 px entre bloques (`space-y-3` / `gap-3`), 12 a 16 px de padding de tarjeta, 8 px entre la barra superior y el primer bloque y estados vacíos compactos (`py-6`)**: en un teléfono el aire entre componentes empuja el contenido fuera de pantalla (decisión del dueño, 2026-10-29). Celdas de tabla con `p-3`. Sin aire decorativo en tablas ni en la grilla.
- **Breakpoints:** los de Tailwind v4 (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536). En `md` los campos bajan a 14 px y los botones a 40 px; en `lg` aparece el riel.
- **Piso:** el panel se diseña para la notebook del mostrador (ver `PRODUCT.md`) y no debe tener scroll horizontal a 375 px. En el teléfono, todo blanco táctil mide 44 px o más.
- **Capas (z-index):** barra superior 20 · riel 30 · barra inferior y velo de diálogo 40 · diálogo, sheet, popover, menú y tooltip 50 · toasts 100.
- **Scroll en touch:** con `pointer: coarse` no se dibuja barra de scroll (`scrollbar-width: none` en `@layer base`; una utilidad `scrollbar-thin` explícita sigue ganando). Con mouse no cambia.
- **Scroll interno:** una lista que scrollea adentro de una tarjeta (el catálogo y el ticket de Vender) lleva barra fina con las utilidades nativas de Tailwind: `scrollbar-thin scrollbar-thumb-muted-foreground/45 scrollbar-track-transparent`. La barra del sistema, en oscuro, es un bloque gris claro que pesa más que la lista. No se define una utilidad propia con un nombre que Tailwind ya usa.
- **Bandas de estado:** la banda a lo ancho de arriba (`StatusBanner`) es solo para lo que afecta el servicio: pago vencido, cuenta suspendida o cancelada, servicio degradado. El período de prueba no es una banda: vive en el riel (ver Navigation).

## Elevation & Depth

Híbrido y adaptativo. En claro la profundidad es **elevación**: sombras suaves en capas y un borde superior esmeralda tenue; las superficies de trabajo son opacas. En oscuro es **vidrio**: relleno blanco al 3 %, `backdrop-filter: blur(12px)`, sombra honda y, al pasar el mouse por algo clickeable, un resplandor esmeralda. Los fondos del marco (`.shell-bg`, `.content-area-gradient`) llevan degradés slate con resplandores esmeralda muy bajos y, en el marco, una retícula de 60 px que evoca una cancha.

El portal es el mundo del vidrio, en los dos temas: la profundidad sale de la receta de `.glass` (degradé translúcido, borde de 1 px, brillo interior arriba y sombra honda en oscuro o difusa en claro) sobre la luz de fondo `.portal-ambient`. Recetas y niveles: Colors › Portal de vidrio. Las superficies del panel siguen la regla de arriba; el portal no usa `.card-premium`.

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

Los escalones chicos salen del radio base `--radius: 0.5rem`: `sm` 4 px, `md` 6 px (ítems chicos, skeleton, tooltip) y `lg` 8 px (botones, campos, chips de opción). `xl` 12 px (tarjetas destacadas, popovers, menús, estados vacíos) y `2xl` 16 px (diálogos, la banda del `PageHeader`, la esquina superior de la hoja inferior) son los de Tailwind y no se mueven si cambia `--radius`; `.card-premium` calcula sus 12 px como `--radius` + 4 px. Pastillas y avatares van en `rounded-full`. Los ítems del riel usan 10 px. **El portal no usa estos escalones:** píldora para botones, chips y barras; 18 a 24 px en piezas internas (campo 18, hora 20); 28 a 36 px en tarjetas y hojas (barra de "Reservar" y tarjeta de vidrio 28, hoja 32).

El borde es de 1 px en `border-border` y lo aplica `globals.css` a todo. Tres firmas de forma se repiten: el **borde izquierdo de 3 px** que identifica el estado de un turno en la grilla (legible en densidad alta y para daltónicos, porque la posición no cambia), el **rayado diagonal** (135°, cada 6 px sobre `muted`) de lo bloqueado a propósito, y el **anillo inset** de 1 px de los badges.

## Components

Todas las primitivas viven en `src/components/ui/` y consumen solo tokens semánticos: por eso el cambio de tema no necesita parches por vista. Los íconos son Lucide, la única librería: 16 px en controles, 14 px al lado de texto de 12 px (avisos, variaciones, links en línea), 12 px dentro de un badge y 20 px en la navegación.

### Buttons

- **Shape:** esquina de 8 px (`rounded-lg`); el tamaño `sm` baja a 6 px.
- **Primary:** relleno `primary` con texto `primary-foreground`, 14 px en peso 500, alto de 44 px en el teléfono y 40 px desde 768 px (`h-11 md:h-10`), `px-4`. Uno por vista; si hay dos acciones importantes, la segunda es `outline`. Un botón que mueve plata es siempre `<Button>` (o `bg-primary text-primary-foreground`) y su rótulo dice el efecto y el monto: "Cobrar $ 12.500", no "Confirmar" (excepción del portal, fijada en el brief de la reserva: "Pagar la seña" no lleva el monto, que está en el resumen justo arriba; con los precios ocultos no se puede decir, y el rótulo es el mismo en los dos casos para que el botón no cambie según el complejo). `bg-emerald-600` está bloqueado por ESLint (con texto blanco no llega a AA).
- **Hover / Focus:** el primario baja al 90 %, sube 2 px y agranda la sombra; al apretar se achica al 97 %. El foco es un anillo de 2 px en `ring` con 2 px de separación, que aparece sin transición. Los asíncronos usan `isLoading`: pelotita `TgBallSpinner` de 16 px más `disabled`, nunca un doble envío silencioso.
- **Secondary / Ghost / Tertiary:** `outline` (borde `input`, fondo `card`, hover `accent`), `secondary`, `ghost` (solo hover `accent`), `destructive` (rojo, se separa del cancelar) y `link` (`text-emerald-700 dark:text-emerald-400`, subrayado al hover). Un botón que es solo ícono (`size="icon"`, 44/40 px) lleva `aria-label` y `Tooltip`.

### Portal de vidrio: piezas y movimiento

Las primitivas del panel no se tocan. El portal tiene sus propias variantes y piezas, todas con los tokens `--portal-*` / `--glass-*` (ver Colors › Portal de vidrio). Cada pantalla se arma combinando estas piezas; el detalle de cada una está en la [dirección](docs/planning/2026-11-13-portal-vidrio-direccion.md) y el de cada pantalla, en su brief.

**Piezas (todas existen en `src/`):**

- **Botón de píldora (`Button`, variantes `pill`, `pill-glass`, `pill-danger`, `pill-link`, `pill-chip`; tamaños `pill` 52 px, `pill-sm` 44 px, `pill-icon` 44 px, `src/components/ui/button.tsx`):** `rounded-full`, semibold. `pill` es el verde de acción (degradé `--portal-btn-a` → `--portal-btn-b`, texto `--portal-on-green`); `pill-glass` es vidrio; `pill-chip` marca lo elegido con el mismo verde (`aria-pressed` / `aria-checked`). Apretar: `scale(.985)` en `--dur-1` y, al soltar, vuelve con `--ease-toque`. Foco: contorno verde de 2 px a 3 px de separación. Un `Link` con `buttonVariants({ variant: 'pill' })` va siempre envuelto en `cn(...)`: sin `twMerge`, le ganan `rounded-lg` y `text-sm` de la base.
- **Cabecera (`PortalHeader`, `.portal-top*`; `SiteNav` es su re-export):** en el celu, el logo y el botón de tema sin fondo; desde 768 px, una píldora de vidrio de 60 px (`max-w` 1120) con los links al centro. Pasados 8 px de scroll se condensa una sola vez a 54 px, con más opacidad y sombra (solo `transform` y `opacity`). Variante `overlay` sobre el hero de la home. Con sesión, el menú de cuenta (`AccountMenu`, `glass-pop`) va en portal de Radix. `ThemeButton` abre el tema nuevo en círculo desde el botón con `document.startViewTransition` y `clip-path` (420 ms); sin soporte, cambia directo. `ThemeToggle variant="glass"` es el control segmentado de Cuenta; `variant="portal"` sigue existiendo porque el cajón del celu del panel lo usa.
- **Barra de abajo (`PlayerBottomNav`, `.portal-tabbar`, solo debajo de `md`, con y sin sesión):** píldora flotante de vidrio real de 66 px con Explorar, Rival (solo con el flag `rival`), Reservas y Cuenta. Una sola píldora (`[data-tabbar-pill]`) se traslada de una pestaña a otra con `--spring-pildora`; entre pantallas la lleva `<ViewTransition name="portal-tabbar-pill">`. El activo no se dice solo con color: va semibold. El ícono de la pestaña nueva hace su toque (0,86 → 1) solo cuando la pestaña cambió. Baja y sale cuando sube una hoja (`[data-glass-sheet]`), la barra de "Reservar" (`[data-reserve-bar]`) o hay un campo con foco. No aparece en `/suspended`, `/reactivar` ni con sesión de complejo (`useBottomNavVisible`). `PortalFrame` reserva su espacio con `--portal-tabbar-space` (78 px + área segura).
- **Hoja (`GlassSheetContent`, `src/components/ui/glass-sheet.tsx`, sobre `Sheet` de Radix):** sube desde abajo con `--spring-hoja`, se arrastra desde la manija o la cabecera y se cierra si se arrastra más de un tercio de su alto o con velocidad hacia abajo; desde `md` es un panel centrado sin arrastre. Archivo aparte de `sheet.tsx` para que el panel no cargue `motion`. Con "reducir movimiento", fundido de 150 ms y sin arrastre. `GlassConfirmSheet` (`src/components/world/`) es el `ConfirmDialog` del portal, con la misma lógica (`useConfirmAction`) y la piel de hoja.
- **Barra de "Reservar" (`ReserveBar`, `.rbar`):** sube sobre la ficha al tocar una hora, con la cancha, el precio y el botón. Vidrio real, en portal a `<body>`, con el resorte hoja y arrastre hacia abajo para cerrarla; no es un diálogo (la página sigue usable). La barra fija de confirmar (`ConfirmBookingButton`) y la de Rival miden 78 px y llevan `glass-pop`.
- **Resultado (`PortalResult`, `src/components/world/PortalResult.tsx`):** la forma común de pendiente, error, "no encontrado", los `error.tsx` del jugador, referidos y reactivar. Insignia (verde, roja o de vidrio neutro), título, qué pasó, el turno en un ticket si lo hay y la salida en píldoras de 52 px (`RESULT_GO`, `RESULT_ALT`, `portal-result-classes.ts`). Ninguna insignia lleva ámbar. Columna de 480 px.
- **Foto del hero (`HeroBackdrop`, `src/components/world/HeroBackdrop.tsx`):** foto + desenfoque + velo + resplandores (ver Colors). La usan la home, `/ingresar` y `/para-complejos`; con `priority` es el LCP. Las fotos viven en `src/components/world/fotos/`.
- **Marco de ingreso (`PortalAuthFrame`):** cromo del portal, foto del hero sin reflejo y una columna centrada con la tarjeta de ingreso (`.pa-auth__card glass`). Las clases de campos, links y botones de ingreso están en `portal-auth-styles.ts` (`PORTAL_BUTTON_OUTLINE`, `PORTAL_LINK`, `GLASS_INPUT`), un módulo sin imports a propósito: importarlas desde el marco arrastraría su CSS y el cromo a la ficha, Rival y confirmar.
- **Esqueletos (`Skeleton variant="glass"`, `.skeleton-glass`):** una pieza de vidrio con el brillo de carga, con la forma exacta de lo que reemplaza.
- **Avisos (`[data-toast]` dentro de `[data-portal-glass]`):** bajan desde arriba con `--spring-hoja` en vidrio.
- **Barra fija y `Reveal`:** `Reveal` (`src/components/site/Reveal.tsx`) hace aparecer una sección al bajar, una vez.

**Movimiento.** Calmo (nada se mueve si nadie tocó nada), preciso y físico. Reglas completas y tiempos por pantalla: [dirección §4](docs/planning/2026-11-13-portal-vidrio-direccion.md).

- **Tokens** (en `html:has([data-portal-glass])`): `--dur-1` 120 ms (toque, color), `--dur-2` 200 ms (fundidos, chips), `--dur-3` 320 ms (entradas de bloque), `--dur-4` 700 ms (entrada del hero); curvas `--portal-ease-out` `cubic-bezier(.2,.8,.2,1)` (lo que entra) y `--portal-ease-in` `cubic-bezier(.4,0,1,1)` (lo que se va); resortes en CSS `--spring-hoja` 380 ms, `--spring-pildora` 440 ms y `--spring-toque` 480 ms (curvas `--ease-hoja`, `--ease-pildora`, `--ease-toque`, con `linear()`). Un resorte se pasa de largo un 6 % como mucho.
- **Con qué:** CSS primero (`transition`, `@keyframes`, `animation-timeline`). Para navegar entre pantallas y elementos compartidos, `<ViewTransition>` de React 19 y `transitionTypes` de `<Link>`. `motion` (`motion/react`) solo para lo que necesita física y gestos: hojas que se arrastran y piezas que entran y salen de una lista. Va con `LazyMotion strict` y `MotionConfig reducedMotion="user"` en `PortalMotionProvider` (`src/components/site/`), que montan `PortalFrame` y la home y nunca `(admin)`; el arrastre (`domMax`) se carga en diferido recién al montar una hoja. Es la segunda excepción de la regla "sin librerías de animación" (la otra es `/onboarding`).
- **Piezas de movimiento** (se combinan, no se inventan otras sin escribirlas en la dirección): subir, aparecer al bajar, apretar, píldora que se desliza, hoja, reemplazo (un precio cambia por reemplazo, nunca contando de un valor al otro), escalonado, trazo, brillo de carga (el único bucle permitido), transformación, floración y reflejo.
- **Decidido en F9** (plan, fase 9): fundido de 200 ms entre pantallas con `<ViewTransition>` (`PortalTransition`, `src/components/site/`, dentro de un `template.tsx` por grupo de rutas: un layout persiste y no tendría entrada ni salida) y `transitionTypes` en los `<Link>`; entrar a un detalle (`nav-forward`) entra 24 px desde la derecha y volver (`nav-back`), desde la izquierda; el resto, incluido el Atrás del navegador, es un fundido cruzado. La foto de la tarjeta de `/explorar` se transforma en la portada de la ficha con el nombre compartido `complejo-foto-<slug>` (`TenantCard`). Grano sobre el vidrio real (variable `--glass-grain`, un SVG en línea al 2 a 3 % de opacidad; `--glass-grain: none` lo apaga si en la medición cuesta). Brillo que sigue al puntero en el borde (`usePointerGlow`, `src/components/world/use-pointer-glow.ts`), solo en compu, en el buscador de la home y las tarjetas de planes. La barra de abajo se compacta al bajar y vuelve al subir. Las que todavía no estén en el código al leer esto están en el [plan](docs/planning/2026-11-13-portal-vidrio-plan.md), fase 9.
- **Rendimiento:** solo `transform` y `opacity`; nunca el radio del desenfoque, sombras grandes ni anchos y altos. El elemento más grande de la primera pantalla nunca arranca escondido. Lo que `motion` suma al portal no pasa de unos 25 KB comprimidos y en `(admin)` suma cero.

**Accesibilidad del vidrio** (bloques fuera de `@layer` en `globals.css`, para ganarle a las utilidades):

- `prefers-reduced-motion`: lo que se desplazaba pasa a un fundido corto o aparece directo; nada queda escondido esperando una animación.
- `prefers-reduced-transparency` y navegadores sin `backdrop-filter` (`@supports not`): el vidrio pasa a un relleno casi opaco del color del tema y se sigue leyendo. Un vidrio armado con utilidades se suma a esas listas con `glass-pop`.
- `prefers-contrast: more`: vidrio opaco (`--portal-bg`) y bordes del 55 % de la tinta.
- Foco siempre visible (anillo verde de 2 px), objetivos de 44 px y contraste AA medido sobre el fondo real ya renderizado: la foto del hero cambia el resultado.

Las specs de cada pantalla del portal están en sus briefs: ver Specs por pantalla, al final de Components.

**The Quiet Ghost Rule.** Las acciones de una tarjeta del portal que no son la principal (Cancelar, Dejar reseña, Reservar de nuevo) van sin relleno de acción: píldora de vidrio o de tinta (`pill-link`, `pill-glass`), 44 px. Solo la próxima lleva verde ("Avisarle al grupo"). "Ausente" y "Esperando seña" son neutros: el rojo de error y el ámbar de "Queda 1" no se prestan.

### Chips

- **Alcance:** lo que sigue es del Mostrador. Los días y las horas de la reserva de la ficha (`DayList`, `HourGrid`) y los chips de tamaño del buscador son piezas del portal: están en [`src-app-public-slug.md`](.impeccable/surfaces/src-app-public-slug.md) y en Components › Portal de vidrio.
- **Style:** el badge de estado (`StatusBadge`) es una pastilla con tinte del tono al 10 % (15 % en oscuro), rótulo 800/300, anillo inset al 25 % (40 % en oscuro) e ícono de 12 px. El ícono, el rótulo y el tono de cada estado salen de una tabla única por dominio: `src/lib/booking/slot-visual.ts` para los turnos (grilla, reservas y detalle) y un `status-visual.tsx` por módulo para canchas, turnos fijos y equipo. Así el panel y el portal dicen lo mismo, y un badge nuevo no inventa su propio mapa de colores.
- **State:** las opciones elegibles (`RadioChip`) son tarjetas de 44 px de alto con borde `border`; la elegida pasa a borde `primary` y fondo `primary` al 5 % (10 % en oscuro).
- **Segmentos de elección:** los que eligen una opción entre pocas usan `choiceChipClass` (`src/components/ui/segmented-control.tsx`), con el look de `RadioChip` y el peso como pista que no es color (semibold la elegida, medium el resto). Hoy: "¿Cómo pagan?" del cobro, el método de pago, y en el alta "¿Cobraste algo ahora?", el tipo de reserva en el teléfono, "Repetición", "Precio", "Quién" y "Motivo"; también "Precio" en Editar turno y las horas de Mover turno. Lo elegido nunca va con relleno `primary` sólido: ese verde es del botón que cobra o confirma (The One Voice Rule). Al lado de "Cobrar", una pestaña en verde sólido hacía dos o tres losas gritando a la vez (refinamiento del 2026-10-31). La tira de días de la Grilla y su calendario usan el mismo borde y tinte para el día elegido, y borde punteado para hoy.

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

- **Style:** borde de 1 px `input` (en el panel vale lo mismo que `border`), fondo `card`, esquina de 8 px, 44/40 px de alto, `px-3.5`, placeholder en `muted-foreground` al 60 %. En el portal el campo es `GLASS_INPUT` (`portal-auth-styles.ts`): 52 px, esquina de 18 px, 16 px también desde `md`, borde `border-portal-soft/70` (3:1) y fondo `portal-inner`.
- **Focus:** anillo de 2 px en `ring` con separación y el borde pasa a `primary`.
- **Error / Disabled:** el error va debajo del campo en 12 px `destructive` con `role="alert"`; deshabilitado baja al 50 %. El rótulo es siempre visible (el placeholder es un ejemplo, "Ej: …", y tiene que entrar completo).
- **Plata:** todo campo de pesos es `MoneyInput`, que trabaja en centavos (controlado con `valueCents`/`onValueChange`, o no controlado con `defaultValueCents` + `name`, que viaja en un `<input type="hidden">`). Nunca `type="number"` ni `parseFloat` para plata; lo que no es plata (goles, stock, días, porcentajes, minutos) sigue con `type="number"`.

### Navigation

- **Riel (`AdminSidebar`, `lg` en adelante):** 72 px de ancho sobre `card` con borde derecho. En touch (sin hover) cada ítem mide 60×52 px: ícono de 20 px arriba y rótulo de 10 px abajo, siempre visible — en una tablet no hay hover y un ícono solo es una adivinanza. Con mouse (`pointer-fine`) el riel es solo íconos, y al pasar el mouse o tener el foco adentro se despliega en overlay a ~224 px (no empuja el contenido) mostrando el rótulo a la derecha de cada ícono, que no se mueve de su columna; abre en 200 ms con un delay de 120 ms para que cruzarlo con el mouse no lo dispare, cierra sin delay; `motion-reduce` no anima. Activo: fondo `primary` al 10 %, rótulo `emerald-800`/`emerald-300` e ícono `emerald-700`/`emerald-400`. Arriba de la navegación, entre el logo y los espacios, va el botón **Vender** (2026-10-26): relleno `primary` con ícono de bolsa, abre el modal de venta desde cualquier vista (la tecla V también) y se rotula igual que el resto (solo ícono con mouse, ícono+rótulo en touch); es una acción, no un destino, así que nunca queda "activo". Configuración va aparte, al pie, rotulada "Ajustes"; más abajo, el avatar de 44 px con la cuenta (no se despliega: no tiene ícono+rótulo). Durante la prueba, arriba de Ajustes va un ítem de 60×52 con anillo de 1 px: "Prueba" y los días que quedan, ya en dos líneas de texto y sin cambios al desplegar; los últimos 7 días pasa a ámbar. Al dueño lo lleva a Facturación ("Elegir plan"); al encargado solo le informa. En el cajón es una fila de dos renglones, para que los días no se corten. Un espacio puede agrupar varias rutas y resuelve su estructura interna con pestañas, nunca con submenús.
- **Barra superior (`AdminHeader`):** 60 px sobre `card` con borde inferior. Desde `lg`, nombre del complejo en microrrótulo a la izquierda y hueco de vista en el medio; debajo de `lg`, el isotipo (`LogoMark`, T en `foreground`, G en esmeralda) que lleva a Hoy. Sin tema ni campana de notificaciones: el tema vive en el cajón y las notificaciones en Ajustes.
- **Barra inferior (`AdminBottomNav`, debajo de `lg`):** fija, cuatro accesos de al menos 56 px de alto con ícono y rótulo de 11 px; el cuarto, "Más", abre el cajón (`Sheet` lateral) con el resto de los espacios (no repite los tres de la barra), el período de prueba y Ajustes; sin Ayuda. El pie es compacto: el selector de tema sin rótulo visible (en 240 px el rótulo cortaba "Oscuro") y una fila con el email truncado y "Salir".
- **Pestañas (`ScrollTabs`):** subrayado de 2 px; la activa lleva borde `emerald-600` y texto `emerald-800`/`emerald-400`. Se deslizan en horizontal si no entran.
- **Paginación (`Pager`):** una sola para todo el panel: "Mostrando 26–50 de 312", números con la primera y la última a mano, la actual en `foreground` sólido, "Anteriores"/"Siguientes" apagados en su lugar cuando no hay adónde ir. Nada de scroll infinito en el panel.
- **Portal:** la cabecera en píldora, el pie, la barra de abajo, el menú de cuenta, las hojas y los avisos están en Components › Portal de vidrio.
- **Candado de rol:** lo que el encargado no puede usar se ve con candado y el tooltip "Solo el dueño" en vez de desaparecer (hoy, Configuración).

### Dialogs, Sheets and Toasts

- **Diálogo:** esquina de 16 px, `p-6`, 576 px de ancho por defecto (`max-w-xl`); `ConfirmDialog`, el más usado, va en 448 px (`max-w-md`), y el modal de cobro de un turno en 672 px (`max-w-2xl`), para que los dos equipos entren lado a lado. Arriba en el teléfono y centrado desde 768 px. Entra con fade y zoom de 95 a 100 % en 200 ms. Escape y la X cierran. El error de la acción va en `role="alert"`, 13 px, `red-700`/`red-300` (no `text-destructive`: sobre la superficie oscura da 3.87:1), el mismo piso de 13 px del portal.
- **Confirmar o deshacer:** la fricción crece con el costo, en tres escalones. Lo reversible y barato se hace ya y ofrece "Deshacer" en el toast, solo si existe la acción inversa de verdad. Lo costoso pero explicable pasa por `ConfirmDialog` con sus consecuencias listadas. Lo irreversible con plata real suma tipear una frase (`confirmationPhrase`); borrar la cuenta del jugador pide tipear su email (`phraseMatch="email"`, ver Components › Mi cuenta y Eliminar la cuenta). En el diálogo destructivo el botón rojo va separado del cancelar. Nunca `window.confirm()` ni `alert()`.
- **Sheet:** lateral derecho de 384 px para detalle, izquierdo de 288 px para el cajón de navegación, inferior con esquinas de 16 px en el teléfono.
- **Toast:** abajo a la derecha, tarjeta con una barra de acento a la izquierda (esmeralda a teal, o roja). Éxito se va a los 4 s; error queda hasta que se cierra; con acción, 10 s. El texto dice qué pasó y qué sigue.
- **Tooltip:** pastilla `foreground` sobre `background` (se invierte con el tema), 12 px, aparece a los 300 ms con el mouse y enseguida con el foco. Obligatorio en íconos solos, candados de rol y botones deshabilitados ("¿por qué no puedo?").
- **Guía en contexto:** como mucho un elemento de guía visible por pantalla (`Coachmark` o una pista), que se descarta con un clic y no vuelve. Nada de tours modales de bienvenida.

### Specs por pantalla

Lo de arriba es lo que comparten todas las pantallas. La spec de cada pantalla vive en el brief de su ruta, en `.impeccable/surfaces/`, y `impeccable context --target <ruta>` la carga solo cuando se trabaja en esa pantalla. Una pantalla nueva no suma su sección acá: va a su brief.

| Pantalla                                                           | Brief                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| La ficha del complejo y su reserva en una pantalla                 | [`src-app-public-slug.md`](.impeccable/surfaces/src-app-public-slug.md)                                 |
| La vuelta de la reserva (`/reserva/[bookingId]`)                   | [`src-app-public-slug.md`](.impeccable/surfaces/src-app-public-slug.md)                                 |
| Confirmar la reserva y el ingreso del jugador                      | [`src-app-auth-ingresar.md`](.impeccable/surfaces/src-app-auth-ingresar.md)                             |
| Home                                                               | [`src-app-home.md`](.impeccable/surfaces/src-app-home.md)                                               |
| Cromo del portal (cabecera, pie y barra de abajo)                  | [`src-components-site-portalshell-tsx.md`](.impeccable/surfaces/src-components-site-portalshell-tsx.md) |
| Páginas para complejos (`/para-complejos`, planes, blog y legales) | [`src-app-business-para-complejos.md`](.impeccable/surfaces/src-app-business-para-complejos.md)         |
| El grupo del jugador: Mis reservas, Mi cuenta y Eliminar la cuenta | [`src-app-player.md`](.impeccable/surfaces/src-app-player.md)                                           |
| Grilla de turnos y Placa para historias                            | [`src-app-admin-grilla.md`](.impeccable/surfaces/src-app-admin-grilla.md)                               |
| Agenda (`/reservas`)                                               | [`src-app-admin-reservas.md`](.impeccable/surfaces/src-app-admin-reservas.md)                           |
| Tablero de Hoy                                                     | [`src-app-admin-dashboard.md`](.impeccable/surfaces/src-app-admin-dashboard.md)                         |
| Canchas                                                            | [`src-app-admin-canchas.md`](.impeccable/surfaces/src-app-admin-canchas.md)                             |
| Caja › Cuentas y Caja › Productos                                  | [`src-app-admin-caja.md`](.impeccable/surfaces/src-app-admin-caja.md)                                   |
| Métricas                                                           | [`src-app-admin-analiticas.md`](.impeccable/surfaces/src-app-admin-analiticas.md)                       |
| Superadmin (Pulso, Complejos y Jugadores)                          | [`src-app-super-admin-super-admin.md`](.impeccable/surfaces/src-app-super-admin-super-admin.md)         |

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
- **Do** construir todo lo nuevo del portal en vidrio (ver Colors › Portal de vidrio y Components › Portal de vidrio), con las recetas y las piezas que ya existen en `globals.css`, `src/components/world/` y `src/components/ui/glass-sheet.tsx`, y una sola acción verde por pantalla.
- **Do** dejar `PortalWorld` y `portal-world.css` donde están: siguen montados en `(perfil)/layout.tsx` y dan los tokens de los campos de la ficha. Ninguna pantalla nueva los usa.
- **Do** mantener las compuertas del portal en verde: `tests/unit/portal-world-tokens.test.ts` hashea los tokens del panel (cambiarlos a propósito actualiza el hash en el mismo PR; `@theme` suma los `portal-*`), `tests/unit/portal-shell-bg.test.ts`, `tests/unit/hero-accent-contrast.test.ts` y la suite a11y de Storybook en los dos temas. El contraste del vidrio se mide sobre el píxel ya renderizado, nunca sobre el token.
- **Do** marcar el error en el campo o la casilla que falló, con el mensaje debajo.
- **Do** decir lo elegido en la reserva con relleno verde y tilde o estado: nunca solo color. Cada estado de una hora se dice con palabra ("N libres", "Queda 1", "Libre", "Señando", "Completo") y lo que no se puede elegir se ve y se explica en vez de desaparecer.
- **Do** resolver las columnas de una pieza que vive en una columna angosta con `@container`, no con un breakpoint de viewport.
- **Do** darle a cada vacío o error del portal su causa, qué hacer y una salida (reintentar, otro día, hablar con el complejo) arriba del pliegue.
- **Do** marcar con `data-fixed-cta` todo botón fijo abajo del portal (hoy `ConfirmBookingButton` y la barra fija de Rival) y sumar su alto real (78 px) a la cuenta de `PortalFrame` y al `scroll-padding-bottom` de `globals.css` en el mismo PR; nunca medirlo con JS ni colgarlo de la sesión.
- **Do** dejar el estado que depende del reloj del visitante (hoy, abierto o cerrado, qué horas quedan) en una isla de cliente con un esqueleto del mismo alto, y marcar la sección de reserva con `data-state`.
- **Do** poner `data-portal-glass` (lo ponen `PortalFrame`, la home, `(business)/layout.tsx` y `PortalAuthFrame`) en toda pantalla del portal: sin el marcador no hay tokens `--portal-*` ni `--glass-*`. Los tokens cuelgan de `html:has([data-portal-glass])` y `html.dark:has([data-portal-glass])`, nunca de `:root` ni de `.dark`: el panel no los ve. En Tailwind son `portal-*` (`text-portal-ink`, `bg-portal-inner`).

### Don't:

- **Don't** reemplazar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas", descartada por el dueño el 2026-09-23).
- **Don't** llamar "deuda" a un turno no cobrado, ni pintar de rojo un turno que todavía se está jugando: el rojo es de lo jugado y no cobrado (principio 3 de `PRODUCT.md`). La urgencia se dice con color y texto; el único movimiento es el punto que late en el botón "Cobrar $X" de Hoy (pedido del dueño, 2026-09-25). El anillo que respiraba alrededor de toda la celda de la Grilla (`.slot-alarm-ring`) se eliminó el 2026-09-24 y no vuelve.
- **Don't** usar emerald-500 o emerald-600 como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600.
- **Don't** escribir hex inline en JSX, ni sombras, degradés o vidrio inline; tampoco `dark:` sueltos para arreglar una primitiva: se arregla el token.
- **Don't** poner `bg-white` como fondo de página, ni `text-black`/`bg-black`. En el portal el fondo sale de `.portal-ambient` (sobre `--portal-bg`); en el panel, de `bg-background`.
- **Don't** armar vidrio de portal con valores inline ni inventar uno: `.glass`, `.glass-painted`, `.glass-pop` y los tokens `--glass-*` / `--portal-*` de `globals.css` son la receta. Un vidrio armado con utilidades (una barra fija, un menú) lleva `glass-pop` para entrar en las listas de respaldo de accesibilidad.
- **Don't** apilar más de tres capas de vidrio real visibles en el celu (presupuesto de la dirección §3.3), ni poner `backdrop-filter` en lo que se repite en una lista, ni alrededor de un `position: fixed`: el `backdrop-filter` hace de bloque contenedor y el `fixed` se ubica contra el vidrio. Lo fijo (la barra de "Reservar", la hoja, el menú de la cuenta, los avisos) va en portal de Radix o a `<body>`.
- **Don't** deshabilitar un botón del portal con opacidad ni dejarlo deshabilitado sin explicación.
- **Don't** delimitar un campo, una casilla o un `outline` del portal con `portal-inner-line`: con 1,2:1 no llega a los 3:1 de WCAG 1.4.11. Va `border-portal-soft/70` (`GLASS_INPUT`).
- **Don't** poner dos acciones verdes en una pantalla del portal. La hora, el día o el chip elegidos son estado y no cuentan; el verde de acción es la píldora principal (la barra de "Reservar", "Pagar seña", "Avisarle al grupo" en el éxito). Un verde que no es acción ni lugar disponible es decoración: no va.
- **Don't** mostrar una cuenta regresiva ni prometer una confirmación a quien vuelve de pagar: los cortes de la espera dicen dónde mirar (Mis reservas) y a quién escribir (el complejo). Lo que el jugador comparte (el mensaje al grupo) nunca lleva montos.
- **Don't** usar el ámbar del portal (`--portal-warn*`) para otra cosa que "Queda 1" y los avisos: ni para "Señando" (es una espera, va con borde punteado), ni para decorar, ni para la hora elegida.
- **Don't** esconder las horas completas ni los días cerrados: se ven, deshabilitados y dichos ("Completo" tachado, "Cerrado").
- **Don't** usar `CourtCard` en una página del portal: es la tarjeta del panel y del onboarding; la ficha usa `CourtTile`.
- **Don't** elegir las columnas de las horas con un breakpoint de viewport donde la reserva vive en una columna angosta: la fila de horas es una grilla de cuadrados (`.hgrid`, 4 por fila) y la de días se desliza.
- **Don't** agregar librerías de animación (las excepciones son `/onboarding` y, desde el 2026-11-13, el portal: `motion` en `LazyMotion`, con los límites de [`docs/planning/2026-11-13-portal-vidrio-direccion.md`](docs/planning/2026-11-13-portal-vidrio-direccion.md); el panel sigue sin librería) ni loops infinitos fuera del skeleton, de la web comercial y del punto de "Cobrar $X" en Hoy.
- **Don't** usar el placeholder como rótulo, emojis como íconos estructurales ni fechas ISO o anglicismos de dashboard ("Revenue", "Booking") frente al usuario.
- **Don't** mostrar un número verificable que no salga de datos reales (prueba social, escasez, contadores): lo trucho descubierto destruye la confianza para pagar la seña y es publicidad engañosa (Ley 24.240).
