import { cn } from '@/lib/utils'
import { TurnoGolLogoIcon } from './TurnoGolLogoIcon'

interface LogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon' | 'vector'
  className?: string
  iconClassName?: string
  textClassName?: string
}

export function Logo({ variant = 'vertical', className, iconClassName, textClassName = "text-slate-900" }: LogoProps) {
  // Strip background/border/shadow from legacy icon classes to use the SVG without a background box
  const cleanIconClass = iconClassName?.replace(/\b(bg-|border-|shadow-)\S*/g, '').trim()

  if (variant === 'vector' || variant === 'icon') {
    return <TurnoGolLogoIcon className={cn("h-9 w-9 shrink-0", cleanIconClass, className)} />
  }

  if (variant === 'horizontal') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <TurnoGolLogoIcon className={cn("h-9 w-9 shrink-0", cleanIconClass, textClassName)} />
        <span className={cn("font-display text-xl font-bold tracking-tight", textClassName)}>
          Turno<span className="text-emerald-500">Gol</span>
        </span>
      </div>
    )
  }

  if (variant === 'vertical') {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
        <TurnoGolLogoIcon className={cn("h-24 w-24 sm:h-32 sm:w-32 shrink-0", cleanIconClass, textClassName)} />
        <span className={cn("font-display text-4xl sm:text-5xl font-bold tracking-tight", textClassName)}>
          Turno<span className="text-emerald-500">Gol</span>
        </span>
      </div>
    )
  }

  return null
}
