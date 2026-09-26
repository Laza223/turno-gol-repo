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
typography:
  display:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(26px, 6vw, 36px)'
    fontWeight: 900
    lineHeight: 1
    letterSpacing: '-0.03em'
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
---

# Design System: TurnoGol

## Overview

**Creative North Star: "El Mostrador y La Previa"**

TurnoGol es un solo sistema con dos personalidades. Comparten paleta, tipografías y primitivas; cambia cuánta expresión se permite cada una. **El Mostrador** es el panel del complejo: una herramienta que el encargado usa toda la noche en una notebook con mouse, mientras atiende gente y contesta el WhatsApp. Es denso pero obvio, con los datos primero, un solo verde que grita por vista y movimiento corto. **La Previa** es el portal del jugador y la web: una vidriera con checkout, una idea por pantalla, el verde usado como deseo (resplandores, cifras de precio, el CTA de reservar) y titulares en Archivo negra e itálica.

El mundo es césped de noche sobre slate. En claro, tarjetas blancas que flotan con sombras en capas sobre un fondo slate frío; en oscuro, losas slate-950 con superficies de vidrio (relleno blanco al 3 %, desenfoque y un resplandor esmeralda). Los dos temas son de primera: ninguna vista se diseña para uno y "después se verá" el otro; arranca el del sistema (`next-themes`, `defaultTheme="system"`). El estado nunca se comunica solo con color: siempre va color, ícono y texto, y lo resuelve una sola tabla de tonos.

Este documento describe el estilo tal como está en el código al 2026-09-23 y es la única autoridad de diseño del repo. El panel se **refina** sobre este estilo; no se reemplaza. Donde los documentos anteriores (hoy en `docs/archive/design-system/`) y el código no coincidían, ganó el código. Rechazo confirmado por el dueño el 2026-09-23: cambiar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas").

**Key Characteristics:**

