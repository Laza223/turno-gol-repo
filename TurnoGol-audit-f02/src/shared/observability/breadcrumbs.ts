import * as Sentry from '@sentry/nextjs'

type BookingEvent =
  | 'booking.online.create.start'
  | 'booking.online.create.success'
  | 'booking.online.create.slot_taken'
  | 'booking.manual.create.success'
  | 'booking.transition.confirmed'
  | 'booking.transition.expired'
  | 'booking.cancel.by_player'
  | 'booking.cancel.by_admin'

type PaymentEvent =
  | 'payment.deposit.create'
  | 'payment.deposit.approved'
  | 'payment.deposit.rejected'
  | 'payment.saas.upgrade.approved'
  | 'payment.reconcile.confirmed'

type WebhookEvent =
  | 'mp.webhook.received'
  | 'mp.webhook.duplicate'
  | 'mp.webhook.processed'
  | 'mp.webhook.failed'

type BookingCtx = {
  bookingId?: string
  tenantId?: string
  courtId?: string
  playerId?: string
}

type PaymentCtx = {
  paymentId?: string
  bookingId?: string
  tenantId?: string
  mpPaymentId?: string
  amountCents?: number
}

type WebhookCtx = {
  mpEventId?: string
  tenantId?: string
  eventType?: string
  mpPaymentId?: string
}

type AuthEvent =
  | 'player.anonymized'

type AuthCtx = {
  playerId?: string
}

function emit(category: string, message: string, data: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })
}

export const track = {
  booking: (ev: BookingEvent, ctx: BookingCtx) => emit('booking', ev, ctx),
  payment: (ev: PaymentEvent, ctx: PaymentCtx) => emit('payment', ev, ctx),
  webhook: (ev: WebhookEvent, ctx: WebhookCtx) => emit('webhook', ev, ctx),
  auth: (ev: AuthEvent, ctx: AuthCtx) => emit('auth', ev, ctx),
}
