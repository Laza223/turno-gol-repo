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
  | 'payment.reconcile.drift_detected'

type WebhookEvent =
  'mp.webhook.received' | 'mp.webhook.duplicate' | 'mp.webhook.processed' | 'mp.webhook.failed'

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
  // Los dos lados del magic link. Sin el par, la tasa de entrega/apertura del
  // mail es invisible: un pico de `sent` sin `clicked` es el síntoma de que el
  // mail está cayendo en spam, y hasta ahora eso no se podía ver.
  | 'magiclink.sent'
  | 'magiclink.clicked'

type AuthCtx = {
  playerId?: string
  staffUserId?: string
  tenantCount?: number
  /**
   * magiclink.*: alta nueva con perfil vs re-acceso de un jugador existente.
   * `reaccess_unknown_email`: se pidió re-acceso para un email no registrado —
   * al caller se le responde igual que a un envío real (no filtramos qué emails
   * existen), así que este es el único rastro de que no se mandó ningún mail.
   */
  flow?: 'signup' | 'reaccess' | 'reaccess_unknown_email'
  /** magiclink.clicked: si el intercambio del código terminó en sesión. */
  ok?: boolean
}

/**
 * Arriba del embudo público. Sin esto, el denominador no existe: se sabía
 * cuántas reservas se creaban, pero no sobre cuántas visitas — o sea, no se
 * podía calcular ninguna conversión, que es justo lo que la Fase 5 necesita
 * medir para saber si el rediseño del flujo del jugador sirvió.
 *
 * `checkout.viewed` es el paso más caro de perder: es el jugador que ya eligió
 * cancha y horario y está por pagar.
 *
 * ⚠️ **`portal.viewed` está declarado pero NO tiene emisor todavía, a
 * propósito.** Su lugar natural es `(public)/[slug]/page.tsx`, que corre con
 * `revalidate = 300` (ISR): ahí el Server Component se ejecuta una vez cada 5
 * minutos, no una vez por visita. Emitirlo desde ahí contaría REGENERACIONES
 * DE CACHE, y el número quedaría plano y bajísimo sin importar el tráfico —
 * peor que no tener el dato, porque parece un dato.
 *   Las dos salidas, cuando haga falta: (a) emitirlo desde el cliente contra un
 *   endpoint, que es infraestructura que la Fase 5 probablemente necesite
 *   igual; (b) sacarle el ISR a la portada, si el dato vale más que 300s de
 *   cache. Las otras dos páginas del embudo son `force-dynamic`, así que sus
 *   eventos sí cuentan visitas reales.
 */
type FunnelEvent = 'portal.viewed' | 'profile.viewed' | 'checkout.viewed'

type FunnelCtx = {
  tenantId?: string
  /** profile.viewed: si la vista traía una fecha elegida en la URL. */
  withDate?: boolean
  /** checkout.viewed: si el turno exige seña (cambia el flujo que sigue). */
  withDeposit?: boolean
}

type AvailabilityEvent = 'availability.public.query'

type AvailabilityCtx = {
  tenantId?: string
  date?: string
  courts?: number
}

type SearchEvent = 'search.public.query' | 'search.availability.query' | 'search.availability.pills'

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

type NotificationEvent = 'notification.push.sent' | 'notification.push.failed'

type NotificationCtx = {
  statusCode?: number
  endpoint?: string
  payloadType?: string
  reason?: string
}

/**
 * Proxies de medición de Fase 1 (contrato §3, criterio de salida #6, visión
 * §11): "cierre de caja ≤ 90s y diferencia promedio → $0" y "plata en la
 * calle: tendencia ↓ por tenant". Solo instrumentación — el baseline y el
 * dashboard se arman después con estos datos en Sentry, no acá.
 */
type CashflowEvent = 'close.opened' | 'close.confirmed' | 'street_money.viewed'

