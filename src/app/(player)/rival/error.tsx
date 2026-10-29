'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { Button } from '@/components/ui/button'

/**
 * Error boundary de /rival, en el cascarón de La Previa: dice qué pantalla no cargó (no "tu cuenta").
 * "Reintentar" es `retry`, que vuelve a pedir la page al servidor; `reset` re-renderiza con el payload fallido.
 */
export default function RivalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <PortalResult
      icon={AlertTriangle}
      tone="destructive"
      title="No pudimos cargar RIVAL"
      actions={
        <>
          <Button type="button" onClick={retry} className={PORTAL_BUTTON}>
            Reintentar
          </Button>
          <PortalResultLink href="/" variant="outline">
            Ir al inicio
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
