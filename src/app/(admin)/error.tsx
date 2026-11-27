'use client'

import { useEffect } from 'react'
import { LayoutDashboard } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/**
 * Admin panel error boundary. Renders inside the admin shell (sidebar stays),
 * so it's a contained panel rather than a full-screen takeover.
 */
export default function AdminError({
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
      title="No pudimos cargar esta pantalla"
      description="Probá recargar la pantalla. Si sigue fallando, volvé a Hoy."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/dashboard"
      secondaryLabel="Volver a Hoy"
      secondaryIcon={LayoutDashboard}
    />
  )
}
