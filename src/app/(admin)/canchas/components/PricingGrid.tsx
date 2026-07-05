'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { DAY_KEYS, type PriceGrid, getOperativeHours } from '@/modules/courts/pricing-grid'
import { PricingGridToolbar } from './pricing-grid/PricingGridToolbar'
import { PricingGridTable } from './pricing-grid/PricingGridTable'
import { useCellSelection } from './pricing-grid/use-cell-selection'

// Controlada (pages/horarios-precios.md §3.3): el estado vive en el
// contenedor (PricingSection), que comprime a reglas y muestra el resumen.
type Props = {
  openingHours: OpeningHours
  grid: PriceGrid
  onGridChange: (next: PriceGrid) => void
}

/**
 * Grilla de precios día × hora. Orquesta: interacción (useCellSelection) +
 * toolbar de asignación masiva + la matriz. La lógica de dominio (reglas,
 * compresión, horas operativas) vive en `@/modules/courts/pricing-grid`.
 */
export function PricingGrid({ openingHours, grid, onGridChange }: Props) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const hours = useMemo(() => getOperativeHours(openingHours), [openingHours])

  const priceStats = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const day of DAY_KEYS) {
      for (const v of Object.values(grid[day] ?? {})) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    return { min, max }
  }, [grid])

  const sel = useCellSelection({ openingHours, grid, onGridChange })
  const dayCount = DAY_KEYS.length

  // Sin horas operativas no hay nada que editar; PricingSection ya muestra el
  // aviso con link a /settings/horarios antes de llegar acá.
  if (hours.length === 0) return null

  return (
    <div className="space-y-3">
      <PricingGridToolbar
        selectMode={sel.selectMode}
        onToggleSelectMode={sel.toggleSelectMode}
        selectedCount={sel.selected.size}
        showBulkBar={sel.showBulkBar}
        bulkValue={sel.bulkValue}
        onBulkValueChange={sel.setBulkValue}
        onApplyBulk={sel.applyBulk}
        onClearSelection={sel.clearSelectionPrices}
        canApplyBulk={sel.canApplyBulk}
      />

      <PricingGridTable
        openingHours={openingHours}
        grid={grid}
        hours={hours}
        dayCount={dayCount}
        priceStats={priceStats}
        isDark={isDark}
        selected={sel.selected}
        editing={sel.editing}
        editValue={sel.editValue}
        onEditValueChange={sel.setEditValue}
        onCommit={sel.commitEditor}
        onCancelEdit={() => sel.setEditing(null)}
        onPointerDown={sel.handlePointerDown}
        onPointerEnter={sel.handlePointerEnter}
        onCellClick={sel.handleClick}
      />
    </div>
  )
}
