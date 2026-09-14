# Reservas (admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/reservas`
> y `/reservas/[id]`. Hermana de `pages/grilla.md`, `pages/dashboard.md` y `pages/caja.md`:
> mismos tokens, mismo vocabulario §8.5, mismo `Tooltip`.

**Versión:** 2.0 — 2026-09-14 (rediseño: sin `PageHeader` ni hero, ancho completo, tablero por
cancha para Hoy/Próximas — mismo patrón full-bleed que `pages/grilla.md` v2.0 — y filtros en un
popover en vez de píldoras sueltas. La v1.x de abajo describe una pantalla que ya no existe;
`Código` y el resto de las secciones están actualizados a la v2.)
**Código:** `(list)/page.tsx` · `ReservasHeaderBar.tsx` · `CourtBoard.tsx` · `BookingListItem.tsx` ·
`QuickActions.tsx` · `reservas-filters.ts` · `status-visual.tsx` · `[id]/page.tsx`

## §0 Objetivo y anti-objetivo

Reservas es la vista de **auditoría y operación por lista** de todos los turnos del complejo:
donde la grilla responde "¿qué cancha está libre ahora?", Reservas responde "¿qué pasó/va a pasar
con esta reserva puntual?" — buscar por nombre, filtrar por estado, resolver una reserva desde el
listado (confirmar seña, marcar ausente, cancelar) o entrar al detalle.

Anti-objetivo: NO reemplaza la grilla como herramienta de carga rápida por horario/cancha.

## §1 Problemas del diseño anterior

| #   | Problema                                                                                                                                                                              | Regla violada                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `STATUS_VISUALS` (lista) y `STATUS_LABELS` (detalle) duplicados con vocabulario propio ("Pago pendiente", "Completada")                                                               | §8.5 (vocabulario canónico único)    |
| 2   | Badges de estado sin ícono (solo color + texto chico)                                                                                                                                 | §6.5 (ícono + texto siempre)         |
| 3   | Fila de la lista: solo la hora era clickeable, el resto del `<article>` no reaccionaba                                                                                                | §6.6 (fila clickeable entera, Fitts) |
| 4   | Toggles "vista detallada/compacta" y limpiar búsqueda con `title` nativo, sin `Tooltip`                                                                                               | §7.4 (P1.4 de MASTER §13)            |
| 5   | CTA "Ir a la grilla" y píldoras activas en `bg-emerald-600` hardcodeado sin `dark:`                                                                                                   | §2.4/§6.1                            |
| 6   | Empty state sin CTA de primera acción                                                                                                                                                 | §7.2                                 |
| 7   | `[id]/page.tsx`, `BookingActions.tsx`, `BookingCharges.tsx`, `AbonadoCharges.tsx`: 4 `formatARS`/`formatDate` locales duplicados + `border-slate-100` hardcodeado (invisible en dark) | §8.2/§8.3, §6.1                      |
| 8   | `loading.tsx` genérico (barra + 6 rectángulos) sin relación con la silueta real                                                                                                       | §6.7 (skeleton con silueta real)     |

## §2 Estado — fuente única

`status-visual.tsx` (nuevo) reemplaza los dos mapas duplicados. Expone:

- `reservaStatusVisual(booking)`: color de acento + ícono + texto (§2.6), vocabulario §8.5 exacto.
  **Desde el 2026-09-12 distingue "Señada" de "Confirmada", igual que la grilla** (decisión del
  dueño, al bajar el rediseño de Hoy): antes las colapsaba a propósito, con el argumento de que la
  nuance ya vivía en la línea secundaria "Seña pagada ($X)" de cada ítem. Dejó de valer cuando el
  tablero de Hoy pasó a usar el color para decir el estado de la plata, porque ahí el mismo badge
  quedaba sobre "ya tengo parte de la plata" y sobre "cobro todo cuando llegue". Los 6
  estados de negocio son: `pending_payment` → **Esperando seña** (`Clock`, warning) ·
  `confirmed` sin seña paga → **Confirmada** (`HandCoins`, info) · `confirmed` con seña
  paga o capturada → **Señada** (`CheckCircle2`, success) · `completed` → **Jugada** (`CheckCheck`,
  success) · `no_show` → **Ausente** (`UserX`, destructive) · `canceled_*` → **Cancelada**
  (`XCircle`, muted). `expired` → **Expirada** (muted) y `type==='block'` → **Bloqueado** (`Ban`,
  muted) se mantienen aparte del vocabulario de negocio. (Corrección de drift, 2026-09-14: una
  versión anterior de este doc decía que `pending_payment` se había renombrado a "Pagando ahora" —
  eso nunca llegó a `slot-visual.ts`, la fuente única; el label real en código y en el e2e
  `reservas-crud.spec.ts` siempre fue **"Esperando seña"**. Fuente única hoy es `SLOT_STATES` en
  `src/lib/booking/slot-visual.ts`, compartida con la grilla desde Fase 3; `status-visual.tsx`
  quedó como adaptador delgado sobre `bookingBadgeVisual`.)
