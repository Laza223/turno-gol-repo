'use client'

import { cn } from '@/lib/utils'
import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import { SegmentedControl, type SegmentedControlOption } from './segmented-control'

/**
 * Chip único de "método de pago" (DESIGN.md §Chips): reemplaza los tres
 * `chipClass` a mano que había en ChargeSection/caja-lib para la misma
 * elección. Look de `RadioChip`: borde `border`, el elegido pasa a borde
 * `primary` + fondo `primary` al 5% (10% en oscuro) — el tinte es tan sutil
 * que `text-foreground` sigue en AA en los dos estados, sin inventar un color
 * de texto nuevo.
 */
function chipClass(active: boolean): string {
  return cn(
    'h-11 md:h-10 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60',
    active
      ? 'border-primary bg-primary/5 text-foreground dark:bg-primary/10'
      : 'border-border bg-card text-foreground hover:bg-accent',
  )
}

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
      itemClassName={chipClass}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  )
}
