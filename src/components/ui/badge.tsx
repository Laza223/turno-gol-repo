import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/status-tone'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-foreground text-background hover:bg-foreground/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // El tono sale de `TONE_BADGE`, no de una copia local. Estas dos filas
        // eran la séptima copia de la receta de estado del sistema y ya habían
        // divergido de la tabla en las dos puntas: en light usaban `green-800`
        // (escala OKLCH de Tailwind 4, la única familia verde del repo que NO
        // está pineada a hex en `globals.css`) donde todo el resto del sistema
        // usa `emerald-800`; en dark usaban el token crudo `text-success`,
        // más apagado que el `emerald-300` que la tabla eligió para labels.
        // El motivo original — el token crudo no llega a 4.5:1 en light sobre
        // este fill translúcido (MASTER §2.4) — sigue respetado: la tabla
        // también fija el foreground en las dos puntas.
        // Los `hover:` quedan acá porque son propios de `Badge`; `TONE_BADGE`
        // pinta estado, no interacción.
        success: cn(
          'border-transparent',
          TONE_BADGE.success,
          'hover:bg-success/15 dark:hover:bg-success/20',
        ),
        warning: cn('border-transparent', TONE_BADGE.warning),
        outline: 'text-foreground border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

/** @public Superficie vendorizada de shadcn/ui: la reintroduce cualquier `npx shadcn add`. */
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** @public Superficie vendorizada de shadcn/ui: la reintroduce cualquier `npx shadcn add`. */
export { Badge, badgeVariants }
