'use client'

import type * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChoiceOption<V extends string> = {
  value: V
  label: string
  /** Segunda línea, solo si aporta un dato que cambia la decisión. */
  description?: string
  /** Ícono de 20 px, decorativo (el rótulo ya dice la opción). */
  icon?: React.ReactNode
}

type Props<V extends string> = {
  options: readonly ChoiceOption<V>[]
  /** `null` = nada elegido todavía. */
  value: V | null
  onChange: (value: V) => void
  /** Nombre accesible del grupo (la pregunta). */
  'aria-label': string
  /** Dos columnas desde `sm`, para respuestas cortas como Sí / No. */
  columns?: 1 | 2
  className?: string
}

/**
 * Opciones grandes de un toque cada una, para preguntas de elección única.
 *
 * `radiogroup` de botones (no `<input type="radio">`): elegir dispara `onChange`
 * recién al tocar o con Enter/Espacio, y las flechas no cambian la elección. Eso
 * permite que el flujo avance solo al elegir sin que un lector de pantalla o el
 * teclado salten de pregunta al recorrer las opciones.
 */
export function ChoiceCards<V extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  columns = 1,
  className,
}: Props<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid gap-3', columns === 2 && 'sm:grid-cols-2', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-input bg-card text-foreground hover:bg-accent',
            )}
          >
            {option.icon && (
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5',
                  selected
                    ? 'bg-primary/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {option.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-transparent',
              )}
            >
              <Check className="h-4 w-4" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
