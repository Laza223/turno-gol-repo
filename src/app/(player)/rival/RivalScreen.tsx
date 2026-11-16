import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import './rival.css'

/**
 * El fondo y la columna de cada pantalla de RIVAL en vidrio: la luz de fondo (`portal-ambient`,
 * que tapa el dibujo de cancha que todavía pone `PortalFrame`) y la columna de 760 px en Archivo
 * (`.pa-col`). Trae los CSS de las piezas que comparte con Mis reservas y confirmar el turno.
 */
export function RivalScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="portal-ambient min-h-[88vh]">
      <div className={cn('pa-col rv-stack gap-3.5', className)}>{children}</div>
    </div>
  )
}
