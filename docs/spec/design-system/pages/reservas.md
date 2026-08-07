# Reservas (admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/reservas`
> y `/reservas/[id]`. Hermana de `pages/grilla.md`, `pages/dashboard.md` y `pages/caja.md`
> (2026-07-02): mismos tokens, mismo vocabulario §8.5, mismo `PageHeader`/`Tooltip`.

## §0 Objetivo y anti-objetivo

Reservas es la vista de **auditoría y operación por lista** de todos los turnos del complejo:
donde la grilla responde "¿qué cancha está libre ahora?", Reservas responde "¿qué pasó/va a pasar
con esta reserva puntual?" — buscar por nombre, filtrar por estado, resolver una reserva desde el
listado (confirmar seña, marcar ausente, cancelar) o entrar al detalle.

Anti-objetivo: NO reemplaza la grilla como herramienta de carga rápida por horario/cancha.

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | `STATUS_VISUALS` (lista) y `STATUS_LABELS` (detalle) duplicados con vocabulario propio ("Pago pendiente", "Completada") | §8.5 (vocabulario canónico único) |
| 2 | Badges de estado sin ícono (solo color + texto chico) | §6.5 (ícono + texto siempre) |
| 3 | Fila de la lista: solo la hora era clickeable, el resto del `<article>` no reaccionaba | §6.6 (fila clickeable entera, Fitts) |
| 4 | Toggles "vista detallada/compacta" y limpiar búsqueda con `title` nativo, sin `Tooltip` | §7.4 (P1.4 de MASTER §13) |
| 5 | CTA "Ir a la grilla" y píldoras activas en `bg-emerald-600` hardcodeado sin `dark:` | §2.4/§6.1 |
| 6 | Empty state sin CTA de primera acción | §7.2 |
| 7 | `[id]/page.tsx`, `BookingActions.tsx`, `BookingCharges.tsx`, `AbonadoCharges.tsx`: 4 `formatARS`/`formatDate` locales duplicados + `border-slate-100` hardcodeado (invisible en dark) | §8.2/§8.3, §6.1 |
| 8 | `loading.tsx` genérico (barra + 6 rectángulos) sin relación con la silueta real | §6.7 (skeleton con silueta real) |

## §2 Estado — fuente única

`status-visual.tsx` (nuevo) reemplaza los dos mapas duplicados. Expone:

- `reservaStatusVisual(booking)`: color de acento + ícono + texto (§2.6), vocabulario §8.5 exacto
  — a diferencia de la grilla (`BookingCard.slotVisual`), acá **no** se distingue "Señada" de
  "Confirmada" (esa nuance ya vive en la línea secundaria "Seña pagada ($X)" de cada ítem); los 5
  estados de negocio son: `pending_payment` → **Esperando seña** (`Clock`, warning) ·
  `confirmed` → **Confirmada** (`HandCoins`, info) · `completed` → **Jugada** (`CheckCheck`,
  success) · `no_show` → **Ausente** (`UserX`, destructive) · `canceled_*` → **Cancelada**
  (`XCircle`, muted). `expired` → **Expirada** (muted) y `type==='block'` → **Bloqueo** (`Ban`,
  muted) se mantienen aparte del vocabulario de negocio.
- `<ReservaStatusBadge visual={...} />`: pill dual-theme §6.5 (ícono + texto, nunca color solo).
  Se usa en `BookingListItem` (lista) y en `[id]/page.tsx` (fila "Estado" del `dl`, antes texto
  plano).

## §3 Lista — fila clickeable + hover

Cada `<article>` de `BookingListItem` gana un `<Link>` estirado (`absolute inset-0`) al detalle:
toda la superficie de la fila navega, no solo la hora (Fitts). El `aria-label` descriptivo
("Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada") vive en el `<article>` **y** en el
`Link` (el primero para landmarks/tests, el segundo porque es el elemento realmente enfocable).

`QuickActions` (los botones inline + el menú contextual mobile) se posiciona `relative z-10` para
ganar la pulseada de stacking contra el link estirado — sin eso, "Cancelar" navegaría al detalle
en vez de abrir el diálogo. Hover de fila: `hover:bg-accent/50` (§6.6) sumado al acento de borde
existente; el tiempo cambia a `text-emerald-700`/`dark:text-emerald-400` vía `group-hover` (ya no
es su propio link, así que no puede tener su propio estado hover).

## §4 Header, CTA y píldoras

- **PageHeader**: ya tenía ícono halo (`CalendarCheck`) — se mantiene. Subtítulo ahora es
  contextual en los 3 scopes (antes solo en "Hoy"): `"mié 2 de julio · 3 reservas"` en Hoy,
  `"3 reservas"` en Próximas/Historial (fix #6.4 "subtítulo = fecha/contexto").
- ~~**CTA "Ir a la grilla"**~~ — **eliminado en Fase 4.** Esta pantalla dejó de ser un módulo
  propio: es la pestaña **Lista** del espacio **Grilla** (`GrillaTabs`, arriba del PageHeader,
  con Calendario y Lista). La pestaña Calendario hace exactamente lo que hacía el CTA, y dos
  caminos al mismo destino en la misma pantalla son ruido. La ruta `/reservas` no se movió.
- **Píldoras de filtro** (activa): `bg-emerald-600` → `bg-primary text-primary-foreground`; el
  contador interno pasa de `bg-emerald-700` fijo a `bg-primary-foreground/20` (translúcido sobre
  el propio pill, dual-theme gratis sin nuevo token).
- **Tabs de rango** (Hoy/Próximas/Historial): ya usaban tokens (`bg-muted`/`bg-card`) — sin
  cambios.

## §5 Guided UX

- **Tooltips** (cierra MASTER §13 P1.4): toggles "Vista detallada"/"Vista compacta", "Limpiar
  búsqueda" y el trigger del menú contextual mobile (`MoreVertical`) ganan `<Tooltip>` (delay
  300ms) además del `aria-label` que ya tenían — el `aria-label` sigue siendo la fuente de verdad
  para el nombre accesible, el tooltip es el refuerzo visual §7.4.
- **Empty state** (fix §7.2): además de ícono + título + descripción, ahora tiene CTA "Cargar una
  reserva" → `/grilla` (antes vacío mudo sin acción).
- **Loading**: `loading.tsx` pasa de skeleton genérico a silueta real (header + tabs + toolbar +
  píldoras + 2 secciones de filas), mismo patrón que `pages/grilla.md`.

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
   beneficio real. Se aplican los *principios* de §6.6 (fila clickeable entera, hover
   `bg-accent/50`, `tabular-nums`) sin migrar la marca semántica.
4. `tests/e2e/reservas-crud.spec.ts` TEST 2/3 (radios "Sin reembolso"/"Con reembolso",
   "¿Reembolsar la seña?") ya no coinciden con el flujo actual de `BookingActions.tsx`
   ("¿Quién cancela?" + tipo complejo/jugador) — deuda de test preexistente, no introducida por
   este rediseño; **REQUIERE INPUT** si se quiere reparar en otra tarea.

## §8 Contratos de test

- e2e `reservas-crud`: TEST 1 y TEST 5 actualizados al vocabulario nuevo ("Jugada" en vez de
  "Completada", "Esperando seña" en vez de "Pago pendiente"). El resto de selectores (roles,
  botones, `#cancel-reason`) intacto.
- Unit `reservas-page-render`, `reservas-quick-actions`, `reservas-toolbar`: pasan sin cambios de
  contrato — `aria-label` del `<article>` se preserva explícitamente pese al `Link` estirado.
