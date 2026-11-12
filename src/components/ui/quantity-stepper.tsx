'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  value: number
  onChange: (value: number) => void
  /** Piso del contador. Default 0. */
  min?: number
  /** Techo del contador. Sin techo si falta. */
  max?: number
  /** Qué se cuenta, para los lectores de pantalla ("canchas de Fútbol 5"). */
  label: string
  className?: string
}

/**
 * Contador − N + con blancos táctiles de 48 px. Los botones no son `type="submit"`:
 * viven dentro de formularios y tocar "+" no puede enviarlos.
 */
export function QuantityStepper({ value, onChange, min = 0, max, label, className }: Props) {
  const atMin = value <= min
  const atMax = max !== undefined && value >= max
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-3', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-12 w-12 md:h-12 md:w-12"
        aria-label={`Menos, ${label}`}
        disabled={atMin}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-5 w-5" aria-hidden />
      </Button>
      <output
        aria-live="polite"
        className="w-8 text-center text-xl font-semibold tabular-nums text-foreground"
      >
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-12 w-12 md:h-12 md:w-12"
        aria-label={`Más, ${label}`}
        disabled={atMax}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Button>
    </div>
  )
}
