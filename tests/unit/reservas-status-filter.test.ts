import { beforeEach, describe, expect, it, vi } from 'vitest'

// Server Component: aislamos auth/tenant/db para verificar la unica logica del
// #30 — que el ?status se valide contra el allowlist antes de tocar la query.
// B10 — la page pasó a `requireOperatorStaff()`, que además del tenant lee el rol
// contra `tenant_staff_members`. Se mockea el guard, no las dos funciones que
// usaba antes por separado.
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(async () => ({
    ok: true,
    user: { type: 'staff', staffUserId: 'staff-1' },
    role: 'admin',
    tenant: { id: 'tenant-1' },
  })),
}))
// withTenantContext invoca el callback con un tx dummy: deja correr la llamada
// a listTenantBookings (mockeada) sin tocar la DB real.
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/app/(admin)/reservas/queries', () => ({
  listTenantBookings: vi.fn(async () => ({ rows: [], hasMore: false })),
  RESERVAS_PAGE_SIZE: 100,
  countTenantBookingsByStatus: vi.fn(async () => ({})),
  // La page la usa para derivar el saldo de los turnos terminados (píldora
  // "Sin cobrar"). Acá la lista siempre viene vacía, así que devuelve un Map
  // vacío igual que la implementación real cuando no hay ids.
  sumBookingChargesByBooking: vi.fn(async () => new Map<string, number>()),
}))
vi.mock('@/shared/dates/art', () => ({
  artTodayStr: vi.fn(() => '2026-06-12'),
  addDays: vi.fn((d: string) => d),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { listTenantBookings } from '@/app/(admin)/reservas/queries'
import ReservasPage from '@/app/(admin)/reservas/(list)/page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReservasPage — ?status allowlist (#30)', () => {
  it('ignora un ?status fuera del allowlist (texto basura -> sin filtro)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'foo' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
      0,
    )
  })

  it('ignora un enum valido pero no listado en FILTERS (canceled_refunded crudo)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'canceled_refunded' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
      0,
    )
  })

  it('respeta un ?status del allowlist', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'confirmed' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', status: 'confirmed' },
      expect.anything(),
      0,
    )
  })

  it('acepta el filtro virtual "canceladas" (agrupa ambos canceled_*)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'canceladas' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', status: 'canceladas' },
      expect.anything(),
      0,
    )
  })

  it('sin ?status filtra por todas', async () => {
    await ReservasPage({ searchParams: Promise.resolve({}) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
      0,
    )
  })
})

describe('ReservasPage — ?dia allowlist', () => {
  it('default es hoy', async () => {
    await ReservasPage({ searchParams: Promise.resolve({}) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'hoy' }),
      expect.anything(),
      0,
    )
  })

  it('respeta ?dia=proximas y ?dia=historial', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'proximas' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximas' }),
      expect.anything(),
      0,
    )
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'historial' }),
      expect.anything(),
      0,
    )
  })

  it('degrada un ?dia basura a hoy', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'ayer' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'hoy' }),
      expect.anything(),
      0,
    )
  })
})
