'use client'

import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'

type Props = {
  selectMode: boolean
  onToggleSelectMode: () => void
  selectedCount: number
  showBulkBar: boolean
  bulkValueCents: number | null
  onBulkValueChange: (cents: number | null) => void
  onApplyBulk: () => void
  onClearSelection: () => void
  canApplyBulk: boolean
}

/** Barra superior: modo selección, asignación masiva de precio y ayuda. */
export function PricingGridToolbar({
  selectMode,
  onToggleSelectMode,
  selectedCount,
  showBulkBar,
  bulkValueCents,
  onBulkValueChange,
  onApplyBulk,
  onClearSelection,
  canApplyBulk,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={selectMode ? 'default' : 'outline'}
        size="sm"
        onClick={onToggleSelectMode}
      >
        {selectMode ? 'Selección activa' : 'Seleccionar bloque'}
      </Button>

      {showBulkBar && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-2 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {selectedCount} celda{selectedCount === 1 ? '' : 's'}
          </span>
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onApplyBulk()
              }
            }}
          >
            <MoneyInput
              valueCents={bulkValueCents}
              onValueChange={onBulkValueChange}
              placeholder="35.000"
              aria-label="Precio para las celdas seleccionadas"
              showWords={false}
              className="h-11 md:h-9 w-24"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onApplyBulk}
            disabled={selectedCount === 0 || !canApplyBulk}
          >
            Asignar precio
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={selectedCount === 0}
          >
            Vaciar
          </Button>
        </div>
      )}

      <p className="ml-auto text-xs text-muted-foreground">
        {selectMode
          ? 'Tocá celdas para sumarlas a la selección.'
          : 'Click para editar · arrastrá o Shift+click para un bloque.'}
      </p>
    </div>
  )
}
