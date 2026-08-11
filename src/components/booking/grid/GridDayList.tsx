'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { timeToMins } from '@/lib/booking/pricing'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { bookingDisplayName } from '../BookingCard'
import { MorningCollapseBand } from './MorningCollapseBand'
import type { GridCells } from '@/hooks/use-grid-layout'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'

type Props = {
  courts: CourtRow[]
  slots: string[]
  visibleSlots: string[]
  cells: GridCells
  collapsedCount: number
  hasBand: boolean
  isSlotPast: (slotTime: string) => boolean
  pulseIds: ReadonlySet<string>
  onDetailChange: (bookingId: string | null) => void
  onSlotClick: (courtId: string, slotTime: string) => void
  onExpandMorning: () => void
  isNavPending: boolean
  /** Celda con el alta rápida abierta, como `courtId:HH:MM`. */
  quickSlotKey?: string | null
  onQuickClose?: () => void
  renderQuickForm?: (courtId: string, courtName: string, slotTime: string) => React.ReactNode
}

/** Página del carrusel: el resumen de todas las canchas, o una cancha puntual. */
type Page = { kind: 'all' } | { kind: 'court'; court: CourtRow }

function rangeLabel(slotTime: string): string {
  return `${slotTime}–${endLabelFromMins(timeToMins(slotTime) + SLOT_DURATION_MINUTES)}`
}

/**
 * La grilla en mobile: lista por hora con swipe horizontal entre canchas
 * (visión v2 §4.2, criterio de salida de Fase 4). Reemplaza a la matriz, que a
 * 375px mide 600px de ancho mínimo y obliga al peor gesto bajo presión —
 * scroll bidimensional con zoom.
 *
 * **La primera página es "Todas"**, y no es un extra: el swipe cancha por
 * cancha responde "¿cómo viene la 3 esta noche?" pero pierde la pregunta más
 * frecuente del mostrador con el teléfono en la oreja — "¿tenés cancha a las
 * 21?" —, que en la matriz se contestaba con un barrido horizontal de una
 * fila. Esa página la devuelve.
 *
 * Las píldoras de arriba son a la vez selector e indicador de posición (mismo
 * rol que los dots de `TenantCardCarousel`, de donde sale la receta de
 * scroll-snap: cero librerías de gestos en el repo, y no hacen falta).
 *
 * OJO con los nombres accesibles: son deliberadamente DISTINTOS de los de
 * `BookingCard` ("Reservar 16:00 en Cancha 1" acá vs. "Reservar turno 16:00 en
 * Cancha 1" en la matriz). No es un descuido de redacción — es lo que permite
 * que `tests/unit/booking-grid.test.tsx` siga apuntando sin ambigüedad a la
 * matriz. Unificarlos rompe esos tests.
 */
