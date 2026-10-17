import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CANCELLATION_HOURS_BEFORE } from '@/shared/constants'

// `cancellationHoursBefore` es lo que la pantalla de confirmar le dice al jugador con seña ("si
// cancelás con más de N horas…"): tiene que salir de la política REAL del complejo, no de una
// constante, y el default solo vale si el complejo no fijó ninguna.

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  getDb: () => ({ query: { tenants: { findFirst } } }),
  withTenantContext: vi.fn(),
}))

import { getPublicTenant } from '@/modules/tenants/public.service'

const row = (settings: Record<string, unknown>) => ({
  id: 't1',
  slug: 'club-x',
  name: 'Club X',
  description: null,
  logoUrl: null,
  coverUrl: null,
  address: 'Av. Siempreviva 742',
  city: 'Moreno',
  province: 'Buenos Aires',
  phone: '+541100000000',
  whatsapp: null,
  openingHours: {},
  closedDates: [],
  closesNextDay: false,
  status: 'active',
  timezone: 'America/Argentina/Buenos_Aires',
  settings,
  amenities: {},
  latitude: null,
  longitude: null,
})

beforeEach(() => findFirst.mockReset())

describe('getPublicTenant — cancellationHoursBefore', () => {
  it('lee las horas de la política de cancelación del complejo', async () => {
    findFirst.mockResolvedValue(row({ cancellation_policy: { hours_before: 24 } }))
    expect((await getPublicTenant('club-x'))?.cancellationHoursBefore).toBe(24)
  })

  it('0 horas es 0: no cae al default', async () => {
    findFirst.mockResolvedValue(row({ cancellation_policy: { hours_before: 0 } }))
    expect((await getPublicTenant('club-x'))?.cancellationHoursBefore).toBe(0)
  })

  it('sin política, el default del sistema', async () => {
    findFirst.mockResolvedValue(row({}))
    expect((await getPublicTenant('club-x'))?.cancellationHoursBefore).toBe(
      DEFAULT_CANCELLATION_HOURS_BEFORE,
    )
  })

  it('con la política pero sin `hours_before`, también el default', async () => {
    findFirst.mockResolvedValue(row({ cancellation_policy: { penalty_type: 'none' } }))
    expect((await getPublicTenant('club-x'))?.cancellationHoursBefore).toBe(
      DEFAULT_CANCELLATION_HOURS_BEFORE,
    )
  })
})
