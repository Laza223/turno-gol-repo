'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { Button } from '@/components/ui/button'

/**
 * Error boundary de /reserva/[bookingId]/{exito,pendiente,error}: el cierre del checkout de plata
 * real. El genérico raíz no sabe que acá el jugador viene de pagar: este manda a Mis reservas, que
 * es donde se ve cómo quedó la reserva. No promete nada sobre el pago. El mundo del portal lo pone
 * `reserva/layout.tsx`, que envuelve a este boundary.
 */
export default function ReservaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <PortalResult
      icon={AlertTriangle}
      tone="destructive"
      title="No pudimos cargar esta página"
      actions={
        <>
          <Button type="button" onClick={reset} className={PORTAL_BUTTON}>
            Reintentar
          </Button>
          <PortalResultLink href="/mis-reservas" variant="outline">
            Ver mis reservas
          </PortalResultLink>
        </>
      }
    >
      <p>Fue un error de esta pantalla. Mirá en Mis reservas cómo quedó tu reserva.</p>
      {error.digest && (
        <p className="text-sm">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
