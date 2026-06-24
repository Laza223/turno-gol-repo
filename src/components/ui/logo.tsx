import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon'
  className?: string
  iconClassName?: string
  textClassName?: string
}

export function Logo({ variant = 'vertical', className, iconClassName, textClassName }: LogoProps) {
  if (variant === 'vertical') {
    return (
      <div className={cn("flex flex-col items-center justify-center", className)}>
        <Image
          src="/logo-turno-gol.png"
          alt="TurnoGol Logo"
          width={400}
          height={400}
          className={cn("w-full h-auto max-w-[200px] object-contain", iconClassName)}
          priority
        />
      </div>
    )
  }

  if (variant === 'horizontal') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn("relative flex items-center justify-center h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white p-1 shadow-sm", iconClassName)}>
          <Image
            src="/logo-turno-gol.png"
            alt="TurnoGol Icon"
            width={64}
            height={64}
            className="h-full w-full object-cover"
            style={{ transform: 'scale(1.95)', transformOrigin: 'top center' }}
            priority
          />
        </div>
        <span className={cn("font-display text-lg font-bold tracking-tight", textClassName)}>
          Turno<span className="text-emerald-500">Gol</span>
        </span>
      </div>
    )
  }

  // icon
  return (
    <div className={cn("relative flex items-center justify-center h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white p-1 shadow-sm", className)}>
      <Image
        src="/logo-turno-gol.png"
        alt="TurnoGol Icon"
        width={64}
        height={64}
        className={cn("h-full w-full object-cover", iconClassName)}
        style={{ transform: 'scale(1.95)', transformOrigin: 'top center' }}
        priority
      />
    </div>
  )
}
