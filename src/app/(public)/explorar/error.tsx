'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { Button } from '@/components/ui/button'

/**
 * Error boundary de /explorar: dice qué no cargó. La salida secundaria es la home: el boundary
 * de `(public)` manda a `/explorar`, que acá volvería a la misma página.
 */
export default function ExplorarError({
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
      title="No pudimos cargar los complejos"
      actions={
        <>
          <Button type="button" onClick={reset} className={PORTAL_BUTTON}>
            Reintentar
          </Button>
          <PortalResultLink href="/" variant="outline">
            Ir al inicio
          </PortalResultLink>
        </>
      }
    >
      <p>Fue un error de nuestro lado, ya lo tenemos en la mira.</p>
      {error.digest && (
        <p className="text-sm">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
