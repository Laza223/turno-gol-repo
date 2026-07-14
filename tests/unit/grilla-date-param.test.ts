import { describe, expect, it, vi } from 'vitest'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'

// El page es un Server Component: mockeamos auth/tenant/db para aislar la
// unica logica relevante al #28 (la sanitizacion del ?date antes de la query).
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'staff', staffUserId: 'staff-1' })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(async () => ({
    id: 'tenant-1',
    openingHours: {},
    closedDates: [],
  })),
}))
// withTenantContext NO invoca el callback: evita la query drizzle/SQL real.
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async () => [[], []]),
}))
vi.mock('@/modules/courts/court.service', () => ({ listCourts: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))
// BookingGrid real arrastra realtime/supabase: lo neutralizamos.
vi.mock('@/components/booking/BookingGrid', () => ({ BookingGrid: () => null }))

import GrillaPage from '@/app/(admin)/grilla/page'

type RenderedGrilla = { props: { children: { props: { date: string } } } }

async function gridDateFor(date: string | undefined): Promise<string> {
  const el = (await GrillaPage({
    searchParams: Promise.resolve({ date }),
  })) as unknown as RenderedGrilla
  return el.props.children.props.date
}

describe('GrillaPage — ?date deep-link sanitizado (#28)', () => {
  it('degrada un ?date con calendario imposible a una fecha real', async () => {
    const gridDate = await gridDateFor('2024-13-32')
    expect(gridDate).not.toBe('2024-13-32')
    expect(isValidCalendarDate(gridDate)).toBe(true)
  })

  it('degrada un ?date con formato basura a una fecha real', async () => {
    const gridDate = await gridDateFor('2024-99-99')
    expect(gridDate).not.toBe('2024-99-99')
    expect(isValidCalendarDate(gridDate)).toBe(true)
  })

  it('respeta un ?date calendario valido', async () => {
    expect(await gridDateFor('2026-06-20')).toBe('2026-06-20')
  })
})
