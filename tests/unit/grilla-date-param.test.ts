import { describe, expect, it, vi } from 'vitest'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'

// El page es un Server Component: mockeamos auth/tenant/db para aislar la
// unica logica relevante al #28 (la sanitizacion del ?date antes de la query).
// B10 — la page pasó a `requireOperatorStaff()`, que además del tenant lee el rol
// contra `tenant_staff_members`. Se mockea el guard, no `extractAuthUser` +
// `getStaffTenant` por separado: es lo que la page llama hoy.
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(async () => ({
    ok: true,
    user: { type: 'staff', staffUserId: 'staff-1' },
    role: 'admin',
    tenant: {
      id: 'tenant-1',
      openingHours: {},
      closedDates: [],
      // `TenantRow.settings` no es opcional en producción; el mock lo omitía y el
      // page empezó a leerlo (deposit_percentage, Fase 3 T6).
      settings: { deposit_percentage: 30 },
    },
  })),
}))
// withTenantContext NO invoca el callback: evita la query drizzle/SQL real.
// Devuelve la misma forma que arma el page (canchas + reservas + saldos), no
// una tupla: el page destructura por nombre.
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async () => ({
    courts: [],
    rawBookings: [],
    chargesByBooking: new Map<string, number>(),
  })),
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

type RenderedChild = { props?: { date?: string } }
type RenderedGrilla = { props: { children: RenderedChild | RenderedChild[] } }

/**
 * Desde Fase 4 el page devuelve DOS hijos (la barra de pestañas Calendario|Lista
 * y la vista), así que `children` puede ser un array: se busca al que lleva la
 * fecha en vez de asumir que hay uno solo.
 */
async function gridDateFor(date: string | undefined): Promise<string> {
  const el = (await GrillaPage({
    searchParams: Promise.resolve({ date }),
  })) as unknown as RenderedGrilla
  const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children]
  const withDate = children.find((c) => typeof c?.props?.date === 'string')
  if (!withDate?.props?.date) throw new Error('ningún hijo del page recibió `date`')
  return withDate.props.date
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
