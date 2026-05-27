'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

export default function CajaError({
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
      title="No pudimos cargar la caja"
      description="Ocurrió un error al obtener los datos de la caja. El equipo ya fue notificado. Probá recargar."
      digest={error.digest}
      onRetry={reset}
    />
  )
}
