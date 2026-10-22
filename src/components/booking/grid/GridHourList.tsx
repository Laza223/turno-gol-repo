'use client'

import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { gridMoneyVisual } from '@/lib/booking/slot-visual'
import { TONE_BORDER, TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { formatArs } from '@/lib/format'
import { hasBookingEnded, isPendingCollection, type GridBooking } from '@/lib/booking/grid-cells'
import { bookingDisplayName, HoldCountdown } from '../BookingCard'
import type { GridCells } from '@/hooks/use-grid-layout'
import type { CourtRow } from '@/modules/courts/court.types'

type Props = {
  courts: CourtRow[]
  /** Todos los slots del día: la lista no pliega la madrugada, omite las horas pasadas vacías. */
  slots: string[]
  cells: GridCells
  /** Slot de la hora actual (null = el día mostrado no es hoy, o fuera de horario). */
  nowSlot: string | null
  isNavPending: boolean
  /** Reloj de lo que pinta la grilla (BookingGrid): decide qué turno ya terminó. */
  nowMs: number
  highlightPending?: boolean
  ariaLabel: string
  isSlotPast: (slotTime: string) => boolean
  pulseIds: ReadonlySet<string>
  detailBookingId: string | null
  onDetailChange: (bookingId: string | null) => void
  onSlotClick: (courtId: string, slotTime: string) => void
}

type HourRow =
  | { kind: 'start'; court: CourtRow; booking: GridBooking; span: number }
  | { kind: 'continues'; court: CourtRow; booking: GridBooking }

type HourSection = {
  slot: string
  rows: HourRow[]
  /** Canchas habilitadas con la hora libre y por empezar: un botón de alta cada una. */
  free: CourtRow[]
  past: boolean
}

/**
 * La grilla en el teléfono (< md): una lista que baja hora por hora, con una
 * fila por turno (cancha, nombre y plata enteros) y las canchas libres como
 * botones. Decisión del dueño, 2026-10-22 (variante "A · Por hora"):
 * `docs/decisions/2026-10-22-grilla-celular-por-hora.md`.
 *
 * Es otra forma de pintar EXACTAMENTE lo mismo que GridScroller: el mismo
 * `cells`, el mismo `gridMoneyVisual` y los mismos callbacks — el alta y el
 * modal de cobro son los de GridOverlays, uno solo para las dos vistas. Por
 * eso BookingGrid monta las dos y elige por CSS (`md:`), no por un hook de
 * viewport, que resuelve después del primer pintado.
 *
 * Sin tira horizontal de nada: la que tenía la lista vieja (eliminada en #303)
 * escondía canchas detrás de un scroll que nadie descubría. Los botones de
 * las libres bajan de renglón.
 */
export function GridHourList({
  courts,
  slots,
  cells,
  nowSlot,
  isNavPending,
  nowMs,
  highlightPending = false,
  ariaLabel,
  isSlotPast,
  pulseIds,
  detailBookingId,
  onDetailChange,
  onSlotClick,
}: Props) {
  const headingId = useId()

  // La celda `skip` no dice de quién es: se busca el turno que la cubre
  // recorriendo la cancha de arriba para abajo.
  const coveringBooking = useMemo(() => {
    const byKey = new Map<string, GridBooking>()
    for (const court of courts) {
      let current: GridBooking | null = null
      for (const slot of slots) {
        const cell = cells.get(`${court.id}:${slot}`)
        if (cell?.kind === 'booking') current = cell.booking
        else if (cell?.kind === 'skip' && current) byKey.set(`${court.id}:${slot}`, current)
        else current = null
      }
    }
    return byKey
  }, [courts, slots, cells])

  const sections: HourSection[] = []
  let leadingSkipped = 0
  for (const slot of slots) {
    const past = isSlotPast(slot)
    const rows: HourRow[] = []
    const free: CourtRow[] = []
    for (const court of courts) {
      const key = `${court.id}:${slot}`
      const cell = cells.get(key)
      if (cell?.kind === 'booking') {
        rows.push({ kind: 'start', court, booking: cell.booking, span: cell.rowSpan })
      } else if (cell?.kind === 'skip') {
        const booking = coveringBooking.get(key)
        if (booking) rows.push({ kind: 'continues', court, booking })
      } else if (cell?.kind === 'free' && court.status === 'online' && !past) {
        free.push(court)
      }
    }
    // Una hora pasada sin turnos no tiene nada que leer ni que hacer.
    if (rows.length === 0 && free.length === 0) {
      if (sections.length === 0) leadingSkipped++
      continue
    }
    sections.push({ slot, rows, free, past })
  }

  // El auto-scroll va a la hora de ahora, o a la próxima que se muestre si la
  // de ahora quedó vacía.
  const nowIndex = nowSlot === null ? -1 : slots.indexOf(nowSlot)
  const anchorSlot =
    nowIndex < 0 ? null : (sections.find((s) => slots.indexOf(s.slot) >= nowIndex)?.slot ?? null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const didAutoScrollRef = useRef(false)
  // Layout effect: se scrollea antes de pintar, así la lista nunca se ve arriba
  // de todo y después salta.
  useLayoutEffect(() => {
    if (didAutoScrollRef.current || anchorSlot === null) return
    const container = listRef.current
    if (!container) return
    const scrollToAnchor = (): boolean => {
      // Oculta (escritorio, `md:hidden`): no hay nada que scrollear todavía.
      if (container.clientHeight === 0) return false
      const anchor = container.querySelector<HTMLElement>('[data-scroll-anchor]')
      if (!anchor) return false
      didAutoScrollRef.current = true
      const offset =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop
      container.scrollTop = Math.max(0, offset)
      return true
    }
    if (scrollToAnchor()) return
    // Montada oculta (el teléfono acostado ya pasa `md`): se ancla la primera vez
    // que se ve, y no a la hora siguiente mientras el dueño está leyendo.
    const observer = new ResizeObserver(() => {
      if (scrollToAnchor()) observer.disconnect()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [anchorSlot])

  const firstShown = sections[0]?.slot

  return (
    <div
      ref={listRef}
      data-testid="booking-hour-list"
      role="region"
      aria-label={ariaLabel}
      aria-busy={isNavPending}
      // Enfocable por lo mismo que la matriz: un día pasado no tiene ningún
      // botón de alta y la región tiene que poder scrollearse por teclado.
      tabIndex={0}
      className={cn(
        'h-full overflow-y-auto overscroll-y-contain rounded-xl border border-border bg-card',
        'transition-opacity duration-150 motion-reduce:transition-none',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        isNavPending && 'opacity-90',
        // Sin hidratar no hay hora (`nowMs` 0): el HTML del server trae el día
        // entero como libre y, al hidratar, las horas pasadas se van y la lista
        // salta. Se pinta recién con la hora, ya anclada.
        nowMs === 0 && 'invisible',
      )}
    >
      {sections.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {slots.every(isSlotPast)
            ? 'No hubo turnos este día.'
            : 'No hay canchas habilitadas para reservar.'}
        </p>
      ) : (
        leadingSkipped > 0 &&
        firstShown && (
          <p className="border-b border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {slots[0]}–{firstShown}
            </span>{' '}
            · Sin turnos
          </p>
        )
      )}

      {sections.map((section) => {
        const isNow = section.slot === nowSlot
        const titleId = `${headingId}-${section.slot}`
        return (
          // `group` y no `<section>`: una sección con nombre es un landmark, y
          // una noche de 15 horas serían 15 landmarks para el lector de pantalla.
          // El único landmark es la lista entera.
          <div
            key={section.slot}
            role="group"
            aria-labelledby={titleId}
            data-scroll-anchor={section.slot === anchorSlot ? '' : undefined}
          >
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-border bg-card px-4 pb-1.5 pt-3">
              <h3 id={titleId} className="flex items-baseline gap-2">
                <span className="font-display text-[17px] leading-none font-extrabold tabular-nums text-foreground">
                  {section.slot}
                </span>
                {isNow && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-bold',
                      TONE_TEXT.destructive,
                    )}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    Ahora
                  </span>
                )}
              </h3>
              {/* Una hora que ya empezó no se puede reservar: no se dice cuántas quedan. */}
              {!section.past && (
                <span className="text-xs font-medium text-muted-foreground">
                  {section.free.length === 0
                    ? 'Completo'
                    : `${section.free.length} ${section.free.length === 1 ? 'libre' : 'libres'}`}
                </span>
              )}
            </div>

            <ul className="divide-y divide-border border-b border-border">
              {section.rows.map((row) => (
                <li key={`${row.court.id}:${section.slot}`}>
                  {row.kind === 'start' ? (
                    <BookingRow
                      booking={row.booking}
                      span={row.span}
                      courtName={row.court.name}
                      started={section.past}
                      ended={hasBookingEnded(row.booking, nowMs)}
                      spotlighted={highlightPending && isPendingCollection(row.booking, nowMs)}
                      isNew={pulseIds.has(row.booking.id)}
                      detailOpen={detailBookingId === row.booking.id}
                      onOpen={onDetailChange}
                    />
                  ) : (
                    <ContinuationRow
                      booking={row.booking}
                      courtName={row.court.name}
                      detailOpen={detailBookingId === row.booking.id}
                      onOpen={onDetailChange}
                    />
                  )}
                </li>
              ))}
              {section.free.length > 0 && (
                <li className="px-4 py-3">
                  <p className="mb-2 text-[13px] font-medium text-muted-foreground">Libres</p>
                  <div className="flex flex-wrap gap-2">
                    {section.free.map((court) => (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => onSlotClick(court.id, section.slot)}
                        aria-label={`Reservar turno a las ${section.slot} en ${court.name}`}
                        // Neutro: en la grilla el verde es lo cobrado, no la acción
                        // (DESIGN.md, The One Voice Rule).
                        className={cn(
                          'inline-flex h-11 max-w-full items-center gap-1.5 rounded-lg border border-dashed border-slate-400 px-3.5 text-sm font-semibold text-foreground dark:border-slate-500',
                          'transition-colors duration-150 hover:bg-secondary',
                          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <Plus aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{court.name}</span>
                      </button>
                    ))}
                  </div>
                </li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

type BookingRowProps = {
  booking: GridBooking
  span: number
  courtName: string
  /** ¿Ya empezó la hora de inicio? (`isSlotPast`): "Se juega" vs. "por jugar". */
  started: boolean
  ended: boolean
  spotlighted: boolean
  isNew: boolean
  detailOpen: boolean
  onOpen: (bookingId: string) => void
}

/**
 * Un turno en su hora de inicio. Mismo mapa de estados que BookingCard
 * (`gridMoneyVisual`, el color es solo de la plata), pero con lugar para decir
 * las cosas enteras: en la matriz del teléfono la celda medía 48 px.
 */
function BookingRow({
  booking,
  span,
  courtName,
  started,
  ended,
  spotlighted,
  isNew,
  detailOpen,
  onOpen,
}: BookingRowProps) {
  const visual = gridMoneyVisual({ ...booking, ended, started })
  const displayName = bookingDisplayName(booking)
  const StateIcon = visual.icon
  const hasAmount = visual.amountCents !== null
  const colored = visual.tone !== 'neutral'
  const isHold = booking.status === 'pending_payment'

  const title = displayName ?? (visual.label || 'Turno')
  // El estado va abajo del nombre cuando a la derecha va la plata; si no hay
  // plata, el estado ES lo de la derecha ("Pagado"). Sin nombre, el estado ya
  // es el título y no se repite.
  const stateBelow = displayName && (hasAmount || isHold) ? visual.label : ''
  const isEvent = span > 1 && booking.type !== 'block'
  const subtitle = [
    isEvent ? `Evento · ${hhmm(booking.timeStart)}–${hhmm(booking.timeEnd)}` : '',
    stateBelow,
  ]
    .filter(Boolean)
    .join(' · ')
  const right = hasAmount
    ? visual.partial
      ? `Falta ${formatArs(visual.amountCents!)}`
      : formatArs(visual.amountCents!)
    : displayName && !isHold
      ? visual.label
      : ''

  return (
    <button
      type="button"
      onClick={() => onOpen(booking.id)}
      aria-haspopup="dialog"
      aria-expanded={detailOpen}
      // "de HH:MM a HH:MM" y no "HH:MM–HH:MM": el rango con guion es el nombre
      // de la celda de la matriz, que está montada al lado (oculta por CSS).
      aria-label={`${courtName}, de ${hhmm(booking.timeStart)} a ${hhmm(booking.timeEnd)}: ${displayName ? `${displayName}, ${visual.label || 'confirmada'}` : visual.label || 'confirmada'}${hasAmount ? `, falta cobrar ${formatArs(visual.amountCents!)}` : ''}`}
      className={cn(
        'flex min-h-[52px] w-full items-center gap-3 border-l-[3px] py-1.5 pl-[13px] pr-4 text-left',
        colored ? TONE_BORDER[visual.tone] : 'border-l-slate-400 dark:border-l-slate-500',
        colored ? TONE_TINT[visual.tone] : 'bg-secondary/50 dark:bg-secondary',
        visual.striped && 'slot-blocked-stripes',
        isNew && 'animate-slot-pulse',
        spotlighted && 'ring-2 ring-inset ring-destructive',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      <CourtLabel name={courtName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-foreground">{title}</span>
        {subtitle && (
          <span
            className={cn(
              'block truncate text-xs',
              visual.key === 'pending_charge'
                ? cn('font-semibold', TONE_TEXT.destructive)
                : 'text-muted-foreground',
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums whitespace-nowrap',
          colored ? TONE_TEXT[visual.tone] : 'text-muted-foreground',
        )}
      >
        {StateIcon && <StateIcon aria-hidden className="h-4 w-4 shrink-0" />}
        {right}
        {isHold && booking.createdAt && <HoldCountdown createdAt={booking.createdAt} />}
      </span>
    </button>
  )
}

/**
 * El nombre de la cancha es lo que el dueño busca (no las encontraba en la
 * matriz del teléfono): va entero, en los renglones que haga falta, nunca
 * cortado. "Techada A" y "Techada B" se distinguen por el final.
 */
function CourtLabel({ name }: { name: string }) {
  return (
    <span className="w-[4.5rem] shrink-0 text-[13px] leading-tight font-medium break-words text-muted-foreground">
      {name}
    </span>
  )
}

type ContinuationRowProps = {
  booking: GridBooking
  courtName: string
  detailOpen: boolean
  onOpen: (bookingId: string) => void
}

/** Las horas siguientes de un evento de N horas: la cancha sigue ocupada, tocar abre el mismo turno. */
function ContinuationRow({ booking, courtName, detailOpen, onOpen }: ContinuationRowProps) {
  const who = bookingDisplayName(booking) ?? (booking.type === 'block' ? 'Bloqueado' : 'Turno')
  const until = hhmm(booking.timeEnd)
  return (
    <button
      type="button"
      onClick={() => onOpen(booking.id)}
      aria-haspopup="dialog"
      aria-expanded={detailOpen}
      aria-label={`${courtName}: ${who}, sigue hasta las ${until}`}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 border-l-[3px] border-dotted border-l-slate-400 py-1.5 pl-[13px] pr-4 text-left dark:border-l-slate-500',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      <CourtLabel name={courtName} />
      {/* Se corta el nombre, nunca la hora de fin: es el dato de la fila. */}
      <span className="flex min-w-0 flex-1 gap-1 text-sm font-medium text-muted-foreground">
        <span className="truncate">{who}</span>
        <span className="shrink-0 whitespace-nowrap">· sigue hasta {until}</span>
      </span>
    </button>
  )
}
