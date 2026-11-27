'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
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
          <Button type="button" onClick={reset} variant="pill" size="pill" className="w-full">
            Reintentar
          </Button>
          <PortalResultLink href="/explorar" variant="outline">
            Explorar complejos
          </PortalResultLink>
        </>
      }
    >
      <p>Hubo un problema de nuestro lado. Probá de nuevo en unos segundos.</p>
      {error.digest && (
        <p className="text-sm">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