export function GridDayList({
  courts,
  slots,
  visibleSlots,
  cells,
  collapsedCount,
  hasBand,
  isSlotPast,
  pulseIds,
  onDetailChange,
  onSlotClick,
  onExpandMorning,
  isNavPending,
  quickSlotKey,
  onQuickClose,
  renderQuickForm,
}: Props) {
  const pages = useMemo<Page[]>(
    () => [{ kind: 'all' }, ...courts.map((court) => ({ kind: 'court' as const, court }))],
    [courts],
  )
  const trackRef = useRef<HTMLDivElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  /**
   * La píldora activa se trae a la vista al cambiar de página. Con 6 canchas la
   * fila scrollea, y sin esto el swipe dejaría la píldora activa fuera de
   * pantalla: exactamente el bug que la auditoría 2026-08-01 §8 documentó en
   * `WeekStrip` ("el día activo queda fuera de vista").
   */
  useEffect(() => {
    const pill = pillsRef.current?.children[index]
    pill?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = trackRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(i, pages.length - 1))
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
      setIndex(clamped)
    },
    [pages.length],
  )

  const onScroll = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIndex(Math.max(0, Math.min(i, pages.length - 1)))
  }, [pages.length])

  return (
    <div
      data-testid="booking-day-list"
      aria-busy={isNavPending}
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 transition-opacity duration-150 motion-reduce:transition-none',
        isNavPending && 'opacity-90',
      )}
    >
      {/* Selector + indicador de posición. Receta de píldoras de
          AvailabilityGrid (portal público): scroll propio, nunca desborda. */}
      <div
        ref={pillsRef}
        role="group"
        aria-label="Elegir cancha"
        className="flex shrink-0 items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page, i) => {
          const label = page.kind === 'all' ? 'Todas' : page.court.name
          const active = i === index
          return (
            <button
              key={page.kind === 'all' ? 'all' : page.court.id}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-pressed={active}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors md:min-h-9',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        role="group"
        aria-roledescription="carrusel"
        aria-label="Canchas del día"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            scrollToIndex(index - 1)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            scrollToIndex(index + 1)
          }
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none [&::-webkit-scrollbar]:hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {pages.map((page) => (
          <section
            key={page.kind === 'all' ? 'all' : page.court.id}
            aria-label={page.kind === 'all' ? 'Todas las canchas' : page.court.name}
            className="w-full shrink-0 snap-center overflow-y-auto rounded-xl border border-border bg-card"
          >
            {hasBand && (
              <div className="grid">
                <MorningCollapseBand
                  firstSlot={slots[0]!}
                  boundarySlot={slots[collapsedCount]!}
                  onExpand={onExpandMorning}
                />
              </div>
            )}

            {page.kind === 'all' ? (
              <AllCourtsPage
                courts={courts}
                visibleSlots={visibleSlots}
                cells={cells}
                isSlotPast={isSlotPast}
                onSlotClick={onSlotClick}
                onDetailChange={onDetailChange}
              />
            ) : (
              <CourtPage
                court={page.court}
                visibleSlots={visibleSlots}
                cells={cells}
                isSlotPast={isSlotPast}
                pulseIds={pulseIds}
                onSlotClick={onSlotClick}
                onDetailChange={onDetailChange}
                quickSlotKey={quickSlotKey}
                onQuickClose={onQuickClose}
                renderQuickForm={renderQuickForm}
              />
            )}
          </section>
        ))}
      </div>

      {/* Sin chevrons ni rótulo al pie, a propósito: duplicaban lo que las
          píldoras ya dicen (posición) y hacen (saltar de página), y en un
          teléfono de 851px esas 44px son cuatro horas menos de grilla a la
          vista. El gesto es el swipe; las píldoras lo hacen descubrible y el
          track responde a las flechas del teclado. */}
      <p aria-live="polite" className="sr-only">
        {index === 0 ? 'Todas las canchas' : (pages[index] as { court: CourtRow }).court.name}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * La página que contesta "¿tenés cancha a las 21?": una fila por hora, y dentro
 * de cada una TODAS las canchas como chips. El color sigue siendo el estado de
 * la plata (misma `gridSlotVisual` que la matriz), así que la lectura aprendida
 * en escritorio se transfiere sin reaprender nada.
 */
