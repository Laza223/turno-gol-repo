# Fase 2: Estabilización + Completitud Admin — Diseño

**Fecha**: 2026-05-22
**Fase**: fase-2-estabilizacion

---

## Contexto

Auditoría de estado real (ejecutada en exploración):

| Gate | Estado actual |
|---|---|
| `pnpm typecheck` | ✅ verde (0 errores) |
| `pnpm lint` | ✅ 0 errores, 4 warnings `@next/next/no-img-element` (login, register, page.tsx) |
| `pnpm build` | ✅ compila todas las rutas |
| `pnpm test` (unit) | ✅ 171 pass, **4 todo**, 0 fail (staff-actions = 4 `it.todo`) |
| `pnpm test:integration` | ❓ no ejecutado (requiere Supabase local) |

El "build roto" del blueprint **no aplica hoy**. El trabajo real son brechas puntuales: 4 tests todo, integración por validar, y completitud de páginas admin (incluye links muertos descubiertos).

Hallazgo de navegación: el sidebar (`admin-sidebar.tsx`) enlaza `/settings/*` y secciones top-level (`/canchas`, `/staff`, `/caja`, `/reservas`). **Nunca `/configuracion/*`** → esos dirs son vestigiales. Links muertos reales (404 hoy):
- `/settings/facturacion` — referenciado 3× (`status-banner.tsx` ×2, `onboarding-checklist.tsx` ×1).
- `/reservas` — en el sidebar, sin `page.tsx`.
- `/abonados/nuevo` — botón "+ Nuevo Abonado" en `abonados/page.tsx`.

---

## Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Alcance de páginas admin | Todo lo enlazado | Cerrar TODOS los links muertos, no solo las 7 `.gitkeep` |
| `configuracion/*` (5 dirs) | Borrar `.gitkeep` | Nada los enlaza; canónicas viven en `/canchas`, `/settings/horarios`, `/staff` |
| Integración | 100% verdes | Setup Supabase local + 15 suites verdes, incluye `test:isolation` (bloqueante) |
| Warnings `<img>` | Dejar como están | Imágenes externas (Unsplash) / dinámicas; `next/image` exige config remota — YAGNI. Lint sigue en 0 errores |
| Render de páginas nuevas | Páginas propias (no modales) | `/abonados/nuevo` y `/reservas` ya enlazados como rutas; `reservas/[id]` es detalle natural |
| Capa de los 4 `todo` | Integración (no unit) | `deactivate`/`inviteStaffAction` son DB-pesadas (`withTenantContext` + chains Drizzle + `createAdminClient`); unit-mockear los chains = frágil/bajo valor. DB real + mock de auth/admin |
| Orden | A-gate continuo → B → D → C | B rápido; D concreto (acciones ya existen); C (integración) triage abierto, al final |

---

## Arquitectura por fases

```
FASE A — Gate de build (verificación, sin cambios de código)
  pnpm typecheck && pnpm lint && pnpm build  ← corre tras cada fase

FASE B — Tests 100% (resolver los 4 todo)
  NEW tests/integration/staff-actions.test.ts (DB real; mock extractAuthUser/getStaffTenant/createAdminClient):
    deactivateStaffAction: (1) previene desactivar último admin (2) desactiva miembro cuando hay >1
    inviteStaffAction:      (3) error si email ya es miembro activo (4) crea staff_users + tenant_staff_members + llama inviteUserByEmail
  DELETE tests/unit/staff-actions.test.ts (solo contenía 4 it.todo)
  Meta: unit 0 todo/skip/fail; integración cubre las acciones

FASE C — Integración 100% verde
  Setup:  supabase start → pnpm db:push (schema) → ensureRoles/seed → DATABASE_URL=127.0.0.1:54322
  Loop:   pnpm test:integration → capturar fallas → fix por suite → re-run hasta 15/15
  Bloqueante: pnpm test:isolation (RLS dual admin/jugador)

FASE D — Completitud admin (respeta diseño dashboard.tsx + AdminLayoutShell)
  D1  Borrar 5 .gitkeep: configuracion/{canchas,precios,horarios,facturacion,equipo}
  D2  /settings/facturacion        → getSubscriptionState + plan + conectar MP (/api/mp/oauth-start)
                                      + agregar tab "Facturación" a los 4 SETTINGS_TABS
  D3  /reservas (lista)            → query bookings-by-tenant (filtros fecha/estado), filas → detalle
      /reservas/[id] (detalle)     → booking + court + player + payments + acciones existentes
                                      (complete/no-show/cancel de reservas/actions.ts); borrar .gitkeep
  D4  /abonados/nuevo (form)       → abonados/actions.ts (alta) → redirect /abonados; borrar .gitkeep
```

---

## Servicios backend disponibles (confirmados)

- **Staff**: `staff/actions.ts` (deactivate/invite) + `createAdminClient` + Resend.
- **Facturación**: `billing.service.ts` → `getSubscriptionState`, `subscribe`, `upgrade`, `downgrade`, `cancel`, `reactivate`. MP connect: `/api/mp/oauth-start`.
- **Reservas**: `reservas/actions.ts` → `createBookingAction`, `completeBookingAction`, `markNoShowAction`, `cancelBookingAction`. Falta confirmar query de lista (reusar de `grilla` o agregar `listBookings`).
- **Abonados**: `abonado.service.ts` (`getAbonados`) + `abonados/actions.ts` (alta).

---

## Patrones a respetar

- **Auth en páginas admin**: `extractAuthUser()` → `if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')` → `getStaffTenant(user.staffUserId)`.
- **Tenant context**: `withTenantContext(tenant.id, (tx) => ...)`.
- **Settings tabs**: array `SETTINGS_TABS` + `<PinGate>` wrapper (zonas sensibles).
- **Diseño**: slate/emerald, `MetricCard`, tipografía/spacing de `dashboard.tsx`. Montos en centavos ARS, formateo `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`.
- **Server Actions** para mutaciones; `revalidatePath` tras éxito.

---

## Estrategia de refactor si TypeScript falla (REQ explícito)

El typecheck hoy pasa; estas reglas aplican al introducir código nuevo (D) o al arreglar integración (C):

1. **`tsc --noEmit` falla** → leer error exacto (`pnpm typecheck 2>&1`); nunca silenciar con `any` (CLAUDE.md: strict, sin `any`).
2. **Tipo de fila DB desconocido** → tipar el resultado de `tx.execute(sql\`...\`)` con `as unknown as Array<{...}>` (patrón existente en el repo).
3. **Drizzle `inArray` con enum** → castear el array literal (`as never` / `as TipoEnum[]`) como en servicios existentes.
4. **Import faltante** → resolver desde el módulo correcto; no duplicar imports del mismo paquete.
5. **`redirect()` en Server Action** → llamar fuera de `try/catch` (lanza `NEXT_REDIRECT`).

---

## Testing / verificación

- **Fase B**: `pnpm test:integration staff-actions` verde; `pnpm test` completo sin todo/skip/fail (stub unit borrado).
- **Fase C**: `pnpm test:integration` 15/15 + `pnpm test:isolation` verde.
- **Fase D**: por página → `pnpm typecheck && pnpm lint && pnpm build`; smoke manual de la ruta y verificación de que el link antes muerto resuelve. Tests de la query nueva de `/reservas` (unit o integración).
- **Gate final**: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build` todo verde.

---

## Out of scope

- Refactor `<img>` → `next/image` (warnings aceptados).
- Redirects para `configuracion/*` (se borran, no se redirigen).
- Nuevas features de negocio (solo se completan páginas con backend ya existente).
- e2e Playwright (fuera de esta fase).
