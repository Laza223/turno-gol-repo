# Staff / Equipo (admin) — spec de vista

> Complementa a `MASTER.md` v2 (ley general). Acá viven las decisiones específicas de `/staff`.
> Hermana de `pages/reservas.md`, `pages/abonados.md`, `pages/canchas.md`, `pages/caja.md`,
> `pages/dashboard.md` y `pages/grilla.md`: mismos tokens, mismo `PageHeader`/badge/empty-state.

## §0 Objetivo y anti-objetivo

Staff (`/staff`, título "Equipo") es el listado admin-only de miembros del equipo del complejo:
invitar, cambiar rol (Administrador/Encargado), desactivar, reenviar invitación. No tiene vista de
detalle por miembro.

Anti-objetivo: no es un editor de permisos granular (2 roles fijos, sin RBAC configurable — ver
`modules/staff/roles.ts`); no toca `InviteStaffDialog.tsx` (formulario del modal, fuera de scope de
un rediseño de listado, mismo criterio que Canchas dejó `CourtForm` fuera).

## §1 Problemas del diseño anterior

| # | Problema | Regla violada |
|---|---|---|
| 1 | Badge de rol (`ROLE_BADGE_CLASSES`) y de estado (verde/muted inline) sin ícono, solo color + texto | §6.5 (ícono + texto siempre) |
| 2 | Badge de rol en `violet`/`sky`, hues sin declarar en §2.5/§2.6 | §2.1/§2.3 |
| 3 | CTA "Agregar miembro del equipo" con `bg-emerald-600 hover:bg-emerald-500` hardcodeado sobre el primitive `Button` (override redundante con su variant default, aún no tokenizado — P0 §13.1) | §2.1 (token, no primitiva) |
| 4 | Empty state mudo: ícono `Mail` + una línea, sin CTA | §7.2 (didáctico) |
| 5 | Tabla con `divide-slate-100` hardcodeado, `hover:bg-accent` sin opacidad, celdas `px-6 py-4` (más ancho que la densidad base `p-3` de Reservas/Abonados), columna de acciones sin header de texto | §6.6 |
| 6 | Trigger icon-only del menú de acciones (`MoreHorizontal`, `aria-label="Opciones"`) sin `Tooltip` | §7.4 |
| 7 | `loading.tsx` con barras sueltas, sin banda de header real ni columnas de badge | §6.7 |

## §2 Estado — fuente única

`status-visual.tsx` (nuevo, mismo patrón que `abonados/status-visual.tsx`): expone
`<StaffRoleBadge role={...} />` + `<StaffStatusBadge isActive={...} />`.

- **Rol** no es un estado de §2.6 (esa tabla cubre reservas/cuentas, no jerarquía de permisos): se
  resolvió por analogía con §2.3 ("pocos susurran: acentos... emerald texto/borde") — `admin`
  (`ShieldCheck`, tinte emerald) es el único acento emerald del listado fuera del CTA, porque
  resalta el rol de acceso total; `manager` (`Users`, `bg-muted`) queda en el tono neutro por ser
  el rol por defecto al invitar (`DEFAULT_INVITE_ROLE` en `roles.ts`). Vocabulario sin cambios
  (`STAFF_ROLE_LABELS`: "Administrador"/"Encargado").
- **Estado de cuenta**: `active` → **Activo** (`CheckCircle2`, success) · `inactive` → **Inactivo**
  (`XCircle`, muted) — mismo patrón success/muted que `abonados` (`canceled`) y `canchas`
  (`offline`). Vocabulario sin cambios, fijado por `tests/e2e/staff-crud.spec.ts`
  (`getByText('Inactivo')`).

## §3 Header, CTA

`PageHeader` ya tenía ícono halo (`UserCog`) y `subtitle` con conteo de activos — sin cambios
estructurales. El CTA se retokeniza: deja de usar el primitive `Button` (P0 §13.1, aún no
migrado — override `bg-emerald-600` era redundante con su variant default) y pasa a un `<button>`
raw + `bg-primary`/`text-primary-foreground`, misma receta canónica que Abonados/Canchas/Reservas.

