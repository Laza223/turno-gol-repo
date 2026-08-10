// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ActivatePlanSection, type ActivatePlanOption } from '@/app/(admin)/settings/facturacion/ActivatePlanSection'

// Este archivo pisa `window.location` entero (ver beforeEach) — sin
// restaurarlo, cualquier otro test file que corra DESPUÉS en el mismo
// worker (singleThread: true, vitest.config.ts) hereda el objeto plano y
// rompe `window.history.replaceState` (detectado vía availability-grid.test.tsx
// fallando de forma no determinística según el orden de scheduling de vitest).
const originalLocation = window.location

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
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

// Espejo del catálogo real (migr. 071). El componente muestra los precios de
// ESTE prop pero elige el sugerido con `planForCourts` de la constante estática
// de `plans-data.ts`, así que si el fixture se desincroniza del catálogo el test
// pasa a medir dos cosas distintas a la vez.
const PLANS: ActivatePlanOption[] = [
  { id: 'plan-predio', slug: 'predio', name: 'Predio', maxCourts: 3, priceMonthly: 6_300_000, priceAnnual: 5_040_000 },
  { id: 'plan-complejo', slug: 'complejo', name: 'Complejo', maxCourts: 6, priceMonthly: 9_900_000, priceAnnual: 7_920_000 },
  { id: 'plan-estadio', slug: 'estadio', name: 'Estadio', maxCourts: null, priceMonthly: 12_900_000, priceAnnual: 10_320_000 },
]

let assignSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  assignSpy = vi.fn()
  // happy-dom permite reasignar window.location entero.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignSpy },
    writable: true,
    configurable: true,
  })
})

describe('ActivatePlanSection', () => {
  it('no renderiza nada si no hay planes activos', () => {
    const { container } = render(<ActivatePlanSection plans={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra los 3 planes (como heading) y el precio mensual de cada uno', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    expect(screen.getByRole('heading', { name: 'Predio' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Complejo' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Estadio' })).toBeTruthy()
    expect(screen.getByText(/^\$\s*63\.000$/)).toBeTruthy()
    expect(screen.getByText(/^\$\s*99\.000$/)).toBeTruthy()
    expect(screen.getByText(/^\$\s*129\.000$/)).toBeTruthy()
  })

  it('marca el plan sugerido según la cantidad de canchas elegida', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    // Por defecto (3 canchas) el sugerido es Predio. Antes de la migr. 071 era
    // Complejo: el corte de Predio pasó de 2 a 3 canchas para alinearse con los
    // tramos de ATC, y 3 canchas es justo el piso del ICP.
    expect(
      within(screen.getByText('Sugerido para tus canchas').parentElement as HTMLElement).getByRole('heading', {
        name: 'Predio',
      }),
    ).toBeTruthy()

    // Elegir "8+" canchas cambia el sugerido a Estadio.
    fireEvent.click(screen.getByRole('radio', { name: '8+' }))
    expect(
      within(screen.getByText('Sugerido para tus canchas').parentElement as HTMLElement).getByRole('heading', {
        name: 'Estadio',
      }),
    ).toBeTruthy()
  })

  it('cambia el precio mostrado de todos los planes al elegir ciclo anual', () => {
    render(<ActivatePlanSection plans={PLANS} />)
    fireEvent.click(screen.getByRole('radio', { name: /^Anual/ }))
    expect(screen.getByText(/^\$\s*50\.400$/)).toBeTruthy()
    expect(screen.getByText(/^\$\s*79\.200$/)).toBeTruthy()
    expect(screen.getByText(/^\$\s*103\.200$/)).toBeTruthy()
  })

  it('201 → redirige a checkoutUrl con el planId y billingCycle seleccionados', async () => {
    mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/abc' } }, 201)
    render(<ActivatePlanSection plans={PLANS} />)

    fireEvent.click(screen.getByRole('radio', { name: /^Anual/ }))
    const activarButtons = screen.getAllByRole('button', { name: 'Activar plan' })
    // El orden de las cards sigue el orden del prop `plans`: [Predio, Complejo, Estadio].
    fireEvent.click(activarButtons[1]!)

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

    const activarButtons = screen.getAllByRole('button', { name: 'Activar plan' })
    fireEvent.click(activarButtons[0]!)

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Ya tenés una suscripción activa.')
    })
    expect(assignSpy).not.toHaveBeenCalled()
  })
})
