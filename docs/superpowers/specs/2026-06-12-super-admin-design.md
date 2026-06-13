# Diseño: Panel SuperAdmin (rol de soporte del dueño del SaaS)

**Fecha:** 2026-06-12 · **Estado:** aprobado por el usuario (diseño conversado en sesión)
**Decisiones del usuario:** alcance v1 = control total · impersonación con acción · acceso por magic link + allowlist de email (MFA TOTP deferido).

## 1. Contexto y objetivo

TurnoGol necesita un rol SuperAdmin para el dueño del SaaS (un solo usuario):
visión y control total cross-tenant para soporte — diagnosticar y resolver
cualquier problema de un cliente sin tocar SQL a mano.

La spec ya define la infraestructura (doc12 §4.4, doc13 §3.14, CLAUDE.md) y
**~40% ya está construido sin uso**:

| Existe hoy | Dónde |
|---|---|
| Tabla `system_admins` (con `mfa_secret`, `last_login_at/ip`) | `src/shared/db/schema/system-admins.ts`, migración 003 |
| Branch `is_system_admin` en auth → `type: 'system_admin'` | `src/modules/auth/auth.middleware.ts:28-31`, `types.ts` (SystemAdminUser) |
| `withSystemAdminContext()` (SET LOCAL `app.current_system_admin_id`) | `src/shared/db/client.ts:126-137` |
| RLS self-only en `system_admins` + trigger de auditoría | migraciones 006 y 012; tests en `tests/integration/isolation.test.ts:475-514` y `system-admins-audit-trigger.test.ts` |
| Endpoint gateado por system_admin | `src/app/api/admin/jobs/route.ts:17` |
| FSM completo de lifecycle de tenants (10 transiciones) | `src/modules/billing/lifecycle.service.ts` |
| Billing SaaS completo (subscribe/upgrade/downgrade/cancel/reactivate) | `src/modules/billing/billing.service.ts` |
| Anonymización ARCO | `src/modules/players/player.anonymization.ts:37` |

**No existe**: forma de crear el system admin (setter del claim), guard,
panel UI, impersonación, métricas globales, retry de jobs, bans globales.

**Regla de oro del diseño: el panel no reimplementa lógica de negocio.**
Cada botón llama un servicio existente; solo se crean servicios para gaps
reales (extender trial, ban global, DLQ persistente).

## 2. Fases

- **F1 — Fundaciones + Tenants + Dashboard**: bootstrap, guard, layout,
  dashboard global, lista/detalle de tenants con acciones de soporte.
- **F2 — Impersonación**: "Entrar como este complejo" con acción real.
- **F3 — Jugadores + Jobs + Audit + Notificaciones.**

Cada fase es deployable sola. Cada fase tendrá su propio plan de
implementación (writing-plans).

## 3. Seguridad y acceso

### Bootstrap (sin superficie HTTP)
`scripts/seed-system-admin.ts`, corre manualmente con service role:
1. INSERT en `system_admins` (email del dueño).
2. `auth.admin.updateUserById` → `app_metadata: { is_system_admin: true, system_admin_id: <uuid de la fila> }`.

No existe ninguna ruta/action que setee el claim: imposible auto-promoverse
desde la app. Login: magic link existente (sin flujo nuevo).

### Guard `requireSystemAdmin()`
Nuevo, en `src/modules/auth/` (patrón de `staff/guards.ts`). Triple chequeo:
1. `extractAuthUser().type === 'system_admin'` (claim JWT).
2. Fila en `system_admins` con `status='active'` vía `withSystemAdminContext`
   (la DB manda — revocación inmediata desactivando la fila; misma lección
   que roles de staff: nunca confiar solo en el JWT).
3. Email ∈ `SYSTEM_ADMIN_EMAILS` (env, lista separada por comas).

Falla cualquiera → `redirect('/login')` sin diferenciar motivo (no filtra que
la ruta existe). Variante `requireSystemAdminAction()` para Server Actions
(devuelve `ActionResult`, sin redirect — mismo patrón que
`requireAdminStaffAction`).

Side-effect en login del layout: actualiza `last_login_at` / `last_login_ip`.

