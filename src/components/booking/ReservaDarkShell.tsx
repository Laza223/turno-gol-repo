import type { ReactNode } from 'react'

/**
 * Fondo dark premium del retorno de reserva (glow esmeralda), espeja el home.
 * Compartido por éxito / pendiente / error y sus loadings para que la transición
 * sea consistente (sin flash claro→oscuro).
 */
export default function ReservaDarkShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[88vh] overflow-hidden" style={{ background: '#020617' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-12%] top-[-14%] h-[560px] w-[560px] rounded-full blur-[12px]"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.22), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-18%] left-[-12%] h-[480px] w-[480px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)' }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
