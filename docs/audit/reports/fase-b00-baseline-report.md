# Fase B0 — Baseline Report

**Fecha:** 2026-05-24
**Worktree:** `audit/backend-b00` (`C:/Users/Lazar/Documents/github/TurnoGol-audit-b00`)
**Ejecutor:** Claude (modo híbrido — main thread + subagent reviewer)
**Duración total:** ~30 min (incluye `pnpm install` 40s + integration 42s + e2e 49s + stress + setup)

---

## Resumen Ejecutivo

| Gate | Resultado | Exit Code | Tiempo | Notas |
|------|-----------|-----------|--------|-------|
| B0.1 Typecheck | ✅ PASS | 0 | ~10s | 0 errors |
| B0.2 Lint | ✅ PASS con warnings | 0 | ~15s | 0 errors, 4 warnings (`<img>` → Image) |
| B0.3 Unit tests | ✅ PASS | 0 | 3.35s | **318/318** passed, 29 test files |
| B0.4 Supabase + schema | ✅ PASS | 0 | <1s | 20 tablas en `public` (19 business + system_admins) |
| B0.5 Integration tests | ✅ PASS | 0 | 42.63s | **253/253** passed, 40 test files |
| B0.6 Isolation BLOQUEANTE | ✅ PASS | 0 | 3.26s | **96/96** passed (gate crítico) |
| B0.7 E2E Playwright | ✅ PASS | 0 | 49.1s | 20 passed, 2 skipped, 0 failed |
| B0.8 Stress bookings | ✅ PASS | 0 | ~5s | **Accepted=1, Rejected=49** (409 SLOT_TAKEN), invariant holds |
| B0.9 Launch check | ⚠️ FAIL (esperado en dev) | 1 | <1s | Env vars de prod missing (no aplica en dev local) |

**Total tests ejecutados:** 318 (unit) + 253 (integration, de los cuales 96 son del gate `test:isolation` re-ejecutado en B0.6 como check explícito BLOQUEANTE) + 20 (E2E) + 50 (stress concurrentes HTTP) = **641 ejecuciones**. Nota: los 96 de isolation están contados una sola vez dentro de los 253 integration; B0.6 los re-ejecuta de forma aislada para satisfacer el gate bloqueante de doc16.

---

## Veredicto Global

🟢 **BASELINE LIMPIO**

Todos los gates ejecutables en dev local pasan en verde. El único FAIL (`launch:check`) es por env vars de producción no presentes en entorno de desarrollo — comportamiento esperado y diseñado del script.

**Implicancia**: el repo en su estado actual (`d2d21d7`) tiene un piso de calidad sólido. Los gates de race condition, RLS isolation, IDOR cross-tenant, webhook idempotency, MP OAuth, rate limiting, cookies/headers seguridad, anonimización ARCO y billing FSM están todos pasando.

**Listo para arrancar Fase B1 (Motor de Reservas) con confianza.**

---

## Hallazgos por Severidad

### P0 (bloquean continuar)
**Ninguno.** El gate bloqueante (`test:isolation`, 96 tests) pasó completo.

### P1 (alto, fase siguiente debería tratar primero)
1. **Pre-prod launch-check requiere env reales**: antes del primer deploy real, correr `pnpm launch:check` con env vars de producción completas. Falta validar que con env real el script pase. (Acción: Fase B11 Operativo).
2. **Stress test requiere `NEXT_PUBLIC_E2E=1` env**: scripts/stress-test.ts depende del endpoint `/api/e2e/create-booking` que está gateado por env var. Documentar en runbook que para correr stress hay que arrancar dev con `NEXT_PUBLIC_E2E=1`. (Acción: actualizar doc19 en Fase B11 o README sección "Stress testing").

### P2 (medio, agregar a backlog)
1. **4 warnings `<img>` no-optimized** en:
   - `src/app/(auth)/login/page.tsx:27`
   - `src/app/(auth)/register/page.tsx:27`
   - `src/app/page.tsx:112,239`
   - **Acción**: migrar a `next/image`. Deuda Fase F12 (Performance / Core Web Vitals).