### Hardening
- `robots: noindex` + sin links desde ninguna superficie pública.
- Rate limit (`enforce`) en todas las actions del panel.
- MFA TOTP: **deferido** (columna `mfa_secret` queda lista). IP whitelist:
  **descartada** para v1 (IP dinámica de ISP argentino = lockouts).

## 4. Arquitectura

- Route group `src/app/(super-admin)/super-admin/*` con layout propio:
  shell visual calcado de `admin-layout-shell` pero con color distintivo
  (slate oscuro/violeta) — siempre sabés en qué sombrero estás.
- Server Components para lectura, Server Actions para mutaciones (regla
  CLAUDE.md), `validatedJson`/`ActionResult` como el resto.
- **Datos cross-tenant**:
  - Tablas globales (`tenants`, `plans`, `tenant_subscriptions`, `players`):
    lectura directa con `getDb()` — sin RLS, igual que hoy.
  - Agregados sobre tablas RLS (ej. conteos de bookings): mismo caveat BK-01
    que los workers (la conexión actual es dueña de las tablas; bajo FORCE
    RLS futuro, estas queries van con rol de servicio). Documentar en cada
    query con el comentario estándar BK-01.
  - Operaciones SOBRE un tenant específico: la action setea
    `withTenantContext(tenantId)` → la defensa RLS normal aplica.
  - `system_admins`: siempre vía `withSystemAdminContext` (policy self-only).

## 5. F1 — Pantallas y operaciones

### `/super-admin` — Dashboard global
- MRR (suma `plans.price` de `tenant_subscriptions` activas — query de
  doc12 §9.5), tenants por estado (8 estados), trials que vencen en ≤7 días,
  últimos signups (7d), profundidad de colas pg-boss (reusa lógica de
  `/api/admin/jobs`), webhooks MP fallidos recientes (`processed_webhooks`).

### `/super-admin/tenants` — Lista
Búsqueda por nombre/slug/email + filtros por `status` y plan. Columnas:
nombre, slug, estado (badge), plan, MRR, trial_ends_at, created_at.

### `/super-admin/tenants/[id]` — Detalle + acciones
Tabs: **Resumen** (datos, settings, canchas, staff) · **Suscripción**
(estado, plan, ciclo, dunning, historial de pagos SaaS) · **Actividad**
(audit trail del tenant, últimos bookings) · **Acciones**.

| Acción de soporte | Implementación |
|---|---|
| Forzar transición de estado | `lifecycle.service.ts` — transiciones existentes expuestas con selector de estado destino válido según FSM |
| Reactivar tenant | `transitionToActiveFromAny` (lifecycle.service.ts:344) |
| Extender trial | **nuevo** `extendTrial(tenantId, days)` — único servicio nuevo de F1 (update `trial_ends_at` + audit) |
| Cambiar plan sin cobro | `billing.service.upgrade/downgrade` con flag de soporte (skip cobro MP) |
| Cancelar suscripción | `billing.service.cancel` |
| Editar settings del tenant | `updateTenantSettings` (tenant.service.ts:142) — editor de campos whitelisteados, no JSON libre |

Escrituras destructivas (forzar `deleted`, cancelar): confirmación escribiendo
el nombre del tenant (patrón GitHub). **Toda** escritura emite audit log
`support.*` (ver §8).

## 6. F2 — Impersonación con acción

- Botón "Entrar como este complejo" en el detalle del tenant.
- **Cookie** httpOnly firmada HMAC (mismo patrón que la cookie de PIN en
  `src/modules/auth/pin.ts`: `buildPinCookie`/`verifyPinCookie`):
  `tg_sa_impersonate = { tenantId, systemAdminId, exp }`, TTL 1 hora,
  `SameSite=Lax`, `Secure`.
- **Punto único de cambio**: los guards del admin (`requireAdminStaff`,
  `requireOperatorStaff`, `requireStaffTenant`, layout `(admin)/layout.tsx`)
  ganan una rama: si `user.type === 'system_admin'` y cookie válida →
  resuelven el contexto del tenant impersonado con rol efectivo `admin`.
  Las ~40 Server Actions del admin funcionan sin tocarse.
