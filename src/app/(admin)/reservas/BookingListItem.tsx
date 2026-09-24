import Link from 'next/link'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs, formatTime } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
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

/**
 * La fila entera es un Link estirado con ESTE aria-label: quien navega por
 * links con lector de pantalla escucha solo este string. Dejar la plata
 * afuera se la escondería justo a quien no puede ver la píldora roja.
 */
function buildAriaLabel({
  timeRange,
  courtName,
  name,
  visual,
  money,
  isAbonado,
}: {
  timeRange: string
  courtName: string
  name: string
  visual: Pick<ReturnType<typeof reservaStatusVisual>, 'label' | 'unpaid'>
  money: ReturnType<typeof moneyLine>
  isAbonado: boolean
}): string {
  return [
    `Reserva ${timeRange}`,
    courtName,
    name,
    visual.label,
    money?.text ?? null,
    visual.unpaid ? 'sin cobrar' : null,
    isAbonado ? 'abonado' : null,
  ]
    .filter(Boolean)
    .join(', ')
}

/** La celda de plata: precio del turno + qué falta (o "Sin costo" si no cobra). */
function MoneyCell({
  noCost,
  priceSnapshot,
  money,
}: {
  noCost: boolean
  priceSnapshot: number
  money: ReturnType<typeof moneyLine>
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-x-1.5 @2xl:order-4 @2xl:w-24 @2xl:shrink-0 @2xl:flex-col @2xl:items-end">
      {noCost ? (
        <span className="truncate text-xs font-semibold text-muted-foreground @2xl:text-sm">
          Sin costo
        </span>
      ) : (
        <>
          <span className="text-xs font-semibold tabular-nums text-foreground @2xl:text-sm">
            {formatArs(priceSnapshot)}
          </span>
          {money && (
            <span
              className={cn(
                'truncate text-xs tabular-nums',
                money.tone === 'paid' ? TONE_TEXT.success : 'text-muted-foreground',
              )}
            >
              {money.text}
            </span>
          )}
        </>
      )}
    </span>
  )
}

type Props = {
  booking: ReservaListRow
  /**
   * La pestaña Hoy agrupa por cancha y el nombre ya es el título de la
   * sección: repetirlo en la línea secundaria de cada fila es ruido. Próximas
   * e Historial agrupan por fecha y mezclan canchas, ahí sí hace falta.
   * Default `true` — el caso "sin especificar" es el que necesita el dato.
   */
  showCourt?: boolean
}

/**
 * Fila de /reservas. `@container`: en el teléfono y en cada una de las dos
 * columnas de escritorio la fila es angosta; en una pantalla muy ancha puede
 * no serlo. Sin botones propios (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): la fila entera abre el turno, como ya
 * hacía el link estirado — "Confirmar pago" se mudó a "Cobrar seña $X" en el
 * modal y en la página del turno (`CobrarSenaButton`).
 */
export function BookingListItem({ booking, showCourt = true }: Props) {
  const visual = reservaStatusVisual(booking)
  const name = clientName(booking)
  const isBlock = booking.type === 'block'
  const isAbonado = !isBlock && booking.type === 'fixed'
  const timeRange = `${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`
  const money = moneyLine(booking)
  const noCost = !isBlock && booking.priceSnapshot === 0

  const ariaLabel = buildAriaLabel({
    timeRange,
    courtName: booking.courtName,
    name,
    visual,
    money,
    isAbonado,
  })

  const secondaryParts = [
    showCourt ? booking.courtName : null,
    !isBlock ? depositText(booking) : null,
  ].filter((p): p is string => Boolean(p))

  return (
    <li>
      {/* Sin recuadro propio: la lista separa las filas con un filete
          (`divide-y` en el `<ul>`) en vez de apilar tarjetas con borde, sombra
          y 8px de aire entre cada una. Medido el 2026-09-17: la fila ocupaba
          121px y en una columna del tablero entraban 4 turnos; el recuadro y el
          tercer renglón eran la mitad de esa altura. */}
      <article
        aria-label={ariaLabel}
        className="@container group relative flex gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50"
      >
        <Link
          href={`/reservas/${booking.id}`}
          aria-label={ariaLabel}
          className="absolute inset-0 z-0 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <span aria-hidden className={cn('w-1 shrink-0 self-stretch rounded-full', visual.accent)} />
        {/* Angosta (teléfono, columna de escritorio): DOS renglones — horario + plata +
            estado, y nombre + seña | acciones. El primero es un `flex-wrap`:
            si el estado no entra al lado del horario y la plata, baja solo a
            otra línea. Con el estado en su propia columna de grid, 5 canchas a
            1366 px (fila de 172-197 px) pisaban horario, plata y badges letra
            sobre letra (crítica 2026-09-23). Ancha (@2xl, 42rem): una sola
            fila; el `order` devuelve el orden de lectura horario → nombre →
            estado → plata. */}
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 @2xl:flex @2xl:items-center @2xl:gap-3">
          {/* `@2xl:contents`: el mismo horario y la misma plata, colocados
              distinto. En angosto van juntos en el renglón de arriba (la plata
              no gasta un renglón propio), con el estado; en ancho el wrapper
              desaparece del layout y los tres pasan a ser hijos del flex del
              padre, cada uno en su `order`. Un `@2xl:hidden` + una copia habría duplicado el monto
              en el DOM y roto por strict-mode cualquier `getByText` de plata. */}
          <div className="col-span-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 @2xl:contents">
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 @2xl:order-1 @2xl:w-24">
              {timeRange}
            </span>
            {!isBlock && (
              <MoneyCell noCost={noCost} priceSnapshot={booking.priceSnapshot} money={money} />
            )}
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 @2xl:order-3 @2xl:ml-0 @2xl:justify-start">
              <ReservaStatusBadge visual={visual} />
              {/* La plata va antes que "Turno fijo": gana prioridad de lectura. */}
              {visual.unpaid && <ReservaStatusBadge visual={RESERVA_UNPAID_VISUAL} />}
              {isAbonado && (
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30">
                  Turno fijo
                </span>
              )}
            </div>
          </div>

          <div className="col-start-1 row-start-2 min-w-0 @2xl:order-2 @2xl:flex-1">
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
        </div>
      </article>
    </li>
  )
}