- `<ReservaStatusBadge visual={...} />`: pill dual-theme §6.5 (ícono + texto, nunca color solo).
  Se usa en `BookingListItem` (lista) y en `[id]/page.tsx` (fila "Estado" del `dl`, antes texto
  plano).

## §3 Tarjeta — fila clickeable + `@container`

Cada `<article>` de `BookingListItem` gana un `<Link>` estirado (`absolute inset-0`) al detalle:
toda la superficie de la fila navega, no solo la hora (Fitts). El `aria-label` descriptivo
("Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada") vive en el `<article>` **y** en el
`Link` (el primero para landmarks/tests, el segundo porque es el elemento realmente enfocable).

**v2.0 — una sola variante, `@container` en vez de viewport.** La vista compacta (`?vista=
compacta`) se eliminó: era una segunda variante que había que mantener sincronizada con la
detallada y que el rediseño de tablero (§4) vuelve redundante — la densidad ahora la da tener 8
turnos en una columna angosta, no una fila más chica. Un `?vista=` viejo en un link
compartido/bookmark se ignora en silencio. La tarjeta es `@container`: el layout interno (fila vs.
columna) y `QuickActions` (abajo) responden al ancho REAL del contenedor, no al viewport — la
misma tarjeta puede estar en una columna angosta del tablero (`CourtBoard`, ~280px, aun en
escritorio) o en la grilla ancha de Historial (`xl:grid-cols-2`). Prop `showCourt` (default
`true`): dentro de una columna de `CourtBoard` el nombre de cancha ya es el header de la columna,
así que se apaga (`showCourt={false}`) para no repetirlo en la línea secundaria; Historial mezcla
canchas por fecha, ahí se necesita. Precio `0` (turno sin costo, ej. cortesía) muestra "Sin costo"
en vez de "$ 0".

`QuickActions` se posiciona `relative z-10` para ganar la pulseada de stacking contra el link
estirado — sin eso, "Cancelar" navegaría al detalle en vez de abrir el diálogo. Hover de fila:
`hover:bg-accent/50` (§6.6) sumado al acento de borde existente; el tiempo cambia a
`text-emerald-700`/`dark:text-emerald-400` vía `group-hover` (ya no es su propio link, así que no
puede tener su propio estado hover).

**`QuickActions` v2.0**: la fila ancha/angosta dejó de decidirse por viewport (`sm:`) y pasó a
`@container` (`@sm:`) — el mismo criterio que la tarjeta. Tarjeta ancha (`@sm`+): la fila de
botones de siempre ("Confirmar pago", o "Completada"/"Cobrar" + "Ausente" + "Cancelar"). Tarjeta
angosta (columnas del tablero, `< @sm`): la acción primaria dejó de esconderse en el menú (H079)
— es un botón visible sin abrir nada — y lo secundario (Ausente/Cancelar) va en un menú chico al
lado; `pending_payment` no tiene secundarias, así que ahí no hay menú, solo el botón. Las dos
variantes viven juntas en el DOM (CSS decide cuál se ve, no un `if`) — mismo patrón que ya usaban
el resto de vistas responsive del panel (ej. `GridHeaderBar`).

## §4 Header, filtros y tablero (v2.0 — rediseño 2026-09-14)

