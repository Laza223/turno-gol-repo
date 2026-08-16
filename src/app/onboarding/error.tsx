'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/**
 * El wizard no tenía boundary propio: cualquier error caía en el `error.tsx` raíz,
 * que no sabe nada del onboarding y no ofrece salida. Acá el copy dice lo único
 * que el dueño necesita oír en ese momento — que lo cargado no se perdió.
 */
export default function OnboardingError({
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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <ErrorState
          variant="contained"
          title="Se cortó la configuración"
          description="No pudimos cargar este paso. Lo que ya guardaste está a salvo: al reintentar volvés donde estabas."
          digest={error.digest}
          onRetry={reset}
        />
      </div>
    </div>
  )
}
