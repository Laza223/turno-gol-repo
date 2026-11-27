'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
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
          <Button type="button" onClick={reset} variant="pill" size="pill" className="w-full">
            Reintentar
          </Button>
          <PortalResultLink href="/" variant="outline">
            Ir al inicio
          </PortalResultLink>
        </>
      }
    >
      <p>Hubo un problema al buscar complejos. Probá de nuevo en unos segundos.</p>
      {error.digest && (
        <p className="text-sm">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