function AllCourtsPage({
  courts,
  visibleSlots,
  cells,
  isSlotPast,
  onSlotClick,
  onDetailChange,
}: {
  courts: CourtRow[]
  visibleSlots: string[]
  cells: GridCells
  isSlotPast: (slotTime: string) => boolean
  onSlotClick: (courtId: string, slotTime: string) => void
  onDetailChange: (bookingId: string | null) => void
}) {
  return (
    <ul role="list" className="divide-y divide-border">
      {visibleSlots.map((slotTime) => {
        const past = isSlotPast(slotTime)
        return (
          <li key={slotTime} className={cn('px-3 py-2.5', past && 'opacity-55')}>
            <p className="mb-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
              {rangeLabel(slotTime)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {courts.map((court) => {
                const cell = cells.get(`${court.id}:${slotTime}`)
                // `skip` = esta hora la cubre una reserva de 120 min que empezó
                // antes. En la matriz eso se ve porque la celda se estira; acá
                // el chip repite el turno para que la fila no mienta con un
                // hueco.
                const booking =
                  cell?.kind === 'booking'
                    ? cell.booking
                    : cell?.kind === 'skip'
                      ? findCoveringBooking(cells, court.id, visibleSlots, slotTime)
                      : null

                if (booking) {
                  return (
                    <BookingChip
                      key={court.id}
                      booking={booking}
                      courtName={court.name}
                      slotTime={slotTime}
                      onOpen={() => onDetailChange(booking.id)}
                    />
                  )
                }

                const clickable = court.status === 'online' && !past
                return (
                  <button
                    key={court.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onSlotClick(court.id, slotTime)}
                    aria-label={`Reservar ${slotTime} en ${court.name}`}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-xs font-medium',
                      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                      clickable
                        ? 'text-muted-foreground hover:border-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-400'
                        : 'cursor-not-allowed text-muted-foreground/50',
                    )}
                  >
                    {clickable && <Plus className="h-3.5 w-3.5" aria-hidden />}
                    <span className="max-w-24 truncate">{court.name}</span>
                  </button>
                )
              })}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** El turno de 120 min que cubre `slotTime` en esa cancha (celda `skip`). */
function findCoveringBooking(
  cells: GridCells,
  courtId: string,
  visibleSlots: string[],
  slotTime: string,
): GridBooking | null {
  const i = visibleSlots.indexOf(slotTime)
  for (let j = i - 1; j >= 0; j--) {
    const prev = cells.get(`${courtId}:${visibleSlots[j]}`)
    if (prev?.kind === 'booking') return prev.booking
    if (prev?.kind !== 'skip') return null
  }
  return null
}

function BookingChip({
  booking,
  courtName,
  slotTime,
  onOpen,
}: {
  booking: GridBooking
  courtName: string
  slotTime: string
  onOpen: () => void
}) {
  const visual = gridSlotVisual(booking)
  const Icon = visual.icon
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${courtName} a las ${slotTime}: ${visual.label}`}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg border-l-[3px] px-2.5 text-xs font-medium',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        visual.cell,
        visual.borderL,
        visual.alarm && 'slot-alarm-ring',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', visual.labelText)} aria-hidden />
      <span className="max-w-24 truncate">{courtName}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------

/** Una cancha, hora por hora — la vista natural del teléfono. */
function CourtPage({
  court,
  visibleSlots,
  cells,
  isSlotPast,
  pulseIds,
  onSlotClick,
  onDetailChange,
  quickSlotKey,
  onQuickClose,
  renderQuickForm,
}: {
  court: CourtRow
  visibleSlots: string[]
  cells: GridCells
  isSlotPast: (slotTime: string) => boolean
  pulseIds: ReadonlySet<string>
  onSlotClick: (courtId: string, slotTime: string) => void
  onDetailChange: (bookingId: string | null) => void
  quickSlotKey?: string | null
  onQuickClose?: () => void
  renderQuickForm?: (courtId: string, courtName: string, slotTime: string) => React.ReactNode
}) {
  return (
    <ul role="list" className="divide-y divide-border">
      {visibleSlots.map((slotTime) => {
        const cell = cells.get(`${court.id}:${slotTime}`)
        if (!cell || cell.kind === 'skip') return null
        const past = isSlotPast(slotTime)
        const cellKey = `${court.id}:${slotTime}`

        if (cell.kind === 'booking') {
          const booking = cell.booking
          const visual = gridSlotVisual(booking)
          const Icon = visual.icon
          const name = bookingDisplayName(booking)
          return (
            <li key={slotTime}>
              <button
                type="button"
                onClick={() => onDetailChange(booking.id)}
                aria-label={`Turno de ${booking.timeStart} a ${booking.timeEnd} en ${court.name}${name ? `, ${name}` : ''}`}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 border-l-[3px] px-3 py-2 text-left',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  visual.cell,
                  visual.borderL,
                  past && 'opacity-70',
                  visual.alarm && 'slot-alarm-ring',
                  pulseIds.has(booking.id) && 'animate-slot-pulse',
                )}
              >
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {booking.timeStart}–{booking.timeEnd}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {name ?? visual.label}
                </span>
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-xs font-medium',
                    visual.labelText,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {visual.label}
                </span>
              </button>
            </li>
          )
        }

        const clickable = court.status === 'online' && !past
        const freeRow = (
          <button
            type="button"
            disabled={!clickable}
            onClick={() => onSlotClick(court.id, slotTime)}
            aria-label={`Reservar ${slotTime} en ${court.name}`}
            className={cn(
              'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              clickable ? 'hover:bg-emerald-500/5' : 'cursor-not-allowed opacity-55',
              quickSlotKey === cellKey && 'bg-emerald-500/5',
            )}
          >
            <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
              {rangeLabel(slotTime)}
            </span>
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">Libre</span>
            {clickable && (
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </button>
        )

        return (
          <li key={slotTime}>
            {clickable && renderQuickForm && quickSlotKey === cellKey ? (
              <Popover open onOpenChange={(v) => !v && onQuickClose?.()}>
                <PopoverTrigger asChild>{freeRow}</PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={4}
                  collisionPadding={12}
                  className="w-auto p-3"
                >
                  {renderQuickForm(court.id, court.name, slotTime)}
                </PopoverContent>
              </Popover>
            ) : (
              freeRow
            )}
          </li>
        )
      })}
    </ul>
  )
}
