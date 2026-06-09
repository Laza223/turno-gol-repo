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
      title="Error en el panel de administración"
      description="No pudimos cargar esta sección. El equipo ya fue notificado. Probá recargar; si el problema persiste, volvé al dashboard."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/dashboard"
      secondaryLabel="Ir al dashboard"
      secondaryIcon={LayoutDashboard}
    />
  )
}
