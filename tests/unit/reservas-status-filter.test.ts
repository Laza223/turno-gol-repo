import { beforeEach, describe, expect, it, vi } from 'vitest'

// Server Component: aislamos auth/tenant/db para verificar la unica logica del
// #30 — que el ?status se valide contra el allowlist antes de tocar la query.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'staff', staffUserId: 'staff-1' })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1' })),
}))
// withTenantContext invoca el callback con un tx dummy: deja correr la llamada
// a listTenantBookings (mockeada) sin tocar la DB real.
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/app/(admin)/reservas/queries', () => ({
  listTenantBookings: vi.fn(async () => []),
  countTenantBookingsByStatus: vi.fn(async () => ({})),
}))
vi.mock('@/shared/dates/art', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/dates/art')>()),
  artTodayStr: vi.fn(() => '2026-06-12'),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { listTenantBookings } from '@/app/(admin)/reservas/queries'
import ReservasPage from '@/app/(admin)/reservas/page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReservasPage — ?status allowlist (#30)', () => {
  it('ignora un ?status fuera del allowlist (texto basura -> sin filtro)', async () => {
    await ReservasPage({ searchParams: { status: 'foo' } })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
    )
  })

  it('ignora un enum valido pero no listado en FILTERS (canceled_refunded crudo)', async () => {
    await ReservasPage({ searchParams: { status: 'canceled_refunded' } })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
    )
  })

  it('respeta un ?status del allowlist', async () => {
    await ReservasPage({ searchParams: { status: 'confirmed' } })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', status: 'confirmed' },
      expect.anything(),
    )
  })

  it('acepta el filtro virtual "canceladas" (agrupa ambos canceled_*)', async () => {
    await ReservasPage({ searchParams: { status: 'canceladas' } })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', status: 'canceladas' },
      expect.anything(),
    )
  })

  it('sin ?status filtra por todas', async () => {
    await ReservasPage({ searchParams: {} })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
    )
  })
})

describe('ReservasPage — ?dia allowlist', () => {
  it('default es hoy', async () => {
    await ReservasPage({ searchParams: {} })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'hoy' }),
      expect.anything(),
    )
  })

  it('respeta ?dia=proximas y ?dia=historial', async () => {
    await ReservasPage({ searchParams: { dia: 'proximas' } })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximas' }),
      expect.anything(),
    )
    await ReservasPage({ searchParams: { dia: 'historial' } })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'historial' }),
      expect.anything(),
    )
  })

  it('degrada un ?dia basura a hoy', async () => {
    await ReservasPage({ searchParams: { dia: 'ayer' } })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'hoy' }),
      expect.anything(),
    )
  })
})
