import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  generateSlotDates: vi.fn(() => ['2026-06-15']),
}))
vi.mock('@/modules/abonados/abonado.service', () => ({
  checkAbonadoSlotConflict: vi.fn(async () => false),
  getAbonadoSlotConflicts: vi.fn(async () => []),
}))
vi.mock('@/app/(admin)/abonados/actions', () => ({ createAbonadoAction: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import {
  checkAbonadoSlotConflict,
  getAbonadoSlotConflicts,
} from '@/modules/abonados/abonado.service'
import { previewAbonadoSlotsAction } from '@/app/(admin)/abonados/nuevo/actions'

const VALID_UUID = '11111111-1111-1111-1111-111111111111'
const baseInput = {
  courtId: VALID_UUID,
  dayOfWeek: 1,
  timeStart: '10:00',
  timeEnd: '11:00',
  startsOn: '2026-06-15',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('previewAbonadoSlotsAction — conflicto de abonado activo (#34)', () => {
  it('devuelve error cuando ya existe un abonado activo en ese court/dia/horario', async () => {
    vi.mocked(checkAbonadoSlotConflict).mockResolvedValueOnce(true)
    const res = await previewAbonadoSlotsAction(baseInput)
    expect(res).toEqual({
      success: false,
      error: 'Ya existe un turno fijo activo en ese horario.',
    })
    // No tiene sentido calcular conflictos de booking si ya hay choque de abonado.
    expect(getAbonadoSlotConflicts).not.toHaveBeenCalled()
  })

  it('devuelve success con los conflictos de booking si no hay abonado en conflicto', async () => {
    vi.mocked(checkAbonadoSlotConflict).mockResolvedValueOnce(false)
    vi.mocked(getAbonadoSlotConflicts).mockResolvedValueOnce(['2026-06-15'])
    const res = await previewAbonadoSlotsAction(baseInput)
    expect(res).toEqual({
      success: true,
      dates: ['2026-06-15'],
      conflicts: ['2026-06-15'],
    })
  })
})
