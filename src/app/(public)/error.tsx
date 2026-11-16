'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { buttonVariants } from '@/components/ui/button'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { cn } from '@/lib/utils'

/** Public-facing error boundary (complex pages, search, booking flow). */
export default function PublicError({
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
          <button
            type="button"
            onClick={reset}
            className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'w-full')}
          >
            Reintentar
          </button>
          <PortalResultLink href="/explorar" variant="outline">
            Explorar complejos
          </PortalResultLink>
        </>
      }
    >
      <p>
        Se nos escapó un error de nuestro lado, ya lo tenemos en la mira. Probá de nuevo o explorá
        otros complejos mientras tanto.
      </p>
      {error.digest && (
        <p className="text-sm text-portal-soft">
          Código de referencia: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      )}
    </PortalResult>
  )
}
