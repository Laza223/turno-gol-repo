'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

export default function CanchasError({
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
    <ErrorState
      variant="contained"
      title="No pudimos cargar las canchas"
      description="Falló la lectura de la lista y ya nos llegó el aviso. Tus canchas y tus precios no se tocaron: tocá «Reintentar»."
      digest={error.digest}
      onRetry={reset}
    />
  )
}
