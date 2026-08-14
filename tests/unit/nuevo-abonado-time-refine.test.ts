import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mockeamos las dependencias del module para poder importar las actions sin
// tocar DB/supabase. En los casos invalidos el parse Zod corta antes de usarlas.
vi.mock('@/app/(admin)/abonados/actions', () => ({
  createAbonadoAction: vi.fn(async () => ({ success: true, abonado: {} })),
}))
// B10 — la action pasó a `requireOperatorStaff()`, el mismo guard que
// `createAbonadoAction`: una Server Action no hereda nada del layout de (admin).
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(async () => ({
    ok: true,
    user: { type: 'staff', staffUserId: 'staff-1' },
    role: 'admin',
    tenant: { id: 'tenant-1', closedDates: [] },
  })),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(async () => null),
}))
vi.mock('@/modules/abonados/slot-generator', () => ({
  generateSlotDates: vi.fn(() => [FUTURE_START]),
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

import { previewAbonadoSlotsAction, submitNewAbonado } from '@/app/(admin)/abonados/nuevo/actions'

// Fecha de inicio SIEMPRE futura y relativa al reloj: una fecha fija (antes
// '2026-06-15') queda en el pasado con el correr del tiempo y choca contra el
// guard de "un turno fijo no puede arrancar antes de hoy" (🟡 QA 2026-08-13).
// Mismo patrón de fixture que ya rotó en race-admin-vs-online.test.ts.
const FUTURE_START = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)

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
      startsOn: FUTURE_START,
    })
    expect(res).toEqual({ success: false, error: TIME_MSG })
  })

  it('rechaza timeEnd < timeStart', async () => {
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '11:00',
      timeEnd: '10:00',
      startsOn: FUTURE_START,
    })
    expect(res).toEqual({ success: false, error: TIME_MSG })
  })

  it('acepta un rango valido', async () => {
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '10:00',
      timeEnd: '11:00',
      startsOn: FUTURE_START,
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
    fd.set('startsOn', FUTURE_START)
    fd.set('paymentMethod', 'cash')
    const res = await submitNewAbonado({ status: 'idle' }, fd)
    expect(res).toEqual({ status: 'error', message: TIME_MSG })
  })

  // 🟡 QA 2026-08-13: una fecha de inicio pasada generaba reservas retroactivas
  // que el trigger de 24h pasaba a 'completed' — partidos "jugados" que nunca
  // ocurrieron, y que ni pausar ni cancelar el abonado borran después.
  it('rechaza una fecha de inicio anterior a hoy', async () => {
    const past = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10)
    const fd = new FormData()
    fd.set('courtId', VALID_UUID)
    fd.set('contactName', 'Juan')
    fd.set('contactPhone', '1122334455')
    fd.set('dayOfWeek', '1')
    fd.set('timeStart', '10:00')
    fd.set('timeEnd', '11:00')
    fd.set('pricePerSessionCents', '10000')
    fd.set('startsOn', past)
    fd.set('paymentMethod', 'cash')
    const res = await submitNewAbonado({ status: 'idle' }, fd)
    expect(res).toEqual({
      status: 'error',
      message: 'La fecha de inicio no puede ser anterior a hoy.',
    })
  })

  it('el preview también rechaza la fecha pasada, antes de mostrar los slots', async () => {
    const past = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10)
    const res = await previewAbonadoSlotsAction({
      courtId: VALID_UUID,
      dayOfWeek: 1,
      timeStart: '10:00',
      timeEnd: '11:00',
      startsOn: past,
    })
    expect(res.success).toBe(false)
  })
})
