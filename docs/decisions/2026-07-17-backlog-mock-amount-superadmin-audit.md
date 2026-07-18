# Decisiones #4 (mock MP amount=1) y #5 (auditoría super-admin)

**Fecha:** 2026-07-17
**Estado:** Decididas (dueño: Lazar). NO tocan código — son aceptación de riesgo / diferimiento.
**Origen:** findings 🟡 del veredicto `docs/qa/HAPPY_PATHS_RUN_2026-07-16.md` (§ mock-amount línea 145, § auditoría super-admin líneas 161-166).

---

## #4 — Mock MP escribe `amount=1` en no-prod → DECISIÓN: **ACEPTAR** (riesgo staging-only)

### Qué es
`LocalMockGateway.getPaymentStatus` (`src/modules/payments/mock-mp.ts:82,90`) devuelve
`amount:1` fijo. Ese valor se escribe en `payments.amount` (`upsertPaymentRow`) y se
usa como fuente de verdad en 3 lugares reales, SOLO bajo `isNonProductionRuntime`
(dev/E2E/staging — **nunca en prod**, donde el gateway devuelve el monto real):
1. **confirmado:** `handleApproved` inserta `audit_logs 'payment.amount_discrepancy'`
   en cada seña mock-aprobada (`receivedCents:1 < expectedCents:5000`).
2. latente: `recordDepositCashFlow` registraría $0,01 en caja si el tenant tuviera staff.
3. latente: `prepareRefund` lee `original.amount=1` → `RefundAmountExceedsOriginalError`
   bloquea testear un refund MP legítimo en el mock (por eso TG-HP-108 no se pudo correr en mock).

### Decisión y razón
**Aceptar el status quo. No se toca el mock.** El bug NO alcanza producción (gate
`isNonProductionRuntime`). El fix recomendado por el QA (que el mock derive el
`deposit_amount` real del bookingId) tiene **ripple en tests** (rompe asserts que
esperan `amount=1`, ej. TG-HP-104) y **ROI bajo pre-launch**: los refunds MP se
validan de verdad con el **sandbox REAL de MP en fase 2**, no con el mock. Pagar ese
trabajo ahora no compra nada que la fase 2 no cubra mejor.

### Reversibilidad / consecuencias aceptadas
Trivial de revertir (el fix del mock queda como candidato de fase 2, junto con el
resto del testing MP real). Consecuencia aceptada: en staging/no-prod hay ruido de
`payment.amount_discrepancy` en el audit y $0,01 latente en caja; refund MP no se
testea en mock (se testea con MP real en fase 2). Ver memoria `mock-mp-amount-pollutes-nonprod`.

---

## #5 — Trazabilidad de auditoría del super-admin → DECISIÓN: **DIFERIR** a v1.5

### Qué es (governance, NO corrupción de plata)
4 sub-puntos 🟡 de trazabilidad del panel super-admin (`docs/qa/HAPPY_PATHS_RUN_2026-07-16.md:161-166`):
1. Cuando un super-admin fuerza un estado, la fila canónica del FSM la escribe
   `insertSystemAuditLog` con el actor **SENTINEL** (`00000000-…`), igual que el sweep
   automático; el actor real solo aparece en una fila `support.*` separada, sin
   correlation_id → un filtro `action='tenant.suspended'` no distingue manual de automático.
2. Metadata de causa hardcodeada (`reason:'dunning_day_7'`) no distingue forzado-manual de sweep.
3. `forceTenantStatusAction` no captura motivo (a diferencia de `cancelSubscriptionAction`,
   que exige 3-500 chars) → bloquear un complejo queda sin justificación en el audit.
4. `'suspended'` no está en `DESTRUCTIVE_TARGET_STATUSES` (`support.schema.ts:13`) pese a
   cortar acceso a un cliente pagante — no exige confirmar nombre, a diferencia de `blocked`/`deleted`.

### Decisión y razón
**Diferir a v1.5.** Es **governance/trazabilidad, no dinero**: las transiciones de plata
del super-admin quedaron CONFIRMED ×3 lentes en el veredicto (dunning 7d/14d,
nombre-exacto, auditoría inmutable por REVOKE, estado final sin orphans). Ninguno de los
4 puntos rompe plata ni aislamiento; degradan la calidad forense del audit. En v1, con
pocos super-admins de confianza, es un riesgo aceptable. Se reabre en v1.5 como
endurecimiento de governance (actor real + correlation_id + motivo obligatorio +
`suspended` destructivo).

### Reversibilidad / consecuencias aceptadas
Trivial (no hay migración de datos; son cambios de instrumentación). Consecuencia
aceptada hasta v1.5: filtrar el audit por `action` no separa manual de automático, y
forzar `suspended`/bloquear queda sin justificación textual.

### Ya cerrado de este bloque (no diferido)
- 🟢 `product_id NULL` en cash_flows → **RESUELTO** por la deprecación #6 (migr. 046, la
  columna ya no existe).
- El force-`'deleted'` (que dejaba tenants huérfanos) → **cerrado** en `befad5d` (B5).
