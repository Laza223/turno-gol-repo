import type { CSSProperties } from 'react'
import ReservaShell from '@/components/booking/ReservaDarkShell'
import { PortalResultLink } from '@/components/world/PortalResult'

/**
 * La página no encontrada, en vidrio (`estados.html` del mockup): el "404" grande, qué pasó y la
 * salida. Pura (sin sesión ni server actions) para que la use `not-found.tsx` dentro del cromo del
 * portal, `MatchNotFound` dentro del layout del jugador y Storybook. No pone `<main>`: ya lo trae
 * `PortalFrame`.
 */
export function NotFoundView() {
  return (
    <ReservaShell>
      <div className="rv-done min-h-[60dvh] content-center pt-6 md:pt-10">
        <p className="rv-rise text-portal-green text-[length:clamp(96px,30vw,220px)] leading-[.86] font-black tracking-[-0.06em] italic tabular-nums">
          404
        </p>
        <h1 className="rv-h1 rv-rise mt-4" style={{ '--i': 1 } as CSSProperties}>
          Página no encontrada
        </h1>
        <p className="rv-sub rv-rise" style={{ '--i': 2 } as CSSProperties}>
          La página que buscás no existe o fue movida. Verificá la dirección o volvé al inicio.
        </p>
        <div className="rv-acts rv-rise" style={{ '--i': 3 } as CSSProperties}>
          <PortalResultLink href="/">Volver al inicio</PortalResultLink>
        </div>
      </div>
    </ReservaShell>
  )
}
