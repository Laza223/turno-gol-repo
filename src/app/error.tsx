'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { buttonVariants } from '@/components/ui/button'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { cn } from '@/lib/utils'

/**
 * Error raíz, sin cromo: tiene que depender de lo mínimo (si el cromo fue lo que falló, no puede
 * caerse otra vez). Por eso trae su propio fondo de vidrio y su `<main>`.
 */
export default function Error({
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
    <div data-portal-glass className="portal-ambient min-h-dvh text-portal-ink">
      <main id="main-content">
        <PortalResult
          icon={AlertTriangle}
          tone="destructive"
          title="Algo salió mal"
          actions={
            <>
              <button
                type="button"
                onClick={reset}
                className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'w-full')}
              >
                Reintentar
              </button>
              <PortalResultLink href="/" variant="outline">
                Volver al inicio
              </PortalResultLink>
            </>
          }
        >
          <p>
            Tuvimos un problema inesperado. Ya quedó registrado y lo estamos revisando. Podés
            reintentar en unos segundos o volver al inicio.
          </p>
          {error.digest && (
            <p className="text-sm text-portal-soft">
              Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
            </p>
          )}
        </PortalResult>
      </main>
    </div>
  )
}
