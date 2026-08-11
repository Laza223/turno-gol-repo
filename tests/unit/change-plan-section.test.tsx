// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChangePlanSection } from '@/app/(admin)/settings/facturacion/ChangePlanSection'
import type { ActivatePlanOption } from '@/app/(admin)/settings/facturacion/ActivatePlanSection'

/**
 * Cambio de plan con suscripción ya activa. El endpoint `/api/billing/upgrade`
 * existía desde siempre pero NINGUNA UI lo llamaba: un complejo que sumaba
 * canchas se chocaba contra el techo de su plan sin salida in-app.
 *
 * Lo que este archivo protege es que subir y bajar no se confundan: subir cobra
 * el proraeo y manda al checkout de MP; bajar no cobra nada y se agenda para el
 * fin del período ya pago. Mandar un downgrade al endpoint de upgrade le
 * cobraría al complejo por achicarse.
 */

// Mismo cuidado que activate-plan-section.test.tsx: este archivo pisa
// `window.location` entero y tiene que restaurarlo, o contamina a los demás
// tests del mismo worker (singleThread).
const originalLocation = window.location

const PLANS: ActivatePlanOption[] = [
  {
    id: 'plan-predio',
    slug: 'predio',
    name: 'Predio',
    maxCourts: 2,
    priceMonthly: 5_500_000,
    priceAnnual: 4_400_000,
  },
  {
    id: 'plan-complejo',
    slug: 'complejo',
    name: 'Complejo',
    maxCourts: 5,
    priceMonthly: 8_500_000,
    priceAnnual: 6_800_000,
  },
  {
    id: 'plan-estadio',
    slug: 'estadio',
    name: 'Estadio',
    maxCourts: null,
    priceMonthly: 11_500_000,
    priceAnnual: 9_200_000,
  },
]

const PERIOD_END = '2026-09-13T12:00:00.000Z'

let assignSpy: ReturnType<typeof vi.fn>
let fetchSpy: ReturnType<typeof vi.fn>

function mockFetch(body: unknown, status = 200) {
  fetchSpy = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  global.fetch = fetchSpy as unknown as typeof global.fetch
}

function renderSection(overrides: Partial<Parameters<typeof ChangePlanSection>[0]> = {}) {
  return render(
    <ChangePlanSection
      plans={PLANS}
      currentPlanId="plan-predio"
      billingCycle="monthly"
      periodEnd={PERIOD_END}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  assignSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignSpy },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
})

describe('ChangePlanSection', () => {
  it('no renderiza si el plan actual no está en el catálogo', () => {
    const { container } = renderSection({ currentPlanId: 'plan-inexistente' })
    expect(container.firstChild).toBeNull()
  })

  it('marca el plan actual y no le ofrece botón de cambio', () => {
    renderSection()
    expect(screen.getByText('Tu plan actual')).toBeTruthy()
    // Predio es el actual → quedan 2 botones (Complejo y Estadio).
    const botones = screen.getAllByRole('button')
    expect(botones).toHaveLength(2)
  })

  it('un plan más caro va a /api/billing/upgrade y redirige al checkout', async () => {
    mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/abc', prorationAmount: 1_500_000 } })
    renderSection()

    // Desde Predio, Complejo y Estadio son ambos upgrades; el primero es Complejo.
    fireEvent.click(screen.getAllByRole('button', { name: /Pasar a este plan/i })[0]!)

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://mp.test/checkout/abc'))
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/billing/upgrade')
    expect(JSON.parse(String(init.body))).toEqual({ targetPlanId: 'plan-complejo' })
  })

  it('un plan más barato va a /api/billing/downgrade y NO redirige a cobrar', async () => {
    mockFetch({ data: { appliesAt: PERIOD_END, targetPlanId: 'plan-predio' } })
    renderSection({ currentPlanId: 'plan-estadio' })

    fireEvent.click(screen.getAllByRole('button', { name: /Bajar a este plan/i })[0]!)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe('/api/billing/downgrade')
    // Bajar de plan nunca manda a pagar: el período ya está pago.
    expect(assignSpy).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('muestra el mensaje del backend cuando el downgrade está bloqueado por canchas', async () => {
    mockFetch({ error: { message: 'Tenés 4 canchas online y el plan Predio soporta 2.' } }, 409)
    renderSection({ currentPlanId: 'plan-estadio' })

    fireEvent.click(screen.getAllByRole('button', { name: /Bajar a este plan/i })[0]!)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('4 canchas online')
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('un 501 (flag apagado como kill switch) se muestra, no queda en silencio', async () => {
    mockFetch({ error: { message: 'Cambio de plan no disponible todavía.' } }, 501)
    renderSection()

    fireEvent.click(screen.getAllByRole('button', { name: /Pasar a este plan/i })[0]!)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('no disponible')
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('un 500 con cuerpo HTML no explota: muestra el error genérico', async () => {
    // `res.json()` tira ante HTML (página de error del edge). Sin el catch de
    // `readJson`, el dueño se quedaba sin ningún mensaje.
    fetchSpy = vi.fn(
      async () =>
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        }),
    )
    global.fetch = fetchSpy as unknown as typeof global.fetch
    renderSection()

    fireEvent.click(screen.getAllByRole('button', { name: /Pasar a este plan/i })[0]!)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('No se pudo cambiar el plan')
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('un 200 sin checkoutUrl avisa en vez de quedarse en silencio', async () => {
    // No debería pasar, pero si pasa el botón no puede quedar girando para
    // siempre sin decir nada.
    mockFetch({ data: {} })
    renderSection()

    fireEvent.click(screen.getAllByRole('button', { name: /Pasar a este plan/i })[0]!)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('No se pudo cambiar el plan')
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('anuncia un cambio ya agendado (downgrade pendiente)', () => {
    renderSection({ currentPlanId: 'plan-estadio', pendingPlanId: 'plan-predio' })
    expect(screen.getByText(/Ya tenés agendado el cambio/i)).toBeTruthy()
  })

  it('el ciclo anual cambia qué plan cuenta como más caro', async () => {
    // Con ciclo anual los precios son otros; el sentido del cambio se calcula
    // sobre el precio del ciclo vigente, no sobre el mensual siempre.
    mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/anual' } })
    renderSection({ billingCycle: 'annual' })

    fireEvent.click(screen.getAllByRole('button', { name: /Pasar a este plan/i })[0]!)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect((fetchSpy.mock.calls[0] as [string])[0]).toBe('/api/billing/upgrade')
  })
})
