# Canchas (admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/canchas`.
> Hermana de `pages/reservas.md`, `pages/abonados.md`, `pages/caja.md`, `pages/dashboard.md` y
> `pages/grilla.md` (2026-07-02/03): mismos tokens, mismo `PageHeader`/badge/empty-state.

## §0 Objetivo y anti-objetivo

Canchas es el listado administrativo de las canchas del complejo: alta, edición, activar/
desactivar. Alcance de esta tarea: **solo el listado** (`page.tsx` + `CourtList.tsx` +
`loading.tsx`) — el editor de precios/horarios (`CourtForm.tsx`, `PricingGrid.tsx`,
`PricingSection.tsx`) ya fue rediseñado por separado y queda **fuera de scope**, sin tocar.

Anti-objetivo: no es un editor de precios (eso vive en `CourtForm`), no agrega campos nuevos al
listado (ej. no se muestra `format`/precio — no estaban en el diseño anterior y agregarlos es
contenido nuevo, no un fix visual).

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | Badge de estado con hue `green-*` genérico (`bg-green-50`/`text-green-700`) en vez del verde de marca | §2.3 (un solo verde: emerald) |
| 2 | Badge sin ícono, solo color + texto | §6.5 (ícono + texto siempre) |
| 3 | `PageHeader` sin `subtitle` con conteo (a diferencia de Reservas/Abonados) | §6.4 |
| 4 | CTA "+ Nueva cancha" vive suelto arriba de la lista, no en el `PageHeader` | §6.4 (acciones a la derecha del header) |
| 5 | CTA/empty-state en `bg-emerald-600`/`rounded-md` hardcodeado en vez de `bg-primary`/`rounded-lg` | §2.1 (token, no primitiva) + §4.2 (radio de botón) |
| 6 | Botones secundarios ("Editar", toggle) en `rounded` (4px, fuera de escala) | §4.2 (radio: `rounded-md` para ítems de acción) |
| 7 | `loading.tsx` genérico (barra + 5 bloques) sin relación con el contenedor real (`max-w-4xl mx-auto px-4 py-8`) ni con la silueta de las cards | §6.7 |
| 8 | Caption de aforo (`{capacity} jugadores`) sin `tabular-nums` | §3 (todo dato numérico) |

## §2 Estado — fuente única

`components/status-visual.tsx` (nuevo): expone `courtStatusVisual(status)` +
`<CourtStatusBadge status={...} />`. 2 estados de `court_status`: `online` → **Online**
(`CheckCircle2`, success) · `offline` → **Offline** (`Ban`, muted — mismo ícono que MASTER §2.6
asigna a "Bloqueado / cancha offline"). Vocabulario **sin cambios** ("Online"/"Offline" ya es el
vocabulario establecido del producto, no una traducción es-AR pendiente — y está fijado por
`tests/e2e/canchas-crud.spec.ts`, que hace `courtCard.getByText('Online'|'Offline')`).

## §3 Header, CTA

- **PageHeader** se muda de `page.tsx` (server) a `CourtList.tsx` (client): el trigger de "+ Nueva
  cancha" abre un form inline (`showForm` state), no navega a una ruta — a diferencia de Abonados
  (CTA = `<Link href="/abonados/nuevo">`), acá el `PageHeader` con sus `actions` tiene que vivir
  donde vive el estado que controla el form. Gana `subtitle`: `"3 canchas · {tenant.name}"` (antes
  "Gestioná las canchas de {tenant.name}", sin conteo — mismo criterio de conteo que
  Reservas/Abonados).
- **CTA visible solo con el form cerrado** (`isAdmin && !showForm`): reproduce el comportamiento
  anterior, donde el botón vivía en el branch de "lista" y desaparecía al abrir `CourtForm`. Si el
  CTA quedara siempre visible en el header (header ahora persiste en ambos branches para no regre-
  dir el comportamiento previo de `page.tsx`, que mostraba el header incluso con el form abierto),
  clickearlo mientras se edita una cancha resetearía `editingCourt` sin aviso — se evita ocultándolo.