- **Sin hero, ancho completo.** `PageHeader` se eliminó del todo — no queda banda de encabezado ni
  ícono halo. `/reservas` pasa a ser full-bleed (`admin-layout-shell.tsx`: la variable que antes
  se llamaba `isGrilla` pasó a `isFullBleed` e incluye la ruta exacta `/reservas`, mismo
  tratamiento de viewport fijo que `/grilla` — `/reservas/[id]` sigue con el layout normal de
  `max-w-7xl`). Queda un `<h1 className="sr-only">Reservas</h1>` solo para el árbol de
  accesibilidad: el nombre visible de la pantalla lo sigue dando `GrillaTabs` (Grilla|Reservas),
  como en Fase 4.
- **`ReservasHeaderBar.tsx`** (nuevo, `'use client'`) reemplaza a `ReservasToolbar.tsx` (borrado) y
  a las tres `<nav>` de chips de la v1 (rango, estado, cancha). Cuelga en UN solo
  `AdminHeaderSlot` junto a `GrillaTabs`: el segmento Hoy/Próximas/Historial (siguen siendo
  `<Link>`, no `router.replace` — cambiar de scope es navegar, no filtrar), la búsqueda (misma
  lógica URL-based con debounce de 300ms que tenía `ReservasToolbar`, migrada acá), el botón
  "Filtros" y un contador mudo "N reservas" (visible recién en `xl`). En `< lg` la barra superior
  ya la ocupa la marca: el mismo contenido (menos el contador) se repite en una fila arriba del
  tablero, en el cuerpo de la página — el corte es SIEMPRE por CSS (`hidden lg:flex` / `lg:hidden`
  sobre nodos duplicados), nunca por un hook de viewport (mismo criterio que §3 del MASTER para la
  celda de la grilla). Los dos renders comparten el mismo estado de React pero cada `<input>` de
  búsqueda lleva su propio `id` (no pueden compartirlo, los dos existen a la vez en el DOM).
- **Filtros → `Popover`, no chips sueltos.** "Estado" (radio con contador al lado de cada opción,
  mismas 6 opciones que las píldoras de la v1: Todas/Confirmadas/Esperando seña/Completadas/
  Ausentes/Canceladas) y "Cancha" (radio, oculto con una sola cancha — mismo criterio H110 que
  antes) viven en un `RadioChipGroup` adentro del popover. El trigger muestra un badge con la
  cantidad de filtros activos (0–2) y "Limpiar filtros" aparece solo cuando hay algo que limpiar.
  Elegir una opción pega `router.replace` preservando el resto de los params y resetea `pagina` —
  ya no es una navegación por `<Link>` como en la v1.
- ~~**CTA "Ir a la grilla"**~~ — sigue eliminado (Fase 4): la pestaña Calendario de `GrillaTabs` es
  el mismo destino.
- **Tablero por cancha (`CourtBoard.tsx`, nuevo) para Hoy y Próximas.** Antes "Hoy" agrupaba en
  secciones apiladas (una cancha abajo de la otra); ahora es una columna por cancha —TODAS las del
  tenant, en el orden de `listCourts`, o solo la elegida por el filtro de cancha— lado a lado, cada
  una con su propio scroll en `lg`+ (`overflow-y-auto` por columna): una cancha con 15 turnos nunca
  empuja a la de al lado. Una cancha sin reservas muestra su columna igual, con el texto "Sin
  reservas" — nunca desaparece en silencio. Próximas agrupa además por fecha DENTRO de cada
  columna, con separador sticky. En `< lg` las columnas miden 85% de ancho (la siguiente cancha
  asoma) y alto natural, sin scroll anidado — la página entera scrollea (el root de
  `(list)/page.tsx` es el `overflow-y-auto` de ese caso; en `lg`+ es `overflow-hidden` y el
  tablero es quien scrollea). Historial NO usa el tablero (mezcla canchas por fecha, un header de
  columna no aplicaría): sigue siendo una lista agrupada por fecha con la misma tarjeta,
  `xl:grid-cols-2`. La paginación sigue existiendo para los 3 scopes, debajo del tablero/lista.

## §5 Guided UX

- **Tooltips** (cierra MASTER §13 P1.4): "Limpiar búsqueda" y el trigger del menú contextual de la
  tarjeta angosta (`MoreVertical`) tienen `<Tooltip>` (delay 300ms) además del `aria-label` que ya
  tenían — el `aria-label` sigue siendo la fuente de verdad para el nombre accesible, el tooltip es
  el refuerzo visual §7.4. (El toggle "Vista detallada"/"Vista compacta" que tenía su propio
  tooltip se eliminó junto con la vista compacta, v2.0 §3.)
