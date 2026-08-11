'use client'

import { useEffect } from 'react'
import { Home } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

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
    <ErrorState
      variant="full"
      title="Algo salió mal"
      description="Tuvimos un problema inesperado. Ya quedó registrado y lo estamos revisando. Podés reintentar en unos segundos o volver al inicio."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/"
      secondaryLabel="Volver al inicio"
      secondaryIcon={Home}
    />
  )
}
