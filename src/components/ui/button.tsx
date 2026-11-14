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

/**
 * Portal de vidrio (decisión 2026-11-13). Pieza "Apretar" de la dirección: al tocar responde en
 * `--dur-1` y al soltar vuelve con el resorte `toque`. Con "reducir movimiento" no escala, solo
 * cambia el color (`motion-reduce:active:scale-100` de la base).
 */
const pillPress = (scale: string) =>
  `transition-[scale,filter,background-color,border-color,color] duration-480 ease-(--ease-toque) ${scale} active:duration-(--dur-1) active:ease-(--portal-ease-out)`
/** Foco del portal: el anillo verde de 2 px como contorno, sin la banda del `ring-offset`. */
const PILL_FOCUS =
  'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green'
const PILL = `rounded-full font-semibold ${PILL_FOCUS}`
const PILL_GREEN =
  'text-portal-on-green bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) shadow-[inset_0_1px_0_rgb(255_255_255/.45),0_14px_30px_-12px_var(--portal-btn-glow)]'
const PILL_INNER =
  'border border-portal-inner-line bg-portal-inner text-portal-ink hover:bg-portal-bar-on'
const PILL_CHECKED =
  'aria-pressed:border-transparent aria-pressed:bg-linear-to-b aria-pressed:from-(--portal-btn-a) aria-pressed:to-(--portal-btn-b) aria-pressed:text-portal-on-green aria-checked:border-transparent aria-checked:bg-linear-to-b aria-checked:from-(--portal-btn-a) aria-checked:to-(--portal-btn-b) aria-checked:text-portal-on-green'

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
        // TurnoGol Plus (lo pago con IA): violeta, ver DESIGN.md.
        plus: 'bg-plus text-plus-foreground shadow-md shadow-plus/20 hover:bg-plus/90 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-emerald-700 dark:text-emerald-400 underline-offset-4 hover:text-emerald-800 dark:hover:text-emerald-300 hover:underline',
        // ── Portal de vidrio (solo el portal del jugador; el panel no las usa).
        /** Principal: el degradé verde. El verde es acción (dirección §3.6). */
        pill: `${PILL} ${PILL_GREEN} ${pillPress('active:scale-[.985]')} hover:brightness-106`,
        /** De vidrio real: va sobre una foto o sobre contenido que pasa por detrás. */
        'pill-glass': `${PILL} glass text-portal-ink ${pillPress('active:scale-[.985]')} hover:brightness-106`,
        /** De riesgo: cancelar, eliminar. */
        'pill-danger': `${PILL} bg-linear-to-b from-(--portal-bad-a) to-(--portal-bad-b) text-white shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_14px_30px_-14px_rgb(225_29_72/.6)] ${pillPress('active:scale-[.985]')} hover:brightness-106`,
        /** Enlace en píldora (`.link` del mockup): acción secundaria, con el ícono en verde. */
        'pill-link': `${PILL} ${PILL_INNER} gap-2 [&_svg]:size-4.5 [&_svg]:text-portal-green ${pillPress('active:scale-[.98]')}`,
        /** Chip que se elige (`.chipb`): con `aria-pressed` o `aria-checked` pasa al verde. */
        'pill-chip': `${PILL} ${PILL_INNER} ${PILL_CHECKED} ${pillPress('active:scale-[.96]')}`,
      },
      size: {
        default: 'h-11 px-4 py-2 md:h-10',
        sm: 'h-10 rounded-md px-3 md:h-9',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-11 w-11 md:h-10 md:w-10',
        // Portal de vidrio: 52 px el principal y 44 px el resto (objetivo táctil).
        pill: 'h-13 gap-2 px-6.5 text-base',
        'pill-sm': 'h-11 px-4.5 text-[15px]',
        'pill-icon': 'h-11 w-11 p-0',
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