- **Empty state** (fix §7.2): además de ícono + título + descripción, ahora tiene CTA "Cargar una
  reserva" → `/grilla` (antes vacío mudo sin acción).
- **Loading**: `loading.tsx` pasa de skeleton genérico a silueta real. v2.0: sin banda de header
  (se fue con `PageHeader`), una fila chica de toolbar en `< lg` y 3 columnas de cancha —el mismo
  tablero de `CourtBoard`—, mismo patrón que `pages/grilla.md`.

## §6 Formato (§8.2/§8.3 normativa)

- **Entero** (`formatArs` de `lib/format`, fuente única): precios, seña, montos de cobro/saldo en
  lista y detalle — es la fila de "Player + grilla + listados" de §8.2 (`$ 12.500` sin decimales).
- **Fecha** (`formatDateLong`): reemplaza el `formatDate`/`new Date(...).toLocaleDateString(...)`
  local de `[id]/page.tsx`.
- Mueren 4 `formatARS`/1 `formatDate` locales (`[id]/page.tsx`, `BookingActions.tsx`,
  `BookingCharges.tsx`, `AbonadoCharges.tsx`) — mismo patrón que P0.2 en `pages/caja.md`.
- Seña en el `dl` del detalle: el estado crudo (`paid`/`pending`/`refunded`) pasa a texto
  es-AR ("pagada"/"pendiente"/"reembolsada") en vez de mostrar el enum. Mismo fix en "Método de
  pago" (`cash`/`transfer`/`mercadopago`/`other` → texto es-AR) y en el estado de seña de
  `BookingCharges` (antes `(pending)` crudo entre paréntesis).

## §7 Deuda declarada / fuera de scope

1. `EmptyState` y `ConfirmDialog` siguen con clases light hardcodeadas (P0.1 §13 — se tokenizan
   en su propio barrido de primitives, mismo diferimiento que `pages/caja.md` §10.2).
2. `[id]/page.tsx` mantiene el patrón "back-link + `h1`" (no `PageHeader`) — es el mismo patrón
   que las demás vistas de detalle del admin (ej. `jugadores/[playerId]`); adoptar `PageHeader`
   ahí es un cambio más amplio, no específico de Reservas.
3. La lista sigue siendo `<article>`/`<ul>` (no `<table>` literal): la fila mezcla acento lateral,
   badge, acciones rápidas y layout responsive mobile/desktop que un `<table>` complicaría sin
   beneficio real. Se aplican los _principios_ de §6.6 (fila clickeable entera, hover
   `bg-accent/50`, `tabular-nums`) sin migrar la marca semántica.
4. `tests/e2e/reservas-crud.spec.ts` TEST 2/3 (radios "Sin reembolso"/"Con reembolso",
   "¿Reembolsar la seña?") ya no coinciden con el flujo actual de `BookingActions.tsx`
   ("¿Quién cancela?" + tipo complejo/jugador) — deuda de test preexistente, no introducida por
   este rediseño; **REQUIERE INPUT** si se quiere reparar en otra tarea.

## §8 Contratos de test

- e2e `reservas-crud`: TEST 1 y TEST 5 usan el vocabulario vigente ("Jugada" en vez de
  "Completada", **"Esperando seña"** — ver corrección de drift en §2 — en vez de "Pago pendiente").
  El resto de selectores (roles, botones, `#cancel-reason`) intacto. El flujo `goto('/reservas')` →
  `article` por nombre → botón "Confirmar pago" → diálogo → "Confirmar" → badge "Señada" no cambió
  con el tablero v2.0: sigue siendo un `<article>` con el mismo `aria-label`, ahora adentro de una
  columna de `CourtBoard` en vez de una sección apilada.
- Unit `reservas-page-render` (regiones por cancha, popover de filtros, sr-only `h1`, lista de
  Historial), `reservas-header-bar` (búsqueda + filtros vía `router.replace`; reemplaza a
  `reservas-toolbar`, borrado junto con `ReservasToolbar.tsx`), `reservas-quick-actions` (fila
  ancha + tarjeta angosta, scopeadas por `data-testid` porque las dos variantes conviven en el DOM
  — jsdom no calcula `@container` real): pasan sin cambios de contrato de accesibilidad —
  `aria-label` del `<article>` se preserva explícitamente pese al `Link` estirado.
