# Fase B1 — Motor de Reservas Report

**Fecha:** 2026-05-24
**Worktree:** `audit/backend-b01` (`C:/Users/Lazar/Documents/github/TurnoGol-audit-b01`)
**Ejecutor:** Claude (Opus 4.7) modo subagent-driven
**Tests previos:** 56/56 verde post-cambios (regresión 0)

---

## Resumen Ejecutivo

| Task | Hallazgo | Resultado | Tests agregados | Fix aplicado |
|------|----------|-----------|-----------------|--------------|
| B1.1 Audit estructural | Motor sound: exclusion DB + trigger immutability + state machine explícita | ✅ Validado | 0 | No |
| B1.2 Race admin vs online | Cubierto por exclusion constraint + advisory lock | ✅ Pass | 2 | No |
| B1.3 Sweep cron scheduling | Definido `*/5 * * * *` | ✅ Pre-existente | 0 | No |
| B1.4 autoComplete cron | Definido `*/30 * * * *` | ✅ Pre-existente | 0 | No |
| B1.5 Booking time validation | **🚨 P0 BUG DETECTADO Y FIXED** | ✅ Fix verde | 3 | **Sí** (errors + service) |
| B1.6 Race cancel vs expire | No aplicable por diseño (estados disjuntos) | ✅ Validado | 0 | No |
| B1.7 Race abonado vs individual | Exclusion DB protege | ✅ Pass | 2 | No |
| B1.8 Online sin deposit + webhook tardío | Deferido a Fase B3 (requiere mock MP completo) | ⏭️ Deferred | 0 | No |
| B1.9 libuv assertion P2 | Bug runtime Windows, no aplica en producción Linux | 📝 Documentado | 0 | No |
| B1.10 Duration borders | Adyacentes OK, overlap rechazado | ✅ Pass | 4 | No |

**Total tests nuevos: 11** (todos verdes).
**Fixes de código: 2 archivos** (`booking.errors.ts` + `booking.service.ts`).
**Tests existentes modificados: 1** (`bookings.test.ts` ajustados a PAST_DATE).
**Commits en branch `audit/backend-b01`: 4** (audit estructural, race admin/online, fix time validation, duration borders).

---

## Veredicto Global

🟡 **MOTOR VALIDADO CON 1 BUG P0 FIXED**

El motor de reservas estaba 95% correcto. La auditoría detectó **1 bug P0 crítico** (admin podía marcar `completed`/`no_show` bookings del futuro) que fue corregido en esta fase. Resto del motor (exclusion constraint, state machine, expiry, cron scheduling, races) pasó validación.

---

## Bug P0 Detectado y Corregido

### 🚨 BUG: `completeBooking` y `markNoShow` no validaban tiempo

**Severidad:** P0 (corrupción de datos + auto-ban injusto de jugadores)

**Comportamiento previo (bug):**
- `completeBooking(bookingId, 'admin', tx)` permitía marcar como `completed` un booking del año 2099.
- `markNoShow(bookingId, staffUserId, tx)` permitía marcar `no_show` antes de que el slot empezara.
- Solo `autoCompleteOverdueBookings` (job bulk cron) validaba que `time_end + 30min < NOW`.
- Admin podía corromper reportes y disparar auto-ban del jugador via no-show penalty injustamente.

**Causa raíz:**
Las funciones `completeBooking` y `markNoShow` solo llamaban `assertTransition('confirmed', X, ...)` que valida la transición de estado pero NO el tiempo. Solo `autoCompleteOverdueBookings` tenía time check en su WHERE clause.

**Fix aplicado:**

1. **`src/modules/bookings/booking.errors.ts`** — agregadas 2 error classes:
   - `BookingNotYetEndedError`
   - `BookingNotYetStartedError`

2. **`src/modules/bookings/booking.service.ts`**:
   - `completeBooking`: para `actor='admin'`, rechaza con `BookingNotYetEndedError` si `date + time_end > NOW AT TIME ZONE 'America/Argentina/Buenos_Aires'` (es decir, requiere que el slot ya haya terminado). Para `actor='system'` (cron `autoCompleteOverdueBookings`), no aplica este check porque tiene su propia lógica de gracia.
   - `markNoShow`: rechaza con `BookingNotYetStartedError` si `date + time_start > NOW` en ART (es decir, requiere que el slot ya haya empezado). Sin excepciones por actor — admin-only function.

3. **`tests/integration/bookings.test.ts`** — corregidos 2 tests legacy que usaban `FUTURE_DATE` para testear `completed → completed` (ahora usan `PAST_DATE`). Los tests originales eran incorrectos: la transición legítima de completed solo aplica a bookings ya terminados.

**Verificación:**
- 3 tests nuevos en `tests/integration/booking-time-validation.test.ts`: future rejection (complete + no-show) + past allowed sanity → ✅ 3/3 pasan.
- 56 tests bookings totales corren verde post-fix.

**Commit:** `audit(b01): fix admin can complete/no-show future bookings (P0)`

---

## Hallazgos sin bug (validaciones positivas)

### ✅ Anti-doble-booking dual-strategy funciona

`tests/integration/race-admin-vs-online.test.ts` (nuevo, 2 tests):
1. Admin `createManualBooking` + Player `createOnlineBooking` concurrent en mismo slot → exactly 1 wins
2. N=10 mix (5 admin + 5 online) concurrent en mismo slot → exactly 1 wins

Mecanismo: combinación de:
- `lockCourtOrThrow` advisory lock (SELECT FOR UPDATE) en `booking.service.ts`
- EXCLUSION constraint `no_overlapping_bookings` en migration `004_isolated_tables.sql:288` (GIST sobre court_id × tsrange con WHERE status IN ('pending_payment', 'confirmed'))

