# P5 — Booking Module (state machine + concurrency, sin pagos ni cancelación)

## Context

Schema de `bookings` ya existe (migrations 04+05). Falta capa de servicio. Pilar C exige:
- State machine explícita en TS con matriz de transiciones validable.
- Primitiva de concurrencia para `pending_payment → X` (Fix #9 audit) — UPDATE condicional + rowCount.
- Creación atómica con `SELECT FOR UPDATE` + verificación dentro de tx, exclusion constraint `no_overlapping_bookings` como safety net.
- Sin cancelación (P12) ni MP (P10-11) ni PTR (P14) — esos métodos quedan fuera.

Schema/triggers ya cubren:
- `enforce_booking_invariants_fn`: `price_snapshot` inmutable + estados terminales bloquean UPDATE.
- `chk_booking_payment_consistency`: payment_method/payment_id/deposit_status consistente.
- `no_overlapping_bookings`: exclusion gist sobre `(court_id, date, tsrange)` WHERE status IN ('pending_payment','confirmed').

**Conflicto detectado (flagearlo, NO resolver en P5):** doc6 §3 admite `completed → no_show` (corrección dentro de 24h con CashFlow compensatorio). El trigger DB lista `completed` como terminal y bloquea cualquier UPDATE. P5 implementará SOLO `confirmed → no_show`. La corrección post-cierre queda como TODO para P12+ (requiere cambiar trigger o usar `SECURITY DEFINER`).

## Files

### `src/modules/bookings/booking.types.ts`
- `BookingStatus`, `BookingType`, `DepositStatus`, `PaymentMethodValue`, `CancellationActor` (alias del ENUM literal).
- `BookingRow` (mapeo `typeof bookings.$inferSelect` → camelCase, igual patrón que `CourtRow`).
- `CreateOnlineBookingInput` (playerId, courtId, date, timeStart, timeEnd, durationMins, requiresDeposit, depositPercentage).
- `CreateManualBookingInput` (courtId, date, timeStart, timeEnd, durationMins, type, staffUserId, playerId?, guestName?, guestPhone?, priceOverride?, depositAmount?, depositMethod?, notesInternal?, notesPlayer?).
- `AvailableSlot` (timeStart, timeEnd, price, available).
- `TransitionResult` = `{ won: true; row: BookingRow } | { won: false }` para la primitiva.

### `src/modules/bookings/booking.schema.ts`
Validación Zod por endpoint:
- `createOnlineBookingSchema`: playerId UUID, courtId UUID, date ISO `YYYY-MM-DD`, timeStart/timeEnd `HH:MM`, durationMins ∈ {60,120}.
- `createManualBookingSchema`: igual + `type ∈ {spontaneous, block}`, `playerId XOR (guestName+guestPhone)` cuando type='spontaneous', `priceOverride?` >= 0, `depositMethod ∈ {cash,transfer,mercadopago,other}` opcional.
- `markNoShowSchema`, `completeBookingSchema`: bookingId UUID.
- `getAvailableSlotsSchema`: courtId UUID, date ISO, durationMins.

### `src/modules/bookings/booking.state-machine.ts`
Matriz pura (sin DB). Inputs/outputs tipados.

```ts
export const TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  pending_payment: new Set(['confirmed', 'expired']),
  confirmed:       new Set(['canceled_refunded', 'canceled_no_refund', 'completed', 'no_show']),
  expired:         new Set(),
  canceled_refunded:  new Set(),
  canceled_no_refund: new Set(),
  completed:       new Set(),  // doc6 admite → no_show; bloqueado por trigger DB en P5
  no_show:         new Set(),
}

export type TransitionContext = {
  actor: 'player' | 'admin' | 'system'
  reason?: string
}

export function canTransition(from: BookingStatus, to: BookingStatus, ctx?: TransitionContext): boolean
export function assertTransition(from: BookingStatus, to: BookingStatus, ctx?: TransitionContext): void  // throws InvalidTransitionError
export class InvalidTransitionError extends Error
```

Reglas de actor (chequeadas vía `ctx`):
- `confirmed → completed` solo `system` (auto-complete) o `admin` (manual mark).
- `confirmed → no_show` solo `admin`.
- `pending_payment → expired` solo `system`.
- `pending_payment → confirmed` solo `system` (webhook MP) o `admin` (override raro). En P5 no se invoca, pero se documenta.

### `src/modules/bookings/booking.concurrency.ts`
Primitiva única usada por webhook handler MP (P10) y job de expiración (P5):

```ts
export async function transitionFromPendingPayment(
  bookingId: string,
  newStatus: 'confirmed' | 'expired',
  tx: DbTx,
): Promise<TransitionResult> {
  assertTransition('pending_payment', newStatus, { actor: 'system' })
  const result = await tx.execute(sql`
    UPDATE bookings
    SET status = ${newStatus}, updated_at = NOW()
    WHERE id = ${bookingId} AND status = 'pending_payment'
    RETURNING *
  `)
  if (result.length === 0) return { won: false }
  return { won: true, row: rowToBookingRow(result[0]) }
}
```

**Regla inviolable**: cualquier llamador DEBE chequear `won` antes de disparar side effects (email, cashflow, audit log). Documentado con comentario inline.

### `src/modules/bookings/booking.service.ts`
Funciones que usa la API/Server Actions. Todas reciben `tx: DbTx` (caller decide contexto: `withTenantContext` para admin, `withPlayerContext` para online).

#### `createManualBooking(tenantId, input, tx): Promise<BookingRow>`
1. Validar court online + tenant_id match (SELECT con `eq(courts.id, …) AND status='online'`). Si no online → throw `CourtOfflineError`.
2. Calcular `price_snapshot`:
   - Si `input.priceOverride !== undefined` → usar ese (incluye 0).
   - Si no → `calculatePrice(court.pricing, dateAtTime, durationMins)` o throw si null.
3. `SELECT id FROM courts WHERE id = $1 FOR UPDATE` (lock por cancha; previene race en mismo court).
4. Verificar `chk_overlap`: SELECT 1 FROM bookings WHERE court_id=$1 AND date=$2 AND status IN ('pending_payment','confirmed') AND tsrange overlap. Si existe → throw `SlotTakenError`.
5. INSERT con `status='confirmed'`, `created_by_staff=staffUserId`, `type=input.type ?? 'spontaneous'`, `player_id` o `guest_name+guest_phone`, `payment_method`/`deposit_amount`/`deposit_status` según input.
6. Manejar fallo de exclusion constraint (errcode `23P01`) → re-throw como `SlotTakenError` (safety net por si el lock no alcanzó).

#### `createOnlineBooking(input, tenantId, tx): Promise<BookingRow>`
1. Validar court online (igual).
2. **No** crear PTR aquí (P14). Solo INSERT del booking.
3. Calcular `price_snapshot` = `calculatePrice(court.pricing, …)` — siempre dentro de tx, nunca cliente.
4. `SELECT FOR UPDATE` cancha + verificar overlap + INSERT con:
   - `status = requiresDeposit ? 'pending_payment' : 'confirmed'`
   - `deposit_amount` = `requiresDeposit ? Math.round(priceSnapshot * pct/100) : 0`
   - `deposit_status` = `requiresDeposit ? 'pending' : 'not_required'`
   - `payment_method = null` (la fila en `payments` se crea en P10 al generar preference). Consistente con `chk_booking_payment_consistency` cuando deposit_status='pending' y payment_method=null + payment_id=null → ❌ falla. Plan: si `requiresDeposit=true`, NO insertar fila aquí; primero generar preference MP y crear fila con `payment_method='mercadopago'+payment_id` ya populado. **P5 NO implementa la rama con seña** (defer a P10). Solo implementa la rama `requiresDeposit=false → confirmed`.
   - **Decisión**: en P5, `createOnlineBooking` SOLO acepta tenants con `requires_deposit=false`. Si `requires_deposit=true`, throw `DepositFlowNotImplementedError`. Test integration cubre el rechazo. P10 reemplaza la implementación por la versión completa.

> Alternativa B (preguntar al user si se prefiere): permitir el INSERT con check_violation y dejar que la rama caiga; pero eso requiere cambiar `chk_booking_payment_consistency` o pre-crear la fila de payments en P5 con stub. Más sucio. Recomiendo la decisión arriba.

#### `completeBooking(bookingId, ctx, tx): Promise<BookingRow>`
- `assertTransition('confirmed', 'completed', ctx)`.
- UPDATE condicional: `WHERE id=$1 AND status='confirmed'`. Si rowCount=0 → throw `BookingNotInConfirmedError`.
- Devuelve fila actualizada. NO crea CashFlow (eso es P11).
- Caller separado para auto-complete masivo (job): un wrapper que recibe lista de IDs y hace el UPDATE masivo `WHERE status='confirmed' AND date+time_end < NOW()-30min`.

#### `markNoShow(bookingId, staffUserId, tx): Promise<BookingRow>`
- ctx = `{ actor: 'admin' }`.
- `assertTransition('confirmed', 'no_show', ctx)`.
- UPDATE condicional `WHERE status='confirmed'`. rowCount check.
- NO toca `tenant_player_bans` (Flujo 4D ban automático es P12+).
- NO crea CashFlow compensatorio (P11).

#### `expirePendingBooking(bookingId, tx): Promise<TransitionResult>`
- Wrapper sobre `transitionFromPendingPayment(bookingId, 'expired', tx)`.
- El job cron lo invoca; si `won=false` → otro proceso ya transicionó (webhook ganó). No-op.

#### `getAvailableSlots(courtId, date, durationMins, tx): Promise<AvailableSlot[]>`
- SELECT court (pricing + tenant.opening_hours via join).
- Generar slots en grilla del día (8:00–close, paso = durationMins).
- SELECT bookings activas (`status IN ('pending_payment','confirmed')`) con overlap a cualquier slot generado.
- Marcar `available=false` los que solapan.
- `price` por slot vía `calculatePrice`.

### Errores tipados (en `booking.types.ts` o nuevo `booking.errors.ts`)
- `CourtOfflineError`, `SlotTakenError`, `InvalidTransitionError`, `BookingNotInConfirmedError`, `DepositFlowNotImplementedError`, `PriceUnavailableError`.

## Tests

### Unit — `tests/unit/booking-state-machine.test.ts`
Matriz exhaustiva. Para cada par `(from, to)` ∈ `BookingStatus × BookingStatus`:
- Si está en `TRANSITIONS[from]` → `canTransition` = true (con ctx válido).
- Si no → false.
- `assertTransition` lanza `InvalidTransitionError` con mensaje que incluya from+to.
- Reglas de actor: `confirmed → no_show` con `ctx.actor='player'` → false. `pending_payment → confirmed` con `ctx.actor='player'` → false.
- Cobertura completa de doc6 §3 (15 transiciones válidas + matriz de 49 inválidas).

### Unit — `tests/unit/booking-service.test.ts`
- `getAvailableSlots`: 1 court con pricing fijo + array de bookings mock → verificar que slots overlapped salen con `available=false`.
- `calculatePrice` ya está testeado en court-service. No re-test aquí.

### Integration — `tests/integration/bookings.test.ts`
Reusa `helpers/tenant.ts` + `helpers/factories.ts`.

1. **createManualBooking happy path**: tenant + court online + INSERT → status='confirmed', price_snapshot capturado.
2. **createManualBooking court offline → CourtOfflineError**.
3. **createManualBooking con priceOverride=0** → permitido (cortesía).
4. **createManualBooking con guestName sin player** → válido si type='spontaneous'.
5. **Race condition (Fix #9)**: 2 promesas concurrentes invocan `transitionFromPendingPayment` sobre el mismo booking en pending_payment. Una gana (`won=true`), otra pierde (`won=false`). Side effect counter solo se incrementa 1 vez.
6. **Exclusion constraint safety net**: 2 bookings overlap (mismo court+date+rango) — el segundo debe fallar con error `no_overlapping_bookings` (errcode `23P01`). Test usa INSERT directo sin SELECT FOR UPDATE para forzar la safety net.
7. **price_snapshot inmutabilidad**: UPDATE manual `SET price_snapshot=999` → trigger lanza error.
8. **Estado terminal inmutable**: insertar booking, transicionar a `expired`, intentar UPDATE de cualquier campo → trigger rechaza.
9. **completeBooking confirmed → completed**: éxito.
10. **completeBooking en pending_payment → BookingNotInConfirmedError**.
11. **markNoShow confirmed → no_show**: éxito + ctx.actor=admin.
12. **expirePendingBooking happy**: pending_payment → expired, won=true.
13. **expirePendingBooking sobre booking ya confirmed → won=false** (UPDATE condicional no matchea).

## Verificación

```bash
pnpm typecheck                 # debe pasar
pnpm test:unit                 # state-machine matrix completa + service unit
pnpm test:integration          # bookings.test.ts + race + exclusion
pnpm lint                      # ESLint
```

Criterios:
- Cobertura matriz completa state machine (15 válidas + ~49 inválidas).
- Test race con 2 workers concurrentes pasa.
- Test exclusion constraint pasa.
- 0 errores typecheck/lint.

## Decisiones que esperan OK

1. **Diferir flujo CON seña en `createOnlineBooking`** a P10 (rechazo explícito si `requires_deposit=true`). Alternativa: cambiar `chk_booking_payment_consistency` para permitir `deposit_status='pending'` con `payment_method=null`. Recomiendo la primera (no tocar schema en P5).
2. **No implementar `completed → no_show`** (correction post-24h). Trigger DB lo bloquea. Defer a P12+.
3. **No crear PTR en `createOnlineBooking`** (P14).
4. **No crear filas en `payments`/`cash_flows`** desde el service (P10/P11).
5. **`createManualBooking` con seña efectivo/transfer**: SÍ se acepta — `payment_method='cash'/'transfer'`, `payment_id=null`, `deposit_status='paid'`. `chk_booking_payment_consistency` lo permite. Sin fila en `payments` (la auditoría es vía CashFlow en P11).
