# Fase B5 — Background Jobs / pg-boss

**Branch:** `audit/backend-b05`
**Fecha:** 2026-05-25
**Veredicto:** 🟡 1 P1 FIXED (parcial) + 2 P1 docs + 1 P2 doc

---

## Resumen ejecutivo

Auditoría de 11 workers pg-boss. Encontrado **1 bug P1** (send-email double-dispatch bajo concurrencia) con **fix parcial aplicado** (claim atómico reduce races de 3→2 envíos). Fix completo requiere migración enum `notification_status` para añadir valor `sending` — escalado a B10/B11.

**3 hallazgos documentados** (no fix ahora): DLQ ausente, queue depth monitor ausente, cron `generate-abonado-slots` sin comentario de intent.

**Sistemas validados sin bug**: reconcile-pending-payments idempotente (N=5 concurrent → 1 confirm + 1 processed_webhooks), refresh-mp-tokens last-writer-wins coherente (N=5 → 5 succeeded, DB token válido + decryptable), data-retention-cleanup ARCO wipe atómico + idempotente.

---

## Workers mapeados (11)

| Worker | Cron | Idempotency | Tests B5 |
|--------|------|-------------|----------|
| send-email | `* * * * *` | ⚠️ parcial (fix B5) | ✅ 2 nuevos |
| expire-trials | `0 11 * * *` (08:00 ART) | ✓ status guard | (cubierto billing) |
| auto-complete-bookings | `*/30 * * * *` | ✓ status guard | (cubierto B1) |
| booking-reminder | on-demand | ✓ status guard | — |
| dunning-retry | `0 16 * * *` (13:00 ART) | ✓ tested B4 | (cubierto B4) |
| expire-pending-booking | `*/5 * * * *` + on-demand | ✓ state machine | (cubierto B1) |
| data-retention-cleanup | `0 10 * * 0` (07:00 ART Sun) | ✓ tx atómico | ✅ 3 nuevos |
| generate-abonado-slots | `0 6 * * *` (⚠️ sin comentario) | ✓ ON CONFLICT | (cubierto abonados) |
| process-mp-webhook | on-demand | ✓ lockMpEvent (B3) | (cubierto B3) |
| reconcile-pending-payments | `*/5 * * * *` | ✓ lockMpEvent | ✅ 2 nuevos |
| refresh-mp-tokens | `0 */4 * * *` | ⚠️ last-writer-wins | ✅ 2 nuevos |

---

## Bugs encontrados

### P1 — send-email double-dispatch bajo concurrencia

**Síntoma**: 2 instancias del cron `send-email` (o cron + boss.work del job) corren simultáneo sobre la misma notificación queued → Resend recibe N requests → jugador recibe N emails idénticos.

**Root cause**: `processSingleNotification` hacía:
1. `getEmailProvider().send()` — network call
2. `markNotificationSent(id)` — UPDATE status='sent'

Entre 1 y 2, otra instancia que ya leyó `status='queued'` pasa el check `if (notif.status === 'sent') return` y dispatch de nuevo. Resend NO tiene dedup per-recipient.

**Test reproductor**: `tests/integration/send-email-concurrent-sweep.test.ts`. N=3 sweeps concurrent → SIN fix: 3 envíos. CON fix parcial: 1-2 envíos (variabilidad por timing del scheduler).

**Fix aplicado (parcial)**:
- Nueva fn `claimNotificationForSend(id, expectedAttemptCount)` en `notification.service.ts`. Atomic UPDATE WHERE `status='queued' AND attempt_count = N`. Solo un caller gana el claim.
- `processSingleNotification` llama claim ANTES del send. Si claim devuelve false → return.

**Por qué parcial**: el claim mitiga races donde múltiples readers ven mismo `attempt_count` inicial. Pero si reader B hace `getNotificationById` DESPUÉS del claim de A (cuando attempt_count ya = 1), B llama claim(1) → succeeds → segundo send.