### ✅ State machine + DB trigger immutability post-terminal

`booking.state-machine.ts` define `TRANSITIONS` explícito + `ACTOR_RULES`.
`enforce_booking_invariants_fn` trigger BEFORE UPDATE rechaza cualquier UPDATE si OLD.status es terminal (completed, no_show, expired, canceled_*) y mantiene `price_snapshot` inmutable.

### ✅ Cron jobs todos scheduleados

Verificado en `src/shared/jobs/workers/`:
- `auto-complete-bookings` → `*/30 * * * *`
- `expire-pending-booking-sweep` → `*/5 * * * *`
- `reconcile-pending-payments` → `*/5 * * * *`
- `refresh-mp-tokens` → `0 */4 * * *`
- `send-email` → `* * * * *`
- `data-retention-cleanup` → `0 10 * * 0`
- `dunning-retry` → `0 16 * * *`
- `expire-trials` → `0 11 * * *`
- `generate-abonado-slots` → `0 6 * * *`

### ✅ Duration borders correctos

`tests/integration/booking-duration-borders.test.ts` (nuevo, 4 tests):
- Slot 20:00-21:00 + slot 21:00-23:00 adyacentes en misma cancha → ambos OK ✓
- Slot 20:00-22:00 + slot 21:00-23:00 overlap → segundo rechazado con `SlotTakenError` ✓
- Mismo slot exacto duplicado → segundo rechazado ✓
- Mismo slot en canchas diferentes → ambos OK ✓

### ✅ Abonado slot-generator respeta exclusion constraint

`tests/integration/race-abonado-vs-individual.test.ts` (nuevo, 2 tests):
- Pre-existing individual booking → abonado lo marca como `conflictDates` en su retorno y skip ese día
- Concurrent abonado + individual mismo slot → DB exclusion garantiza ≤ 1 booking activo

---

## Hallazgos sin bug pero deferidos

### ⏭️ B1.8 — Online sin deposit + MP webhook tardío

Defendido por:
- `lockMpEvent(event, tx)` idempotencia por mp_event_id
- Tenant cross-check (mp-webhook.handler.ts:134-138)
- Si booking no existe → return silencioso

Test profundo asignado a **Fase B3 — MercadoPago** que requiere mock completo del flow.

### ⚠️ B1.9 — libuv assertion Windows-only

Bug conocido de Node 20 + postgres.js + Windows. Aparece en cleanup del stress test. Sin impacto en producción (servidores Linux). Documentado en `audit-structural.md`.

---

## Hallazgos para fases siguientes

### Recomendaciones para Fase B2 (RLS Multi-tenancy)

El motor de bookings usa `withTenantContext` consistentemente (verificado en cada test). No se detectaron paths que escapen del contexto tenant. **B2 puede arrancar directo con foco en matriz tabla × op × rol** sin re-auditar el motor.

### Recomendaciones para Fase B3 (MercadoPago)

- B1.8 deferido: test online sin deposit + webhook tardío
- Verificar idempotencia replay de mp-webhook con N=100 mismos eventos
- Validar refund flow (no encontrado en módulo bookings, vive en payments)
- Token refresh on 401 fail-safe (mencionado en mp-webhook.handler.ts:56 — "Hallazgo 4")

### Backlog deuda menor (P3)

- Considerar exponer `BookingNotYetEndedError` y `BookingNotYetStartedError` en API contracts (doc15) y traducir a HTTP 422 en endpoints futuros.
- Server Actions de admin (`completeBookingAction`, `markNoShowAction`) deberían capturar las nuevas excepciones y mostrar mensaje claro al usuario en UI (relevante para Fase F4).

---

## Outputs Crudos

- `docs/audit/reports/fase-b01-raw/audit-structural.md` — mapeo completo módulo + jobs + state machine + B1.6/8/9 análisis
- `docs/audit/reports/fase-b01-raw/race-admin-vs-online.txt` — output test B1.2
- `docs/audit/reports/fase-b01-raw/booking-time-validation-before-fix.txt` — output con bug demostrado
- `docs/audit/reports/fase-b01-raw/booking-time-validation-after-fix.txt` — output post-fix verde
- `docs/audit/reports/fase-b01-raw/booking-duration-borders.txt` — output test B1.10
- `docs/audit/reports/fase-b01-raw/race-abonado-vs-individual.txt` — output test B1.7

## Commits en `audit/backend-b01`

1. `audit(b01): structural audit booking module` — mapeo + cron verificación
2. `audit(b01): add race test admin manual vs player online` — Task B1.2
3. `audit(b01): fix admin can complete/no-show future bookings (P0)` — **bug fix crítico**
4. `audit(b01): add duration borders test - all pass, exclusion constraint validated` — Task B1.10
5. (commit final con report B1 + STATE + tests abonado) ← este

---

## Estado para Próxima Fase

- **Worktree `audit/backend-b01`**: mantener para PR a main.
- **Branch `audit/backend-b01`**: 5 commits, listo para PR. Incluye fix P0 + 11 tests nuevos.
- **Fase B2 (RLS Multi-tenancy)**: arrancar en worktree nuevo `audit/backend-b02` desde main post-merge.

---

## Decisiones requeridas al humano

1. **¿Mergeo `audit/backend-b01` → `main` vía PR ahora?** (Recomendado: sí — contiene fix P0 + 11 tests nuevos + reports.)
2. **¿Procedo con Fase B2 — RLS Multi-tenancy?** (Recomendado: sí — motor validado, B2 puede arrancar directo sin re-auditar bookings.)
3. **¿Algún hallazgo querés priorizar de forma distinta?** Por defecto sigo el orden del MASTER_PLAN.
