# Fase B4 — Billing SaaS Report

**Fecha:** 2026-05-24
**Tests verde:** 17/17 (14 existentes + 3 nuevos B4)

---

## Resumen Ejecutivo

| Task | Hallazgo | Resultado | Tests |
|------|----------|-----------|-------|
| B4.1 Audit estructural | 1338 LOC en billing module + 14 tests legacy bien cubren FSM | ✅ | 0 |
| B4.2 Race condition dunning | onPaymentApproved race-safe via lockWebhook + status WHERE-guard | ✅ | 2 |
| B4.3 Cron dunning idempotente | runDunningSweep N=5 → 1 transición (idempotent by status SELECT) | ✅ | 1 |
| B4.4 Reactivate from churned | wrapper allowed=[canceled, churned], blocked rechazado, deletion gate ✓ | ✅ Validado código | 0 |

**Total tests nuevos: 3** (todos verdes). **Bugs encontrados: 0**.

---

## Veredicto Global

🟢 **BILLING SOLID**

Billing SaaS está sólidamente diseñado:
- 14 tests existentes cubren lifecycle FSM completo (trialing→active, dunning escalation rejected→past_due→suspended→blocked→churned, voluntary cancel, retention cleanup, upgrade proration, downgrade gate, suspended mutations)
- Race conditions cubiertas por DB-level constraints (WHERE status='X' en UPDATE = atómico)
- Webhook idempotent via lockWebhook (mp_event_id UNIQUE)
- Cron sweep idempotent by design (SELECT por status que cambia tras primera transición)
- Reactivate gate respetado (canceled/churned OK, blocked/past_due/suspended NO via reactivate; deletion_at gate)

**0 bugs detectados en B4.** Fase pasa sin fixes.

---

## Validaciones positivas

### ✅ Race condition concurrent webhooks (B4.2)

`tests/integration/billing-race-conditions.test.ts`:
1. 2 webhooks distintos mpEventIds → estado final coherente (active) ✓
2. 10 webhooks mismo mpEventId → exactly 1 fresh ✓

Mecanismo: `lockWebhook` por mp_event_id + `UPDATE WHERE status='trialing'` atómico.

### ✅ Cron dunning idempotente (B4.3)

`tests/integration/dunning-sweep-idempotency.test.ts`:
- Tenant past_due con dunning_started_at -8d
- runDunningSweep × 5
- Resultado: 1 transición a suspended (no más)

Idempotente porque `SELECT WHERE status='past_due' AND dunning_started_at <= NOW()-INTERVAL '7 days'` deja de matchear después de primera transición.

### ✅ Reactivate gate (B4.4 validado por análisis)

`billing.service.ts:reactivate` (líneas 412-476):
- allowed: `['canceled', 'churned']`
- Rechaza si `scheduled_deletion_at <= now`
- Status `blocked, past_due, suspended` rechazados con ReactivateNotAllowedError

Test legacy `billing.test.ts:reactivate` cubre: canceled allowed + blocked rejected.

---

## Hallazgos sin bug pero notas operativas

- **MP retry on InvalidTransitionError loser**: cuando 2 webhooks concurrent llegan para mismo tenant trialing, uno wins (transition trialing→active) y otro lanza `InvalidTransitionError` (porque ya no está trialing). MP retrymeará el rejected webhook → spam logs pero no corruption. **Recomendación operacional (no bug)**: en B10 (Observabilidad) configurar Sentry para no alertar sobre InvalidTransitionError repetidos en dunning context.

---

## Outputs Crudos

- `docs/audit/reports/fase-b04-raw/billing-race.txt`
- `docs/audit/reports/fase-b04-raw/dunning-idempotency.txt`

---

## Estado para Próxima Fase

- **Worktree `audit/backend-b04`**: listo para merge.
- **Fase B5 (Jobs)** o **B6 (Auth)**: independientes, paralelizables.

---

## Decisiones requeridas

1. **Mergeo `audit/backend-b04` → `main`?** (Recomendado: sí — 3 tests + 0 bugs detectados)
2. **¿Continuar con B5 (Jobs) o cerrar sesión acá?** Mi recomendación: cerrar acá — bloque crítico completo.
