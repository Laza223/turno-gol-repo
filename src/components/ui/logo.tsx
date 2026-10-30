import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/ui/logo-mark'

interface LogoProps {
  /** `horizontal`/`vertical`: logotipo "TURNOGOL". `icon`: isotipo TG. */
  variant?: 'vertical' | 'horizontal' | 'icon'
  /** Tamaño del logotipo: tabla fija, no se pisa con clases de texto sueltas. */
  size?: 'sm' | 'md'
  className?: string
  textClassName?: string
  /**
   * Color del acento ("Gol"). Default: el emerald de siempre — sirve
   * sobre `text-foreground`/blanco, donde el acento tiene que distinguirse
   * del resto de la palabra.
   */
  accentClassName?: string
}

const SIZE = { sm: 'text-sm', md: 'text-2xl' } as const

export function Logo({
  variant = 'horizontal',
  size = 'md',
  className,
  textClassName = 'text-foreground',
  accentClassName = 'text-emerald-700 dark:text-emerald-400',
}: LogoProps) {
  if (variant === 'icon') {
    return <LogoMark className={className} markClassName={textClassName} />
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-display uppercase italic font-black tracking-tighter',
        variant === 'vertical' ? 'justify-center text-4xl sm:text-5xl' : SIZE[size],
        textClassName,
        className,
      )}
    >
      Turno<span className={accentClassName}>Gol</span>
    </span>
  )
}
