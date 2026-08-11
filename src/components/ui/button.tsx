import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'

// Propiedades nombradas en vez de `transition-all`: el anillo de foco tiene que
// aparecer al instante. En Tailwind v4 el `ring-*` se dibuja con `box-shadow`, así
// que la única forma de no animarlo es dejar `box-shadow` fuera de la lista —
// a costa de que el `hover:shadow-*` de las variantes aparezca de golpe.
// `scale` y `translate` van explícitos: en v4 son propiedades independientes de
// `transform`, y sin nombrarlas el `active:scale-[0.97]` no anima.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,opacity,translate,scale] duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/30 disabled:translate-y-0 disabled:shadow-none',
        destructive:
          'bg-destructive text-destructive-foreground shadow-md shadow-red-600/20 hover:bg-destructive/90 hover:-translate-y-0.5',
        outline:
          'border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-emerald-700 dark:text-emerald-400 underline-offset-4 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2 md:h-10',
        sm: 'h-10 rounded-md px-3 md:h-9',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-11 w-11 md:h-10 md:w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/** @public Superficie vendorizada de shadcn/ui: la reintroduce cualquier `npx shadcn add`. */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || disabled}
        aria-disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && <TgBallSpinner size="xs" className="mr-2" aria-hidden="true" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
