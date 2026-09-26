// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MetricsDashboard from '@/app/(admin)/analiticas/MetricsDashboard'
import type { TenantMetrics } from '@/modules/metrics/metrics.service'
import type { SystemStatus } from '@/app/api/admin/system-status/route'

const metricsFixture: TenantMetrics = {
  windowDays: 30,
  from: '2026-05-14',
  to: '2026-06-12',
  bookingsPerDay: [
    { date: '2026-06-11', count: 4 },
    { date: '2026-06-12', count: 2 },
  ],
  revenuePerDay: [
    { date: '2026-06-11', amountCents: 500_000 },
    { date: '2026-06-12', amountCents: 250_000 },
  ],
  topSlots: [
    { time: '20:00', count: 9 },
    { time: '21:00', count: 7 },
  ],
  noShow: { noShow: 2, completed: 18, finished: 20, rate: 0.1 },
  noShowPrev: { noShow: 0, completed: 0, finished: 0, rate: 0 },
  revenue: { totalCents: 750_000, byCategory: { booking: 750_000, product_sale: 0, other: 0 } },
}

const systemFixture: SystemStatus = {
  db: { status: 'ok', latencyMs: 12 },
  pgboss: {
    queues: [
      { queue: 'send-email', depth: 3 },
      { queue: 'health-ping', depth: null },
    ],
  },
  lastHealthPing: new Date(Date.now() - 3 * 60_000).toISOString(),
  timestamp: new Date().toISOString(),
}

const fetchMock = vi.fn()

function jsonResponse(data: unknown): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: async () => ({ data }) }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('system-status') ? jsonResponse(systemFixture) : jsonResponse(metricsFixture),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MetricsDashboard', () => {
  it('renderiza los últimos 30 días con copys en español ("ausencias", nunca "no-show")', async () => {
    const { container } = render(<MetricsDashboard canSeeSystem={false} showRecent />)

    expect(await screen.findByText('Últimos 30 días')).toBeDefined()
    expect(screen.getByText('Horarios más pedidos')).toBeDefined()
    expect(screen.getByText('9 turnos')).toBeDefined()
    expect(screen.getByText('Ausencias')).toBeDefined()
    // noShow.rate 0.1 → 10% (formatPct: sin decimal cuando es entero).
    expect(screen.getByText('10%')).toBeDefined()
    expect(screen.getByText('Sin datos de los 30 días anteriores.')).toBeDefined()
    // Copy en español: nunca el anglicismo.
    expect(container.textContent).not.toMatch(/no[- ]show/i)
    // H032: el "Ingresos" de 30 días se fue; lo que entró es del mes, en el server.
    expect(screen.queryByText('Ingresos')).toBeNull()
  })

  it('NO muestra el panel de sistema cuando canSeeSystem=false (ni lo fetchea)', async () => {
    render(<MetricsDashboard canSeeSystem={false} showRecent />)

    await screen.findByText('Últimos 30 días')
    expect(screen.queryByText('Estado del sistema')).toBeNull()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('system-status'))).toBe(false)
  })

  it('en un mes cerrado no pide ni muestra los últimos 30 días', async () => {
    render(<MetricsDashboard canSeeSystem showRecent={false} />)

    expect(await screen.findByText('Estado del sistema')).toBeDefined()
    expect(screen.queryByText('Últimos 30 días')).toBeNull()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/api/admin/metrics'))).toBe(false)
  })

  it('muestra el panel de sistema cuando canSeeSystem=true', async () => {
    render(<MetricsDashboard canSeeSystem showRecent />)

    expect(await screen.findByText('Estado del sistema')).toBeDefined()
    expect(await screen.findByText(/Operativa/)).toBeDefined()
    expect(screen.getByText('hace 3 min')).toBeDefined()
    // Una cola con depth null → total desconocido.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
