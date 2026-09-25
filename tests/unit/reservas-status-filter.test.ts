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
  RESERVAS_PAGE_SIZE: 50,
  countTenantBookingsByStatus: vi.fn(async () => ({})),
  // La page la usa para derivar el saldo de los turnos terminados
  // (`agendaMoneyCell`). Acá la lista siempre viene vacía, así que devuelve un
  // Map vacío igual que la implementación real cuando no hay ids.
  sumBookingChargesByBooking: vi.fn(async () => new Map<string, number>()),
}))
// H110 — la page pide las canchas del tenant (filtro por cancha) dentro del
// mismo `withTenantContext`; sin este mock, `listCourts` real corre contra el
// `tx` de mentira de arriba y explota.
vi.mock('@/modules/courts/court.service', () => ({
  listCourts: vi.fn(async () => [] as Array<{ id: string; name: string }>),
}))
vi.mock('@/shared/dates/art', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/dates/art')>()
  return { ...actual, artTodayStr: vi.fn(() => '2026-06-12') }
})
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
      expect.objectContaining({ scope: 'proximos' }),
      expect.anything(),
      0,
    )
    expect(listTenantBookings).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: expect.anything() }),
      expect.anything(),
      0,
    )
  })

  it('degrada los valores viejos "confirmed"/"completed" a sin filtro (se van del vocabulario)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'confirmed' }) })
    expect(listTenantBookings).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'confirmed' }),
      expect.anything(),
      0,
    )
    await ReservasPage({ searchParams: Promise.resolve({ status: 'completed' }) })
    expect(listTenantBookings).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'completed' }),
      expect.anything(),
      0,
    )
  })

  it('respeta un ?status del allowlist nuevo (pending_payment/no_show)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'pending_payment' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'pending_payment' }),
      expect.anything(),
      0,
    )
    await ReservasPage({ searchParams: Promise.resolve({ status: 'no_show' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'no_show' }),
      expect.anything(),
      0,
    )
  })

  it('acepta el filtro virtual "canceladas" (agrupa canceled_* + expired)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ status: 'canceladas' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'canceladas' }),
      expect.anything(),
      0,
    )
  })

  it('sin ?status filtra por "Todos" (sin filtro de status en la query)', async () => {
    await ReservasPage({ searchParams: Promise.resolve({}) })
    expect(listTenantBookings).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: expect.anything() }),
      expect.anything(),
      0,
    )
  })
})

describe('ReservasPage — ?dia allowlist', () => {
  it('default es próximos', async () => {
    await ReservasPage({ searchParams: Promise.resolve({}) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximos' }),
      expect.anything(),
      0,
    )
  })

  it('respeta ?dia=pasados', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'pasados' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'pasados' }),
      expect.anything(),
      0,
    )
  })

  it('degrada un ?dia basura a próximos', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'ayer' }) })
    expect(listTenantBookings).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximos' }),
      expect.anything(),
      0,
    )
  })

  it('los valores viejos de las tres pestañas por día calendario migran sin romper links guardados', async () => {
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'hoy' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximos' }),
      expect.anything(),
      0,
    )
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'proximas' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'proximos' }),
      expect.anything(),
      0,
    )
    await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial' }) })
    expect(listTenantBookings).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'pasados' }),
      expect.anything(),
      0,
    )
  })
})