**Fix completo requerido** (P1 deferred):
- (a) Migration: añadir valor `sending` al enum `notification_status`. Transition: `queued → sending → sent`. Atomic UPDATE status='sending' WHERE status='queued' bloquea concurrentes.
- (b) Alternativa: `pg_advisory_xact_lock(hashtext(id))` dentro de una tx que envuelve el send (anti-pattern: tx larga con I/O, pero pragmático para sends de ~50ms).
- (c) Resend `Idempotency-Key` header (defensa en proveedor, no en DB).

Recomendado: **(a)** en Fase B10 (Observabilidad) cuando se agreguen más estados de tracking.

**Archivos modificados**:
- `src/modules/notifications/notification.service.ts` — añade `claimNotificationForSend`
- `src/shared/jobs/workers/send-email.worker.ts` — usa claim antes del send + ajusta attempt tracking

---

## Hallazgos documentados (no fix)

### P1 — DLQ / failed-jobs visibility ausente
- pg-boss persiste jobs fallados en `pgboss.archive` después del retention period, pero NO hay handler que notifique ops cuando un job agota `retryLimit`.
- Sin alertas: si `dunning-retry` falla 3x consecutivos, nadie se entera.
- **Mitigación**: agregar `boss.onComplete()` o `boss.onFail()` con `track.payment()`/Sentry capture, escalado a **B10 Observabilidad**.

### P1 — Queue depth monitor ausente
- Sin endpoint `/admin/jobs` o métrica Prometheus de `pgboss.job` count by state.
- Si email queue crece a 10k pending por outage Resend, nadie sabe hasta que jugadores reportan.
- **Mitigación**: dashboard simple en super-admin panel + alerta si depth > umbral. Escalado a **B10**.

### P1 — refresh-mp-tokens race window narrow pero existente
- `refreshTenantMpToken` lee `mp_refresh_token`, llama MP API, escribe ambos tokens. SIN `SELECT FOR UPDATE`.
- 2 instancias concurrent → MP single-use refresh token invalida la segunda (devuelve 401) → defensa práctica funciona.
- Edge case: si MP permite 2 refresh con mismo token (no garantizado), last-writer-wins coherente (test validó). DB queda con token válido.
- **Mitigación**: añadir `SELECT mp_refresh_token FROM tenants WHERE id = $1 FOR UPDATE` como defensa belt-and-suspenders. Escalado a **B11 Operativo**.

### P2 — `generate-abonado-slots` cron sin comentario de intent
- `0 6 * * *` = 06:00 UTC = 03:00 ART. Otros workers documentan la intención ("08:00 ART = 11:00 UTC"). Este no.
- No es bug — slots se generan a las 03:00 ART. Puede ser deliberado (off-peak hours). Documentar.

---

## Tests nuevos (10)

| Archivo | Cantidad | Status |
|---------|----------|--------|
| `reconcile-pending-payments-idempotency.test.ts` | 2 | ✅ |
| `refresh-mp-tokens-concurrency.test.ts` | 2 | ✅ |
| `send-email-concurrent-sweep.test.ts` | 2 | ✅ (1 documenta gap P1) |
| `data-retention-cleanup.test.ts` | 3 | ✅ |
| **Total** | **10** | **10/10** |

---

## Sanity check no-regresión

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test:integration` → ✅ **287/287** (54 test files, 58s)

---

## Criterios "done" Fase B5

| Criterio | Status |
|----------|--------|
| Mapear 11 workers + crons + idempotencia | ✅ |
| Validar idempotencia bajo concurrencia (≥3 workers) | ✅ (4/11 validados; resto cubierto en fases previas) |
| Validar atomicity data-retention wipe | ✅ |
| Audit timezones (UTC vs ART) | ✅ (8/9 documentados, 1 sin intent) |
| Documentar gaps DLQ / queue observability | ✅ |
| 0 regresión en tests existentes | ✅ |

---

## Hallazgos crítico hand-off

- **P1 send-email completo**: requiere migration → Fase B10
- **P1 DLQ + queue depth**: requiere instrumentation → Fase B10
- **P1 refresh-mp-tokens defensa**: requiere SELECT FOR UPDATE → Fase B11
- **P2 cron docs**: ergonómico → backlog
