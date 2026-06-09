# 🏆 Protocolo de Lanzamiento TurnoGol — Auditoría Definitiva

> **Objetivo**: Lista secuencial para copiar/pegar a Claude Code. Cada paso tiene contexto real del código, archivos específicos, criterios de aceptación y prompts listos para usar.
>
> **Regla**: NO avanzar al paso siguiente hasta que el anterior esté ✅.

---

## FASE 0: Pre-vuelo — Verificar que el Entorno Funciona

> Antes de auditar lógica, asegurate de que el proyecto compila y los tests existentes pasan.

### Paso 0.1 — Build y TypeCheck

**Prompt para Claude:**

```
Ejecutá los siguientes comandos en orden y reportá el resultado de cada uno:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm build`

Si hay errores de TypeScript o lint, corregí cada uno ANTES de continuar.
NO ignores warnings — cada warning puede ser un bug silencioso.
Reportá: cantidad de errores corregidos, archivos modificados.
```

**Criterio de aceptación**: Los 3 comandos pasan sin errores.

---

### Paso 0.2 — Tests Unitarios Existentes

**Prompt para Claude:**

```
Ejecutá `pnpm test` (vitest run --dir tests/unit).

Hay 14 archivos de test unitarios en tests/unit/:
- booking-service.test.ts
- booking-state-machine.test.ts
- cashflow-service.test.ts
- court-service.test.ts
- middleware.test.ts
- mp-webhook-route.test.ts
- notification-templates.test.ts
- payment-gateway.test.ts
- pin.test.ts
- public-service.test.ts
- reports.test.ts
- slot-generator.test.ts
- staff-actions.test.ts
- tenant-service.test.ts

Si algún test falla, analizá si es:
A) Un bug real en el código → corregilo
B) Un test desactualizado → actualizalo para reflejar la implementación actual

Reportá: tests pasados, tests fallidos, correcciones hechas.
```

**Criterio de aceptación**: `pnpm test` pasa al 100%.

---

### Paso 0.3 — Tests de Integración Existentes

**Prompt para Claude:**

```
Ejecutá `pnpm test:integration` (vitest run --dir tests/integration).

PREREQUISITO: Supabase local debe estar corriendo (`pnpm supabase:start`).
Si no está corriendo, ejecutá:
1. `pnpm supabase:start`
2. `pnpm supabase:reset` (aplica migrations + seed)

Hay 15 archivos de integración en tests/integration/:
- isolation.test.ts (84 tests — BLOQUEANTE)
- bookings.test.ts, booking-api.test.ts
- cancellations.test.ts
- payments.test.ts
- mp-webhook.test.ts
- billing.test.ts
- cashflow.test.ts
- courts.test.ts
- abonados.test.ts
- bans.test.ts
- notifications.test.ts
- player-app.test.ts
- reports.test.ts
- tenant-context.test.ts

IMPORTANTE: Si `isolation.test.ts` falla, PARÁ TODO. Es BLOQUEANTE.
Si otros tests fallan, corregí y documentá.

Reportá: resultado por archivo, errores corregidos.
```

**Criterio de aceptación**: Todos los integration tests pasan. `isolation.test.ts` con sus 84 tests es el más crítico.

---

## FASE 1: Sincronización — La Documentación Refleja el Código Real

> El código ya existe. Ahora hay que verificar que la documentación coincide con lo implementado.

### Paso 1.1 — Auditoría del Core: Flujos E2E vs Código Real

**Prompt para Claude:**

```
Hacé una auditoría EXHAUSTIVA comparando docs/doc7_flujos_e2e.md contra la implementación real.

