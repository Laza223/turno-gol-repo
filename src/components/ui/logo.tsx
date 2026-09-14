import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon' | 'vector'
  className?: string
  iconClassName?: string
  textClassName?: string
  /**
   * Color del acento ("Gol"/"G"). Default: el emerald de siempre — sirve
   * sobre `text-foreground`/blanco, donde el acento tiene que distinguirse
   * del resto de la palabra. Si el logo va sobre un fondo YA emerald (p. ej.
   * `bg-primary` del riel), pasar el mismo tono que `textClassName`: el
   * default se funde con su propio fondo y la G desaparece (0:1 en light,
   * donde `--primary` y este emerald-700 son el mismo color).
   */
  accentClassName?: string
}

export function Logo({
  variant = 'horizontal',
  className,
  textClassName = 'text-foreground',
  accentClassName = 'text-emerald-700 dark:text-emerald-400',
}: LogoProps) {
  if (variant === 'vector' || variant === 'icon') {
    return (
      <span
        className={cn(
          'font-display text-2xl uppercase italic font-black tracking-tighter',
          textClassName,
          className,
        )}
      >
        T<span className={accentClassName}>G</span>
      </span>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span
          className={cn(
            'font-display text-2xl uppercase italic font-black tracking-tighter',
            textClassName,
          )}
        >
          Turno<span className={accentClassName}>Gol</span>
        </span>
      </div>
    )
  }

  if (variant === 'vertical') {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
        <span
          className={cn(
            'font-display text-4xl sm:text-5xl uppercase italic font-black tracking-tighter',
            textClassName,
          )}
        >
          Turno<span className={accentClassName}>Gol</span>
        </span>
      </div>
    )
  }

  return null
}
