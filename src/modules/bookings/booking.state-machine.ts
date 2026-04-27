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
