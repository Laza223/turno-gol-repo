import Link from 'next/link'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs, formatTime } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { QuickActions, type BookingQuickActions } from './QuickActions'
import { hasQuickActions } from './quick-actions-helpers'
import { reservaStatusVisual, ReservaStatusBadge, RESERVA_UNPAID_VISUAL } from './status-visual'
import { moneyLine } from './money-line'
import { resolveDepositDisplayStatus } from './deposit-display'
import type { ReservaListRow } from './queries'

function depositText(
  booking: Pick<ReservaListRow, 'depositStatus' | 'depositAmount' | 'refundState'>,
): string {
  if (booking.depositAmount <= 0) return 'Sin seña'
  switch (resolveDepositDisplayStatus(booking.depositStatus, booking.refundState)) {
    case 'paid':
    case 'captured':
      return `Seña pagada (${formatArs(booking.depositAmount)})`
    case 'pending':
      return `Seña pendiente (${formatArs(booking.depositAmount)})`
    // La plata todavía no se movió: el complejo la debe. Ver `deposit-display.ts`.
    case 'refund_pending':
      return `Seña a devolver (${formatArs(booking.depositAmount)})`
    case 'refunded':
      return 'Seña devuelta'
    default:
      return 'Sin seña'
  }
}

function clientName(booking: Pick<ReservaListRow, 'playerName' | 'guestName' | 'type'>): string {
  if (booking.type === 'block') return 'Bloqueo'
  return booking.playerName ?? booking.guestName ?? 'Sin nombre'
}

type Props = {
  booking: ReservaListRow
  /**
   * Server Actions de QuickActions, reenviadas tal cual (Server Component →
   * Client Component). Solo se usan si `hasQuickActions(booking)` es true.
   */
  actions: BookingQuickActions
  /**
   * Horas de anticipación de la política de cancelación del complejo (mismo
   * dato en las 200 filas de la página — se calcula una sola vez arriba,
   * page.tsx, no por fila). Reenviado a QuickActions para el preview de
   * plazo de cancelación (cluster F bug 2).
   */
  cancellationPolicyHours?: number
  /**
   * `CourtBoard` ya muestra el nombre de la cancha como header de columna:
   * repetirlo en la línea secundaria de cada fila es ruido. Historial mezcla
   * canchas por fecha (no hay columna que lo diga), ahí sí hace falta.
   * Default `true` — el caso "sin especificar" es el que necesita el dato.
   */
  showCourt?: boolean
}

/**
 * Fila de /reservas. `@container`: dentro del tablero (`CourtBoard`) la
 * tarjeta puede ser angosta (una columna de ~280px) aun en escritorio, y en
 * Historial (`xl:grid-cols-2`) puede ser ancha — el layout interno y
 * `QuickActions` responden al ancho REAL de la tarjeta, no al viewport.
 */
export function BookingListItem({
  booking,
  actions,
  cancellationPolicyHours,
  showCourt = true,
}: Props) {
  const visual = reservaStatusVisual(booking)
  const name = clientName(booking)
  const isBlock = booking.type === 'block'
  const isAbonado = !isBlock && booking.type === 'fixed'
  const timeRange = `${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`
  const money = moneyLine(booking)
  const noCost = !isBlock && booking.priceSnapshot === 0

  const ariaLabel = [
    `Reserva ${timeRange}`,
    booking.courtName,
    name,
    visual.label,
    // La fila entera es un Link estirado con ESTE aria-label: quien navega por
    // links con lector de pantalla escucha solo este string. Dejar la plata
    // afuera se la escondería justo a quien no puede ver la píldora roja.
    money?.text ?? null,
    visual.unpaid ? 'sin cobrar' : null,
    isAbonado ? 'abonado' : null,
  ]
    .filter(Boolean)
    .join(', ')

  const withActions = hasQuickActions(booking)

  // QuickActions ya se posiciona (z-10) contra el Link estirado de la fila
  // (Fitts: la fila entera navega al detalle, menos donde hay otro control).
  const quickActions = withActions && (
    <QuickActions
      booking={{
        id: booking.id,
        status: booking.status,
        type: booking.type,
        depositStatus: booking.depositStatus,
        depositAmount: booking.depositAmount,
        priceSnapshot: booking.priceSnapshot,
        paymentMethod: booking.paymentMethod,
        guestName: booking.guestName ?? null,
        guestPhone: null,
        playerName: booking.playerName,
        pending: booking.pending,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      }}
      label={`${name} · ${timeRange}`}
      cancellationPolicyHours={cancellationPolicyHours}
      {...actions}
    />
  )

  const secondaryParts = [
    showCourt ? booking.courtName : null,
    !isBlock ? depositText(booking) : null,
  ].filter((p): p is string => Boolean(p))

  return (
    <li>
      <article
        aria-label={ariaLabel}
        className="@container group relative flex gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs transition-colors hover:bg-accent/50"
      >
        <Link
          href={`/reservas/${booking.id}`}
          aria-label={ariaLabel}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-full', visual.accent)} />
        {/* Angosta (columna del tablero): grilla de 2 columnas en tres renglones
            — horario | estado · nombre · plata | acciones — para que entren
            más turnos por pantalla. Ancha (@3xl, 48rem): una sola fila; el
            `order` devuelve el orden de lectura horario → nombre → estado →
            plata. Con menos de 48rem, hora + estado + plata + tres botones le
            dejaban ancho 0 al nombre (columna de ~570 px con 3 canchas). */}
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 @3xl:flex @3xl:items-center @3xl:gap-3">
          <div className="shrink-0 @3xl:order-1 @3xl:w-24">
            <span className="text-sm font-semibold tabular-nums text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
              {timeRange}
            </span>
          </div>

          <div className="col-span-2 min-w-0 @3xl:order-2 @3xl:flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
              {isBlock && (
                <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              {name}
            </p>
            {secondaryParts.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">{secondaryParts.join(' · ')}</p>
            )}
          </div>

          <div className="col-start-2 row-start-1 flex shrink-0 flex-wrap items-center justify-end gap-1.5 @3xl:order-3 @3xl:justify-start">
            <ReservaStatusBadge visual={visual} />
            {/* La plata va antes que "Turno fijo": gana prioridad de lectura. */}
            {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
            {isAbonado && (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30">
                Turno fijo
              </span>
            )}
          </div>

          {!isBlock && (
            <div className="flex min-w-0 shrink-0 flex-wrap items-baseline gap-x-1.5 @3xl:order-4 @3xl:block @3xl:w-24 @3xl:text-right">
              {noCost ? (
                <p className="text-sm font-semibold text-muted-foreground">Sin costo</p>
              ) : (
                <>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatArs(booking.priceSnapshot)}
                  </p>
                  {money && (
                    <p
                      className={cn(
                        'text-xs tabular-nums',
                        money.tone === 'paid' ? TONE_TEXT.success : 'text-muted-foreground',
                      )}
                    >
                      {money.text}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {quickActions && (
            <div className="col-start-2 justify-self-end @3xl:order-5">{quickActions}</div>
          )}
        </div>
      </article>
    </li>
  )
}
