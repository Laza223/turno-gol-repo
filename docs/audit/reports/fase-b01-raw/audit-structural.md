  267 src/modules/bookings/booking.cancellation.ts
   44 src/modules/bookings/booking.concurrency.ts
   78 src/modules/bookings/booking.errors.ts
  205 src/modules/bookings/booking.expiry.ts
   41 src/modules/bookings/booking.mappers.ts
   75 src/modules/bookings/booking.schema.ts
  555 src/modules/bookings/booking.service.ts
   72 src/modules/bookings/booking.state-machine.ts
   91 src/modules/bookings/booking.types.ts
 1428 total

## State machine transitions
import { InvalidTransitionError } from './booking.errors'
import type { BookingStatus, CancellationActor } from './booking.types'

export type TransitionContext = {
  actor: CancellationActor
  reason?: string
}

// doc6 §3 — Booking state machine. Source of truth for valid transitions.
// Self-loops are NOT allowed (any from === to is invalid).
export const TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  pending_payment: new Set<BookingStatus>(['confirmed', 'expired']),
  confirmed: new Set<BookingStatus>([
    'canceled_refunded',
    'canceled_no_refund',
    'completed',
    'no_show',
  ]),
  // Terminal states (DB trigger enforce_booking_invariants_fn rejects any UPDATE).
  // doc6 §3 admits completed -> no_show (24h correction); blocked at DB layer in P5.
  expired: new Set<BookingStatus>(),
  canceled_refunded: new Set<BookingStatus>(),
  canceled_no_refund: new Set<BookingStatus>(),
  completed: new Set<BookingStatus>(),
  no_show: new Set<BookingStatus>(),
}

// Actor authorization per transition. Missing key = any actor allowed.
const ACTOR_RULES: Record<string, ReadonlySet<CancellationActor>> = {
  'pending_payment->confirmed': new Set<CancellationActor>(['system', 'admin']),
  'pending_payment->expired': new Set<CancellationActor>(['system']),
  'confirmed->canceled_refunded': new Set<CancellationActor>([
    'player',
    'admin',
    'system',
  ]),
  'confirmed->canceled_no_refund': new Set<CancellationActor>([
    'player',
    'admin',
  ]),
  'confirmed->completed': new Set<CancellationActor>(['system', 'admin']),
  'confirmed->no_show': new Set<CancellationActor>(['admin']),
}

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  ctx?: TransitionContext,
): boolean {
  const allowed = TRANSITIONS[from]
  if (!allowed.has(to)) return false
  if (!ctx) return true
  const actors = ACTOR_RULES[`${from}->${to}`]
  if (!actors) return true
  return actors.has(ctx.actor)
}

export function assertTransition(
  from: BookingStatus,
  to: BookingStatus,
  ctx?: TransitionContext,
): void {
  if (!canTransition(from, to, ctx)) {
    throw new InvalidTransitionError(
      from,
      to,
      ctx ? `actor=${ctx.actor}` : undefined,
    )
  }
}

export { InvalidTransitionError }

## Scheduled Jobs (pg-boss)

| Queue | Cron | Frecuencia | Worker |
|-------|------|-----------|--------|
| `auto-complete-bookings` | `*/30 * * * *` | cada 30 min | auto-complete-bookings.worker.ts |
| `expire-pending-booking-sweep` | `*/5 * * * *` | cada 5 min | expire-pending-booking.worker.ts |
| `data-retention-cleanup` | `0 10 * * 0` | dom 10am | data-retention-cleanup.worker.ts |
| `dunning-retry` | `0 16 * * *` | diario 16hs | dunning-retry.worker.ts |
| `expire-trials` | `0 11 * * *` | diario 11am | expire-trials.worker.ts |
| `generate-abonado-slots` | `0 6 * * *` | diario 6am | generate-abonado-slots.worker.ts |
| `reconcile-pending-payments` | `*/5 * * * *` | cada 5 min | reconcile-pending-payments.worker.ts |
| `refresh-mp-tokens` | `0 */4 * * *` | cada 4hs | refresh-mp-tokens.worker.ts |
| `send-email` | `* * * * *` | cada minuto | send-email.worker.ts |

**Veredicto B1.3 + B1.4**: ✅ Sweep cron + autoComplete cron AMBOS DEFINIDOS. NO requieren fix.

## EXCLUSION constraint

- Path: `src/shared/db/migrations/004_isolated_tables.sql:288`
- Constraint: `no_overlapping_bookings`
- Mecanismo: `EXCLUDE USING gist (court_id WITH =, date WITH =, tsrange(time_start, time_end) WITH &&)` WHERE status IN ('pending_payment', 'confirmed')

## Trigger enforce_booking_invariants_fn

- Path: `src/shared/db/migrations/005_triggers.sql` BEFORE UPDATE on bookings
- Reglas:
  1. price_snapshot inmutable SIEMPRE
  2. Cualquier UPDATE bloqueado si OLD.status ∈ {completed, no_show, expired, canceled_refunded, canceled_no_refund}

## Conclusión B1.1

Motor structurally sound:
- ✅ Exclusion constraint DB
- ✅ Trigger immutability post-terminal
- ✅ State machine explícita (booking.state-machine.ts)
- ✅ Concurrency primitive (booking.concurrency.ts)
- ✅ Todos los jobs scheduleados

Gaps a auditar via tests: races cruzados (B1.2, B1.6, B1.7), time validation (B1.5), no-deposit + webhook (B1.8), libuv (B1.9), borde adyacente (B1.10).
