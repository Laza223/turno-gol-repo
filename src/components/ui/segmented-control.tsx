'use client'

import type { CSSProperties, ReactNode } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '@/lib/utils'
import { RADIX_DETACHED_FORM_ID } from './radix-form-detach'

export type SegmentedControlOption<T extends string> = {
  value: T
  label: ReactNode
}

/**
 * El look estándar de "una opción elegida entre pocas" en el panel (DESIGN.md
 * › Chips, el de `RadioChip`): borde `border`; la elegida pasa a borde
 * `primary` + fondo `primary` al 5% (10% en oscuro). El tinte es tan sutil que
 * `text-foreground` sigue en AA en los dos estados. Nunca relleno `primary`
 * sólido: ese verde es del botón que cobra o confirma (The One Voice Rule), y
 * con los dos en verde la vista tenía dos o tres losas gritando a la vez.
 * El peso es la pista que no es color (semibold la elegida, medium el resto):
 * el estado nunca se dice solo con color (PRODUCT.md). Cada caller ajusta tamaño
 * con `cn(choiceChipClass(active), '…')`; el peso no se pisa.
 */
export function choiceChipClass(active: boolean): string {
  return cn(
    'h-11 md:h-10 cursor-pointer rounded-lg border px-3 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
    active
      ? 'border-primary bg-primary/5 font-semibold text-foreground dark:bg-primary/10'
      : 'border-border bg-card font-medium text-foreground hover:bg-accent',
  )
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
 * El estilo lo pone el caller con `itemClassName(active)`: algunos usos
 * tienen identidad propia (pill grande de `ReservasPolicyForm`, chip chico de
 * `DepositFieldset`). Lo que es "elegir una opción" usa `choiceChipClass`.
 * `RadioGroupPrimitive.Item` renderiza un `<button type="button">`, así que el
 * swap es 1:1 con el `<button>` de antes.
 */
/** Opción del control de vidrio: 44 px, el texto de la elegida en el verde de "lugar". */
const GLASS_ITEM =
  'relative z-[1] grid h-11 place-items-center rounded-full px-4 text-[15px] leading-none font-semibold whitespace-nowrap text-portal-ink transition-colors duration-(--dur-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:text-portal-slot-ink'

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  itemClassName,
  className,
  disabled,
  variant,
  'aria-label': ariaLabel,
}: {
  /** `undefined` = ninguna elegida todavía (por ejemplo, el tema antes de hidratar). */
  value: T | undefined
  onValueChange: (value: T) => void
  options: readonly SegmentedControlOption<T>[]
  /** Estilo de cada opción. Con `variant="glass"` lo pone el control. */
  itemClassName?: (active: boolean) => string
  className?: string
  disabled?: boolean
  /**
   * `glass`: el control segmentado del portal de vidrio (decisión 2026-11-13). Una sola píldora
   * marca la opción elegida y se desliza de una a otra con el resorte `píldora` (dirección §4.4);
   * con "reducir movimiento" cambia sin deslizar.
   */
  variant?: 'glass'
  'aria-label'?: string
}) {
  const glass = variant === 'glass'
  const index = options.findIndex((opt) => opt.value === value)
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        glass && 'glass relative grid auto-cols-fr grid-flow-col gap-1 rounded-full p-1',
        className,
      )}
      style={glass ? ({ '--i': index, '--n': options.length } as CSSProperties) : undefined}
      // `null` y no `undefined`: con `undefined` Radix lo toma como no controlado y avisa al pasar
      // a controlado cuando llega el valor (el tema, al hidratar).
      value={value ?? null}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
      aria-label={ariaLabel}
      // Sin esto, el reset automático que React 19 le hace al form al terminar
      // una Server Action devuelve la selección al valor de montaje — el bug de
      // "Requerir seña" que volvía sola a "Sin seña". Ver radix-form-detach.ts:
      // el valor lo manda el `<input type="hidden">` del consumidor, no Radix.
      form={RADIX_DETACHED_FORM_ID}
    >
      {glass && (
        <span aria-hidden data-empty={index < 0 ? '' : undefined} className="segmented-pill" />
      )}
      {options.map((opt) => (
        <RadioGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          className={glass ? GLASS_ITEM : (itemClassName?.(value === opt.value) ?? '')}
        >
          {opt.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
