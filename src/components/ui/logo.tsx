import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon' | 'vector'
  className?: string
  iconClassName?: string
  textClassName?: string
}

export function Logo({ variant = 'horizontal', className, textClassName = "text-foreground" }: LogoProps) {
  if (variant === 'vector' || variant === 'icon') {
    return (
      <span className={cn("font-display text-2xl uppercase italic font-black tracking-tighter", textClassName, className)}>
        T<span className="text-emerald-700 dark:text-emerald-400">G</span>
      </span>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn("font-display text-2xl uppercase italic font-black tracking-tighter", textClassName)}>
          Turno<span className="text-emerald-700 dark:text-emerald-400">Gol</span>
        </span>
      </div>
    )
  }

  if (variant === 'vertical') {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
        <span className={cn("font-display text-4xl sm:text-5xl uppercase italic font-black tracking-tighter", textClassName)}>
          Turno<span className="text-emerald-700 dark:text-emerald-400">Gol</span>
        </span>
      </div>
    )
  }

  return null
}