FLUJO 2 (Reserva Online) — Verificar contra:
- src/modules/bookings/booking.service.ts → función createOnlineBooking() (línea 198)
  - ¿Verifica ban del jugador? → checkPlayerBanned() está en línea 203 ✓
  - ¿Hace SELECT FOR UPDATE? → lockCourtOrThrow() línea 214 ✓
  - ¿Calcula precio con price_snapshot inmutable? → calculatePrice() línea 219
  - ¿Chequea overlap? → checkOverlapOrThrow() línea 227
  - ¿Crea con status pending_payment cuando hay seña? → línea 251
  - ¿Crea con status confirmed cuando NO hay seña? → línea 251
  - ¿Ejecuta ensurePTR para player_tenant_relationships? → línea 261
  - ¿Encola notificación al jugador? → enqueueNotification línea 280
  - ¿Encola notificación al admin? → enqueueTenantOwnerNotification línea 301
  - ¿Maneja exclusion constraint violation? → catch línea 319

FLUJO 3 (Reserva Manual) — Verificar contra:
- src/modules/bookings/booking.service.ts → función createManualBooking() (línea 118)
  - ¿Permite price override? → línea 129
  - ¿Tipo block tiene precio 0? → línea 131
  - ¿Status siempre confirmed? → línea 174
  - ¿Soporta guest sin player_id? → guestName/guestPhone línea 179-180

FLUJO 4 (Cancelaciones) — Verificar contra:
- src/modules/bookings/booking.cancellation.ts (7670 bytes)
  - ¿Implementa las 4 variantes (4A, 4B, 4C, 4D)?
  - ¿Variante 4A: canceled_refunded cuando dentro del plazo?
  - ¿Variante 4B: canceled_no_refund cuando fuera del plazo?
  - ¿Variante 4C: admin decide con/sin reembolso?
  - ¿Variante 4D: markNoShow() en booking.service.ts línea 363?
  - ¿Auto-complete por sistema? → autoCompleteOverdueBookings() línea 346

FLUJO 4D auto-complete — Verificar contra:
- src/shared/jobs/workers/auto-complete-bookings.worker.ts
  - ¿Usa grace de 30 minutos? → parámetro graceMinutes=30

Para cada discrepancia encontrada entre doc7 y el código, decidí:
A) Si el código es correcto → actualizá doc7
B) Si el doc7 es correcto → corregí el código

Documentá TODAS las discrepancias en un resumen al final.
```

**Criterio de aceptación**: doc7 refleja exactamente lo que hace el código. Cero discrepancias sin resolver.

---

### Paso 1.2 — Auditoría de Tenant Isolation: Doc12 vs RLS Real

**Prompt para Claude:**

```
Verificá que docs/doc12_tenant_isolation.md refleja EXACTAMENTE las policies RLS implementadas.

1. Leer las policies reales en: supabase/migrations/20260424000006_rls_policies.sql

2. Para cada una de las 12 tablas aisladas, verificar que existen EXACTAMENTE estas policies:
   - tenant_isolation_select (USING tenant_id = current_setting)
   - tenant_isolation_insert (WITH CHECK tenant_id = current_setting)
   - tenant_isolation_update (USING + WITH CHECK)
   - tenant_isolation_delete (USING)

3. Verificar las tablas con RLS especial:
   - bookings: ¿tiene RLS dual (staff + player_own_bookings_select + realtime)?
   - player_tenant_relationships: ¿tiene RLS dual (staff + player)?
   - players: ¿tiene RLS relacional (staff ve solo jugadores con PTR en su tenant)?
   - staff_users: ¿tiene RLS relacional (staff ve solo staff del mismo tenant)?
   - tenant_player_bans: ¿tiene policy player_own_bans_select?

4. Verificar las tablas append-only en: supabase/migrations/20260424000008_revokes.sql
   - audit_logs: ¿REVOKE UPDATE, DELETE?
   - daily_cash_closes: ¿REVOKE UPDATE, DELETE?

5. Verificar el middleware de tenant context:
   - src/shared/middleware/with-tenant.ts → ¿usa withTenantContext() que hace SET LOCAL?
   - src/shared/db/client.ts → ¿withTenantContext hace SET LOCAL app.current_tenant_id?
   - ¿withTenantContext hace SET LOCAL app.current_player_id para jugadores?
   - ¿NUNCA usa SET sin LOCAL?

