import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { MessageCircle, Navigation, RotateCcw } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import { buttonVariants } from '@/components/ui/button'
import { Pager } from '@/components/ui/pager'
import { StatusBadge } from '@/components/ui/status-badge'
import { PORTAL_BUTTON, PORTAL_COLUMN, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { buildFichaHref, buildReservaHref } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { addDays } from '@/shared/dates/art'
import { playerBookingVisual, isDepositPaid } from './status-visual'
import { RefundContactPanel } from './RefundContactPanel'
import type { RefundContactInfo } from './actions'
import { CancelBookingButton, type CancelMyBookingAction } from './CancelBookingButton'
import { LeaveReviewButton } from './LeaveReviewButton'

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
  /** `deposit_status` de la reserva: decide si "Cancelada" lleva "(sin reembolso)". */
  deposit_status: string
  /**
   * Devolución de seña en juego, si la hay. Sale de la fila `payments`, no de
   * `deposit_status` — ver `refundContactFor` en page.tsx.
   */
  refund?: RefundContactInfo
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

/** "Hoy", "Mañana" o el día ("vie 3 oct"). `today` es el día ART de hoy. */
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return formatDate(date)
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
      return 'Falta pagar la seña. Si no se paga a tiempo, el turno se libera.'
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

/** Cómo se paga: la seña propia se ve siempre; el monto del turno, solo si el complejo no lo oculta. */
function payNote(b: MisReservasBookingRow): string[] {
  const parts: string[] = []
  if (b.status === 'confirmed') {
    parts.push(
      isDepositPaid(b.deposit_status)
        ? `Señada, ${formatArs(b.deposit_amount)}`
        : 'Pagás en el complejo',
    )
  }
  if (b.price_snapshot != null && PRICE_STATUSES.has(b.status)) {
    parts.push(`Turno ${formatArs(b.price_snapshot)}`)
  }
  return parts
}

/** Botón de una acción de tarjeta: 44 px, plano (sin sombra ni levante), foco con el anillo del mundo. */
/** Acción sin borde (cancelar, reseña, reservar de nuevo): 44 px de toque; la primera de la fila se alinea con el borde de la tarjeta. */
const GHOST =
  'inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

const ACTION =
  'h-auto min-h-11 md:h-auto gap-2 whitespace-normal px-4 py-2 text-sm shadow-none hover:shadow-none hover:translate-y-0 active:scale-100 focus-visible:ring-offset-background'

/** Tarjeta vacía compartida: "no tenés nada" y "esa página no existe" son el mismo molde con distinto texto. */
function EmptyCard({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-extrabold leading-7 tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-base text-muted-foreground">{description}</p>
      <div className="mt-6">{action}</div>
    </div>
  )
}

function BookingCard({
  b,
  today,
  featured,
  cancelAction,
}: {
  b: MisReservasBookingRow
  today: string
  /** La próxima: la primera de Próximos. Trae dirección, "Avisarle al grupo" y "Cómo llegar". */
  featured: boolean
  cancelAction: CancelMyBookingAction
}) {
  const visual = playerBookingVisual(b.status, b.deposit_status)
  // "18:00 a 19:00", como la vuelta de la reserva: se lee en voz alta mejor que la raya.
  const when = `${b.time_start.slice(0, 5)} a ${b.time_end.slice(0, 5)}`
  const whenId = `reserva-${b.id}-cuando`
  const whereId = `reserva-${b.id}-donde`
  const describedBy = `${whenId} ${whereId}`
  // Esperando seña no abre nada: /reserva/{id}/error habla de un pago "rechazado o cancelado" y
  // acá el jugador puede no haber pagado todavía (pendiente de decisión de producto).
  const href = b.status === 'confirmed' ? buildReservaHref(b.id, 'exito') : null
  const note = statusNote(b)
  const pay = payNote(b)
  const canCancel = b.status === 'confirmed' && !b.ended
  const canReview = b.status === 'completed' && !b.has_review
  const canReserveAgain = RESERVE_AGAIN_STATUSES.has(b.status)
  const showShare = featured && b.share_href != null
  const showDirections = featured && b.directions_href != null
  const hasActions = canCancel || canReview || canReserveAgain || showShare || showDirections

  const title = (
    <>
      <span className="block text-sm font-medium text-muted-foreground">
        {dayLabel(b.starts_on, today)}
      </span>
      <span
        className={cn(
          'block font-semibold tabular-nums text-foreground',
          featured ? 'text-2xl leading-8' : 'text-lg leading-7',
        )}
      >
        {when}
      </span>
    </>
  )

  return (
    <li
      className={cn(
        'relative rounded-xl border border-border bg-card p-4 transition-colors',
        href && 'hover:bg-accent',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div id={whenId} className="min-w-0">
          {href ? (
            // Vínculo extendido: el `::after` cubre la tarjeta entera y las acciones de abajo
            // quedan por encima (`z-10`), así no hay nada interactivo adentro de un <a>.
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b.type === 'fixed' && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium',
                TONE_BADGE.neutral,
              )}
            >
              Turno fijo
            </span>
          )}
          <StatusBadge visual={visual} className="shrink-0 whitespace-nowrap text-[13px]" />
        </div>
      </div>

      <div id={whereId} className="mt-2 break-words">
        <p className="text-base font-medium text-foreground">
          {b.court_name} · {formatLabel(b.court_format)}
        </p>
        <p className="text-sm text-muted-foreground">{b.tenant_name}</p>
        {featured && b.address !== '' && (
          <p className="text-sm text-muted-foreground">{b.address}</p>
        )}
      </div>

      {(pay.length > 0 || note) && (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {pay.length > 0 && (
            <p className="tabular-nums">
              {pay.map((part, i) => (
                <Fragment key={part}>
                  {i > 0 && ' · '}
                  <span className="whitespace-nowrap">{part}</span>
                </Fragment>
              ))}
            </p>
          )}
          {note && <p>{note}</p>}
        </div>
      )}

      {b.refund && (
        <div className="relative z-10 mt-3 rounded-lg border border-border bg-muted p-3">
          <p className="mb-2 text-base font-semibold text-foreground">
            {b.refund.state === 'pending' ? 'Devolución pendiente' : 'Devolución confirmada'}
          </p>
          <RefundContactPanel refund={b.refund} />
        </div>
      )}

      {hasActions && (
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 [&>[data-ghost]:first-child]:-ml-3 [&>:not([data-ghost])~[data-ghost]]:ml-auto">
          {showShare && (
            <a
              href={b.share_href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={describedBy}
              className={cn(buttonVariants(), ACTION)}
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              Avisarle al grupo
            </a>
          )}
          {showDirections && (
            <a
              href={b.directions_href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={describedBy}
              className={cn(buttonVariants({ variant: 'outline' }), ACTION)}
            >
              <Navigation className="size-4 shrink-0" aria-hidden />
              Cómo llegar
            </a>
          )}
          {canCancel && (
            <CancelBookingButton
              bookingId={b.id}
              courtName={b.court_name}
              dateLabel={formatDate(b.starts_on)}
              timeLabel={when}
              cancellationOutcome={b.cancellation_outcome}
              depositAmountCents={b.deposit_amount}
              describedBy={describedBy}
              action={cancelAction}
            />
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
              href={buildFichaHref(b.tenant_slug, { date: b.date, formato: b.court_format })}
              aria-describedby={describedBy}
              data-ghost
              className={cn(GHOST, 'text-foreground')}
            >
              <RotateCcw className="size-4 shrink-0" aria-hidden />
              Reservar de nuevo
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Vista presentacional de /mis-reservas, en el mundo de La Reserva: título, pestañas
 * próximos/historial, empty state y la lista de tarjetas. La primera de Próximos es la próxima
 * y se lee sola. Extraída de page.tsx (que solo aporta auth + la query cruda) para poder
 * aislarla en Storybook.
 */
export function MisReservasView({
  bookings,
  tab,
  today,
  upcomingCount,
  cancelAction,
  page,
  total,
  pageSize,
}: {
  bookings: MisReservasBookingRow[]
  tab: 'proximos' | 'historial'
  /** Hoy en ART, YYYY-MM-DD: decide "Hoy" y "Mañana". */
  today: string
  upcomingCount: number
  cancelAction: CancelMyBookingAction
  /** Página 0-based que se está viendo (B10). */
  page: number
  /** Reservas en total para este tab (`COUNT(*) OVER()`, mismo filtro que la lista) — alimenta el Pager compartido en modo total. */
  total: number
  /** Tamaño de página real (`MIS_RESERVAS_PAGE_SIZE`) — vive en page.tsx, se pasa por prop porque esta vista es presentacional. */
  pageSize: number
}) {
  const tabClass = (active: boolean) =>
    cn(
      '-mb-px flex min-h-11 flex-1 items-center justify-center border-b-2 px-2 text-center text-base transition-colors',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      active
        ? 'border-primary font-semibold text-foreground'
        : 'border-transparent font-medium text-muted-foreground hover:text-foreground',
    )

  // La próxima: la primera confirmada que todavía no terminó (un turno de hoy ya jugado no lo es).
  const featuredIndex =
    tab === 'proximos' && page === 0
      ? bookings.findIndex((b) => b.status === 'confirmed' && !b.ended)
      : -1

  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')}>
      <h1 className={PORTAL_TITLE}>Mis reservas</h1>
      {upcomingCount > 0 && (
        <p className="mt-1 text-base text-muted-foreground tabular-nums">
          {`Tenés ${upcomingCount} turno${upcomingCount === 1 ? '' : 's'} por jugar.`}
        </p>
      )}

      <nav aria-label="Tus reservas" className="mt-6 flex border-b border-border">
        <Link
          href="/mis-reservas?tab=proximos"
          aria-current={tab === 'proximos' ? 'page' : undefined}
          className={tabClass(tab === 'proximos')}
        >
          Próximos
        </Link>
        <Link
          href="/mis-reservas?tab=historial"
          aria-current={tab === 'historial' ? 'page' : undefined}
          className={tabClass(tab === 'historial')}
        >
          Historial
        </Link>
      </nav>

      <div className="mt-6">
        {bookings.length === 0 ? (
          page > 0 ? (
            // Página fuera de rango (link viejo/compartido a una página que ya
            // no existe): no es "no tenés reservas", es "esa página no existe" —
            // decir lo primero con el tab lleno de filas sería mentir (mismo
            // criterio que el libro de movimientos de Cuentas).
            <EmptyCard
              title="Esa página no existe"
              description={`${tab === 'proximos' ? 'Tus próximas reservas' : 'Tu historial'} tiene menos que lo que pide este link.`}
              action={
                <Link href={pageHref(tab, 0)} className={cn(buttonVariants(), PORTAL_BUTTON)}>
                  Volver al principio
                </Link>
              }
            />
          ) : (
            <EmptyCard
              title={tab === 'proximos' ? 'Todavía no tenés reservas' : 'Historial vacío'}
              description={
                tab === 'proximos'
                  ? 'Encontrá tu próxima cancha y reservá al instante.'
                  : 'Acá van a aparecer tus partidos jugados.'
              }
              action={
                <Link href="/explorar" className={cn(buttonVariants(), PORTAL_BUTTON)}>
                  Explorar complejos
                </Link>
              }
            />
          )
        ) : (
          <ul className="space-y-3">
            {bookings.map((b, i) => (
              <BookingCard
                key={b.id}
                b={b}
                today={today}
                featured={i === featuredIndex}
                cancelAction={cancelAction}
              />
            ))}
          </ul>
        )}
      </div>

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
  )
}
