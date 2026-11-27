import { Fragment, ViewTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { Compass, CreditCard, MessageCircle, Navigation, RotateCcw, Swords } from 'lucide-react'
import { isInRivalStartWindow } from '@/modules/rival/rival-window'
import { formatLabel } from '@/components/public/courtFacets'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { Pager } from '@/components/ui/pager'
import { buildFichaHref, buildReservaHref } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { bookingCode } from '@/lib/booking-code'
import { resolveTenantContact, type TenantContactSource } from '@/lib/tenant-contact'
import type { StatusTone } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { addDays } from '@/shared/dates/art'
import { playerBookingVisual, isDepositPaid } from './status-visual'
import { RefundContactPanel } from './RefundContactPanel'
import type { RefundContactInfo } from './actions'
import type { LateCancelPenalty } from '@/modules/bookings/late-cancel'
import { CancelBookingButton, type CancelMyBookingAction } from './CancelBookingButton'
import { LeaveReviewButton } from './LeaveReviewButton'
import type { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import type { DepositPayState } from '@/lib/booking/hold'
import '@/components/world/portal-app.css'
import '@/components/booking/reserva.css'
import './mis-reservas.css'

/** Entra por prop: `.../reservar/actions` es `'use server'` y no se importa como valor acá. */
export type PayDepositAction = typeof retryDepositPaymentAction

/**
 * Fila de reserva del jugador tal como la arma la query cruda (raw SQL vía
 * `tx.execute`, ver mis-reservas/page.tsx) — no es el `BookingRow` de
 * `@/modules/bookings/booking.types` (esa es la fila de la tabla; esta es la
 * proyección con JOIN a courts/tenants + el flag `has_review`).
 */
export type MisReservasBookingRow = {
  id: string
  /** Día operativo (`bookings.date`): el que usa "Reservar de nuevo". */
  date: string
  /** Día calendario ART en que arranca el turno: de acá salen "Hoy", "Mañana" y la fecha que se lee. */
  starts_on: string
  time_start: string
  time_end: string
  type: string
  status: string
  /** null = el complejo oculta sus precios. */
  price_snapshot: number | null
  court_name: string
  /** Jugadores por lado (`courts.format`): "Fútbol 5". */
  court_format: number
  tenant_name: string
  tenant_slug: string
  /** "Dirección, ciudad" del complejo; vacío si no la cargó. */
  address: string
  /** "Cómo llegar" (Google Maps); `null` si el complejo no cargó dirección ni coordenadas. */
  directions_href: string | null
  /** "Avisarle al grupo" (wa.me con el turno escrito, sin montos); `null` si no corresponde. */
  share_href: string | null
  /** El turno ya terminó (`ends_at` contra ahora, calculado en el servidor): no se cancela. */
  ended: boolean
  /** Quién canceló; `null` si no está cancelada (o es una fila vieja sin dato). */
  canceled_by: 'player' | 'admin' | 'system' | null
  has_review: boolean
  /**
   * ENS-2: consecuencia concreta de cancelar AHORA, calculada server-side en
   * page.tsx (getCancellationPreview, misma política que cancelByPlayer).
   */
  cancellation_outcome: 'no_deposit' | 'refund' | 'no_refund'
  /** Monto de la seña en centavos — solo relevante si cancellation_outcome !== 'no_deposit'. */
  deposit_amount: number
  /** Cancelar AHORA cuenta como tardía (complejo sin seña): qué le pasa y el umbral en horas. */
  late_cancel?: (LateCancelPenalty & { hours: number }) | null
  /** `deposit_status` de la reserva: decide si "Cancelada" lleva "(sin reembolso)". */
  deposit_status: string
  /** Solo `pending_payment`: qué se ofrece para pagar la seña (`depositPayState`, en page.tsx). */
  pay_deposit?: DepositPayState | null
  /**
   * Devolución de seña en juego, si la hay. Sale de la fila `payments`, no de
   * `deposit_status` — ver `refundContactFor` en page.tsx.
   */
  refund?: RefundContactInfo
  /** Horas de anticipación que pide el complejo para devolver la seña. */
  cancellation_policy_hours?: number
  /** Contacto público del complejo, para "Escribir al complejo". */
  tenant_contact?: TenantContactSource
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

/** "vie 13 mar": sin la coma que mete el formateador (DESIGN.md, The Tabular Rule). */
function formatDate(dateStr: string): string {
  const parts = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: AR_TZ,
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${pick('weekday')} ${pick('day')} ${pick('month')}`
}

/** El tono del sistema (`status-visual.ts`) pasado a la etiqueta de vidrio (`.pa-tag`). */
const TAG_BY_TONE: Record<StatusTone, string> = {
  success: '',
  brand: '',
  info: '',
  warning: 'pa-tag--warn',
  destructive: 'pa-tag--bad',
  neutral: 'pa-tag--off',
  plus: 'pa-tag--off',
}

/**
 * "Hoy", "Mañana" o el día ("vie 3 oct"). `today` es el día ART de hoy. Si el turno es de otro
 * año se suma ("vie 13 mar 2026"): en el historial el mismo día y mes puede ser de dos años.
 */
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  const year = date.slice(0, 4)
  return year === today.slice(0, 4) ? formatDate(date) : `${formatDate(date)} ${year}`
}

/** `/mis-reservas?…` preservando el tab. `?pagina=` es 1-based en la URL. */
function pageHref(tab: 'proximos' | 'historial', page: number): string {
  const search = new URLSearchParams()
  if (tab === 'historial') search.set('tab', tab)
  if (page > 0) search.set('pagina', String(page + 1))
  const qs = search.toString()
  return qs ? `/mis-reservas?${qs}` : '/mis-reservas'
}

/** Estados en los que el turno no salió y tiene sentido volver a la ficha del complejo. */
const RESERVE_AGAIN_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'canceled_refunded',
  'canceled_no_refund',
  'expired',
  'no_show',
])

/** Estados en los que el turno todavía cuenta como una plata a la vista (Turno $X). */
const PRICE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'pending_payment',
  'completed',
  'no_show',
])

/**
 * Qué pasó con el turno, en una línea, para los estados que no se explican solos. Vacío para los
 * que sí ("Confirmada", "Jugada"). Ninguna empieza con "Cancelada": el badge ya lo dice y un
 * segundo nodo con esa palabra rompe `getByText('Cancelada')` en la misma tarjeta.
 */
function statusNote(b: MisReservasBookingRow): string | null {
  switch (b.status) {
    case 'pending_payment':
      if (b.pay_deposit === 'processing')
        return 'Tu pago se está procesando. Si se aprueba, el turno queda confirmado.'
      if (b.pay_deposit === 'open')
        return 'Falta pagar la seña. Si no se paga a tiempo, el turno se libera.'
      if (b.pay_deposit === 'unavailable')
        return 'Por ahora no se puede pagar la seña desde acá. Escribile al complejo.'
      return 'Se terminó el tiempo para pagar la seña. El turno se está liberando.'
    case 'expired':
      return 'No se pagó la seña a tiempo, así que el turno se liberó.'
    case 'no_show':
      return 'No te presentaste a este turno y el complejo lo marcó. Si fue un error, escribile al complejo.'
    case 'canceled_refunded':
    case 'canceled_no_refund':
      if (b.canceled_by === 'player') return 'La cancelaste vos.'
      if (b.canceled_by === 'admin' || b.canceled_by === 'system') return 'La canceló el complejo.'
      return null
    case 'confirmed':
      return b.ended ? 'Este turno ya terminó.' : null
    default:
      return null
  }
}

/**
 * Cuánto se pagó y cuánto falta: la seña propia se ve siempre; el monto del turno, solo si el
 * complejo no lo oculta (sin monto no se puede calcular lo que falta).
 */
function payNote(b: MisReservasBookingRow): string[] {
  const price = b.price_snapshot != null && PRICE_STATUSES.has(b.status) ? b.price_snapshot : null
  if (b.status === 'confirmed') {
    // Fragmentos cortos: cada uno no se parte y entre uno y otro la línea puede saltar (320 px).
    if (!isDepositPaid(b.deposit_status)) {
      return price != null
        ? ['Se paga en el complejo', `Turno ${formatArs(price)}`]
        : ['Se paga en el complejo']
    }
    const paid = `Seña pagada ${formatArs(b.deposit_amount)}`
    if (price == null) return [paid, 'Resto en el complejo']
    const rest = price - b.deposit_amount
    return rest > 0 ? [paid, `Falta ${formatArs(rest)}`] : [paid]
  }
  return price != null ? [`Turno ${formatArs(price)}`] : []
}

/** Acción de la tarjeta (`.link` del mockup): píldora interior de 44 px de toque. */
// Las acciones de la tarjeta van como en el mockup (`.bk .links .link`: 14 px, padding 14): entran de a dos por renglón a 390 px.
const LINK = cn(
  buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
  'min-h-11 px-3.5 text-sm',
)

/** Entrada escalonada: cabecera, control y las primeras tarjetas; del décimo en adelante, juntas. */
const rise = (i: number) => ({ '--i': Math.min(i, 10) }) as CSSProperties

function BookingCard({
  b,
  today,
  featured,
  index,
  rivalEnabled,
  cancelAction,
  payDepositAction,
}: {
  b: MisReservasBookingRow
  today: string
  /** La próxima: la primera de Próximos. Trae dirección, "Avisarle al grupo" y "Cómo llegar". */
  featured: boolean
  /** Lugar en la lista: ordena la entrada escalonada. */
  index: number
  /** Flag de RIVAL: suma "Armar el partido" a la próxima. Apagado, no renderiza nada. */
  rivalEnabled: boolean
  cancelAction: CancelMyBookingAction
  payDepositAction?: PayDepositAction
}) {
  const visual = playerBookingVisual(b.status, b.deposit_status)
  // "18:00 a 19:00", como la vuelta de la reserva: se lee en voz alta mejor que la raya.
  const when = `${b.time_start.slice(0, 5)} a ${b.time_end.slice(0, 5)}`
  const whenId = `reserva-${b.id}-cuando`
  const whereId = `reserva-${b.id}-donde`
  const describedBy = `${whenId} ${whereId}`
  // Esperando seña no abre nada: su salida es "Pagar la seña", abajo.
  const href = b.status === 'confirmed' ? buildReservaHref(b.id, 'exito') : null
  const note = statusNote(b)
  const pay = payNote(b)
  const pendingPayment = b.status === 'pending_payment'
  const canPayDeposit = pendingPayment && b.pay_deposit === 'open' && payDepositAction != null
  const canCancel = b.status === 'confirmed' && !b.ended
  const canReview = b.status === 'completed' && !b.has_review
  const canReserveAgain = RESERVE_AGAIN_STATUSES.has(b.status)
  // Las que ya pasaron van sin relleno, solo el borde.
  const past = canReserveAgain
  // La "foto" del complejo: su inicial (la query no trae imagen).
  const initial = Array.from(b.tenant_name.trim())[0]?.toUpperCase() ?? ''
  // Escribirle al complejo: en turnos por jugar o ya jugados que quedaron raros (esperando seña,
  // ausente). Si nada sirve para marcar, no se ofrece: un link roto se lee como "escribí y nadie recibió".
  const contact =
    b.tenant_contact &&
    (b.status === 'confirmed' || b.status === 'pending_payment' || b.status === 'no_show')
      ? resolveTenantContact(
          b.tenant_contact,
          `Hola ${b.tenant_name}, te escribo por mi turno en ${b.court_name} del ${formatDate(b.starts_on)} a las ${b.time_start.slice(0, 5)}. Código ${bookingCode(b.id)}.`,
        )
      : null
  const contactHref = contact ? (contact.whatsappUrl ?? contact.telHref ?? contact.mailto) : null
  const showShare = featured && b.share_href != null
  const showDirections = featured && b.directions_href != null
  const showRival =
    rivalEnabled &&
    featured &&
    b.status === 'confirmed' &&
    !b.ended &&
    isInRivalStartWindow(b.starts_on, today)
  const hasActions =
    canCancel ||
    canReview ||
    canReserveAgain ||
    showShare ||
    showDirections ||
    showRival ||
    contactHref != null

  const title = (
    <>
      <span>{dayLabel(b.starts_on, today)}</span>
      {' · '}
      <span className="whitespace-nowrap">{when}</span>
    </>
  )

  return (
    <li
      className={cn('pa-bk glass-painted rv-rise', past && 'pa-bk--past')}
      style={rise(index + 2)}
    >
      <div className="pa-bk__top">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('pa-tag', TAG_BY_TONE[visual.tone])}>{visual.label}</span>
          {b.type === 'fixed' && <span className="pa-tag pa-tag--off">Turno fijo</span>}
        </div>
        <div id={whenId} className="pa-bk__when">
          {href ? (
            // Vínculo extendido: el `::after` cubre la tarjeta entera y las acciones de abajo
            // quedan por encima (`z-10`), así no hay nada interactivo adentro de un <a>.
            <Link
              transitionTypes={['nav-forward']}
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-[28px] focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-portal-green"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
      </div>

      <div id={whereId} className="pa-bk__main">
        <span aria-hidden className="pa-bk__pic">
          {initial}
        </span>
        <div className="min-w-0">
          <span className="pa-bk__name">{b.tenant_name}</span>
          <span className="pa-bk__meta">
            <span>
              {b.court_name} · {formatLabel(b.court_format)}
            </span>
            {featured && b.address !== '' && (
              <>
                {' · '}
                <span>{b.address}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {pay.length > 0 && (
        <p className="pa-bk__pay tabular-nums">
          {pay.map((part, i) => (
            <Fragment key={part}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{part}</span>
            </Fragment>
          ))}
        </p>
      )}

      {note &&
        (pendingPayment ? (
          <div
            className={cn(
              'pa-note relative z-10',
              b.pay_deposit !== 'processing' && 'pa-note--warn',
            )}
          >
            <span>{note}</span>
            {canPayDeposit && (
              <form action={payDepositAction}>
                <input type="hidden" name="bookingId" value={b.id} />
                <SubmitButton
                  variant="pill"
                  size="pill-sm"
                  aria-describedby={describedBy}
                  className="min-h-11"
                  pendingLabel="Abriendo Mercado Pago…"
                >
                  <CreditCard className="size-4.5 shrink-0" aria-hidden />
                  Pagar la seña
                </SubmitButton>
              </form>
            )}
          </div>
        ) : (
          <p className="pa-bk__pay">{note}</p>
        ))}

      {b.refund && (
        <div className="pa-note relative z-10">
          <p className="text-base font-semibold text-portal-ink">
            {b.refund.state === 'pending' ? 'Devolución pendiente' : 'Devolución confirmada'}
          </p>
          <RefundContactPanel refund={b.refund} />
        </div>
      )}

      {hasActions && (
        <div className="pa-links relative z-10">
          {showDirections && (
            <a
              href={b.directions_href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={describedBy}
              className={LINK}
            >
              <Navigation aria-hidden />
              Cómo llegar
            </a>
          )}
          {showShare && (
            <a
              href={b.share_href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={describedBy}
              className={LINK}
            >
              <MessageCircle aria-hidden />
              Avisarle al grupo
            </a>
          )}
          {showRival && (
            <Link
              transitionTypes={['nav-forward']}
              href={`/rival/nuevo?reserva=${b.id}`}
              aria-describedby={describedBy}
              data-ghost
              className={LINK}
            >
              <Swords aria-hidden />
              Armar el partido
            </Link>
          )}
          {contactHref && (
            <a
              href={contactHref}
              target={contactHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              aria-describedby={describedBy}
              data-ghost
              className={LINK}
            >
              <MessageCircle aria-hidden />
              {contact?.whatsappUrl || contact?.mailto === contactHref
                ? 'Escribir al complejo'
                : 'Llamar al complejo'}
            </a>
          )}
          {canReview && (
            <LeaveReviewButton
              bookingId={b.id}
              tenantName={b.tenant_name}
              describedBy={describedBy}
            />
          )}
          {canReserveAgain && (
            <Link
              transitionTypes={['nav-forward']}
              href={buildFichaHref(b.tenant_slug, { date: b.date, formato: b.court_format })}
              aria-describedby={describedBy}
              data-ghost
              className={LINK}
            >
              <RotateCcw aria-hidden />
              Reservar de nuevo
            </Link>
          )}
          {canCancel && (
            <CancelBookingButton
              bookingId={b.id}
              courtName={b.court_name}
              dateLabel={formatDate(b.starts_on)}
              timeLabel={when}
              cancellationOutcome={b.cancellation_outcome}
              depositAmountCents={b.deposit_amount}
              lateCancel={b.late_cancel ?? null}
              tenantName={b.tenant_name}
              policyHours={b.cancellation_policy_hours}
              isFixed={b.type === 'fixed'}
              describedBy={describedBy}
              action={cancelAction}
            />
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Vista presentacional de /mis-reservas en vidrio: cabecera, pestañas próximos/historial, estado
 * vacío y la lista de tarjetas. La primera de Próximos es la próxima y se lee sola. Extraída de
 * page.tsx (que solo aporta auth + la query cruda) para poder aislarla en Storybook.
 */
export function MisReservasView({
  bookings,
  tab,
  today,
  upcomingCount,
  cancelAction,
  payDepositAction,
  page,
  total,
  pageSize,
  rivalEnabled = false,
}: {
  bookings: MisReservasBookingRow[]
  tab: 'proximos' | 'historial'
  /** Hoy en ART, YYYY-MM-DD: decide "Hoy" y "Mañana". */
  today: string
  upcomingCount: number
  cancelAction: CancelMyBookingAction
  /** "Pagar la seña" de las que esperan seña (`retryDepositPaymentAction`, por prop). */
  payDepositAction?: PayDepositAction
  /** Página 0-based que se está viendo (B10). */
  page: number
  /** Reservas en total para este tab (`COUNT(*) OVER()`, mismo filtro que la lista) — alimenta el Pager compartido en modo total. */
  total: number
  /** Tamaño de página real (`MIS_RESERVAS_PAGE_SIZE`) — vive en page.tsx, se pasa por prop porque esta vista es presentacional. */
  pageSize: number
  /** Flag global de RIVAL (lo lee la page en el server). */
  rivalEnabled?: boolean
}) {
  // La próxima: la primera confirmada que todavía no terminó (un turno de hoy ya jugado no lo es).
  const featuredIndex =
    tab === 'proximos' && page === 0
      ? bookings.findIndex((b) => b.status === 'confirmed' && !b.ended)
      : -1

  return (
    <div className="portal-ambient min-h-[88vh]">
      <div className="pa-col">
        <header className="rv-rise" style={rise(0)}>
          <p className="pa-eyebrow">Tu actividad</p>
          <h1 className="rv-h1">Mis reservas</h1>
          <p className="rv-sub">
            {upcomingCount > 0
              ? `Tenés ${upcomingCount} turno${upcomingCount === 1 ? '' : 's'} por jugar.`
              : 'Tus turnos por jugar y los que ya pasaron.'}
          </p>
        </header>

        {/* Pestañas: dos links (viven en la URL) en un control con la píldora que se traslada. */}
        <nav
          aria-label="Tus reservas"
          className="pa-seg glass-painted rv-rise mt-5"
          style={rise(1)}
        >
          <span
            aria-hidden
            className="segmented-pill"
            style={{ '--i': tab === 'proximos' ? 0 : 1, '--n': 2 } as CSSProperties}
          />
          <Link
            href="/mis-reservas?tab=proximos"
            aria-current={tab === 'proximos' ? 'page' : undefined}
          >
            Próximos
          </Link>
          <Link
            href="/mis-reservas?tab=historial"
            aria-current={tab === 'historial' ? 'page' : undefined}
          >
            Historial
          </Link>
        </nav>

        {bookings.length === 0 ? (
          // Página fuera de rango (link viejo/compartido a una página que ya no existe): no es "no
          // tenés reservas", es "esa página no existe" — decir lo primero con el tab lleno de filas
          // sería mentir (mismo criterio que el libro de movimientos de Cuentas).
          page > 0 ? (
            <section
              className="rv-empty glass-painted rv-rise mt-5"
              style={rise(2)}
              aria-labelledby="mis-reservas-vacio"
            >
              <h2 className="rv-h2" id="mis-reservas-vacio">
                Esa página no existe
              </h2>
              <p className="rv-sub">{`Volvé al principio de ${tab === 'proximos' ? 'Próximos' : 'Historial'}.`}</p>
              <Link
                href={pageHref(tab, 0)}
                className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'mt-3')}
              >
                Volver al principio
              </Link>
            </section>
          ) : (
            <section
              className="rv-empty glass-painted rv-rise mt-5"
              style={rise(2)}
              aria-labelledby="mis-reservas-vacio"
            >
              <h2 className="rv-h2" id="mis-reservas-vacio">
                {tab === 'proximos'
                  ? 'No tenés turnos por jugar'
                  : 'Todavía no hay turnos en tu historial'}
              </h2>
              <p className="rv-sub">
                {tab === 'proximos'
                  ? 'Elegí un complejo y reservá tu próximo turno.'
                  : 'Acá vas a ver tus turnos jugados y cancelados.'}
              </p>
              <Link
                href="/explorar"
                className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'mt-3')}
              >
                <Compass className="size-5" aria-hidden />
                Explorar complejos
              </Link>
            </section>
          )
        ) : (
          // Al cancelar, la revalidación saca la tarjeta: se cierra y las de abajo suben a su lugar
          // (dirección §4.5, Mis reservas). Al cambiar de pestaña o de página la lista entera es
          // otra (`key`) y sale sin animar: así las tarjetas no se cierran todas juntas.
          <ViewTransition key={`${tab}-${page}`} exit="none" default="none">
            <ul className="pa-list">
              {bookings.map((b, i) => (
                <ViewTransition
                  key={b.id}
                  exit="portal-cerrar"
                  update="portal-mover"
                  default="none"
                >
                  <BookingCard
                    b={b}
                    today={today}
                    featured={i === featuredIndex}
                    index={i}
                    rivalEnabled={rivalEnabled}
                    cancelAction={cancelAction}
                    payDepositAction={payDepositAction}
                  />
                </ViewTransition>
              ))}
            </ul>
          </ViewTransition>
        )}

        {/* B10 — antes la query traía 200 reservas y el corte próximos/historial
            se hacía en JS. Como el orden es por fecha descendente, lo que se
            perdía era la COLA DEL HISTORIAL: un jugador de años no llegaba a sus
            reservas más viejas y nada se lo decía. Paginador compartido (con
            total): nunca se dibuja con una sola página, y con la lista vacía
            (`bookings.length === 0`, arriba) ninguna rama llega hasta acá. */}
        {bookings.length > 0 && (
          <div className="mt-6">
            <Pager
              label="Paginación de reservas"
              page={page}
              total={total}
              pageSize={pageSize}
              shown={bookings.length}
              hrefFor={(p) => pageHref(tab, p)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