6. Verificar que los tests de isolation.test.ts cubren:
   - A. Smoke positivo (tenant ve sus filas): 13 tablas
   - B. Cross-tenant SELECT bloqueado: 13 tablas
   - C. Cross-tenant INSERT bloqueado: 13 tablas
   - D. Cross-tenant UPDATE bloqueado: 10 tablas
   - E. Cross-tenant DELETE bloqueado: 10 tablas
   - F. PTR cross-tenant UPDATE: 1 test
   - G. REVOKE append-only: 4 tests
   - H. Fail-safe sin contexto: 15 tablas
   - I. Casos especiales: 5 tests (player isolation, realtime JWT, staff PII, player PII, ban visibility)

Si hay discrepancias entre doc12 y la implementación, actualizá doc12.
Si falta alguna policy en la migración, ALERTÁ INMEDIATAMENTE — es una brecha de seguridad.
```

**Criterio de aceptación**: doc12 es un reflejo exacto de las policies en `20260424000006_rls_policies.sql` y del middleware en `with-tenant.ts`.

---

### Paso 1.3 — Auditoría del Middleware Stack de Seguridad

**Prompt para Claude:**

```
Verificá la cadena completa de middlewares de seguridad según doc12 §4.3.

ARCHIVOS A REVISAR:
- src/modules/auth/auth.middleware.ts → extractAuthUser()
- src/shared/middleware/with-tenant.ts → withTenant(), withPublicTenant(), withBillingTenant()
- src/shared/middleware/with-auth.ts → wrapper de autenticación genérico
- src/shared/middleware/with-player.ts → contexto de jugador
- src/shared/middleware/with-role.ts → verificación de roles
- src/shared/middleware/with-pin.ts → PIN para zonas sensibles

VERIFICAR EN ORDEN:

1. extractAuthUser() (auth.middleware.ts):
   - ¿Diferencia correctamente entre player, staff y system_admin?
   - ¿Lee tenant_id de app_metadata para staff?
   - ¿Lee player_id de app_metadata para player?
   - ¿NUNCA retorna un user con tenant_id para un player?

2. withTenant() (with-tenant.ts):
   - ¿Rechaza con 401 si no hay usuario?
   - ¿Rechaza con 403 si no es staff?
   - ¿Rechaza con 403 si no tiene tenant_id?
   - ¿Verifica que el tenant existe y su status?
   - ¿Bloquea statuses: blocked, churned, deleted?
   - ¿Read-only para suspended (solo GET/HEAD)?
   - ¿Llama a withTenantContext() que hace SET LOCAL?

3. withPublicTenant() (with-tenant.ts):
   - ¿Resuelve tenant por slug?
   - ¿Bloquea tenants con status blocked/churned/deleted (devuelve 404)?
   - ¿Setea contexto de tenant correctamente?

4. withBillingTenant():
   - ¿Permite canceled/churned para reactivación?
   - ¿Bloquea solo deleted y blocked?

5. Verificar que NINGUNA API route accede a la DB sin pasar por alguno de estos middlewares.
   Revisar TODAS las rutas en src/app/api/:
   - api/abonados/, api/bookings/, api/cash-flows/, api/courts/
   - api/notifications/, api/payments/, api/products/, api/reports/
   - api/billing/, api/tenant/, api/status/
   - api/player/ (debe usar withPlayer, NO withTenant)
   - api/public/ (debe usar withPublicTenant)
   - api/webhooks/mercadopago/ (acceso especial sin auth — verificar idempotencia)
   - api/auth/ (pre-auth, sin middleware de tenant)

Reportá cualquier ruta que acceda a datos sin middleware de contexto.
```

**Criterio de aceptación**: Cada ruta API tiene el middleware correcto. Ninguna ruta accede a datos sin contexto.

---

> **FIN DE PARTE 1** — Fases 0 y 1 cubiertas. Continúa con Parte 2 cuando estas fases estén ✅.
