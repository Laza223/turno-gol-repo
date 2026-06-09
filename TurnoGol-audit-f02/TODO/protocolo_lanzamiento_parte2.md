# 🏆 Protocolo de Lanzamiento TurnoGol — Parte 2

## FASE 2: El Escudo de Acero — Testing Lógico y de Seguridad

---

### Paso 2.1 — Test de Tenant Isolation (BLOQUEANTE)

**Prompt para Claude:**

```
Ejecutá `pnpm test:isolation` y verificá que los 84 tests de
tests/integration/isolation.test.ts pasan al 100%.

Este archivo cubre 9 categorías:
A. Smoke positivo (13 tests): tenant SÍ ve sus propias filas
B. Cross-tenant SELECT bloqueado (13 tests): tenant B no ve filas de A
C. Cross-tenant INSERT bloqueado (13 tests): tenant A no inserta con tenant_id de B
D. Cross-tenant UPDATE bloqueado (10 tests)
E. Cross-tenant DELETE bloqueado (10 tests)
F. PTR cross-tenant UPDATE (1 test)
G. REVOKE append-only: audit_logs y daily_cash_closes (4 tests)
H. Fail-safe sin contexto: 15 tablas devuelven 0 filas (15 tests)
I. Casos especiales (5 tests):
   I.1 — player A no ve bookings de player B (mismo tenant)
   I.2 — JWT con tenant_id ajeno → 0 bookings
   I.3 — staff A no ve email de staff B
   I.4 — staff A no ve PII de player sin PTR-con-A
   I.5 — jugador baneado ve su propio ban

SI ALGÚN TEST FALLA → PARÁ TODO. Esto es BLOQUEANTE.
Investigá la causa, corregí la policy RLS o el código, y volvé a correr.

ADEMÁS: Revisá el TODO al final de isolation.test.ts (línea 376-380).
Hay 4 gaps declarados que NO están implementados:
- player_update_self
- player_self_insert (bookings)
- player_self_ptr_insert
- system_admin_self / system_admin_self_update

Evaluá si alguno de estos gaps representa un riesgo de seguridad real.
Si sí → implementá el test y la policy faltante.
Si no → documentá por qué no es riesgo.
```

**Criterio de aceptación**: 84/84 tests pasan. Gaps evaluados y documentados.

---

### Paso 2.2 — Test de Roles y Permisos

**Prompt para Claude:**

```
Verificá que un jugador (player) NO puede acceder a rutas de admin.

1. Revisá src/shared/middleware/with-tenant.ts línea 38-43:
   El middleware withTenant() rechaza con 403 STAFF_REQUIRED si user.type !== 'staff'.
   Esto protege TODAS las rutas admin.

2. Verificá que TODAS las rutas bajo src/app/api/ que son de admin usan withTenant():
   - api/bookings/
   - api/courts/
   - api/abonados/
   - api/cash-flows/
   - api/payments/
   - api/products/
   - api/notifications/
   - api/reports/
   - api/tenant/
   - api/billing/ (usa withBillingTenant)
   - api/status/

3. Verificá que las rutas de jugador usan withPlayer():
   - api/player/ → debe usar src/shared/middleware/with-player.ts

4. Verificá que las rutas públicas usan withPublicTenant():
   - api/public/ → no requiere auth

5. Verificá el caso especial del webhook de MercadoPago:
   - api/webhooks/mercadopago/ → NO usa auth middleware (MP no envía JWT)
   - DEBE verificar firma del webhook (webhook-auth.ts)
   - DEBE verificar idempotencia (processed_webhooks)

6. Verificá que with-pin.ts protege las zonas sensibles:
   - ¿Qué rutas requieren PIN?
   - ¿El PIN es por tenant (no global)?

Para cada ruta que NO tiene el middleware correcto, reportá como CRÍTICO.

BONUS: Escribí un test unitario en tests/unit/ que valide que
withTenant() retorna 403 cuando user.type es 'player'.
Si ya existe en middleware.test.ts, verificá que funciona.
```

**Criterio de aceptación**: 100% de rutas API protegidas con el middleware correcto.

---

### Paso 2.3 — Test de Concurrencia en Reservas

**Prompt para Claude:**

