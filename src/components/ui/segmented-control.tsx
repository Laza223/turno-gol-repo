'use client'

import type { ReactNode } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'

export type SegmentedControlOption<T extends string> = {
  value: T
  label: ReactNode
}

/**
 * F-007 (QA prod 2026-08-17): "Los controles segmentados no anuncian cuál
 * está elegido". Eran `<button>` sueltos con solo color para marcar el
 * activo — sin `role`, sin `aria-checked`, sin `role="radiogroup"` en el
 * contenedor. `RadioGroupPrimitive` (Radix, ya usado directo en
 * `AvisosForm.tsx`, el precedente citado en el propio hallazgo) da
 * `role="radiogroup"` + `role="radio"` + `aria-checked` + roving tabindex +
 * flechas de teclado gratis, sin reimplementar nada a mano.
 *
 * Deliberadamente SIN estilo propio: cada uso de este patrón en el repo ya
 * tenía su propia identidad visual (pill grande de `ReservasPolicyForm`,
 * chip chico de `DepositFieldset`, chip de `CompleteBookingDialog`) y
 * uniformarlos hubiera sido un rediseño no pedido por el hallazgo — que es
 * de accesibilidad, no de UI. `itemClassName(active)` devuelve las clases
 * exactas que el caller ya tenía; `RadioGroupPrimitive.Item` renderiza un
 * `<button type="button">`, así que el swap es 1:1 con el `<button>` de antes.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  itemClassName,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  options: readonly SegmentedControlOption<T>[]
  itemClassName: (active: boolean) => string
  className?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <RadioGroupPrimitive.Root
      className={className}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <RadioGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          className={itemClassName(value === opt.value)}
        >
          {opt.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
