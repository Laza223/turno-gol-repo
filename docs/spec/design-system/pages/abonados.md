# Abonados (admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/abonados`.
> Hermana de `pages/reservas.md`, `pages/caja.md`, `pages/dashboard.md` y `pages/grilla.md`
> (2026-07-02/03): mismos tokens, mismo `PageHeader`/badge/empty-state, mismo vocabulario §8.

## §0 Objetivo y anti-objetivo

Abonados es el listado administrativo de turnos fijos recurrentes (grupos que juegan el mismo
día/horario todas las semanas): alta, pausa, reactivación y baja. A diferencia de Reservas, **no
tiene vista de detalle** (`/abonados/[id]`) — el listado + los diálogos de acción (pausar/
reactivar/cancelar) son toda la superficie de la feature.

Anti-objetivo: NO es un CRM de jugadores (eso es `/jugadores`); un abonado puede o no estar
vinculado a un `player_id`.

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | Badge de estado (`ui/Badge` + `STATUS_VARIANT`/`STATUS_LABELS`) sin ícono, solo color + texto | §6.5 (ícono + texto siempre) |
| 2 | `formatARS` local duplicado (mismo patrón que Reservas tenía 4 copias) | §8.2 (helper único) |
| 3 | Acciones "Pausar" en `text-yellow-700` sin par `dark:` (invisible/bajo contraste en dark) | §2.4 (dual-theme) |
| 4 | "Reactivar" en `text-green-700` (hue fuera de la paleta medida en §2.4, no `emerald`) | §2.3 (un solo verde de marca) |
| 5 | Píldoras de filtro activas en `bg-foreground text-background` — tokens válidos pero fuera del acento de marca que usan Reservas/Caja para el mismo patrón | Consistencia cross-página |
| 6 | CTA "+ Nuevo Abonado" con signo `+` literal en vez de ícono Lucide, y Title Case en "Abonado" | §8.4 (sentence case) |
| 7 | Filas de tabla sin `hover:bg-accent/50` ni `tabular-nums` en columnas numéricas | §6.6 |
| 8 | Empty state con copy fijo ("Creá el primer abonado…") incluso filtrando por un estado sin resultados — mensaje engañoso | §7.2 (didáctico y honesto) |
| 9 | `PageHeader` sin `subtitle` (a diferencia de Grilla/Reservas/Caja) | §6.4 |
| 10 | `loading.tsx` genérico (barra + 5 filas) sin relación con la silueta real (banda de header, píldoras) | §6.7 |

## §2 Estado — fuente única

`status-visual.tsx` (nuevo, mismo patrón que `reservas/status-visual.tsx`): expone
`abonadoStatusVisual(status)` + `<AbonadoStatusBadge status={...} />`. 3 estados de `AbonadoStatus`:
`active` → **Activo** (`CheckCircle2`, success) · `paused` → **Pausado** (`PauseCircle`, warning) ·
`canceled` → **Cancelado** (`XCircle`, muted). Vocabulario idéntico al que ya usaban
`STATUS_LABELS` (sin cambios de texto — los tests de `abonados-list.test.tsx` lo fijan), solo se
agrega el ícono y se tokeniza el tinte (receta §6.5, igual a `ReservaStatusBadge`).

## §3 Tabla — hover, alineación, sin fila clickeable

`hover:bg-accent/50` en cada `<tr>` (§6.6). Columnas "Precio por turno"/"Precio mensual"
right-align + `tabular-nums`; "Día / horario" también `tabular-nums` (es un rango horario, mismo
criterio que `BookingListItem`). Header de tabla pasa a `text-xs uppercase tracking-wide
text-muted-foreground` (antes texto normal sin jerarquía).

**Sin fila clickeable a un detalle**: a diferencia de Reservas, Abonados no tiene
`/abonados/[id]` — las acciones (Pausar/Reactivar/Cancelar) ya viven inline en la fila vía
diálogos. No se agregó un Link estirado porque no hay destino; ver §7.4 REQUIERE INPUT.

## §4 Header, CTA y píldoras

- **PageHeader**: ya tenía ícono halo (`Users`) — se mantiene. Gana `subtitle` contextual:
  `"3 abonados"` sin filtro, `"3 abonados · Activos"` con un filtro de estado activo (mismo
  criterio que el subtítulo de Reservas, adaptado a que acá el "scope" es el filtro de estado en
  vez del rango de fechas).
- **CTA "+ Nuevo Abonado"** → `bg-primary text-primary-foreground` + ícono `UserPlus` + texto
  "Nuevo abonado" (sentence case §8.4, sin el `+` literal — mismo tratamiento que el CTA de
  Reservas/Dashboard). Radio `rounded-md` → `rounded-lg` (§4.2: los botones son `rounded-lg`, no
  `rounded-md` — ese radio es para inputs/ítems de menú).