```
Verificá la protección contra double-booking.

1. Revisá booking.service.ts:
   - lockCourtOrThrow() (línea 66): ¿Usa SELECT FOR UPDATE?
   - checkOverlapOrThrow() (línea 90): ¿Usa tsrange && para detectar overlap?
   - isExclusionViolation() (línea 57): ¿Captura PG error 23P01?

2. Verificá que la exclusion constraint existe en la migración:
   - supabase/migrations/20260424000004_isolated_tables.sql
   - Debe haber un EXCLUDE constraint en bookings que impida overlap
     en (court_id, date, tsrange(time_start, time_end))
     SOLO para status IN ('pending_payment', 'confirmed')

3. Verificá en tests/integration/bookings.test.ts:
   - ¿Hay test de doble booking simultáneo con Promise.allSettled?
   - ¿Hay test de overlap parcial (21:00-22:00 vs 21:30-22:30)?
   - ¿Hay test de booking expirado que libera slot?
   - ¿Hay test de bookings en diferentes canchas (ambas deben ganar)?

4. Si falta alguno de estos tests, CREALO:

   it('Dos reservas simultáneas en el mismo slot: solo una gana', async () => {
     // Promise.allSettled con dos createManualBooking en el mismo slot
     // Exactamente 1 fulfilled, 1 rejected con SlotTakenError
   })

   it('Overlap parcial bloqueado por exclusion constraint', async () => {
     // Crear booking 21:00-22:00
     // Intentar 21:30-22:30 → debe fallar
   })

5. Ejecutá los tests de bookings y reportá resultados.
```

**Criterio de aceptación**: Double-booking es imposible tanto por lógica de negocio como por constraint de DB.

---

### Paso 2.4 — Test de Idempotencia de Webhooks MercadoPago

**Prompt para Claude:**

```
Verificá el flujo completo de webhooks de MercadoPago.

1. Revisá src/modules/payments/mp-webhook.handler.ts:
   - ¿Verifica que el mp_event_id no fue procesado? (tabla processed_webhooks)
   - ¿Inserta en processed_webhooks ANTES de procesar?
   - ¿Maneja payment.approved → booking confirmed?
   - ¿Maneja payment.rejected → booking queda en pending_payment?

2. Revisá src/modules/payments/webhook-auth.ts:
   - ¿Verifica la firma/autenticidad del webhook de MP?

3. Revisá tests/integration/mp-webhook.test.ts:
   - ¿Test de webhook duplicado → segundo es ignorado?
   - ¿Test de payment approved → booking pasa a confirmed + deposit_status paid?
   - ¿Test de payment rejected → booking NO cambia de status?
   - ¿Test de firma inválida → webhook rechazado?

4. Revisá src/modules/bookings/booking.concurrency.ts:
   - transitionFromPendingPayment(): ¿Es atómica? ¿Usa UPDATE ... WHERE status = 'pending_payment'?

5. Verificá el worker:
   - src/shared/jobs/workers/process-mp-webhook.worker.ts
   - ¿Procesa el webhook como job de pg-boss (retry automático)?

Si falta algún test crítico, crealo.
Ejecutá `pnpm test:integration` filtrando mp-webhook y reportá.
```

**Criterio de aceptación**: Webhook duplicado es no-op. Firma se verifica. Transición es atómica.

---

### Paso 2.5 — Test de State Machine de Bookings

**Prompt para Claude:**

```
Auditoría completa de la state machine de reservas.

1. Revisá src/modules/bookings/booking.state-machine.ts:
   - ¿Define TODAS las transiciones válidas de doc6?
   - Estados: pending_payment, confirmed, completed, expired, canceled_refunded, canceled_no_refund, no_show
   - Transiciones válidas:
     * pending_payment → confirmed (PAYMENT_APPROVED)
     * pending_payment → expired (PAYMENT_TIMEOUT)
     * confirmed → completed (MARK_COMPLETED, auto-complete)
     * confirmed → no_show (MARK_NO_SHOW)
     * confirmed → canceled_refunded (CANCEL_WITH_REFUND)
     * confirmed → canceled_no_refund (CANCEL_WITHOUT_REFUND)
   - Estados finales inmutables: completed, expired, canceled_refunded, canceled_no_refund, no_show
   - ¿assertTransition() lanza error para transiciones inválidas?

2. Revisá tests/unit/booking-state-machine.test.ts:
   - ¿Cubre TODAS las transiciones válidas?
   - ¿Cubre intentos de transición desde estados finales (debe lanzar error)?
   - ¿Cubre transiciones inválidas (ej: pending_payment → no_show)?

3. Revisá que booking.cancellation.ts usa assertTransition() antes de cambiar status.

4. Revisá que completeBooking(), markNoShow(), expirePendingBooking()
   todos usan assertTransition() o UPDATE WHERE status = X (optimistic lock).

Si hay transiciones faltantes en los tests, agregalas.
```

**Criterio de aceptación**: Cada transición válida tiene test. Cada transición inválida lanza error.

---

### Paso 2.6 — Test de Billing/SaaS Lifecycle

**Prompt para Claude:**