2. **2 E2E tests skipped** en `tests/e2e/onboarding.spec.ts`: uno en el grupo `full wizard flow (step 1 - identity)` (`step 1 has all complex identity fields`) y otro en `onboarding wizard` (`wizard shows progress stepper`). Verificar si son skips intencionales (probablemente requieren auth state seed adicional) o tests pendientes de implementar. **Acción**: Fase F2 (Auth + Onboarding).
3. **`Invalid Sentry Dsn: e2e-placeholder` warnings** durante E2E: ruido esperado pero confirma que Sentry init no degrada gracefully con DSN inválido. **Acción**: revisar `src/lib/sentry.ts` en Fase B10 (Observabilidad) — debería loggear una vez y no spamear.
4. **libuv assertion error** al cleanup del stress test (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`): aparece tras éxito de invariant. Probable race en `closeSql()` o cleanup de pg-boss connection en Windows. No bloquea resultado pero ensucia exit. **Acción**: investigar en Fase B5 (Jobs / pg-boss) o B1 (booking service cleanup).

---

## Detalle de Tests Críticos Pasados

### Concurrencia (race conditions)
- `tests/integration/race-double-booking.test.ts` ✅ (1 test, verificado por inspección del archivo: N=10 concurrentes vía `createManualBooking` → exactly 1 wins + DB query confirma 1 booking persistido)
- `tests/integration/race-double-payment.test.ts` ✅ (1 test)
- `tests/integration/race-expiry-vs-confirm.test.ts` ✅ (1 test)
- `scripts/stress-test.ts` ✅ (50 paralelas HTTP reales → 1 winner + 49 SLOT_TAKEN)

### Multi-tenancy / RLS
- `tests/integration/isolation.test.ts` ✅ **96/96 tests** (BLOQUEANTE pasado)
- `tests/integration/idor-admin-cross-tenant.test.ts` ✅ (2 tests)
- `tests/integration/idor-player-bookings.test.ts` ✅ (2 tests)
- `tests/integration/tenant-context.test.ts` ✅ (3 tests)
- `tests/integration/webhook-tenant-cross-check.test.ts` ✅ (1 test)

### MercadoPago
- `tests/integration/mp-webhook.test.ts` ✅ (3 tests)
- `tests/integration/mp-oauth.test.ts` ✅ (2 tests)
- `tests/integration/mp-callback-app-url.test.ts` ✅ (1 test)
- `tests/integration/webhook-ssrf-guard.test.ts` ✅ (5 tests)
- `tests/integration/payments.test.ts` ✅ (5 tests)

### Billing SaaS (lifecycle FSM)
- `tests/integration/billing.test.ts` ✅ **14 tests** incluyendo:
  - dunning escalation: rejected → past_due → suspended → blocked → churned
  - voluntary cancel + sweep at period_end
  - data retention cleanup (churned → tenant anonymized)

### Privacy / ARCO
- `tests/integration/player-anonymization.test.ts` ✅ (7 tests)

### Rate limiting + Seguridad
- `tests/integration/admin-rate-limit.test.ts` ✅ (2 tests)
- `tests/integration/login-rate-limit.test.ts` ✅ (3 tests)
- `tests/integration/middleware-rate-limit.test.ts` ✅ (4 tests)
- `tests/integration/player-rate-limit.test.ts` ✅ (1 test)
- `tests/integration/rate-limit-fail-mode.test.ts` ✅ (5 tests)
- `tests/integration/cookie-flags.test.ts` ✅ (4 tests)
- `tests/integration/security-headers.test.ts` ✅ (3 tests)

### Bookings core
- `tests/integration/bookings.test.ts` ✅ (15 tests)
- `tests/integration/booking-api.test.ts` ✅ (5 tests)
- `tests/integration/booking-checkout.test.ts` ✅ (1 test)
- `tests/integration/booking-expiry.test.ts` ✅ (5 tests)
- `tests/integration/cancellations.test.ts` ✅ (10 tests)

---

## Outputs Crudos

- `docs/audit/reports/fase-b00-raw/typecheck.txt`
- `docs/audit/reports/fase-b00-raw/lint.txt`
- `docs/audit/reports/fase-b00-raw/test-unit.txt`
- `docs/audit/reports/fase-b00-raw/test-integration.txt`
- `docs/audit/reports/fase-b00-raw/test-isolation.txt`
- `docs/audit/reports/fase-b00-raw/test-e2e-seed.txt`
- `docs/audit/reports/fase-b00-raw/test-e2e.txt`
- `docs/audit/reports/fase-b00-raw/stress-bookings.txt`
- `docs/audit/reports/fase-b00-raw/launch-check.txt`
- `docs/audit/reports/fase-b00-raw/supabase-status.txt`

---

## Recomendaciones para Fase B1 — Motor de Reservas

Dado que el motor ya tiene tests sólidos pasando (race, expiry, state, cancellation), la Fase B1 debe enfocarse en **gaps específicos no cubiertos**:

### Auditorías sugeridas
1. **Exclusion constraint a nivel DB**: verificar que migration crea `EXCLUDE USING GIST` con `tsrange` sobre `court_id × tstzrange(date+time_start, date+time_end)`. Cinturón y tirantes con la app logic. Si no existe, agregar.
2. **State machine explícita**: leer `booking.state-machine.ts` y mapear todas las transiciones válidas vs inválidas. Generar tests para CADA transición inválida que debe rechazar (no solo las felices).
3. **Race entre flujos cruzados**:
   - admin manual + jugador online mismo slot (no solo admin vs admin) ← _confirmar si existe_
   - abonado slot-generator + booking individual mismo slot
   - cancel + expire simultáneos
4. **Booking cruza medianoche** (23:00-01:00): ¿permitido o rechazado? Test del borde.
5. **Duraciones 60 vs 120 min adyacentes**: ¿slots 20:00-21:00 + 21:00-23:00 encajan correctamente?
6. **Court `online` → `offline` con pending_payment activo**: ¿qué hace?
7. **Tenant suspended/blocked con pending_payment**: ¿refund automático?
8. **Expiry job idempotente bajo carga**: correr 10x simultáneo → mismo resultado.
9. **Cleanup libuv issue (P2)**: investigar el assertion error en cleanup, puede esconder leak de conexión.

### Archivos clave a leer en B1
- `src/modules/bookings/booking.service.ts`
- `src/modules/bookings/booking.concurrency.ts`
- `src/modules/bookings/booking.state-machine.ts`
- `src/modules/bookings/booking.expiry.ts`
- `src/modules/bookings/booking.cancellation.ts`
- `src/shared/db/schema/bookings.ts`
- `src/shared/db/migrations/004_isolated_tables.sql` (buscar exclusion constraint)
- `src/modules/abonados/slot-generator.ts`

---

## Estado para Próxima Fase

- **Worktree `audit/backend-b00`**: mantener para commit del report + push a remote, después se puede eliminar (su único producto es este report, que se mergeará a main).
- **Branch `audit/backend-b00`**: contiene 1 commit con `docs/audit/` files. Listo para PR a main.
- **Fase B1**: arrancar en worktree nuevo `audit/backend-b01` desde main (post-merge del B0).

---

## Decisiones requeridas al humano

1. **¿Mergeo `audit/backend-b00` a main vía PR ahora?** (Recomendado: sí — el report queda en main como source of truth)
2. **¿Procedo con Fase B1 — Motor de Reservas?** (Recomendado: sí — baseline está limpio, tests críticos pasan)
3. **Stress en env permanente**: ¿agregar `NEXT_PUBLIC_E2E=1` a algún script `pnpm dev:e2e` para futuras corridas de stress? (Acción menor, decisión cosmética)
