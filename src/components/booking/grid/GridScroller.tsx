'use client'

import { useEffect, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { cn } from '@/lib/utils'
import { BookingCard } from '../BookingCard'
import { MorningCollapseBand } from './MorningCollapseBand'
import { hasBookingEnded, isPendingCollection } from '@/lib/booking/grid-cells'
import type { GridCells } from '@/hooks/use-grid-layout'
import type { CourtRow } from '@/modules/courts/court.types'

type Props = {
  courts: CourtRow[]
  slots: string[]
  visibleSlots: string[]
  cells: GridCells
  collapsedCount: number
  hasBand: boolean
  rowOffset: number
  /** Alto MÍNIMO de fila, en rem (`minmax(rowHeightRem, 1fr)` — useGridLayout). */
  rowHeightRem: number
  /** Fila (índice en `visibleSlots`) y fracción (0–1) de la línea de "ahora"; null = no se dibuja. */
  nowRowIndex: number | null
  nowFraction: number
  /** Referencia al marcador de "ahora": useNowLine mide su posición real para el auto-scroll. */
  nowLineRef: MutableRefObject<HTMLDivElement | null>
  isNavPending: boolean
  /** Reloj de la grilla (BookingGrid): decide qué turno ya terminó. */
  nowMs: number
  /** Chip "N sin cobrar" encendido: los turnos que deben plata llevan anillo rojo. */
  highlightPending?: boolean
  gridScrollRef: MutableRefObject<HTMLDivElement | null>
  ariaLabel: string
  isSlotPast: (slotTime: string) => boolean
  pulseIds: ReadonlySet<string>
  detailBookingId: string | null
  onDetailChange: (bookingId: string | null) => void
  onSlotClick: (courtId: string, slotTime: string) => void
  onGridKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  onExpandMorning: () => void
}

/** "Cancha 3" → "C3" para la columna angosta del teléfono; otro nombre, igual. */
function shortCourtName(name: string): string {
  return name.replace(/^cancha\s*(?=\d)/i, 'C')
}

/**
 * Región scrollable de la grilla: CSS Grid con posición explícita (columna de
 * horas sticky, headers de cancha, banda de madrugada, línea de "ahora" y las
 * celdas/BookingCard con span de 60 min). Presentacional puro: toda la
 * matemática de layout llega ya resuelta desde useGridLayout/useNowLine.
 *
 * Variante "Entra entera" (decisión del dueño, 2026-09-25): las filas dejaron
 * de ser fijas — `minmax(rowHeightRem, 1fr)` sobre un contenedor `h-full`
 * reparte el alto disponible entre las horas visibles, así que una noche
 * completa entra sin scroll vertical en una notebook y solo scrollea si no
 * entran ni al mínimo.
 *
 * Los dos anchos de columna se eligen por CSS (variables + `lg:`), no por un
 * hook de viewport: un hook resuelve después del primer pintado, así que el
 * teléfono mostraba un cuadro con las columnas de escritorio —y su scroll
 * horizontal— antes de encogerlas.
 */
export function GridScroller({
  courts,
  slots,
  visibleSlots,
  cells,
  collapsedCount,
  hasBand,
  rowOffset,
  rowHeightRem,
  nowRowIndex,
  nowFraction,
  nowLineRef,
  isNavPending,
  nowMs,
  highlightPending = false,
  gridScrollRef,
  ariaLabel,
  isSlotPast,
  pulseIds,
  detailBookingId,
  onDetailChange,
  onSlotClick,
  onGridKeyDown,
  onExpandMorning,
}: Props) {
  // Canchas que no entran (teléfono con más de 6, o un escritorio angosto): un
  // degradé + pastilla "N canchas →" en el borde derecho, MIENTRAS falte
  // scrollear. Se mide el scroll real (evento + ResizeObserver) — un umbral
  // por cantidad de canchas mentía apenas la ventana cambiaba de ancho.
  const [overflowX, setOverflowX] = useState(false)
  const [atScrollEnd, setAtScrollEnd] = useState(true)
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el) return
    const update = () => {
      setOverflowX(el.scrollWidth > el.clientWidth + 1)
      setAtScrollEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gridScrollRef es estable (useRef)
  }, [courts.length])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={gridScrollRef}
        data-testid="booking-grid"
        aria-busy={isNavPending}
        // tabIndex 0: un día sin slots interactivos (todos pasados) dejaría
        // la región scrolleable inalcanzable por teclado (axe
        // scrollable-region-focusable). Enfocada, scrollea con flechas.
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          'h-full overflow-auto overscroll-x-contain snap-x snap-proximity rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(2,6,23,0.04),0_8px_24px_-12px_rgba(2,6,23,0.10)] dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,0.9)]',
          'transition-opacity duration-150 motion-reduce:transition-none',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
          isNavPending && 'opacity-90',
        )}
      >
        <div
          // Las variables son el único lugar donde vive el ancho de la matriz: el
          // teléfono usa 48 px por cancha (44 tocables) y el escritorio 4.75rem
          // mínimo — la fila `1fr` reparte lo que sobra entre las canchas.
          className="grid relative h-full [--tg-col:3rem] [--tg-hours:2.75rem] lg:[--tg-col:4.75rem] lg:[--tg-hours:3.5rem]"
          style={{
            gridTemplateColumns: `var(--tg-hours) repeat(${courts.length}, minmax(var(--tg-col), 1fr))`,
            // Banda de madrugada 2.75rem (44px): touch mínimo MASTER §10 — el
            // botón "Mostrar" ocupa toda la fila. Las horas van `minmax`: solo
            // scrollean si ni el mínimo entra en el alto disponible.
            gridTemplateRows: `2.75rem ${hasBand ? '2.75rem ' : ''}repeat(${visibleSlots.length}, minmax(${rowHeightRem}rem, 1fr))`,
            minWidth: `calc(var(--tg-hours) + ${courts.length} * var(--tg-col))`,
          }}
          onKeyDown={onGridKeyDown}
        >
          {/* Esquina: tapa el cruce de los dos ejes sticky. */}
          <div
            aria-hidden
            style={{ gridColumn: 1, gridRow: 1 }}
            className="sticky left-0 top-0 z-30 border-b border-border bg-card"
          />

          {/* Header sticky de canchas. */}
          {courts.map((court, ci) => {
            const meta = court.status === 'offline' ? 'pausada' : `F${court.format}`
            return (
              <div
                key={court.id}
                style={{ gridColumn: ci + 2, gridRow: 1 }}
                className="sticky top-0 z-20 flex min-w-0 snap-start scroll-ml-11 flex-col items-center justify-center gap-0 border-b border-border bg-card/95 px-1 leading-tight backdrop-blur-sm lg:scroll-ml-14"
              >
                {/* Teléfono: "Cancha 3" no entra en 48px y se truncaba a "Canc…",
                    justo sin el número — ahí va "C3" con el dato corto debajo.
                    Desde `lg` entra todo en una sola línea: "Cancha 3 · F5". */}
                <span className="max-w-full truncate text-xs font-bold text-foreground lg:hidden">
                  {shortCourtName(court.name)}
                </span>
                <span className="hidden max-w-full truncate text-xs font-semibold text-foreground lg:inline">
                  {court.name} · {meta}
                </span>
                <span className="max-w-full truncate text-xs font-semibold uppercase tracking-[0.03em] text-muted-foreground lg:hidden">
                  {meta}
                </span>
              </div>
            )
          })}

          {/* Banda de madrugada colapsada (pages/grilla.md §5). */}
          {hasBand && (
            <MorningCollapseBand
              firstSlot={slots[0]!}
              boundarySlot={slots[collapsedCount]!}
              onExpand={onExpandMorning}
            />
          )}

          {/* Columna de horas sticky: única fuente de la hora (las celdas
              no la repiten — pages/grilla.md §3). La hora actual va en negrita
              con un punto rojo. */}
          {visibleSlots.map((slotTime, ri) => {
            const isNowRow = ri === nowRowIndex
            return (
              <div
                key={slotTime}
                style={{ gridColumn: 1, gridRow: ri + rowOffset }}
                className={cn(
                  'sticky left-0 z-10 flex items-start justify-end gap-1 bg-card pr-1 pt-1.5 text-xs tabular-nums lg:pr-2',
                  isNowRow ? 'font-bold text-foreground' : 'font-medium text-muted-foreground',
                )}
              >
                {isNowRow && (
                  <span
                    aria-hidden
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                  />
                )}
                {/* Sólo la hora en el teléfono: ":00" es ruido en una columna de 44 px. */}
                <span className="lg:hidden">{slotTime.slice(0, 2)}</span>
                <span className="hidden lg:inline">{slotTime}</span>
              </div>
            )
          })}

          {/* Línea de "ahora": un ítem MÁS de la fila de la hora actual, POR
              DEBAJO de las celdas para no tachar nombres. Va ANTES de las
              celdas en el DOM a propósito: sin z-index, los elementos
              posicionados pintan en orden de documento, y las tarjetas
              ocupadas son `relative`, así que la tapan; se ve en los huecos y
              en las celdas libres. */}
          {nowRowIndex !== null && (
            <div
              ref={nowLineRef}
              aria-hidden
              style={{ gridColumn: `2 / -1`, gridRow: nowRowIndex + rowOffset }}
              className="relative pointer-events-none"
            >
              <div
                className="absolute inset-x-0 flex items-center"
                style={{ top: `${nowFraction * 100}%` }}
              >
                <div className="h-[2px] w-full bg-red-500/70 dark:bg-red-500/50" />
              </div>
            </div>
          )}

          {/* Celdas: posición explícita (col, fila, span) para que las
              reservas de 60+ min ocupen dos o más filas sin agujeros. */}
          {courts.map((court, ci) =>
            visibleSlots.map((slotTime, ri) => {
              const cell = cells.get(`${court.id}:${slotTime}`)
              if (!cell || cell.kind === 'skip') return null

              if (cell.kind === 'booking') {
                return (
                  <BookingCard
                    key={`${court.id}:${slotTime}`}
                    booking={cell.booking}
                    timeStart={slotTime}
                    isPast={isSlotPast(slotTime)}
                    col={ci}
                    row={ri}
                    span={cell.rowSpan}
                    rowOffset={rowOffset}
                    isNew={pulseIds.has(cell.booking.id)}
                    ended={hasBookingEnded(cell.booking, nowMs)}
                    spotlighted={highlightPending && isPendingCollection(cell.booking, nowMs)}
                    courtName={court.name}
                    detailOpen={detailBookingId === cell.booking.id}
                    onDetailChange={onDetailChange}
                  />
                )
              }

              const clickable = court.status === 'online' && !isSlotPast(slotTime)
              return (
                <BookingCard
                  key={`${court.id}:${slotTime}`}
                  booking={null}
                  timeStart={slotTime}
                  isPast={isSlotPast(slotTime)}
                  col={ci}
                  row={ri}
                  rowOffset={rowOffset}
                  courtId={clickable ? court.id : undefined}
                  courtName={court.name}
                  onSlotClick={clickable ? onSlotClick : undefined}
                />
              )
            }),
          )}
        </div>
      </div>

      {overflowX && !atScrollEnd && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-px right-px z-40 w-10 rounded-r-xl bg-gradient-to-l from-card to-transparent"
          />
          <span className="pointer-events-none absolute bottom-2 right-2 z-40 rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background tabular-nums">
            {courts.length} canchas →
          </span>
        </>
      )}
    </div>
  )
}
