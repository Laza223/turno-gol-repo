# Fase B3 — MercadoPago Report

**Fecha:** 2026-05-24
**Worktree:** `audit/backend-b03`
**Tests verde post-cambios:** 10/10 cancellations + 3/3 refund-validation + 2/2 idempotency-massive

---

## Resumen Ejecutivo

| Task | Hallazgo | Resultado | Tests | Fix |
|------|----------|-----------|-------|-----|
| B3.1 Webhook idempotencia masiva | `lockMpEvent` INSERT ON CONFLICT atómico funciona N=20 concurrent + N=50 sequential | ✅ Validado | 2 | No |
| B3.2 Refund partial + total consistency | **🚨 2 BUGS P1**: over-refund + double-refund permitidos | ✅ FIXED | 3 | **Sí** |
| B3.3 Token refresh on 401 | 6 unit tests cubren todos los casos (isMpUnauthorized + withTokenRefresh) | ✅ Pre-existente | 0 | No |
| B3.4 Online sin deposit + webhook tardío | Defensa OK: mp_payment_id UNIQUE + processed_webhooks lock + transitionFromPendingPayment won=false | ✅ Validado por análisis | 0 | No |
| B3.5 Encryption at-rest MP tokens | AES-256-GCM con IV random + authTag. ENCRYPTION_KEY 32 bytes hex | ✅ Validado | 0 | No |
| B3.6 Cierre fase | Report + commit + STATE | 🟢 | - | - |

**Total tests nuevos: 5** (todos verdes).
**Fixes código: 2 archivos** (`payment.errors.ts` + `payment.service.ts`).
**Tests legacy ajustados: 1** (`cancellations.test.ts` — fechas a CURRENT_DATE - 1 día).

---

## Veredicto Global

🟡 **MP VALIDADO CON 2 BUGS P1 FIXED**

MercadoPago integration es sólida en idempotencia y encryption. Pero `createRefund` tenía 2 bugs P1 que permitían over-refund y double-refund. **Fixed**.

---

## Bugs P1 Detectados y Fixed

### 🚨 BUG #1: `createRefund` permitía refund > original.amount

**Severidad:** P1 (riesgo monetario)

**Comportamiento previo:**
```ts
const refundAmount = amount ?? original.amount
const refund = await gateway.createRefund(original.mpPaymentId, refundAmount)
```
No validaba que `refundAmount <= original.amount`. Si admin (o bug en UI) pasaba 200_000 sobre un payment de 100_000, llamaba a MP con ese monto. **MP podría rechazar (defensa externa), pero la app no validaba primero**. Si MP lo aceptaba (cambio de API), refund > cobro → pérdida.

### 🚨 BUG #2: `createRefund` permitía double refund del mismo payment

**Severidad:** P1 (riesgo monetario)

**Comportamiento previo:**
No tracking de refunds previos. Llamar `createRefund(paymentId, 50_000)` dos veces sobre un payment de 50_000 lograba 2 refunds = 100_000 reembolsado.

### Fix unificado

**`src/modules/payments/payment.errors.ts`**: nueva clase `RefundAmountExceedsOriginalError`.

**`src/modules/payments/payment.service.ts:createRefund`**: nueva validación pre-call MP:
```ts
const priorRows = await tx.execute(sql`
  SELECT COALESCE(SUM(amount), 0)::bigint AS total
  FROM payments
  WHERE booking_id = ${original.bookingId}
    AND type = 'refund'
    AND status IN ('approved', 'pending')
    AND description LIKE ${'%' + original.id + '%'}
`)
const priorTotal = Number(...)
const available = original.amount - priorTotal
if (refundAmount > available) {
  throw new RefundAmountExceedsOriginalError(paymentId, refundAmount, available)
}
```

**Lógica**: sum de refunds activos para ese booking referenciando el original ID en description, available = original.amount - prior, rechaza si excede.

**Verificación:**
- 3 tests nuevos `tests/integration/mp-refund-validation.test.ts`: 3/3 verdes
- Tests legacy `cancellations.test.ts`: 10/10 verdes (ajustados a CURRENT_DATE - 1 día para satisfacer time validation de B1)

---

## Validaciones positivas

### ✅ Webhook idempotencia massive

`lockMpEvent` usa `INSERT INTO processed_webhooks ... ON CONFLICT (mp_event_id) DO NOTHING RETURNING id`. Atómico por DB constraint.

Tests `tests/integration/mp-webhook-idempotency-massive.test.ts`:
- N=20 concurrent → exactly 1 fresh ✓
- N=50 sequential → exactly 1 fresh ✓
- COUNT en `processed_webhooks` = 1 ✓

### ✅ Token refresh on 401 (cubierto por unit tests pre-existentes)

`withTokenRefresh` + `isMpUnauthorized` tienen 6 tests unit que cubren:
- detecta 401 across shapes (status, statusCode, cause.status, message)
- no retry on non-401
- refresh + retry once on 401
- propaga second 401 después de refresh

### ✅ Defensa dual ante webhook tardío sin deposit

Cuando booking se crea con `requiresDeposit=false` → status `confirmed` direct (sin payment).
Si webhook MP llega tardío para ese booking (escenario sintético/raro):
- `lockMpEvent` registra el evento (idempotencia por mp_event_id) ✓
- `dispatchPaymentInfo → handleApproved → upsertPaymentRow` inserta payment con `mp_payment_id UNIQUE` (si duplicate, falla) ✓
- `transitionFromPendingPayment(bookingId, 'confirmed')` returns `won=false` (booking ya confirmed) ✓
- No corrompe estado del booking ni duplica side effects

### ✅ Encryption at-rest MP tokens

`src/lib/crypto/encrypt.ts`:
- AES-256-GCM con IV de 12 bytes random ✓
- ENCRYPTION_KEY: 64 hex chars (32 bytes) ✓
- AuthTag verificado en decrypt ✓

`src/modules/payments/mp-oauth.ts`:
- access_token + refresh_token encryptados antes de persist ✓
- Refresh decrypts → llama MP → encrypts nuevo ✓

---

## Hallazgos para fases siguientes

### Para B11 (Operativo)
- Documentar ARM ENCRYPTION_KEY rotation strategy (no encontrado en código)
- Validar que ENCRYPTION_KEY en prod NO es el default del .env.example

### Para B7 (API Contracts)
- Endpoints públicos `/api/mp/*` deberían validar input con Zod schema (a auditar en B7)

### Para F4 (Admin CRUDs)
- UI de refund debería respetar la nueva validación: mostrar "monto disponible: $X" basado en refunds previos

---

## Outputs Crudos

- `docs/audit/reports/fase-b03-raw/idempotency-massive.txt`
- `docs/audit/reports/fase-b03-raw/refund-validation.txt` (before fix - 3 tests documentando bugs)
- `docs/audit/reports/fase-b03-raw/refund-validation-after-fix.txt` (3/3 verde post-fix)

---

## Estado para Próxima Fase

- **Worktree `audit/backend-b03`**: listo para merge a main.
- **Fase B4 (Billing SaaS)** o **B5 (Jobs)**: pueden arrancar en paralelo (independientes).

---

## Decisiones requeridas

1. **¿Mergeo `audit/backend-b03` → `main`?** (Recomendado: sí — 2 fix P1 + 5 tests)
2. **¿Continuar con B4 o pausar?** (Tu llamada según contexto disponible)
