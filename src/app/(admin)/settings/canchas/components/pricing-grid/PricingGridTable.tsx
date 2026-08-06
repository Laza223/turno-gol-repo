'use client'

import { formatArs } from '@/lib/format'
import { MoneyInput } from '@/components/ui/money-input'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  DAY_KEYS,
  DAY_LABELS,
  type PriceGrid,
  hourLabel,
  isHourActive,
} from '@/modules/courts/pricing-grid'
import { cellKey, heatStyle } from './cell-utils'

type Props = {
  openingHours: OpeningHours
  grid: PriceGrid
  hours: number[]
  dayCount: number
  priceStats: { min: number; max: number }
  isDark: boolean
  selected: Set<string>
  editing: string | null
  editValueCents: number | null
  onEditValueChange: (cents: number | null) => void
  onCommit: () => void
  onCancelEdit: () => void
  onPointerDown: (e: React.PointerEvent, key: string) => void
  onPointerEnter: (key: string) => void
  onCellClick: (e: React.MouseEvent, key: string) => void
}

/** Matriz día × hora: encabezados, celdas de precio (heat map) y editor inline. */
export function PricingGridTable({
  openingHours,
  grid,
  hours,
  dayCount,
  priceStats,
  isDark,
  selected,
  editing,
  editValueCents,
  onEditValueChange,
  onCommit,
  onCancelEdit,
  onPointerDown,
  onPointerEnter,
  onCellClick,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] border-collapse text-sm select-none">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 w-16 bg-muted px-2 py-2 text-left text-xs font-semibold text-muted-foreground"
            >
              Hora
            </th>
            {DAY_KEYS.map((day) => (
              <th
                key={day}
                scope="col"
                className="min-w-[64px] bg-muted px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                style={{ width: `${88 / dayCount}%` }}
              >
                {DAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour} className="border-t border-border">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium tabular-nums text-muted-foreground"
              >
                {hourLabel(hour)}
              </th>
              {DAY_KEYS.map((day) => {
                const key = cellKey(day, hour)
                const active = isHourActive(openingHours[day], hour)
                if (!active) {
                  return (
                    <td
                      key={day}
                      className="border-l border-border bg-muted/40 px-1 py-1 text-center text-muted-foreground/40"
                      aria-hidden
                    >
                      ·
                    </td>
                  )
                }
                const price = grid[day]?.[hour]
                const isSelected = selected.has(key)
                const isEditing = editing === key
                const style =
                  price != null ? heatStyle(price, priceStats.min, priceStats.max, isDark) : undefined

                return (
                  <td key={day} className="border-l border-border p-0.5">
                    {isEditing ? (
                      <div
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            onCommit()
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            onCancelEdit()
                          }
                        }}
                        onBlur={onCommit}
                      >
                        <MoneyInput
                          autoFocus
                          valueCents={editValueCents}
                          onValueChange={onEditValueChange}
                          showWords={false}
                          aria-label={`Precio ${DAY_LABELS[day]} ${hourLabel(hour)}`}
                          className="h-11 md:h-8 w-full rounded-md border-2 border-emerald-600 bg-background text-xs"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onPointerDown={(e) => onPointerDown(e, key)}
                        onPointerEnter={() => onPointerEnter(key)}
                        onClick={(e) => onCellClick(e, key)}
                        style={style}
                        aria-label={`${DAY_LABELS[day]} ${hourLabel(hour)}${
                          price != null ? ` ${formatArs(price)}` : ' sin precio'
                        }`}
                        aria-pressed={isSelected}
                        className={`flex h-11 md:h-8 w-full items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors ${
                          price == null
                            ? 'bg-amber-50 text-amber-500 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30 dark:hover:bg-amber-500/20'
                            : ''
                        } ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
                      >
                        {price != null ? formatArs(price) : '—'}
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
