'use client'

import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@/lib/utils'

/**
 * Reemplazo de `<input type="radio">` (target táctil ~20px, 🔴 auditoría
 * 2026-08-01 §4.5) por chips de altura h-11. Radix RadioGroup resuelve gratis
 * lo que un `role="radio"` a mano tendría que reimplementar: roving tabindex,
 * navegación con flechas, y el primer ítem tabbable cuando ninguno está
 * seleccionado todavía (WAI-ARIA APG radiogroup).
 */
export const RadioChipGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('space-y-1.5', className)} {...props} />
))
RadioChipGroup.displayName = 'RadioChipGroup'

export const RadioChip = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    description?: string
  }
>(({ className, children, description, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'group flex min-h-11 w-full items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 dark:data-[state=checked]:bg-primary/10',
      className,
    )}
    {...props}
  >
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-border group-data-[state=checked]:border-primary"
    >
      <RadioGroupPrimitive.Indicator className="h-2 w-2 rounded-full bg-primary" />
    </span>
    <span className="flex-1">
      <span className="font-medium text-foreground">{children}</span>
      {description ? (
        <span className="block text-xs text-muted-foreground">{description}</span>
      ) : null}
    </span>
  </RadioGroupPrimitive.Item>
))
RadioChip.displayName = 'RadioChip'
