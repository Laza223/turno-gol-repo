'use client'

import { type KeyboardEvent, type MutableRefObject } from 'react'
import { cn } from '@/lib/utils'
import { BookingCard } from '../BookingCard'
import { MorningCollapseBand } from './MorningCollapseBand'
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
  rowHeightRem: number
  nowTopRem: number | null
  isCompact: boolean
  isNavPending: boolean
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

/**
 * Región scrollable de la grilla: CSS Grid con posición explícita (columna de
 * horas sticky, headers de cancha, banda de madrugada, línea de "ahora" y las
 * celdas/BookingCard con span de 120 min). Presentacional puro: toda la
 * matemática de layout llega ya resuelta desde useGridLayout/useNowLine.
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
  nowTopRem,
  isCompact,
  isNavPending,
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
  return (
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
        'overflow-auto overscroll-x-contain snap-x snap-proximity flex-1 min-h-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(2,6,23,0.04),0_8px_24px_-12px_rgba(2,6,23,0.10)] dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,0.9)]',
        'transition-opacity duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isNavPending && 'opacity-90',
      )}
    >
      <div
        className="grid relative"
        style={{
          gridTemplateColumns: `3.5rem repeat(${courts.length}, minmax(8.5rem, 1fr))`,
          // Banda de madrugada 2.75rem (44px): touch mínimo MASTER §10 — el
          // botón "Mostrar" ocupa toda la fila (pages/grilla.md §5 decía 2rem;
          // quedó corto para touch y lo marcaba touch-targets.spec).
          gridTemplateRows: `2.75rem ${hasBand ? '2.75rem ' : ''}repeat(${visibleSlots.length}, ${rowHeightRem}rem)`,
          minWidth: `${56 + courts.length * 136}px`,
        }}
        onKeyDown={onGridKeyDown}
      >
        {nowTopRem !== null && (
          <div
            className="absolute left-[3.5rem] right-0 z-20 pointer-events-none flex items-center"
            style={{ top: `calc(${nowTopRem}rem - 0.5px)` }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <div className="flex-1 h-[2px] bg-red-500/70 dark:bg-red-500/50" />
          </div>
        )}
        {/* Esquina: tapa el cruce de los dos ejes sticky. */}
        <div
          aria-hidden
          style={{ gridColumn: 1, gridRow: 1 }}
          className="sticky left-0 top-0 z-30 border-b border-border bg-card"
        />

        {/* Header sticky de canchas. */}
        {courts.map((court, ci) => (
          <div
            key={court.id}
            style={{ gridColumn: ci + 2, gridRow: 1 }}
            className="sticky top-0 z-20 snap-start scroll-ml-14 flex items-center justify-center gap-1 truncate border-b border-border bg-card/95 px-2 text-xs font-semibold text-foreground backdrop-blur"
          >
            <span className="truncate">{court.name}</span>
            {court.status === 'offline' && (
              <span className="shrink-0 font-normal text-muted-foreground">(pausada)</span>
            )}
          </div>
        ))}

        {/* Banda de madrugada colapsada (pages/grilla.md §5). */}
        {hasBand && (
          <MorningCollapseBand
            firstSlot={slots[0]!}
            boundarySlot={slots[collapsedCount]!}
            onExpand={onExpandMorning}
          />
        )}

        {/* Columna de horas sticky: única fuente de la hora (las celdas
            no la repiten — pages/grilla.md §3). */}
        {visibleSlots.map((slotTime, ri) => (
          <div
            key={slotTime}
            style={{ gridColumn: 1, gridRow: ri + rowOffset }}
            className="sticky left-0 z-10 flex items-start justify-end bg-card pr-2 pt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground"
          >
            {slotTime}
          </div>
        ))}

        {/* Celdas: posición explícita (col, fila, span) para que las
            reservas de 120 min ocupen dos filas sin agujeros. */}
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
                  compact={isCompact}
                  isNew={pulseIds.has(cell.booking.id)}
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
                compact={isCompact}
                courtId={clickable ? court.id : undefined}
                courtName={court.name}
                onSlotClick={clickable ? onSlotClick : undefined}
              />
            )
          }),
        )}
      </div>
    </div>
  )
}
