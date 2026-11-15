import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './reserva.css'

/**
 * Cascarón de confirmar y de la vuelta de la reserva (portal de vidrio F5): la luz de fondo del
 * portal (`.portal-ambient`) y la columna de 480 px (`.rv-col`). Lo comparten éxito, pendiente,
 * error, la pantalla de confirmar y sus loadings, para que al llegar los datos nada salte.
 */
export default function ReservaDarkShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="portal-ambient min-h-[88vh]">
      <div className={cn('rv-col', className)}>{children}</div>
    </div>
  )
}
