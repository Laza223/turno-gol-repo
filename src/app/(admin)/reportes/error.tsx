'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

export default function ReportesError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Reportes</h1>
      <ErrorState
        variant="inline"
        title="Error al cargar el reporte"
        description={error.message}
        onRetry={reset}
      />
    </div>
  )
}
