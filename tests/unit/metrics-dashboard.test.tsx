// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MetricsDashboard from '@/app/(admin)/analiticas/MetricsDashboard'
import type { TenantMetrics } from '@/modules/metrics/metrics.service'
import type { SystemStatus } from '@/app/api/admin/system-status/route'

// recharts (ResponsiveContainer) requiere ResizeObserver, que happy-dom no trae.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

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
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

describe('MetricsDashboard', () => {
  it('renderiza los widgets con copys en español ("ausencias", nunca "no-show")', async () => {
    const { container } = render(<MetricsDashboard canSeeSystem={false} />)

    expect(await screen.findByText('Reservas por día')).toBeDefined()
    expect(screen.getByText('Tasa de ausencias')).toBeDefined()
    expect(screen.getByText('Ingresos')).toBeDefined()
    expect(screen.getByText('Top 5 horarios más reservados')).toBeDefined()
    // Tasa 10% con coma decimal + tendencia sin ventana previa.
    expect(screen.getByText('10,0%')).toBeDefined()
    expect(screen.getByText('sin datos previos')).toBeDefined()

    expect(container.textContent).not.toMatch(/no[- ]show/i)
  })

  it('NO muestra el panel de sistema cuando canSeeSystem=false (ni lo fetchea)', async () => {
    render(<MetricsDashboard canSeeSystem={false} />)

    await screen.findByText('Reservas por día')
    expect(screen.queryByText('Estado del sistema')).toBeNull()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('system-status'))).toBe(false)
  })

  it('muestra el panel de sistema cuando canSeeSystem=true', async () => {
    render(<MetricsDashboard canSeeSystem={true} />)

    expect(await screen.findByText('Estado del sistema')).toBeDefined()
    expect(await screen.findByText(/Operativa/)).toBeDefined()
    expect(screen.getByText('hace 3 min')).toBeDefined()
    // depth null de una cola degrada el total a "—" (también aparece en el
    // detalle por cola, por eso getAllByText).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
