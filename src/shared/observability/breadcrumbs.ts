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
  // Pago tardío: MP aprobó después de que la reserva expirara, así que no hay
  // turno y la plata vuelve sola (decisión del dueño 2026-08-19). `.refunded`
  // lo emite quien liquida contra MP; `.late_refunded` lo emite el barrido de
  // reconciliación, que es el único que además sabe que la reserva ya estaba
  // terminal cuando lo encontró.
  | 'payment.late_payment.refund_registered'
  | 'payment.reconcile.late_refunded'
  | 'payment.refund.retry_succeeded'
  | 'payment.reconcile.drift_detected'
  | 'payment.subscription.reconciled'
  | 'payment.subscription.mp_desync'

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
  /**
   * Preapproval de la suscripción SaaS. Identifica a un complejo (una empresa),
   * no a una persona, así que no entra en `PII_KEYS`.
   */
  preapprovalId?: string
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
  // Google OAuth (jugador, 2026-08-14): el equivalente de `magiclink.clicked` —
  // si exchangeCodeForSession terminó en sesión. No hay lado "sent": el
  // redirect a Google es inmediato, no hay nada que esperar en el medio.
  | 'oauth.exchanged'

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
 * Embudo del wizard de onboarding (plan de refactor §I, Fase 7). TODOS estos
 * eventos se emiten desde el servidor —Server Actions y el propio Server
 * Component de `[paso]/page.tsx`, nunca desde el navegador—: `breadcrumbs.ts`
 * es isomórfico, pero el sink que persiste (`recordEvent`, en
 * `@/shared/observability/analytics`) solo se registra en `instrumentation.ts`
 * y `run-workers.ts`. Un `track.onboarding(...)` llamado desde un componente
 * `'use client'` no rompe nada, pero tampoco persiste nada: solo deja
 * breadcrumb de Sentry.
 *
 * Sin `elapsedMs` en los eventos de paso a propósito: el tiempo por paso (o el
 * total, contra el objetivo de doc10 "< 20 min") se calcula DESPUÉS, restando
 * `occurredAt` entre filas de la propia tabla (`onboarding.started` →
 * `onboarding.completed`, o entre dos `step.viewed` consecutivos) — más simple
 * y más robusto que threadear un timestamp de "cuándo se vio el paso" a mano
 * por toda la cadena action→servicio solo para restarlo acá.
 */
type OnboardingEvent =
  | 'onboarding.started'
  | 'onboarding.step.viewed'
  | 'onboarding.step.completed'
  | 'onboarding.step.back'
  | 'onboarding.step.error'
  | 'onboarding.courts.added'
  | 'onboarding.first_booking.created'
  | 'onboarding.first_booking.skipped'
  | 'onboarding.completed'
  | 'onboarding.abandoned'
  | 'onboarding.link.shared'
  | 'onboarding.mp.connected'

type OnboardingCtx = {
  tenantId?: string
  /** step.viewed/completed/error/back: 1..4 (5 = /onboarding/listo). */
  step?: number
  stepName?: string
  /** step.error: motivo legible (el mismo mensaje que ve el usuario, sin datos crudos). */
  reason?: string
  /** courts.added: cuántas canchas nuevas entraron en ese submit. */
  count?: number
  /** completed: cuántas canchas tiene el tenant al cerrar el wizard. */
  courtsCount?: number
  /** completed: si además cargó su primera reserva en el paso 4 (no la salteó). */
  hasFirstBooking?: boolean
  /** abandoned: último paso completado antes de dejar de volver (worker). */
  lastStep?: number
  /** link.shared: por qué canal (el CTA primario es WhatsApp, doc10 §3). */
  channel?: 'whatsapp' | 'copy'
  /** mp.connected: siempre `true` desde la Fase 5 (la conexión se movió a /settings/facturacion). */
  fromChecklist?: boolean
}

/**
 * El aha moment real (doc10, §C del plan): la primera reserva que entra SOLA,
 * sin que el staff la haya cargado (`created_by_staff IS NULL` — mismo
 * predicado que `firstBookingReceived` en dashboard/queries.ts). Categoría
 * propia, no `onboarding.*`: mide algo que puede pasar días después de
 * cerrado el wizard, y es la pregunta que justifica todo el rediseño —¿los que
 * cargaron una reserva en el paso 4 llegan antes acá que los que la
 * saltearon?— así que conviene que quede separada del embudo de los 4 pasos.
 */
type ActivationEvent = 'activation.first_online_booking'

type ActivationCtx = {
  tenantId?: string
  /** Contra `onboarding_completed_at` (settings) — null si el tenant nunca completó el wizard. */
  daysSinceOnboarding?: number | null
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

/**
 * 🔴 F-022 (QA de producción 2026-08-17): el sink vive en `globalThis`, NO en una
 * variable de módulo.
 *
 * `instrumentation.ts` se bundlea en un layer aparte del grafo de la app, así que
 * su `import` de este archivo puede resolver a OTRA instancia del módulo que la
 * que importan los servicios. Con una variable de módulo, `setAnalyticsSink()`
 * seteaba la copia de instrumentation y `track.*` leía la de la app, que seguía
 * en `null`: los eventos se descartaban en silencio y `analytics_events` quedaba
 * vacía en producción (medido: 4 búsquedas públicas con 200, cero filas, cero
 * warns de escritura). Es la misma clase que ya se pagó con el locale de Zod
 * (`zod-locale.ts`) — ahí el canal era interno a la librería y no se podía
 * arreglar; acá el canal es nuestro, y `globalThis` lo comparte entre copias.
 */
const SINK_KEY = '__turnogol_analytics_sink__'
type SinkHolder = { [SINK_KEY]?: AnalyticsSink | null }

export function setAnalyticsSink(sink: AnalyticsSink | null): void {
  ;(globalThis as SinkHolder)[SINK_KEY] = sink
}

function getAnalyticsSink(): AnalyticsSink | null {
  return (globalThis as SinkHolder)[SINK_KEY] ?? null
}

/**
 * El aviso de "sink ausente" se emite UNA vez por instancia. Sin esto, el modo de
 * falla de F-022 es invisible: no hay forma de distinguir "el evento no se emitió"
 * de "se emitió y nadie lo escuchó". En el navegador la ausencia es normal y
 * esperada (ver el comentario de arriba), así que solo se avisa server-side.
 */
let warnedMissingSink = false

function emit(category: string, message: string, data: Record<string, unknown>): void {
  // Contexto para depurar un error: se transmite solo si después hay excepción.
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })

  // Medición: destino durable, independiente de que haya o no error.
  const sink = getAnalyticsSink()
  if (!sink) {
    if (typeof window === 'undefined' && !warnedMissingSink) {
      warnedMissingSink = true
      Sentry.captureMessage('analytics sink no registrado: los eventos no se persisten', 'warning')
    }
    return
  }
  try {
    sink(category, message, data)
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
  onboarding: (ev: OnboardingEvent, ctx: OnboardingCtx) => emit('onboarding', ev, ctx),
  activation: (ev: ActivationEvent, ctx: ActivationCtx) => emit('activation', ev, ctx),
}
