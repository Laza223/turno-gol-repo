import type { ReactNode } from 'react'

/**
 * Cascarón del retorno de reserva (glow esmeralda). Theme-adaptive: en light se
 * vuelve transparente y deja ver el campo del portal (consistente con
 * /mis-reservas); en dark es un slab #020617 que espeja el home. Compartido por
 * éxito / pendiente / error y sus loadings para una transición consistente.
 */
export default function ReservaDarkShell({ children }: { children: ReactNode }) {
  return (
    <div className="reserva-shell relative min-h-[88vh] overflow-hidden">
      <div
        aria-hidden
        className="reserva-glow-top pointer-events-none absolute right-[-12%] top-[-14%] h-[560px] w-[560px] rounded-full blur-md"
      />
      <div
        aria-hidden
        className="reserva-glow-bottom pointer-events-none absolute bottom-[-18%] left-[-12%] h-[480px] w-[480px] rounded-full"
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
