import * as Sentry from '@sentry/nextjs'

type BookingEvent =
  | 'booking.online.create.start'
  | 'booking.online.create.success'
  | 'booking.online.create.slot_taken'
  | 'booking.online.create.too_many_holds'
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
  | 'payment.refund.retry_succeeded'

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
  | 'player.login'
  | 'staff.login'
  | 'staff.onboarding'
  | 'auth.exchange_failed'

type AuthCtx = {
  playerId?: string
  staffUserId?: string
  tenantCount?: number
}

type AvailabilityEvent = 'availability.public.query'

type AvailabilityCtx = {
  tenantId?: string
  date?: string
  courts?: number
}

type SearchEvent =
  | 'search.public.query'
  | 'search.availability.query'
  | 'search.availability.pills'

type SearchCtx = {
  hasQuery?: boolean // never the raw query text — PII-safe (Ley 25.326)
  city?: string
  province?: string
  onlineOnly?: boolean
  results?: number
  // search.availability.query (sin PII: fecha/hora buscadas + conteos)
  date?: string
  time?: string
  formats?: string
  candidates?: number
  // search.availability.pills (conteos por página de /explorar)
  tenants?: number
  withPills?: number
}

type NotificationEvent =
  | 'notification.push.sent'
  | 'notification.push.failed'

type NotificationCtx = {
  statusCode?: number
  endpoint?: string
  payloadType?: string
  reason?: string
}

function emit(category: string, message: string, data: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })
}

export const track = {
  booking: (ev: BookingEvent, ctx: BookingCtx) => emit('booking', ev, ctx),
  payment: (ev: PaymentEvent, ctx: PaymentCtx) => emit('payment', ev, ctx),
  webhook: (ev: WebhookEvent, ctx: WebhookCtx) => emit('webhook', ev, ctx),
  auth: (ev: AuthEvent, ctx: AuthCtx) => emit('auth', ev, ctx),
  availability: (ev: AvailabilityEvent, ctx: AvailabilityCtx) => emit('availability', ev, ctx),
  search: (ev: SearchEvent, ctx: SearchCtx) => emit('search', ev, ctx),
  notification: (ev: NotificationEvent, ctx: NotificationCtx) => emit('notification', ev, ctx),
}
