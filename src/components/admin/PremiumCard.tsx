import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PremiumCardProps {
  children: ReactNode
  className?: string
  /** Activa el hover-lift + glow emerald (para cards clickeables). */
  interactive?: boolean
}

/**
 * Superficie premium theme-adaptive (light = elevación, dark = glass).
 * Estilo en `.card-premium`/`.card-premium-interactive` (globals.css) para
 * que el lenguaje sea idéntico en todo el panel. No fija padding: lo decide
 * el consumidor (las tablas lo quieren en 0).
 */
export function PremiumCard({ children, className, interactive }: PremiumCardProps) {
  return (
    <div className={cn('card-premium', interactive && 'card-premium-interactive', className)}>
      {children}
    </div>
  )
}