- Esmeralda sobre slate, con claro y oscuro como temas de primera.
- Claro = elevación (sombras en capas). Oscuro = vidrio (blanco al 3 % + blur + resplandor).
- Inter trabaja; Archivo titula, pone las cifras clave y firma el logo. Toda cifra es tabular.
- Estado = color + ícono + texto, siempre desde `src/lib/status-tone.ts`.
- Panel denso y movimiento corto (200 ms en los controles). Lo único largo es un pulso de 600 ms, una sola vez: el turno que entra a la grilla o la reserva recién confirmada.
- Un solo primario por vista.

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
- **Losa nocturna** (`night-slab` #020617): el fondo de las superficies siempre oscuras del portal y la landing en tema oscuro.

### Status

- **Cobrado** (`success`: hsl(142 72% 29%) = green-700 · `success-dark`: hsl(142 70% 45%)): confirmado, jugado, cobrado, ingreso.
- **Pendiente** (`warning`: hsl(32 95% 44%) = amber-600 · `warning-dark`: hsl(38 92% 50%)): esperando seña, atención.
- **Informativo** (`info`: hsl(221 83% 53%) = blue-600 · `info-dark`: hsl(217 91% 60%) = blue-500): en proceso (MercadoPago), confirmado a cobrar, avisos neutros. El azul de MercadoPago se permite solo dentro del contexto de pago.
- **Peligro** (`destructive`: hsl(0 72% 51%) = red-600, igual en los dos temas): borrar, ausente, egreso, error y el turno jugado y no cobrado ("No cobrado", decisión del dueño del 2026-09-25: es plata que no entró).

Los rótulos sobre un tinte de estado usan la escala 800 en claro y 300 en oscuro (rojo: 700 y 300). Esas clases, los tintes al 10/15 % y el borde izquierdo de la grilla salen de `TONE_BADGE`, `TONE_TEXT`, `TONE_TINT` y `TONE_BORDER` en `src/lib/status-tone.ts`, con seis tonos: `success`, `warning`, `info`, `destructive`, `neutral` y `brand`.

### Named Rules

**The One Voice Rule.** Por vista, un solo elemento grita en verde sólido: el CTA primario o el dato clave. Los acentos susurran (texto o borde esmeralda) y todo lo demás calla en slate. En la grilla se invierte a propósito: el verde marca lo cobrado, no la acción.

**The Reserved Hues Rule.** `success`, `warning`, `info` y `destructive` son estado, no decoración. Lo que entra va en verde y lo que sale en rojo, siempre con signo y rótulo. La excepción es el libro de Caja › Cuentas, donde casi todo entra y cuarenta montos verdes por noche eran ruido: ahí el ingreso va en el color del texto con "+" y solo lo que sale va en rojo con "−" (decisión del dueño del 2026-09-25).

**The Measured Contrast Rule.** Las escalas emerald, red y amber están fijadas en hex (valores de Tailwind 3) dentro del `@theme` de `globals.css`, porque las de Tailwind 4 en OKLCH rompían AA. Texto esmeralda: 700 sobre tarjeta clara, 800 sobre el fondo de página, 400 en oscuro. Nunca emerald-500 (2,5:1) ni emerald-600 (3,8:1) como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600 (3,8:1 y 3,2:1).

## Typography

**Display Font:** Archivo (variable, `font-display`, con fallback `ui-sans-serif, system-ui`)
**Body Font:** Inter (variable, `font-sans`, el default del `<body>`)
**Label/Mono Font:** Sora (`font-logo`), solo en microrrótulos de la web comercial y del login. La monoespaciada es la del sistema (`font-mono`, sin fuente propia) y solo muestra códigos que se copian o se tipean: la frase de `ConfirmDialog`, el código de referencia de `ErrorState`, el código de una reserva.

**Character:** Inter hace el trabajo: tablas, formularios, rótulos, montos dentro de una fila. Archivo habla: títulos de página, cifras clave, el logo en negra itálica mayúscula y los titulares del portal en negra itálica. Las tres se cargan con `next/font` en `src/app/layout.tsx`.

### Hierarchy

- **Display** (Archivo 900 itálica, clamp(26px, 6vw, 36px), interlineado 1, -0.03em): titulares del portal del jugador (`PlayerHeroBand`, `/explorar`), uno por pantalla. La palabra de acento puede llevar `.hero-accent-text`.
- **Headline** (Archivo 700, 24 px y 30 px desde 640 px, -0.025em): el título de página del panel (`PageHeader`).
- **Numeral** (Archivo 700, 30 px, tabular, -0.025em): la cifra de un KPI (`StatCard`) y los totales destacados.
- **Title** (Inter 600, 18 px, interlineado 1): título de diálogo y de sheet. Los títulos de sección (`SectionHeader`) van en Inter 600 de 16 px.
- **Body** (Inter 400, 14 px): el mínimo del panel. En los flujos de lectura del portal puede subir a 16 px.
- **Label** (Inter 500, 14 px): botones, rótulos de formulario, ítems de menú.
- **Caption** (Inter 500, 12 px): badges, ayudas debajo de un campo, encabezados de tabla (en mayúsculas con `tracking-wide`).
- **Microlabel** (Inter 600, 12 px, mayúsculas, 0.06em): el nombre del complejo en la barra superior. El rótulo del riel de navegación va en 10 px semibold.

### Named Rules

**The Tabular Rule.** Toda cifra que se compara o cambia (plata, horas, contadores, columnas) lleva `tabular-nums`. La plata se muestra `$ 12.500`, sin decimales, siempre con `formatArs` de `src/lib/format.ts` (el espacio después del `$` es uno duro, U+00A0; nada de formateadores propios con `Intl.NumberFormat` o `toLocaleString`); la hora, en 24 h (`18:00`); los rangos, con raya y sin espacios (`17:00–18:00`). Nada de fechas ISO frente al usuario: "vie 3 jul", "mié 1 de julio".

**The Display Discipline Rule.** `font-display` solo en títulos, cifras clave, el logo y los titulares del portal. Nunca en párrafos, tablas ni formularios.

**The 16px Field Rule.** Todo campo donde se tipea mide 16 px por debajo de 768 px y 14 px desde ahí (`text-base md:text-sm`); si no, iOS hace zoom al enfocar. No hay escape hacia abajo; hacia arriba existe `.field-lg` (18 px). `globals.css` tiene una red de seguridad fuera de `@layer`, que no reemplaza escribir la clase.

## Layout

El panel es un marco fijo con el contenido en el medio. En `lg` (1024 px) aparece el **riel** de 72 px a la izquierda; arriba va la **barra superior** de 60 px (más el safe-area de iOS) con el nombre del complejo, el **hueco de vista** (`AdminHeaderSlot`) y el menú de tema; debajo de `lg`, el riel se va y aparece la **barra inferior** con tres accesos directos y "Más".

- **Contenedor de página:** lo pone `admin-layout-shell.tsx` y la página no agrega margen propio: `mx-auto w-full px-4 sm:px-6 lg:px-8`, tope de 1600 px (`max-w-[1600px]`) y `pt-8`. `/grilla` y `/reservas` son de ancho completo, con alto de pantalla y scroll interno. Un `max-w-*` en la página solo se justifica en un formulario o una lectura angosta.
- **Hueco de vista:** las vistas del mostrador (Hoy, Grilla, Agenda, Caja y Configuración) cuelgan ahí sus controles (segmentos, filtros, búsqueda) en vez de abrir filas de encabezado propias. Lo que va al hueco es el control, no el título. Lo portalizado existe recién después de hidratar: un test o una foto de regresión tiene que esperarlo. Clientes, Turnos fijos, Canchas, Métricas, Torneos y el super admin todavía abren con `PageHeader`.
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

### Shadow Vocabulary

- **Tarjeta en claro** (`box-shadow: 0 1px 2px rgba(2,6,23,.05), 0 4px 12px -4px rgba(2,6,23,.08), 0 12px 32px -12px rgba(2,6,23,.12)`, más `border-top: 2px solid rgba(5,150,105,.2)`): `.card-premium`, la superficie destacada por defecto.
- **Tarjeta en oscuro** (`box-shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 24px 50px -34px rgba(0,0,0,.9)` sobre `rgba(255,255,255,.03)` con `blur(12px)`): la misma receta en vidrio.
- **Tarjeta con levante** (`.card-premium-interactive`: al hover sube 4 px en 250 ms y suma un resplandor esmeralda): la llevan las tarjetas clickeables, que además suman `cursor-pointer`, y los KPI de `StatCard`, que levantan sin cursor de clic.
- **Tarjeta de trabajo** (`shadow-xs`): formularios, tablas y listas sobre `bg-card` con borde. Es la sombra más usada del panel; el botón `outline` lleva la misma.
- **Botones con relleno** (`shadow-md shadow-primary/20`, al hover `shadow-lg shadow-primary/30` y sube 2 px; el destructivo, `shadow-red-600/20`): las únicas sombras de color en un control.
- **Capas flotantes** (`shadow-lg` popover, `shadow-xl` menú, `shadow-2xl` diálogo y sheet): sobre un velo negro al 50 % (70 % en oscuro) con `backdrop-blur-xs`. El diálogo va al 95 % de opacidad con `backdrop-blur-md` y el menú al 90 %.

### Named Rules

**The Recipe Rule.** Una vista no inventa su sombra, su degradé ni su vidrio inline. Si la receta no existe, se agrega a `globals.css` con su par claro/oscuro y se documenta acá.

**The Opaque Work Rule.** En claro, lo que se trabaja (tarjetas, tablas, formularios) es opaco. La translucidez es del tema oscuro y de piezas flotantes puntuales (diálogo, menú, la navegación flotante de la landing).

## Shapes

Los escalones chicos salen del radio base `--radius: 0.5rem`: `sm` 4 px, `md` 6 px (ítems chicos, skeleton, tooltip) y `lg` 8 px (botones, campos, chips de opción). `xl` 12 px (tarjetas destacadas, popovers, menús, estados vacíos) y `2xl` 16 px (diálogos, la banda del `PageHeader`, la esquina superior de la hoja inferior) son los de Tailwind y no se mueven si cambia `--radius`; `.card-premium` calcula sus 12 px como `--radius` + 4 px. Pastillas y avatares van en `rounded-full`. Los ítems del riel usan 10 px.

El borde es de 1 px en `border-border` y lo aplica `globals.css` a todo. Tres firmas de forma se repiten: el **borde izquierdo de 3 px** que identifica el estado de un turno en la grilla (legible en densidad alta y para daltónicos, porque la posición no cambia), el **rayado diagonal** (135°, cada 6 px sobre `muted`) de lo bloqueado a propósito, y el **anillo inset** de 1 px de los badges.

## Components

Todas las primitivas viven en `src/components/ui/` y consumen solo tokens semánticos: por eso el cambio de tema no necesita parches por vista. Los íconos son Lucide, la única librería: 16 px en controles, 14 px al lado de texto de 12 px (avisos, variaciones, links en línea), 12 px dentro de un badge y 20 px en la navegación.

### Buttons

- **Shape:** esquina de 8 px (`rounded-lg`); el tamaño `sm` baja a 6 px.
- **Primary:** relleno `primary` con texto `primary-foreground`, 14 px en peso 500, alto de 44 px en el teléfono y 40 px desde 768 px (`h-11 md:h-10`), `px-4`. Uno por vista; si hay dos acciones importantes, la segunda es `outline`. Un botón que mueve plata es siempre `<Button>` (o `bg-primary text-primary-foreground`) y su rótulo dice el efecto y el monto: "Cobrar $ 12.500", no "Confirmar". `bg-emerald-600` está bloqueado por ESLint (con texto blanco no llega a AA).
- **Hover / Focus:** el primario baja al 90 %, sube 2 px y agranda la sombra; al apretar se achica al 97 %. El foco es un anillo de 2 px en `ring` con 2 px de separación, que aparece sin transición. Los asíncronos usan `isLoading`: pelotita `TgBallSpinner` de 16 px más `disabled`, nunca un doble envío silencioso.
- **Secondary / Ghost / Tertiary:** `outline` (borde `input`, fondo `card`, hover `accent`), `secondary`, `ghost` (solo hover `accent`), `destructive` (rojo, se separa del cancelar) y `link` (`text-emerald-700 dark:text-emerald-400`, subrayado al hover). Un botón que es solo ícono (`size="icon"`, 44/40 px) lleva `aria-label` y `Tooltip`.

### Chips

- **Style:** el badge de estado (`StatusBadge`) es una pastilla con tinte del tono al 10 % (15 % en oscuro), rótulo 800/300, anillo inset al 25 % (40 % en oscuro) e ícono de 12 px. El ícono, el rótulo y el tono de cada estado salen de una tabla única por dominio: `src/lib/booking/slot-visual.ts` para los turnos (grilla, reservas y detalle) y un `status-visual.tsx` por módulo para canchas, turnos fijos y equipo. Así el panel y el portal dicen lo mismo, y un badge nuevo no inventa su propio mapa de colores.
- **State:** las opciones elegibles (`RadioChip`) son tarjetas de 44 px de alto con borde `border`; la elegida pasa a borde `primary` y fondo `primary` al 5 % (10 % en oscuro).

### Cards / Containers

- **Corner Style:** 12 px en las destacadas (`.card-premium`), 8 a 12 px en las de trabajo. `.card-premium` vive fuera de `@layer`, así que su radio, fondo, borde y sombra le ganan a cualquier utilidad (`rounded-lg`, `bg-*`, `shadow-*`) que se le sume; el padding sí lo pone cada uso.
- **Background:** `card` sobre el fondo slate; en oscuro, vidrio. No hay primitiva `Card`: la superficie es `.card-premium` o `bg-card` con borde.
- **Shadow Strategy:** ver Elevation & Depth. Una tarjeta de trabajo (formulario, tabla, lista) es `bg-card` con borde y `shadow-xs`; `.card-premium` es para lo destacado.
- **Border:** 1 px `border`; la destacada suma el borde superior esmeralda de 2 px.
- **Internal Padding:** 20 px (`p-5`) en `StatCard`, 24 px (`p-6`) en diálogos y tarjetas de formulario.
- **KPI:** `StatCard` es el único formato de KPI: rótulo, cifra en Archivo tabular, ícono en cuadrado tintado y variación opcional.
- **Encabezado de página (`PageHeader`):** banda de esquina 16 px con el degradé `.page-header-band`, ícono en cuadrado de 48 px con halo esmeralda, título en Archivo y acciones a la derecha. Es el encabezado de las vistas que no usan el hueco de la barra superior (ver Layout).
- **Estados:** el vacío (`EmptyState`) es didáctico (ícono, qué es esto, una acción) con borde punteado, y ofrece la misma acción que la pantalla que lo rodea. El error dice qué pasó, qué podés hacer y qué hace el sistema mientras tanto; nunca "Algo salió mal" solo. `ErrorState` trae "Reintentar", y el 404 y el error de cada grupo de rutas se dibujan dentro de su marco, no en el 404 pelado de Next. La carga es un `.skeleton` con la silueta del contenido final, no un spinner de página.
- **Aviso en línea:** no hay primitiva y hoy conviven recetas a mano. El error lleva tinte `destructive` al 10 %, borde al 30 % y texto `red-700`/`red-300`; la atención, fondo `amber-50` (ámbar al 10 % en oscuro) con anillo o borde ámbar. Unificarlas es trabajo del refinamiento.

### Tables

- **Encabezado:** 12 px, peso 500, mayúsculas con `tracking-wide`, en `muted-foreground`.
- **Filas:** celdas con `p-3`, separadas con `divide-y divide-border` y hover `bg-accent/50`. Nunca `slate-*` fijo: desaparece en oscuro.
- **Cifras:** alineadas a la derecha y tabulares. Si la fila abre un detalle, la fila entera es el blanco de clic, con foco visible.
- **Listas en el teléfono:** `ResponsiveList` muestra tarjetas apiladas debajo de `lg` y la tabla desde `lg`.

### Inputs / Fields

- **Style:** borde de 1 px `border`, fondo `card`, esquina de 8 px, 44/40 px de alto, `px-3.5`, placeholder en `muted-foreground` al 60 %.
- **Focus:** anillo de 2 px en `ring` con separación y el borde pasa a `primary`.
- **Error / Disabled:** el error va debajo del campo en 12 px `destructive` con `role="alert"`; deshabilitado baja al 50 %. El rótulo es siempre visible (el placeholder es un ejemplo, "Ej: …", y tiene que entrar completo).
- **Plata:** todo campo de pesos es `MoneyInput`, que trabaja en centavos (controlado con `valueCents`/`onValueChange`, o no controlado con `defaultValueCents` + `name`, que viaja en un `<input type="hidden">`). Nunca `type="number"` ni `parseFloat` para plata; lo que no es plata (goles, stock, días, porcentajes, minutos) sigue con `type="number"`.

### Navigation

- **Riel (`AdminSidebar`, `lg` en adelante):** 72 px de ancho sobre `card` con borde derecho. En touch (sin hover) cada ítem mide 60×52 px: ícono de 20 px arriba y rótulo de 10 px abajo, siempre visible — en una tablet no hay hover y un ícono solo es una adivinanza. Con mouse (`pointer-fine`) el riel es solo íconos, y al pasar el mouse o tener el foco adentro se despliega en overlay a ~224 px (no empuja el contenido) mostrando el rótulo a la derecha de cada ícono, que no se mueve de su columna; abre en 200 ms con un delay de 120 ms para que cruzarlo con el mouse no lo dispare, cierra sin delay; `motion-reduce` no anima. Activo: fondo `primary` al 10 %, rótulo `emerald-800`/`emerald-300` e ícono `emerald-700`/`emerald-400`. Configuración va aparte, al pie, rotulada "Ajustes"; más abajo, el avatar de 44 px con la cuenta (no se despliega: no tiene ícono+rótulo). Durante la prueba, arriba de Ayuda va un ítem de 60×52 con anillo de 1 px: "Prueba" y los días que quedan, ya en dos líneas de texto y sin cambios al desplegar; los últimos 7 días pasa a ámbar. Al dueño lo lleva a Facturación ("Elegir plan"); al encargado solo le informa. En el cajón es una fila de dos renglones, para que los días no se corten. Un espacio puede agrupar varias rutas y resuelve su estructura interna con pestañas, nunca con submenús.
- **Barra superior (`AdminHeader`):** 60 px sobre `card` con borde inferior. Nombre del complejo en microrrótulo a la izquierda, hueco de vista en el medio, tema a la derecha.
- **Barra inferior (`AdminBottomNav`, debajo de `lg`):** fija, cuatro accesos de al menos 56 px de alto con ícono y rótulo de 11 px; el cuarto, "Más", abre el cajón (`Sheet` lateral) con todos los espacios.
- **Pestañas (`ScrollTabs`):** subrayado de 2 px; la activa lleva borde `emerald-600` y texto `emerald-800`/`emerald-400`. Se deslizan en horizontal si no entran.
- **Paginación (`Pager`):** una sola para todo el panel: "Mostrando 26–50 de 312", números con la primera y la última a mano, la actual en `foreground` sólido, "Anteriores"/"Siguientes" apagados en su lugar cuando no hay adónde ir. Nada de scroll infinito en el panel.
- **Candado de rol:** lo que el encargado no puede usar se ve con candado y el tooltip "Solo el dueño" en vez de desaparecer (hoy, Configuración).

### Dialogs, Sheets and Toasts

- **Diálogo:** esquina de 16 px, `p-6`, 576 px de ancho por defecto (`max-w-xl`); `ConfirmDialog`, el más usado, va en 448 px (`max-w-md`), y el modal de cobro de un turno en 672 px (`max-w-2xl`), para que los dos equipos entren lado a lado. Arriba en el teléfono y centrado desde 768 px. Entra con fade y zoom de 95 a 100 % en 200 ms. Escape y la X cierran.
- **Confirmar o deshacer:** la fricción crece con el costo, en tres escalones. Lo reversible y barato se hace ya y ofrece "Deshacer" en el toast, solo si existe la acción inversa de verdad. Lo costoso pero explicable pasa por `ConfirmDialog` con sus consecuencias listadas. Lo irreversible con plata real suma tipear una frase (`confirmationPhrase`). En el diálogo destructivo el botón rojo va separado del cancelar. Nunca `window.confirm()` ni `alert()`.
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

### Don't:

- **Don't** reemplazar este mundo por uno austero de papel y tinta, sin fondos ni sombras (la dirección "Tablero de partidas", descartada por el dueño el 2026-09-23).
- **Don't** llamar "deuda" a un turno no cobrado, ni pintar de rojo un turno que todavía se está jugando: el rojo es de lo jugado y no cobrado (principio 3 de `PRODUCT.md`). La urgencia se dice con color y texto; el único movimiento es el punto que late en el botón "Cobrar $X" de Hoy (pedido del dueño, 2026-09-25). El anillo que respiraba alrededor de toda la celda de la Grilla (`.slot-alarm-ring`) se eliminó el 2026-09-24 y no vuelve.
- **Don't** usar emerald-500 o emerald-600 como texto sobre claro, ni texto blanco de 14 px sobre emerald-600 o amber-600.
- **Don't** escribir hex inline en JSX, ni sombras, degradés o vidrio inline; tampoco `dark:` sueltos para arreglar una primitiva: se arregla el token.
- **Don't** poner `bg-white` como fondo de página, ni `text-black`/`bg-black`.
- **Don't** agregar librerías de animación (la única excepción es `/onboarding`, con `motion` en `LazyMotion`) ni loops infinitos fuera del skeleton, de la web comercial y del punto de "Cobrar $X" en Hoy.
- **Don't** usar el placeholder como rótulo, emojis como íconos estructurales ni fechas ISO o anglicismos de dashboard ("Revenue", "Booking") frente al usuario.
- **Don't** mostrar un número verificable que no salga de datos reales (prueba social, escasez, contadores): lo trucho descubierto destruye la confianza para pagar la seña y es publicidad engañosa (Ley 24.240).
