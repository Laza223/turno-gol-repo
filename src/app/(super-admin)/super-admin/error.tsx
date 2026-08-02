'use client'

import { useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/**
 * Panel de super-admin sin error boundary propio: cualquier error acá
 * burbujeaba al `error.tsx` raíz, fuera del shell (🔴 auditoría 2026-08-01
 * §7 — mismo patrón que `(admin)/error.tsx`).
 */
export default function SuperAdminError({
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
      title="Error en el panel de super-admin"
      description="No pudimos cargar esta sección. El equipo ya fue notificado. Probá recargar; si el problema persiste, volvé al panel."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/super-admin"
      secondaryLabel="Ir al panel"
      secondaryIcon={ShieldCheck}
    />
  )
}