`InviteStaffButton` gana una prop `label` opcional: el header conserva el texto default
("Agregar miembro del equipo", fijado por e2e #1 vía `getByRole('button', { name:
/Agregar miembro del equipo/i })`); el empty state usa `"Invitar al primer miembro"` para no
tener 2 botones con el mismo nombre accesible si ambos renderizaran a la vez.

## §4 Tabla

Densidad `p-3` por celda (antes `px-6 py-4`, §6.6 "base, nunca inflar por estética"),
`divide-border` (antes `divide-slate-100`), hover `bg-accent/50` con `transition-colors` (antes
`bg-accent` sin opacidad), header "Acciones" gana texto (antes `<th>` vacío).

**Sin fila clickeable a un detalle**: no existe `/staff/[id]` — mismo criterio que
`pages/abonados.md` §3 (no se agrega un `Link` estirado porque no hay destino).

## §5 Guided UX

- **Empty state**: pasa del bloque ad-hoc (ícono `Mail` mudo) a `EmptyState` (ícono `UserCog` +
  copy + CTA "Invitar al primer miembro"). Nota: este estado es prácticamente inalcanzable en
  producción — `requireAdminStaff` exige que quien ve la página ya sea miembro activo del tenant,
  por lo que `members.length` nunca es 0 en runtime real. Se deja de todos modos por disciplina
  defensiva (ya existía un tratamiento propio, aunque mudo, antes de este rediseño).
- **Loading**: `loading.tsx` pasa de barras sueltas a la silueta real (banda de `PageHeader` +
  tabla de 4 columnas con 2 pills de badge), mismo patrón que el resto de listados admin.
- **Tooltip (§7.4)**: el trigger icon-only del dropdown de acciones (`aria-label="Opciones"`) gana
  `<Tooltip>`, mismo patrón compuesto que `reservas/QuickActions.tsx`
  (`Tooltip` → `TooltipTrigger asChild` → `DropdownMenuTrigger asChild` → `Button`).

## §6 Deuda declarada / fuera de scope

1. `EmptyState` (primitive) sigue con clases light hardcodeadas — mismo diferimiento que
   `pages/abonados.md` §7.1, `pages/canchas.md` §7.2, `pages/caja.md` §10.2 y
   `pages/reservas.md` §7.1: se tokeniza en su propio barrido, no por vista.
2. **[CERRADO]** `InviteStaffDialog.tsx` (`SubmitButton`): El botón primario y sus variants fueron tokenizados/corregidos en el commit `a377479`.
3. **[CERRADO]** `ui/button.tsx` (`Button`, variant `default`): Corregido por la barrida de commit `a377479`.
4. No hay fila clickeable a un detalle de staff: no existe `/staff/[id]`. Si en el futuro se
   quisiera una ficha de miembro (historial de acciones, sesiones activas), es una decisión de
   producto nueva, no un fix visual — **REQUIERE INPUT** si se quiere construir esa vista.

## §7 Contratos de test

- e2e `staff-crud.spec.ts`: los 4 tests dependen de selectores que no se tocaron —
  `getByRole('button', { name: /Agregar miembro del equipo/i })` (CTA del header, label default
  sin cambios), `input[name="firstName"|"lastName"|"email"]`, `getByRole('button', { name:
  /Enviar invitación/i })`, `page.locator('tr').filter({ hasText: email })` (estructura `<tr>`
  intacta), `getByText('Inactivo')`/`.filter({ hasText: '(vos)' })`, `getByRole('button', { name:
  /Opciones/i })` (el `aria-label` no lo pisa el `Tooltip` agregado), `getByRole('menuitem', {
  name: /Desactivar|Reenviar invitación/i })`.
- Unit `actions.test.ts` (10 tests, server actions) — sin cambios, no cubre UI. No existe unit
  test de presentación para `/staff` (ni antes ni después de este rediseño).