- **Banner rojo fijo** en todo el panel impersonado:
  "⚠ Impersonando {tenant} — Salir" (el logout de impersonación borra la
  cookie y te devuelve a `/super-admin/tenants/[id]`).
- **Auditoría**: la sesión impersonada setea TAMBIÉN
  `app.current_system_admin_id` (además del tenant context). El writer
  central de audit (`src/shared/db/audit.ts`) lee ese setting: si está
  presente → fuerza `actor_type='system'`, `actor_id=system_admin_id`,
  `metadata.impersonated_tenant_id`. Ninguna acción queda a nombre del
  cliente.
- **Riesgo identificado — FKs a `staff_users`** (ej.
  `cash_flows.registered_by`): estrategia de delegación — el guard resuelve
  el primer staff admin activo del tenant para los campos FK, la identidad
  real queda en el audit log. El plan de implementación de F2 enumera las
  columnas FK afectadas y los tests correspondientes.
- PIN del tenant: la sesión impersonada NO pide PIN (el superadmin ya pasó
  un guard más fuerte); el bypass vive en la misma rama del guard.

## 7. F3 — Jugadores, Jobs, Audit, Notificaciones

- `/super-admin/players`: búsqueda global por email/nombre; ficha con
  relaciones per-tenant (`player_tenant_relationships`, deudas), bans.
  Acciones: **ban global** (**nuevo** servicio: `players.status='banned'` +
  razón + audit), desbanear, **anonymizar** (reusa `anonymizePlayer` — botón
  con doble confirmación, irreversible por diseño ARCO).
- `/super-admin/jobs`: estado de colas + **DLQ persistente** (**nuevo**: hoy
  los jobs fallidos solo van a Sentry y se pierden — tabla `failed_jobs`
  con payload + retry manual que re-encola).
- `/super-admin/audit`: audit logs globales paginados con filtros
  (tenant, action, actor_type, rango de fechas). Solo lectura.
- `/super-admin/notificaciones`: historial (`notifications`) con estado de
  envío + reenviar email fallido (re-dispatch por `notification_id`).

## 8. Auditoría y observabilidad

- Action strings nuevos, namespace `support.`:
  `support.tenant.status_forced`, `support.tenant.trial_extended`,
  `support.tenant.plan_changed`, `support.tenant.settings_updated`,
  `support.impersonation.started`, `support.impersonation.ended`,
  `support.player.banned`, `support.player.unbanned`,
  `support.player.anonymized`, `support.job.retried`,
  `support.notification.resent`.
- Todos con `actor_type='system'`, `actor_id=system_admin_id`,
  `tenant_id` del afectado (o NULL si global), `before_state`/`after_state`.
- Sentry: tag `session=system_admin` (ya lo hace `tagSession` en
  auth.middleware.ts:30). Breadcrumb por acción de soporte.

## 9. Testing

- **Unit**: `requireSystemAdmin` (claim sin fila DB → rechaza; fila
  `inactive` → rechaza; email fuera de allowlist → rechaza); cookie de
  impersonación (expirada / firma alterada / tenant inexistente → rechaza);
  render del banner.
- **Integration**: cada acción de soporte escribe su audit log `support.*`;
  transiciones forzadas respetan el FSM; impersonación produce
  `actor_type='system'`; RLS de `system_admins` (3 tests ya existen);
  `extendTrial` mueve `trial_ends_at` y lo audita.
- **Aislamiento (BLOQUEANTES, doc16)**: staff común y player NUNCA pasan
  `requireSystemAdmin` ni acceden a rutas `/super-admin/*`; un system admin
  inactivo tampoco.
- **E2E mínimo** (F2): login superadmin → impersonar tenant demo → crear
  reserva → verificar audit `actor_type='system'` → salir de impersonación.

## 10. Fuera de scope v1

- MFA TOTP (columnas listas; fase posterior).
- IP whitelist (doc12 la pide; descartada por IP dinámica — revisar si algún
  día hay IP fija/VPN).
- Múltiples system admins / roles granulares dentro de system_admins.
- Edición arbitraria de reservas/caja de un tenant FUERA de impersonación
  (se hace impersonando, que ya audita todo).
- Des-anonimización de jugadores (ARCO es irreversible).
- Notificar al tenant cuando se lo impersona.
