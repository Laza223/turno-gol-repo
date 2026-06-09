'use client'

import { useEffect } from 'react'
import { Home } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

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
    <ErrorState
      variant="full"
      title="Algo salió mal"
      description="No pudimos cargar esta página. Probá de nuevo en unos segundos o explorá otros complejos."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/explorar"
      secondaryLabel="Explorar complejos"
      secondaryIcon={Home}
    />
  )
}