- **Texto del CTA sin cambios**: `"+ Nueva cancha"` (con el `+` literal) — **no** se aplicó el
  sentence-case/ícono de Abonados (`"Nueva cancha"` + `UserPlus`) porque
  `tests/e2e/canchas-crud.spec.ts` ancla el nombre accesible del botón dos veces
  (`getByRole('button', { name: '+ Nueva cancha' })`, tests #1 y #3). Cambiar el texto rompe el
  contrato de e2e — se retokenizó color/radio únicamente (`bg-emerald-600` → `bg-primary`,
  `rounded-md` → `rounded-lg`, `text-white` → `text-primary-foreground`).

## §4 Cards — `.card-premium`, radio con excepción fijada por e2e

`CourtCard` ya usaba `.card-premium` (no era un gap real, a diferencia de lo que sugería el
checklist de la tarea). El problema real es el radio: `card-premium` define su propio
`border-radius: calc(var(--radius) + 0.25rem)` (≈ `rounded-xl`), pero el div también trae la
utilidad `rounded-lg` (8px), que gana por especificidad de capa de Tailwind y pisa el radio de la
receta — violación de §4.2 (`card-premium` debería ir con `rounded-xl`, no `rounded-lg`).

**No se corrigió**: `tests/e2e/canchas-crud.spec.ts` ancla las 3 cards de cancha vía
`page.locator('div.rounded-lg').filter({ hasText: courtName })` en los tests #1, #2 y #4. Cambiar
la clase a `rounded-xl` rompe ese selector en los tres tests. **REQUIERE INPUT**: para cerrar esto
bien hay que migrar primero el locator de e2e a algo estable (`data-testid="court-card"` o
`getByRole` sobre un contenedor con rol semántico) y recién ahí corregir el radio — no se hizo acá
para no tocar el contrato de e2e sin autorización explícita.

Badge de estado, ver §2. Caption de aforo gana `tabular-nums`. Botones "Editar" y el toggle
Activar/Desactivar pasan de `rounded` (4px, fuera de escala) a `rounded-md` (§4.2) — sin riesgo de
e2e, esos botones se ubican por rol+nombre (`getByRole('button', { name: 'Editar'|'Desactivar'|
'Activar' })`), no por clase.

## §5 Guided UX

- **Empty state**: ya era didáctico (copy distinto admin/no-admin) — se mantiene, solo se
  retokeniza el CTA (mismo tratamiento que §3, incluyendo el texto `"+ Nueva cancha"` sin cambios
  por consistencia visual con el CTA del header, aunque acá no hay lock de e2e sobre ese botón
  puntual).
- **Loading**: `loading.tsx` pasa de un skeleton genérico (`div.p-6`, sin relación con el layout
  real) a la silueta real: mismo contenedor `<main className="max-w-4xl mx-auto px-4 py-8
  space-y-6">` que `page.tsx`, banda de header + CTA, y 4 cards `card-premium` con la misma
  geometría que `CourtCard` (nombre + badge + caption + 2 acciones).
- **Tooltips (§7.4)**: revisado — no hay controles icon-only en esta vista (todas las acciones
  llevan texto: "Editar", "Activar"/"Desactivar", "+ Nueva cancha"). Nada que cerrar acá.

## §6 Tipografía display — verificado, sin candidato real

El checklist pedía "tipografía display para los números principales". Esta card no muestra
precios ni ningún numeral tipo KPI (el precio vive en `CourtForm`, fuera de scope) — el único
número visible es el aforo (`{capacity} jugadores`), que es un dato de caption (12px), no un
numeral clave §3. Aplicarle `font-display` violaría la "disciplina display" del propio MASTER
("si todo es display, nada es display"). Se dejó como `tabular-nums` en vez de forzar una
jerarquía tipográfica que no corresponde — verificado, no ignorado.

## §7 Deuda declarada / fuera de scope

1. **Radio `rounded-lg` en vez de `rounded-xl`** en `CourtCard` (ver §4) — bloqueado por el
   locator de e2e `div.rounded-lg`. **REQUIERE INPUT** para migrar el test primero.
2. `EmptyState`/`ui/badge.tsx` (primitives) siguen sin tokenizar para sus otros consumidores —
   mismo diferimiento que `pages/abonados.md` §7.1/§7.2.
3. `CourtForm.tsx`/`PricingGrid.tsx`/`PricingSection.tsx` no se tocaron — rediseño ya hecho por
   separado, explícitamente fuera de scope de esta tarea.
4. CTA "+ Nueva cancha" conserva el `+` literal (sin sentence case ni ícono) por el lock de e2e —
   ver §3. Si se quiere unificar con el patrón de Abonados/Reservas, hay que actualizar
   `tests/e2e/canchas-crud.spec.ts` primero (2 asserts) — **REQUIERE INPUT**.

## §8 Contratos de test

- e2e `canchas-crud`: los 4 tests dependen de 3 selectores exactos que **no se tocaron**:
  `getByRole('heading', { name: 'Canchas' })`, `getByRole('button', { name: '+ Nueva cancha' })`,
  `page.locator('div.rounded-lg').filter({ hasText: courtName })`, y los textos de badge
  `'Online'`/`'Offline'`. Ningún unit test cubre `CourtList.tsx` (no existe
  `courts-list.test.tsx`).
