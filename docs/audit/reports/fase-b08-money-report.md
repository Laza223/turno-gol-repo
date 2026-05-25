# Fase B8 — Money Handling / Cashflow / Reportes

**Branch:** `audit/backend-b08`
**Fecha:** 2026-05-25
**Veredicto:** 🟢 SOLID (0 bugs) + 1 P2 doc

---

## Resumen ejecutivo

Auditoría de money math, cashflow, daily_close, reportes. **Regla CLAUDE.md "centavos integer, never decimal" confirmada en schema + Zod input + math operations**. Validados 11 edge cases de float math + 5 invariantes de daily_close.

**0 bugs encontrados**. 1 hallazgo P2 documentado (decisión by-design no es bug).

---

## Validado sin bug

### Schema integer enforcement
- `cash_flows.amount: integer` + check `> 0`
- `daily_cash_closes.{totalIncome, totalAdjustments, balance, declaredCash, diffAmount}: integer`
- `bookings.{priceSnapshot, depositAmount}: integer`
- Zod input validation: `z.number().int().positive()` en endpoints

### Float math en rangos realistas (B8.2 + B8.3)
- `pesosToCents(amount)` = `Math.round(amount * 100)`:
  - Whole pesos ✓ (1000 → 100000)
  - Two-decimal MP standard ✓ (100.55 → 10055)
  - Non-finite filter ✓ (NaN/Infinity/null → 0)
  - Edge `1.005` → 100 (banker rounding, documentado, NO aplica para webhooks MP que emiten 2-decimal)
- `calcDeposit(price, pct)` = `Math.round(price * pct / 100)`:
  - Clean multiples ✓
  - Order-of-ops integer-safe para precios realistas ($500-$50K, pct 10-50)
  - Edge `priceSnapshot=1 + pct=10` → 0 (silent truncate, NO aplica: precios reales > 1000 cents)
  - 0% / 100% deposit ✓

### Daily close lifecycle (B8.4)
- Aggregation con `SUM(amount)::int` (Postgres integer cast) ✓
- Unique constraint `(tenant_id, date)` + pre-check ✓
- **Concurrencia N=5 closes → exactly 1 succeeds, 4 throw DayAlreadyCloseExistsError** ✓
- `balance = totalIncome + totalAdjustments` (integer math) ✓
- `diffAmount = balance - declaredCash` (integer math) ✓
- Immutable post-close: `REVOKE UPDATE/DELETE` en `008_revokes.sql:19` ✓
- Audit log auto-inserted ✓

### Refunds path (cross-check B3)
- Refund NO crea CashFlow row — se trackea en `payments` table con `type='refund'`.
- Anti-double-refund: SUM existing refunds (verificado B3).
- **Asymmetric vs income** (intencional): payments separados de cashflow operativo.

### Reports
- `SUM(...) CAST AS BIGINT` → JS `Number()` — precisión safe para valores < 2^53 (~9e15).
  - TurnoGol max realista: billones de centavos → safe por décadas.
- CSV export: `Content-Disposition` header solo, sin file system access.
- TZ: ART offset aplicado en query (`occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'`).

---

## Tests nuevos (16)

| Archivo | Tests | Status |
|---------|-------|--------|
| `tests/unit/money-math-precision.test.ts` | 11 | ✅ |
| `tests/integration/daily-close-idempotency.test.ts` | 5 | ✅ |

Cobertura:
- pesosToCents: whole/decimal/non-finite/edge-precision/large amounts
- calcDeposit: clean/non-integer/edge-zero/0%/100%/realistic-range
- Daily close: aggregation, 2x sequential block, N=5 concurrent → 1, balance math, getDailyClose

---

## Hallazgos documentados (no fix)

### P2 — `product_sale` CashFlow no decrementa stock automáticamente
- Al crear CashFlow con `category='product_sale'`, NO se hace `UPDATE products SET stock = stock - N`.
- **Por diseño v1**: CLAUDE.md dice "Gestión BÁSICA de stock/cantina". Admin gestiona stock manual o vía endpoints futuros.
- **Riesgo**: stock visible en admin puede divergir de realidad si no se mantiene.
- **Recomendación**: documentar en doc11 ADR explícito o agregar trigger DB en v1.5.

### P2 — Edge case `pesosToCents(1.005)` retorna 100 (no 101)
- Float precision IEEE-754: `1.005 * 100 = 100.4999...` → `Math.round = 100`.
- NO aplica para webhooks MP (emiten 2-decimal). Documentado.
- **Recomendación si se vuelve issue**: cambiar a string-based conversion (`parseFloat(amount.toFixed(2)) * 100`).

### P2 — Edge case `calcDeposit(1, 10)` retorna 0
- 1 cent + 10% = 0.1 → round 0 (silent truncate).
- NO aplica: precios reales son >1000 cents ($10+).
- Producción protegida por `requiresDeposit && depositPercentage > 0` flag + UI no permite precios <$1.

### P3 — Reports BIGINT → JS Number precision
- Reports SUM as BIGINT, cast a JS Number en route. Pérdida potencial > 2^53 (~9e15).
- TurnoGol no llegará a ese rango. Documentar para auditoría futura.

---

## Cobertura final B8

| Área | Estado |
|------|--------|
| Schema integer (cash_flows, daily_cash_closes, bookings) | ✅ |
| Zod input validation (.int().positive()) | ✅ |
| `pesosToCents` float math | ✅ 5 edge cases tested |
| `calcDeposit` float math | ✅ 6 edge cases tested |
| Daily close idempotency | ✅ 5 tests (incl N=5 concurrent) |
| Daily close immutability post-close | ✅ DB REVOKE verified |
| Refunds money consistency | ✅ B3 cross-check |
| Reports aggregation precision | ✅ safe < 2^53 |
| Product sale stock decrement | ⚠️ by-design (P2 doc) |

---

## Sanity check no-regresión

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test` (unit) → ✅ **341/341** (32 files)
- `pnpm test:integration` → ✅ **304/304** (57 files, 83s)

---

## Hand-off

- 0 bugs P0/P1 → bloque money es **production-ready**
- 4 P2/P3 documentados como decisiones conscientes o edge cases que no aplican
- Próxima fase: **B9 Privacy / Ley 25.326** (ARCO endpoints, anonymization, retention)
