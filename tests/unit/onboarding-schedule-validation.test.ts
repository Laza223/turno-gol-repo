import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({
    type: 'staff',
    id: 'auth-1',
    staffUserId: 'staff-1',
    email: 'admin@test.com',
  })),
}))
vi.mock('@/modules/auth/auth.service', () => ({ setStaffTenantClaim: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(async () => null),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  createTenantWithTrial: vi.fn(),
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1', settings: { onboarding_step: 2 } })),
  updateTenantSettings: vi.fn(),
  completeOnboarding: vi.fn(),
}))
// caza-bugs #7: saveWizardScheduleAction pasa por requireAdminStaffAction, que
// resuelve el rol vía getStaffRole (DB) — mockeado 'admin' (happy path de este
// archivo). Ver onboarding-role-guard.test.ts para el caso manager.
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffRole: vi.fn(async () => 'admin'),
}))
const set = vi.fn()
const withTenantContext = vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    update: () => ({
      set: (values: unknown) => {
        set(values)
        return { where: vi.fn(async () => undefined) }
      },
    }),
  }),
)
vi.mock('@/shared/db/client', () => ({
  withTenantContext: (tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    withTenantContext(tenantId, fn),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { updateTenantSettings } from '@/modules/tenants/tenant.service'
import { saveWizardScheduleAction } from '@/app/onboarding/actions'
import { buildUniformWeek, wizardHoursFrom } from '@/modules/onboarding/onboarding.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveWizardScheduleAction: horariosSchema canónico (pages/onboarding.md §4)', () => {
  it('08 a 00 es el default: medianoche, sin closesNextDay', async () => {
    const res = await saveWizardScheduleAction({ openHour: 8, closeHour: 0 })
    expect(res).toEqual({ success: true, next: '/onboarding/precios' })
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        closesNextDay: false,
        openingHours: expect.objectContaining({
          mon: { open: '08:00', close: '00:00', closed: false },
          sun: { open: '08:00', close: '00:00', closed: false },
        }),
      }),
    )
    // Era el paso 2 hecho; Horarios (3) lo sube.
    expect(updateTenantSettings).toHaveBeenCalledWith('tenant-1', { onboarding_step: 3 })
  })

  it('cerrar de madrugada prende closesNextDay', async () => {
    const res = await saveWizardScheduleAction({ openHour: 10, closeHour: 2 })
    expect(res.success).toBe(true)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ closesNextDay: true }))
  })

  it('cerrar a las 23 es el mismo día', async () => {
    const res = await saveWizardScheduleAction({ openHour: 8, closeHour: 23 })
    expect(res.success).toBe(true)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ closesNextDay: false }))
  })

  it('rechaza un cierre que no es posterior a la apertura ni de madrugada', async () => {
    const res = await saveWizardScheduleAction({ openHour: 18, closeHour: 12 })
    expect(res).toEqual({
      success: false,
      error: 'El cierre tiene que ser después de la apertura.',
    })
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('rechaza horas fuera de rango y tipos inválidos', async () => {
    expect((await saveWizardScheduleAction({ openHour: 25, closeHour: 0 })).success).toBe(false)
    expect((await saveWizardScheduleAction({ openHour: '8', closeHour: 0 })).success).toBe(false)
    expect((await saveWizardScheduleAction(null)).success).toBe(false)
    expect(withTenantContext).not.toHaveBeenCalled()
  })
})

describe('buildUniformWeek / wizardHoursFrom', () => {
  it('el mismo horario los 7 días', () => {
    const { openingHours, closesNextDay } = buildUniformWeek(9, 1)
    expect(Object.keys(openingHours)).toHaveLength(7)
    expect(openingHours.sat).toEqual({ open: '09:00', close: '01:00', closed: false })
    expect(closesNextDay).toBe(true)
  })

  it('el round trip devuelve las mismas horas', () => {
    const { openingHours } = buildUniformWeek(10, 3)
    expect(wizardHoursFrom(openingHours)).toEqual({ openHour: 10, closeHour: 3 })
  })

  it('vuelve a 08 a 00 si el horario guardado no se puede expresar con horas enteras', () => {
    const { openingHours } = buildUniformWeek(8, 0)
    openingHours.mon = { open: '08:30', close: '23:00', closed: false }
    expect(wizardHoursFrom(openingHours)).toEqual({ openHour: 8, closeHour: 0 })
  })
})
