'use client'

import { useEffect } from 'react'
import { LogIn } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/** Error boundary del grupo (auth): login, register, forgot/reset-password, verify. */
export default function AuthError({
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
      title="No pudimos cargar esta página"
      description="Tuvimos un problema. El equipo ya fue notificado. Probá recargar."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/login"
      secondaryLabel="Ir a iniciar sesión"
      secondaryIcon={LogIn}
    />
  )
}
