'use client'

import { type KeyboardEvent, type MutableRefObject } from 'react'
import { cn } from '@/lib/utils'
import { BookingCard } from '../BookingCard'
import { MorningCollapseBand } from './MorningCollapseBand'
import { isPendingCollection } from '@/lib/booking/grid-cells'
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
  isNavPending: boolean
  /** Chip "Por cobrar hoy" encendido: los turnos que deben plata llevan anillo. */
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
  /** Celda con el popover de alta rápida abierto, como `courtId:HH:MM`. */
  quickSlotKey?: string | null
  onQuickClose?: () => void
  /** Devuelve el formulario de alta rápida para esa celda (Fase 3). */
  renderQuickForm?: (courtId: string, courtName: string, slotTime: string) => React.ReactNode
}

/**
 * Región scrollable de la grilla: CSS Grid con posición explícita (columna de
 * horas sticky, headers de cancha, banda de madrugada, línea de "ahora" y las
 * celdas/BookingCard con span de 120 min). Presentacional puro: toda la
 * matemática de layout llega ya resuelta desde useGridLayout/useNowLine.
 *
 * Es la MISMA matriz en el teléfono, con columnas de 44 px: con 7 canchas entran
 * todas en 375 px. Antes ahí vivía otra vista —una lista por hora con carrusel de
 * canchas— y responder "¿tenés cancha a las 22?" obligaba a recorrer fichas de a
 * una en vez de leer la fila de las 22 de izquierda a derecha. Dos vistas para el
 * mismo hecho además se desincronizaban solas: cada arreglo había que hacerlo dos
 * veces.
 *
 * Los dos anchos se eligen por CSS (variables + `lg:`), no por un hook de
 * viewport: un hook resuelve después del primer pintado, así que el teléfono
 * mostraba un cuadro con las columnas de escritorio —y su scroll horizontal—
 * antes de encogerlas.
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
  isNavPending,
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
  quickSlotKey,
  onQuickClose,
  renderQuickForm,
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
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        isNavPending && 'opacity-90',
      )}
    >
      <div
        // Las variables son el único lugar donde vive el ancho de la matriz: el
        // teléfono usa 48 px por cancha y el escritorio 136.
        //
        // 48 y no 44: la celda lleva 2 px de margen por lado, así que 44 de
        // columna dejaban 40 de superficie tocable — por debajo del mínimo de
        // MASTER §10. Con 48 lo tocable son 44 exactos. Se nota sólo en complejos
        // de 7 canchas o más, donde la matriz pasa a scrollear a lo ancho: con
        // menos canchas el `1fr` las estira igual.
        className="grid relative [--tg-col:3rem] [--tg-hours:2.75rem] lg:[--tg-col:8.5rem] lg:[--tg-hours:3.5rem]"
        style={{
          gridTemplateColumns: `var(--tg-hours) repeat(${courts.length}, minmax(var(--tg-col), 1fr))`,
          // Banda de madrugada 2.75rem (44px): touch mínimo MASTER §10 — el
          // botón "Mostrar" ocupa toda la fila (pages/grilla.md §5 decía 2rem;
          // quedó corto para touch y lo marcaba touch-targets.spec).
          gridTemplateRows: `2.75rem ${hasBand ? '2.75rem ' : ''}repeat(${visibleSlots.length}, ${rowHeightRem}rem)`,
          minWidth: `calc(var(--tg-hours) + ${courts.length} * var(--tg-col))`,
        }}
        onKeyDown={onGridKeyDown}
      >
        {nowTopRem !== null && (
          <div
            className="absolute left-11 right-0 z-20 pointer-events-none flex items-center lg:left-14"
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
            className="sticky top-0 z-20 flex min-w-0 snap-start scroll-ml-11 flex-col items-center justify-center border-b border-border bg-card/95 px-1 leading-tight backdrop-blur-sm lg:scroll-ml-14 lg:flex-row lg:gap-1 lg:px-2"
          >
            <span className="max-w-full truncate text-[12px] font-bold text-foreground lg:text-xs lg:font-semibold">
              {court.name}
            </span>
            {/* En 44 px no entra "(pausada)" al lado del nombre: abajo va el dato
                corto —el formato, o el aviso de pausa si la cancha lo está—. */}
            <span className="max-w-full truncate text-[9px] font-semibold uppercase tracking-[0.03em] text-muted-foreground lg:hidden">
              {court.status === 'offline' ? 'pausada' : `F${court.format}`}
            </span>
            {court.status === 'offline' && (
              <span className="hidden shrink-0 text-xs font-normal text-muted-foreground lg:inline">
                (pausada)
              </span>
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
            className="sticky left-0 z-10 flex items-start justify-end bg-card pr-1 pt-1.5 text-[10px] font-medium tabular-nums text-muted-foreground lg:pr-2 lg:text-[11px]"
          >
            {/* Sólo la hora en el teléfono: ":00" es ruido en una columna de 44 px. */}
            <span className="lg:hidden">{slotTime.slice(0, 2)}</span>
            <span className="hidden lg:inline">{slotTime}</span>
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
                  isNew={pulseIds.has(cell.booking.id)}
                  spotlighted={highlightPending && isPendingCollection(cell.booking)}
                  courtName={court.name}
                  detailOpen={detailBookingId === cell.booking.id}
                  onDetailChange={onDetailChange}
                />
              )
            }

            const clickable = court.status === 'online' && !isSlotPast(slotTime)
            const cellKey = `${court.id}:${slotTime}`
            return (
              <BookingCard
                key={cellKey}
                booking={null}
                timeStart={slotTime}
                isPast={isSlotPast(slotTime)}
                col={ci}
                row={ri}
                rowOffset={rowOffset}
                courtId={clickable ? court.id : undefined}
                courtName={court.name}
                onSlotClick={clickable ? onSlotClick : undefined}
                quickOpen={quickSlotKey === cellKey}
                onQuickClose={onQuickClose}
                // Sólo la celda abierta arma el formulario: las demás pasan
                // `undefined` y ni siquiera montan el Popover.
                renderQuickForm={
                  clickable && renderQuickForm && quickSlotKey === cellKey
                    ? () => renderQuickForm(court.id, court.name, slotTime)
                    : undefined
                }
              />
            )
          }),
        )}
      </div>
    </div>
  )
}
