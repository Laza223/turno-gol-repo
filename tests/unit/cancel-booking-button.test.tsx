// @vitest-environment happy-dom
import { startTransition, Suspense, use, useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import * as Sentry from '@sentry/nextjs'
import { toast } from '@/hooks/use-toast'
import { CancelBookingButton } from '@/app/(player)/mis-reservas/CancelBookingButton'

/**
 * El `router.refresh()` de Next entra en el carril de la acción y suspende la transición
 * hasta que llega el RSC; con la red caída, no llega. Un mock sincrónico (el de Storybook)
 * no lo reproduce, así que este arnés hace lo mismo: `refresh` abre una transición que
 * suspende con `use()` sobre una promesa que nunca resuelve. Es lo que dejaba trabado al
 * `setError` de ConfirmDialog (otra transición) en "Procesando…".
 */
const refreshListeners = new Set<() => void>()
function SuspendedRouter() {
  const [pending, setPending] = useState<Promise<never> | null>(null)
  useEffect(() => {
    const onRefresh = () => startTransition(() => setPending(new Promise<never>(() => {})))
    refreshListeners.add(onRefresh)
    return () => void refreshListeners.delete(onRefresh)
  }, [])
  if (pending) use(pending)
  return null
}

const networkError = new Error('Failed to fetch')

afterEach(() => {
  cleanup()
  refreshListeners.clear()
  vi.clearAllMocks()
})

describe('CancelBookingButton — la action lanza (se perdió la respuesta)', () => {
  it('avisa en el Toaster, cierra el diálogo y refresca la lista aunque el refresh no vuelva', async () => {
    router.refresh.mockImplementation(() => refreshListeners.forEach((listener) => listener()))
    render(
      <>
        <Suspense fallback={null}>
          <SuspendedRouter />
        </Suspense>
        <CancelBookingButton
          bookingId="booking-1"
          courtName="Cancha 1"
          dateLabel="sáb, 14 mar"
          timeLabel="18:00–19:00"
          cancellationOutcome="refund"
          depositAmountCents={150_000}
          action={async () => {
            throw networkError
          }}
        />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast).toHaveBeenCalledWith({
      title: expect.stringMatching(/No pudimos confirmar si se canceló.*si sigue, probá de nuevo/),
      variant: 'destructive',
    })
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledWith(networkError)
  })
})