```
Auditoría del lifecycle de suscripción SaaS.

1. Revisá src/modules/billing/lifecycle.service.ts (13539 bytes):
   - ¿Implementa transiciones: trialing → active, active → past_due,
     past_due → suspended, suspended → active (reactivación)?
   - ¿Implementa: active → canceled, canceled → churned?

2. Revisá src/modules/billing/dunning.service.ts (7649 bytes):
   - ¿Implementa secuencia de dunning (3 reintentos)?
   - ¿Programa notificaciones de cobro fallido?

3. Revisá los workers:
   - src/shared/jobs/workers/expire-trials.worker.ts → ¿Expira trials vencidos?
   - src/shared/jobs/workers/dunning-retry.worker.ts → ¿Reintenta cobros fallidos?

4. Revisá tests/integration/billing.test.ts (21758 bytes):
   - ¿Test trial → churned cuando expira sin pago?
   - ¿Test active → past_due → suspended después de cobros fallidos?
   - ¿Test canceled → acceso hasta current_period_end?
   - ¿Test reactivación desde churned/canceled?
   - ¿Test prorrateo en upgrade de plan?

5. Verificá que withTenant() respeta los statuses correctamente:
   - blocked/churned/deleted → 403 siempre
   - suspended → solo GET/HEAD (read-only)
   - canceled → acceso completo hasta period_end
   - active/trialing/past_due → acceso completo

Ejecutá los tests de billing y reportá.
```

**Criterio de aceptación**: Todo el lifecycle SaaS funciona según doc4. Tests pasan.

---

## FASE 3: Testing E2E — Simulando Usuarios Reales

> Los E2E tests simulan el browser real. Actualmente tests/e2e/ tiene solo un .gitkeep (vacío).

---

### Paso 3.1 — Happy Path del Admin (Crear Reserva Manual)

**Prompt para Claude:**

```
Usando Playwright (MCP o el test runner), ejecutá este flujo E2E:

PREREQUISITOS:
- Supabase local corriendo (pnpm supabase:start)
- App corriendo (pnpm dev) en localhost:3000
- Tener un usuario admin de test seeded en la DB

FLUJO:
1. Navegar a localhost:3000/login
2. Loguearse como admin de test
3. Ir al dashboard → verificar que carga correctamente
4. Ir a la grilla de reservas (/grilla)
5. Hacer click en un slot libre
6. Completar formulario: nombre del jugador, teléfono, tipo espontáneo
7. Confirmar la reserva
8. Verificar que el slot aparece como "confirmed" en la grilla
9. Sacar capturas de pantalla de cada paso

Si la app se bloquea, muestra un error, o un paso no funciona:
- Capturá screenshot del error
- Identificá la causa (error de JS, fallo de API, etc.)
- Corregí el código
- Volvé a ejecutar el flujo

Reportá: cada paso con su resultado (✅/❌), screenshots, errores corregidos.
```

**Criterio de aceptación**: El flujo completo funciona sin errores visibles.

---

### Paso 3.2 — Happy Path del Jugador (Reserva Online)

**Prompt para Claude:**

```
Usando Playwright, simulá el flujo del jugador:

FLUJO:
1. Navegar a la página pública del complejo: localhost:3000/{slug-del-tenant-test}
2. Ver la grilla pública de disponibilidad
3. Seleccionar un slot libre
4. Verificar que aparece el modal con precio y detalle
5. Si requiere autenticación → loguearse como jugador test
6. Confirmar reserva (sin seña para simplificar — tenant sin MP configurado)
7. Verificar pantalla de éxito: "¡Tu turno está confirmado!"
8. Navegar a "Mis Reservas" del jugador y verificar que aparece la reserva
9. Sacar capturas de cada paso

VERIFICACIONES ADICIONALES:
- La grilla pública NO muestra datos sensibles (no nombres de otros jugadores)
- Los slots ocupados aparecen como "no disponible" sin datos del ocupante
- El precio mostrado coincide con court.pricing evaluado para ese horario

Si algún paso falla, corregí y volvé a ejecutar.
```

**Criterio de aceptación**: Jugador puede reservar de punta a punta sin errores.

---

### Paso 3.3 — Test de Responsividad Mobile

**Prompt para Claude:**

```
Usando Playwright, redimensioná el viewport a 375x812 (iPhone 14) y navegá por:

1. Landing page (/) → ¿Se ve correctamente? ¿Botones accesibles?
2. Página pública del complejo (/{slug}) → ¿La grilla NO se desborda horizontalmente?
3. Login → ¿Formulario usable en mobile?
4. Dashboard del admin → ¿Sidebar se colapsa o usa hamburger menu?
5. Grilla de reservas → ¿Se puede scrollear horizontalmente sin romper el layout?
6. Modal de nueva reserva → ¿Cabe en la pantalla? ¿Se puede scrollear?
7. Vista del jugador ("Mis Reservas") → ¿Cards se apilan correctamente?

Para cada vista:
- Sacá screenshot a 375x812
- Si hay overflow horizontal, botones cortados, texto ilegible o elementos superpuestos → arreglá el CSS/Tailwind
- Priorizá: grilla de reservas y modal de nueva reserva (son las más usadas)

Reportá: screenshots + issues encontrados + fixes aplicados.
```

**Criterio de aceptación**: Todas las vistas críticas son usables en 375px sin overflow horizontal.

---

> **FIN DE PARTE 2** — Fases 2 y 3 cubiertas. Continúa con Parte 3 para Fases 4-5.
