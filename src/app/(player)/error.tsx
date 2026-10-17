'use client'

import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/** Player-facing error boundary del grupo (Cuenta, Perfil…). Mis reservas tiene el suyo. */
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
    <ErrorState
      variant="full"
      title="No pudimos cargar esta página"
      description="Se nos escapó un error de nuestro lado, ya lo tenemos en la mira. Probá de nuevo en un toque."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/mis-reservas"
      secondaryLabel="Mis reservas"
      secondaryIcon={CalendarDays}
    />
  )
}
