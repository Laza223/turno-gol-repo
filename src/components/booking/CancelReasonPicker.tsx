'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { CANCEL_REASON_LABELS, type CancelReason } from '@/shared/cancel-reasons'

/**
 * Motivo de cancelación: lista cerrada, un toque. Lo usan el jugador y el
 * encargado (cada uno pasa su subconjunto en `reasons`). Sin texto libre.
 *
 * `look`: `panel` (default, el del panel y los diálogos del admin) o `glass`, el del portal de
 * vidrio: filas de una sola elección (`.pa-opt` de `portal-app.css`, que el llamador importa).
 * Es el mismo grupo de radios de Radix; cambia solo la piel.
 */
export function CancelReasonPicker({
  reasons,
  value,
  onChange,
  legend = '¿Por qué se cancela?',
  look = 'panel',
}: {
  reasons: readonly CancelReason[]
  value: CancelReason | null
  onChange: (reason: CancelReason) => void
  legend?: string
  look?: 'panel' | 'glass'
}) {
  if (look === 'glass') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-portal-ink">{legend}</legend>
        <RadioChipGroup
          // '' (nunca undefined): sin elegir sigue siendo controlado.
          value={value ?? ''}
          onValueChange={(v) => onChange(v as CancelReason)}
          className="space-y-0"
        >
          {reasons.map((reason) => (
            <RadioGroupPrimitive.Item key={reason} value={reason} className="pa-opt">
              {CANCEL_REASON_LABELS[reason]}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioChipGroup>
      </fieldset>
    )
  }

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
