'use client'

import { useEffect } from 'react'
import { CalendarDays } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/error-state'

/**
 * Error boundary de /reserva/[bookingId]/{exito,pendiente,verificar}: el cierre
 * del checkout de plata real. El copy aclara que un pago ya hecho está a salvo,
 * porque el genérico raíz no sabe nada de eso.
 */
export default function ReservaError({
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
      description="Tuvimos un problema mostrando tu reserva. Si ya pagaste, el pago está a salvo — no perdiste nada. Probá recargar; si seguís viendo esto, revisá 'Mis reservas' o escribinos."
      digest={error.digest}
      onRetry={reset}
      secondaryHref="/mis-reservas"
      secondaryLabel="Mis reservas"
      secondaryIcon={CalendarDays}
    />
  )
}
