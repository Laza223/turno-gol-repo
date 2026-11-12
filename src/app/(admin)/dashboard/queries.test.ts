import { beforeEach, describe, expect, it, vi } from 'vitest'

// getDashboardData se retiró en Fase 2 (docs/planning/2026-08-01-decisiones-de-fase-v2.md
// §3): la pantalla "Hoy" usa getHoyData (src/modules/home/home.service.ts),
// cubierta en tests/integration/home-service.test.ts. Acá solo queda lo
// propio de este módulo — la lógica derivable ya está en dashboard-lib.test.ts.

// `getChecklistState` dispara 3 consultas en este orden: canchas, primera reserva
// online, reserva cargada por staff. Cada `select()` toma el próximo resultado.
const queue: unknown[][] = []
const tx = {
  select: () => {
    const rows = queue.shift() ?? []
    const chain: Record<string, unknown> = {}
    chain.from = () => chain
    chain.where = () => chain
    chain.limit = () => chain
    chain.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve)
    return chain
  },
}

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(async (_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
}))

import { getChecklistState } from './queries'

const tenant = {
  id: 't-1',
  openingHours: {
    monday: { open: '10:00', close: '23:00' },
  },
  closesNextDay: false,
} as never

beforeEach(() => {
  queue.length = 0
})

describe('getChecklistState', () => {
  it('no trae complexData (era una constante)', async () => {
    queue.push([{ value: 1 }], [], [])
    const state = await getChecklistState(tenant, {} as never, false)
    expect(state).not.toHaveProperty('complexData')
  })

  it('hasStaffBookings es false sin reservas cargadas por staff', async () => {
    queue.push([{ value: 2 }], [{ id: 'b-online' }], [])
    const state = await getChecklistState(tenant, {} as never, false)
    expect(state.hasStaffBookings).toBe(false)
    expect(state.firstBookingReceived).toBe(true)
    expect(state.hasCourts).toBe(true)
  })

  it('hasStaffBookings es true con una reserva no cancelada de staff', async () => {
    queue.push([{ value: 0 }], [], [{ id: 'b-staff' }])
    const state = await getChecklistState(tenant, { public_link_shared: true } as never, true)
    expect(state).toMatchObject({
      hasStaffBookings: true,
      firstBookingReceived: false,
      hasCourts: false,
      publicLinkShared: true,
      mpConnected: true,
    })
  })
})
