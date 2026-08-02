import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mockeamos las dependencias del module para poder importar las actions sin
// tocar DB/supabase. En los casos invalidos el parse Zod corta antes de usarlas.
vi.mock('@/app/(admin)/abonados/actions', () => ({
  createAbonadoAction: vi.fn(async () => ({ success: true, abonado: {} })),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'staff', staffUserId: 'staff-1' })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1', closedDates: [] })),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(async () => null),
}))
vi.mock('@/modules/abonados/slot-generator', () => ({
  generateSlotDates: vi.fn(() => ['2026-06-15']),
}))
vi.mock('@/modules/abonados/abonado.service', () => ({
  checkAbonadoSlotConflict: vi.fn(async () => false),
  getAbonadoSlotConflicts: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import {
  previewAbonadoSlotsAction,
  submitNewAbonado,
} from '@/app/(admin)/abonados/nuevo/actions'

const VALID_UUID = '11111111-1111-1111-1111-111111111111'
const TIME_MSG = 'El horario de fin debe ser posterior al de inicio.'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('previewAbonadoSlotsAction — timeEnd > timeStart (#33)', () => {
  it('rechaza timeEnd == timeStart', async () => {
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '10:00',
      timeEnd: '10:00',
      startsOn: '2026-06-15',
    })
    expect(res).toEqual({ success: false, error: TIME_MSG })
  })

  it('rechaza timeEnd < timeStart', async () => {
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '11:00',
      timeEnd: '10:00',
      startsOn: '2026-06-15',
    })
    expect(res).toEqual({ success: false, error: TIME_MSG })
  })

  it('acepta un rango valido', async () => {
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '10:00',
      timeEnd: '11:00',
      startsOn: '2026-06-15',
    })
    expect(res.success).toBe(true)
  })
})

describe('submitNewAbonado — timeEnd > timeStart (#33)', () => {
  it('rechaza un rango invalido sin llegar a createAbonado', async () => {
    const fd = new FormData()
    fd.set('courtId', VALID_UUID)
    fd.set('contactName', 'Juan')
    fd.set('contactPhone', '1122334455')
    fd.set('dayOfWeek', '1')
    fd.set('timeStart', '10:00')
    fd.set('timeEnd', '09:00')
    fd.set('pricePerSessionCents', '10000')
    fd.set('startsOn', '2026-06-15')
    fd.set('paymentMethod', 'cash')
    const res = await submitNewAbonado({ status: 'idle' }, fd)
    expect(res).toEqual({ status: 'error', message: TIME_MSG })
  })
})
