'use client'

import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { CANCEL_REASON_LABELS, type CancelReason } from '@/shared/cancel-reasons'

/**
 * Motivo de cancelación: lista cerrada, un toque. Lo usan el jugador y el
 * encargado (cada uno pasa su subconjunto en `reasons`). Sin texto libre.
 */
export function CancelReasonPicker({
  reasons,
  value,
  onChange,
  legend = '¿Por qué se cancela?',
}: {
  reasons: readonly CancelReason[]
  value: CancelReason | null
  onChange: (reason: CancelReason) => void
  legend?: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-foreground">{legend}</legend>
      <RadioChipGroup
        // '' (nunca undefined): sin elegir sigue siendo controlado.
        value={value ?? ''}
        onValueChange={(v) => onChange(v as CancelReason)}
        className="grid grid-cols-2 gap-1.5 space-y-0"
      >
        {reasons.map((reason) => (
          <RadioChip key={reason} value={reason}>
            {CANCEL_REASON_LABELS[reason]}
          </RadioChip>
        ))}
      </RadioChipGroup>
    </fieldset>
  )
}
