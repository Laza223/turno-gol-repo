// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CuotaSection } from '@/app/(admin)/settings/facturacion/CuotaSection'
import type { PricingParams } from '@/modules/billing/pricing'
import { formatArs } from '@/lib/format'
import { SUPPORT_EMAIL } from '@/shared/constants'

/**
 * Reemplaza a activate-plan-section.test.tsx y change-plan-section.test.tsx
 * (componentes borrados, decisión 2026-09-17: precio lineal por cancha en vez
 * de 3 planes por bandas). `CuotaSection` es el único componente para los tres
 * modos (activate/reactivate/manage); estos tests cubren el comportamiento que
 * importa, no los 3 cards ni el radiogroup de "7+" que ya no existen.
 */

// `formatArs` separa "$" del numero con NBSP (U+00A0). Los asserts de
// plata de este archivo leen `.textContent` DIRECTO del `<dd>` (no
// `screen.getByText` con el matcher armado a mano) para esquivar el gotcha:
// el normalizador de testing-library colapsa el NBSP del DOM pero no toca
// el string del matcher, asi que comparar `formatArs(cents)` crudo por
// `.textContent` es lo unico que compara lo mismo de los dos lados.

// Valores reales del modelo vigente (docs/decisions/2026-09-17-precio-por-cancha.md):
// $47.000 la primera cancha + $30.000 cada extra, 10% off anual por default.
const PRICING: PricingParams = {
  priceFirstCourtCents: 4_700_000,
  priceExtraCourtCents: 3_000_000,
  annualDiscountBps: 1000,
}

let assignSpy: ReturnType<typeof vi.fn>
const originalLocation = window.location

beforeEach(() => {
  assignSpy = vi.fn()
  // happy-dom permite reasignar window.location entero.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignSpy },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Sin restaurar esto, otros test files del mismo worker (singleThread)
  // heredan el objeto plano y rompen (gotcha ya documentado en los tests viejos).
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// Tipado laxo a propósito (mismo patrón que change-plan-section.test.tsx, ya
// borrado): `.mock.calls[0]` se castea después a `[string, RequestInit]`, y un
// tipo estricto de `vi.fn` (inferido de un lambda sin parámetros) hace que ese
// cast falle en tsc por "no overlap".
function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  global.fetch = fetchSpy as unknown as typeof global.fetch
  return fetchSpy
}

describe('CuotaSection — desglose para N canchas', () => {
  it('5 canchas: $167.000 y desglose 1ª + 4 más', () => {
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={5} billedCourts={5} />)

    const primera = screen.getByText('1ª cancha')
    expect((primera.nextElementSibling as HTMLElement).textContent).toBe(formatArs(4_700_000))

    // 4 canchas más (5 - 1) × $30.000 = $120.000
    expect(screen.getByText(/^4 canchas más ×/)).toBeTruthy()
    const extra = screen.getByText(/^4 canchas más ×/)
    expect((extra.nextElementSibling as HTMLElement).textContent).toBe(formatArs(12_000_000))

    const porMes = screen.getByText('Por mes')
    expect((porMes.nextElementSibling as HTMLElement).textContent).toBe(formatArs(16_700_000))
  })

  it('1 cancha: $47.000 sin fila de "canchas más"', () => {
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={1} billedCourts={1} />)

    const porMes = screen.getByText('Por mes')
    expect((porMes.nextElementSibling as HTMLElement).textContent).toBe(formatArs(4_700_000))
    expect(screen.queryByText(/cancha más ×/)).toBeNull()
    expect(screen.queryByText(/canchas más ×/)).toBeNull()
  })

  it('8 canchas: $257.000', () => {
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={8} billedCourts={8} />)

    const porMes = screen.getByText('Por mes')
    // 47.000 + 7 × 30.000 = 257.000
    expect((porMes.nextElementSibling as HTMLElement).textContent).toBe(formatArs(25_700_000))
  })
})

describe('CuotaSection — el descuento anual sale de los datos, no está hardcodeado', () => {
  it('con annualDiscountBps=1500 (15%), la UI muestra 15% y el monto que corresponde — nunca "20%"', () => {
    const pricing: PricingParams = { ...PRICING, annualDiscountBps: 1500 }
    render(<CuotaSection pricing={pricing} mode="activate" onlineCourts={3} billedCourts={3} />)

    fireEvent.click(screen.getByRole('radio', { name: /^Anual/ }))

    // El label del toggle también saca el % de los datos.
    expect(screen.getByRole('radio', { name: /15%/ })).toBeTruthy()
    expect(screen.queryByText(/20%/)).toBeNull()

    // Lista mensual: 47.000 + 2×30.000 = 107.000. Con 15% off: 107.000×0,85 = 90.950.
    const porMes = screen.getByText('Por mes')
    expect((porMes.nextElementSibling as HTMLElement).textContent).toBe(formatArs(9_095_000))

    const descuento = screen.getByText('Descuento anual (15%)')
    expect((descuento.nextElementSibling as HTMLElement).textContent).toBe(
      `− ${formatArs(1_605_000)}`,
    )
  })
})