type CashflowCtx = {
  tenantId?: string
  /** close.confirmed: ms desde que se abrió el diálogo hasta que se confirmó. */
  durationMs?: number
  /** close.confirmed: declarado − esperado en centavos ARS (0 si no hubo diferencia o no se declaró). */
  diffCents?: number
  /** street_money.viewed: total de "plata en la calle" en centavos ARS, al momento de ver la pantalla. */
  totalCents?: number
}

/**
 * Proxy de medición de Fase 3 (contrato §3, criterio de salida #4): "alta de
 * reserva ≤ 10 s". Mismo patrón que `cashflow` de Fase 1 — solo instrumentación;
 * el baseline se arma después con estos datos en Sentry, no acá.
 *
 * `quick_create.abandoned` importa tanto como `.confirmed`: un popover que se
 * abre y se cierra sin reservar es la señal de que faltan campos y el admin se
 * fue al modal completo — sin ese evento, el promedio de duración solo mediría
 * los casos donde el popover alcanzó.
 */
type GridEvent =
  | 'quick_create.opened'
  | 'quick_create.confirmed'
  | 'quick_create.more_options'
  | 'quick_create.abandoned'

type GridCtx = {
  /** confirmed/more_options/abandoned: ms desde que se abrió el popover. */
  durationMs?: number
  /** confirmed: si la reserva se creó a nombre de un jugador registrado. */
  withPlayer?: boolean
  /** confirmed: si además se cobró seña de mostrador en el mismo paso. */
  withDeposit?: boolean
}

/**
 * Segundo destino de los eventos, registrado desde el servidor.
 *
 * Este archivo es ISOMÓRFICO: lo importan dos componentes cliente
 * (`CloseDayButton`, `QuickBookingForm`), así que no puede importar nada que
 * toque la DB — el driver de Postgres no entra en el bundle del navegador. Por
 * eso la dependencia se invierte: `@/shared/observability/analytics` (solo
 * servidor) se registra acá vía `setAnalyticsSink`, desde `instrumentation.ts`
 * y desde `run-workers.ts`.
 *
 * Sin sink registrado —el navegador, y el servidor antes de que corra
 * `register()`— los eventos solo dejan breadcrumb. Es degradación aceptable:
 * la instrumentación nunca puede ser la razón por la que algo falla.
 */
type AnalyticsSink = (category: string, event: string, data: Record<string, unknown>) => void

let analyticsSink: AnalyticsSink | null = null

export function setAnalyticsSink(sink: AnalyticsSink | null): void {
  analyticsSink = sink
}

function emit(category: string, message: string, data: Record<string, unknown>): void {
  // Contexto para depurar un error: se transmite solo si después hay excepción.
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })

  // Medición: destino durable, independiente de que haya o no error.
  try {
    analyticsSink?.(category, message, data)
  } catch {
    // Un sink roto no puede voltear el flujo que lo emitió.
  }
}

export const track = {
  booking: (ev: BookingEvent, ctx: BookingCtx) => emit('booking', ev, ctx),
  payment: (ev: PaymentEvent, ctx: PaymentCtx) => emit('payment', ev, ctx),
  webhook: (ev: WebhookEvent, ctx: WebhookCtx) => emit('webhook', ev, ctx),
  auth: (ev: AuthEvent, ctx: AuthCtx) => emit('auth', ev, ctx),
  availability: (ev: AvailabilityEvent, ctx: AvailabilityCtx) => emit('availability', ev, ctx),
  search: (ev: SearchEvent, ctx: SearchCtx) => emit('search', ev, ctx),
  notification: (ev: NotificationEvent, ctx: NotificationCtx) => emit('notification', ev, ctx),
  cashflow: (ev: CashflowEvent, ctx: CashflowCtx) => emit('cashflow', ev, ctx),
  grid: (ev: GridEvent, ctx: GridCtx) => emit('grid', ev, ctx),
  funnel: (ev: FunnelEvent, ctx: FunnelCtx) => emit('funnel', ev, ctx),
}