- **Píldoras de filtro** (activa): `bg-foreground text-background` → `bg-primary
  text-primary-foreground` (mismo acento que Reservas para el mismo patrón de UI; ambos eran
  tokens válidos, esto es consistencia cross-página, no un fix de contraste).

## §5 Guided UX

- **Empty state** (fix §7.2): ahora recibe `filterLabel` (ej. `"activos"`) desde `page.tsx`. Sin
  filtro: "Sin abonados registrados" / "Creá el primer abonado para que aparezca acá." Con
  filtro y 0 resultados: "Sin abonados {filterLabel}" / "No hay abonados con este estado. Probá
  otro filtro o cargá uno nuevo." — evita el mensaje engañoso de "creá el primero" cuando en
  realidad ya hay abonados en otro estado.
- **Loading**: `loading.tsx` pasa de skeleton genérico a silueta real (banda de header + 4
  píldoras + header de tabla + 5 filas), mismo patrón que `pages/reservas.md`/`pages/grilla.md`.
- **Tooltips (§7.4)**: revisado — no hay controles icon-only en esta vista tras el rediseño (el
  CTA lleva ícono + texto, no icon-only). Nada que cerrar acá; se deja constancia de que se
  verificó, no que se omitió.

## §6 Formato (§8.2/§8.4 normativa)

- **Entero** (`formatArs` de `lib/format`, fuente única): precio por turno y precio mensual —
  mismo criterio que "listados" de §8.2. Muere el `formatARS` local (mismo patrón que P0.2 de
  `pages/caja.md`/`pages/reservas.md`).
- **Acciones inline**: "Pausar" `text-yellow-700` (sin `dark:`) → `text-amber-700
  dark:text-amber-400` (hue warning consistente con el resto de la app — mismo par usado en
  `BookingCharges`/`ReactivatePreview`). "Reactivar" `text-green-700 dark:text-green-400` →
  `text-emerald-700 dark:text-emerald-400` (§2.3: un solo verde de marca, no `green` suelto).
  "Cancelar" ya usaba `text-destructive` — sin cambios.

## §7 Deuda declarada / fuera de scope

1. `EmptyState` (primitive) sigue con clases light hardcodeadas (P0.1 §13 — se tokeniza en su
   propio barrido, mismo diferimiento que `pages/caja.md` §10.2 y `pages/reservas.md` §7.1).
2. `ui/badge.tsx` (Badge) queda sin uso en esta vista (reemplazado por el pill local de
   `status-visual.tsx`, mismo criterio que Reservas) pero el primitive en sí sigue sin tokenizar
   para sus otros consumidores (`AbonadoForm.tsx`, staff invite, super-admin) — fuera de scope.
3. **No hay fila clickeable a detalle**: no existe `/abonados/[id]`. Si en el futuro se quisiera
   una ficha de abonado (historial de pagos, turnos generados), es una decisión de producto nueva,
   no un fix visual — **REQUIERE INPUT** si se quiere construir esa vista.
4. **Píldoras sin contador por estado**: Reservas muestra un contador numérico en cada píldora de
   filtro (requiere una query de conteo por estado, `countTenantBookingsByStatus`). Abonados no
   tiene el equivalente (`getAbonados` no devuelve conteos agregados) y agregarlo es un cambio de
   query, fuera del contrato "solo visual y formato" de esta tarea — **REQUIERE INPUT** si se
   quiere paridad completa con Reservas.
5. `/abonados/nuevo` (wizard de alta) no se tocó — mismo criterio que Reservas no tocó `/grilla`
   (la carga real de turnos vive en otra vista); queda pendiente para su propio rediseño si
   corresponde.
6. `text-amber-700` (link "Pausar", light mode) da ≈5,02:1 sobre `--card` — pasa AA pero es un
   valor que MASTER §2.4 no tiene verificado en su tabla (solo mide `amber-600`/`amber-950` para
   fills) y queda más cerca del piso 4,5:1 que el par `emerald-700` (5,5:1). No es un bug —
   funciona en ambos temas— pero conviene sumar `amber-700`/`amber-800` a la tabla de §2.4 en el
   próximo barrido de contraste en vez de asumir por analogía con `emerald`.

## §8 Contratos de test

- Unit `abonados-list.test.tsx`: pasa sin cambios de contrato — los textos de badge
  ('Activo'/'Pausado'/'Cancelado') y los `getByRole('button', {name: 'Pausar'|'Cancelar'|
  'Reactivar'})` no cambiaron (solo color/ícono agregado con `aria-hidden`, que no afecta el
  nombre accesible).
- e2e `abonados-crud`: mismos selectores por rol/texto; no se tocó el flujo de `/abonados/nuevo`.
