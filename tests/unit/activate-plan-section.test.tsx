// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActivatePlanSection, type ActivatePlanOption } from '@/app/(admin)/settings/facturacion/ActivatePlanSection'

afterEach(() => cleanup())

function mockFetch(body: unknown, status: number) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof global.fetch
}

const PLANS: ActivatePlanOption[] = [
  { id: 'plan-predio', slug: 'predio', name: 'Predio', maxCourts: 2, priceMonthly: 5_500_000, priceAnnual: 4_400_000 },
  { id: 'plan-complejo', slug: 'complejo', name: 'Complejo', maxCourts: 5, priceMonthly: 8_500_000, priceAnnual: 6_800_000 },
  { id: 'plan-estadio', slug: 'estadio', name: 'Estadio', maxCourts: null, priceMonthly: 11_500_000, priceAnnual: 9_200_000 },
]

let assignSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  assignSpy = vi.fn()
  // happy-dom permite reasignar window.location entero.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignSpy },
    writable: true,
  })
})

describe('ActivatePlanSection', () => {
  it('no renderiza nada si no hay planes activos', () => {
    const { container } = render(<ActivatePlanSection plans={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra los 3 planes y el precio mensual del primero seleccionado', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    expect(screen.getByRole('button', { name: /Predio/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Complejo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Estadio/ })).toBeTruthy()
    expect(screen.getByText(/^\$\s*55\.000$/)).toBeTruthy()
  })

  it('cambia el precio mostrado al elegir otro plan', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    fireEvent.click(screen.getByRole('button', { name: /Complejo/ }))
    expect(screen.getByText(/^\$\s*85\.000$/)).toBeTruthy()
  })

  it('cambia el precio mostrado al elegir ciclo anual', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anual' }))
    expect(screen.getByText(/^\$\s*44\.000$/)).toBeTruthy()
  })

  it('201 → redirige a checkoutUrl con el planId y billingCycle seleccionados', async () => {
    mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/abc' } }, 201)
    render(<ActivatePlanSection plans={PLANS} />)

    fireEvent.click(screen.getByRole('button', { name: /Complejo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Anual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activar plan' }))

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('https://mp.test/checkout/abc')
    })

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/subscribe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ planId: 'plan-complejo', billingCycle: 'annual' }),
      }),
    )
  })

  it('error del server → muestra mensaje inline y no redirige', async () => {
    mockFetch({ error: { code: 'CONFLICT', message: 'Ya tenés una suscripción activa.' } }, 409)
    render(<ActivatePlanSection plans={PLANS} />)

    fireEvent.click(screen.getByRole('button', { name: 'Activar plan' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Ya tenés una suscripción activa.')
    })
    expect(assignSpy).not.toHaveBeenCalled()
  })
})
