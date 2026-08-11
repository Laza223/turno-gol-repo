// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// ENS-25: botón de baja obligatorio (Res. 424/2020) — visible solo en estados
// cancelables. ENS-26 vive en status-banner.test.tsx / admin-layout test.

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { CancelSubscriptionSection } from '@/app/(admin)/settings/facturacion/CancelSubscriptionSection'
import { toast } from '@/hooks/use-toast'

// Mediodía UTC: evita que el rollover de timezone local corra la fecha (la
// máquina que corre el test puede no estar en UTC).
const ACCESS_UNTIL = '2026-09-13T12:00:00.000Z'

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
})

function mockFetch(body: unknown, status: number) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof global.fetch
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar suscripción' }))
  return screen.findByRole('dialog')
}

describe('CancelSubscriptionSection — visibilidad por estado', () => {
  it('trialing: no renderiza nada (sin plan elegido, no hay nada que cancelar)', () => {
    const { container } = render(
      <CancelSubscriptionSection status="trialing" accessUntil={ACCESS_UNTIL} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('blocked: no renderiza nada (no es un estado cancelable por el dueño)', () => {
    const { container } = render(
      <CancelSubscriptionSection status="blocked" accessUntil={ACCESS_UNTIL} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it.each(['active', 'past_due', 'suspended'] as const)(
    '%s: muestra el botón de cancelar suscripción',
    (status) => {
      render(<CancelSubscriptionSection status={status} accessUntil={ACCESS_UNTIL} />)
      expect(screen.getByRole('button', { name: 'Cancelar suscripción' })).toBeTruthy()
    },
  )

  it('canceled: NO muestra el botón — muestra texto + link a /reactivar', () => {
    render(<CancelSubscriptionSection status="canceled" accessUntil={ACCESS_UNTIL} />)
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
    expect(
      screen.getByText(/Suscripción cancelada — acceso hasta el 13 de septiembre de 2026/),
    ).toBeTruthy()
    const link = screen.getByRole('link', { name: /Reactivar/i })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })
})

describe('CancelSubscriptionSection — modal de confirmación', () => {
  it('explica la fecha de acceso y la retención real de datos (60 días)', async () => {
    render(<CancelSubscriptionSection status="active" accessUntil={ACCESS_UNTIL} />)
    const dialog = await openDialog()
    expect(within(dialog).getByText(/13 de septiembre de 2026/)).toBeTruthy()
    expect(within(dialog).getByText(/60 días/)).toBeTruthy()
  })

  it('motivo vacío → error inline, no llama al endpoint', async () => {
    mockFetch({ data: { accessUntil: ACCESS_UNTIL } }, 200)
    render(<CancelSubscriptionSection status="active" accessUntil={ACCESS_UNTIL} />)
    const dialog = await openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar suscripción' }))

    await waitFor(() => {
      expect(within(dialog).getByRole('alert').textContent).toBe('Ingresá un motivo.')
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('200 con éxito: postea el motivo, muestra toast y refresca — el diálogo se cierra', async () => {
    mockFetch({ data: { accessUntil: ACCESS_UNTIL } }, 200)
    render(<CancelSubscriptionSection status="active" accessUntil={ACCESS_UNTIL} />)
    const dialog = await openDialog()

    fireEvent.change(within(dialog).getByLabelText(/Motivo/i), {
      target: { value: 'Cierro el complejo por reforma' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar suscripción' }))

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Suscripción cancelada', variant: 'success' }),
    )

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Cierro el complejo por reforma' }),
      }),
    )
  })

  it('409 del endpoint (INVALID_STATE) → mensaje inline, no refresca ni cierra', async () => {
    mockFetch(
      { error: { code: 'INVALID_STATE', message: 'La suscripción ya no está activa.' } },
      409,
    )
    render(<CancelSubscriptionSection status="active" accessUntil={ACCESS_UNTIL} />)
    const dialog = await openDialog()

    fireEvent.change(within(dialog).getByLabelText(/Motivo/i), {
      target: { value: 'Motivo cualquiera' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar suscripción' }))

    await waitFor(() => {
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'La suscripción ya no está activa.',
      )
    })
    expect(refreshSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