describe('CuotaSection — el stepper no baja de las canchas online', () => {
  it('con onlineCourts=5 y billedCourts=5, "Quitar una cancha" no baja el valor y explica qué hacer', () => {
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={5} billedCourts={5} />)

    const group = screen.getByRole('group', { name: 'Canchas' })
    expect(within(group).getByText('5')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar una cancha' }))

    // El valor no bajó.
    expect(within(group).getByText('5')).toBeTruthy()
    // Y hay una explicación de qué hacer para poder bajarlo.
    expect(screen.getByText(/Para pagar por menos, apagá las que no estés usando/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Canchas' })).toHaveAttribute('href', '/canchas')
  })

  it('con margen (onlineCourts=2, billedCourts=5), sí puede bajar hasta el piso', () => {
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={2} billedCourts={5} />)
    const group = screen.getByRole('group', { name: 'Canchas' })

    fireEvent.click(screen.getByRole('button', { name: 'Quitar una cancha' }))
    expect(within(group).getByText('4')).toBeTruthy()
  })
})

describe('CuotaSection — el CTA llama al endpoint correcto según el modo', () => {
  it('activate: POST /api/billing/subscribe con { billedCourts, billingCycle } y redirige al checkout', async () => {
    const fetchSpy = mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/activate' } })
    render(<CuotaSection pricing={PRICING} mode="activate" onlineCourts={3} billedCourts={3} />)

    fireEvent.click(screen.getByRole('button', { name: /^Activar —/ }))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://mp.test/checkout/activate'))
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/billing/subscribe')
    expect(JSON.parse(String(init.body))).toEqual({ billedCourts: 3, billingCycle: 'monthly' })
  })

  it('reactivate: POST /api/billing/reactivate con { billedCourts, billingCycle }', async () => {
    const fetchSpy = mockFetch({ data: { checkoutUrl: 'https://mp.test/checkout/reactivate' } })
    render(<CuotaSection pricing={PRICING} mode="reactivate" onlineCourts={2} billedCourts={2} />)

    fireEvent.click(screen.getByRole('button', { name: /^Reactivar —/ }))

    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://mp.test/checkout/reactivate'),
    )
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/billing/reactivate')
    expect(JSON.parse(String(init.body))).toEqual({ billedCourts: 2, billingCycle: 'monthly' })
  })

  it('manage: POST /api/billing/canchas con { billedCourts } — SIN billingCycle', async () => {
    const fetchSpy = mockFetch({ data: { applied: true, billedCourts: 4 } })
    render(<CuotaSection pricing={PRICING} mode="manage" onlineCourts={3} billedCourts={3} />)

    // Con 3 canchas facturadas ya no hay nada que guardar (nothingToSave):
    // hay que mover el stepper para habilitar el botón.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una cancha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/billing/canchas')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toEqual({ billedCourts: 4 })
    expect('billingCycle' in body).toBe(false)
    // El endpoint de canchas nunca manda al checkout.
    expect(assignSpy).not.toHaveBeenCalled()
  })
})

describe('CuotaSection — manejo de errores', () => {
  it('DOWNGRADE_BLOCKED muestra un mensaje entendible + link a Canchas', async () => {
    mockFetch(
      {
        error: {
          code: 'DOWNGRADE_BLOCKED',
          message: 'Tenés más canchas prendidas de las que estás facturando.',
        },
      },
      409,
    )
    render(<CuotaSection pricing={PRICING} mode="activate" onlineCourts={3} billedCourts={3} />)

    fireEvent.click(screen.getByRole('button', { name: /^Activar —/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('Tenés más canchas prendidas de las que estás facturando.')
    expect(within(alerta).getByRole('link', { name: /Ir a Canchas/ })).toHaveAttribute(
      'href',
      '/canchas',
    )
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('501 (kill switch del flag) muestra un mensaje que dice qué hacer, no el código crudo', async () => {
    mockFetch({}, 501)
    render(<CuotaSection pricing={PRICING} mode="activate" onlineCourts={3} billedCourts={3} />)

    fireEvent.click(screen.getByRole('button', { name: /^Activar —/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('no se puede hacer solo')
    expect(alerta.textContent).toContain(SUPPORT_EMAIL)
    expect(assignSpy).not.toHaveBeenCalled()
  })
})

describe('CuotaSection — cambio ya agendado', () => {
  it('con pendingBilledCourts, dice a cuántas canchas pasa y desde cuándo', () => {
    render(
      <CuotaSection
        pricing={PRICING}
        mode="manage"
        onlineCourts={3}
        billedCourts={4}
        pendingBilledCourts={6}
        periodEnd="2027-03-15T15:00:00.000Z"
      />,
    )

    expect(screen.getByText(/pasás a pagar por/)).toBeTruthy()
    expect(screen.getByText('6 canchas')).toBeTruthy()
    expect(screen.getByText('15 de marzo de 2027')).toBeTruthy()
  })
})

describe('CuotaSection — sin régimen fiscal definido (D9)', () => {
  it('nunca dice "+ IVA" ni "precio final": el régimen fiscal todavía no está decidido', () => {
    render(<CuotaSection pricing={PRICING} mode="activate" onlineCourts={3} billedCourts={3} />)

    expect(screen.queryByText(/\+\s*IVA/i)).toBeNull()
    expect(screen.queryByText(/precio final/i)).toBeNull()
  })
})
