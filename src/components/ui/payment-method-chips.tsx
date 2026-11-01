'use client'

import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import { choiceChipClass, SegmentedControl, type SegmentedControlOption } from './segmented-control'

/**
 * Chip único de "método de pago" (DESIGN.md §Chips): reemplaza los tres
 * `chipClass` a mano que había en ChargeSection/caja-lib para la misma
 * elección. El look es `choiceChipClass`, el de toda opción elegida del panel.
 */
export function PaymentMethodChips<T extends string = MethodKey>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  options?: readonly SegmentedControlOption<T>[]
  disabled?: boolean
  className?: string
  'aria-label': string
}) {
  return (
    <SegmentedControl
      className={className}
      value={value}
      onValueChange={onValueChange}
      options={
        options ?? (PAYMENT_METHOD_OPTIONS as unknown as readonly SegmentedControlOption<T>[])
      }
      itemClassName={choiceChipClass}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  )
}
