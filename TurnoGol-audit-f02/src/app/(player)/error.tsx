'use client'

import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/** Player-facing error boundary (mis reservas, reserva flows). */
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
      title="No pudimos cargar tus reservas"
      description="Tuvimos un problema al mostrar esta página. Probá de nuevo en unos segundos."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/mis-reservas"
      secondaryLabel="Mis reservas"
      secondaryIcon={CalendarDays}
    />
  )
}
