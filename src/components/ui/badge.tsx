import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-foreground text-background hover:bg-foreground/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // `text-success`/`text-warning` (el token semántico crudo) no llegan a
        // 4.5:1 en light sobre este fill translúcido (medido con axe: 4.43 y
        // 2.82 respectivamente) — mismo patrón que el bug conocido de
        // `emerald-400` en superficie clara (MASTER §2.4). El dark sigue
        // usando el token (ya pasa AA ahí), solo se fija el foreground light.
        success: 'border-transparent bg-success/10 text-green-800 ring-1 ring-inset ring-success/25 hover:bg-success/15 dark:bg-success/15 dark:text-success dark:ring-success/40 dark:hover:bg-success/20',
        warning: 'border-transparent bg-warning/10 text-amber-700 ring-1 ring-inset ring-warning/25 dark:bg-warning/15 dark:text-warning dark:ring-warning/40',
        outline: 'text-foreground border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
