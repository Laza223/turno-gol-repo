'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { Button } from '@/components/ui/button'

/**
 * Error boundary del grupo (Mi cuenta, Eliminar la cuenta), en el mundo de La Reserva. Mis
 * reservas tiene el suyo. `PortalResult` pinta el <h1> y la columna dentro del <main> del
 * cascarón: no abre un <main> propio.
 */
export default function PlayerError({
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
      title="No pudimos cargar tu cuenta"
      actions={
        <>
          <Button type="button" onClick={reset} className={PORTAL_BUTTON}>
            Reintentar
          </Button>
          <PortalResultLink href="/mis-reservas" variant="outline">
            Mis reservas
          </PortalResultLink>
        </>
      }
    >
      <p>Fue un error de nuestro lado, ya lo tenemos en la mira. Probá de nuevo en un toque.</p>
      {error.digest && (
        <p className="text-sm">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
