'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { Button } from '@/components/ui/button'

/** Error boundary de /mis-reservas, en el cascarón de La Previa: dice qué pantalla no cargó. */
export default function MisReservasError({
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
      title="No pudimos cargar tus reservas"
      actions={
        <>
          <Button type="button" onClick={reset} className={PORTAL_BUTTON}>
            Reintentar
          </Button>
          <PortalResultLink href="/explorar" variant="outline">
            Explorar complejos
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
