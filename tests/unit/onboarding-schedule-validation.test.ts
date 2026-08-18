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
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1' })),
  updateOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(),
}))
// caza-bugs #7: saveWizardScheduleAction ahora pasa por requireAdminStaffAction,
// que resuelve el rol vía getStaffRole (DB) — mockeado 'admin' (happy path de
// este archivo). Ver onboarding-role-guard.test.ts para el caso manager.
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffRole: vi.fn(async () => 'admin'),
}))
const withTenantContext = vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    update: () => ({ set: () => ({ where: vi.fn(async () => undefined) }) }),
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

import { updateOnboardingStep } from '@/modules/tenants/tenant.service'
import { saveWizardScheduleAction } from '@/app/onboarding/actions'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const PREV = { success: true } as const

// Contrato FormData del form de horarios (mismo que /settings/horarios):
// `${day}_open` / `${day}_close` + `${day}_closed`='on' + `closes_next_day`='on'.
function scheduleFormData(
  overrides: Partial<
    Record<(typeof DAYS)[number], { open: string; close: string; closed?: boolean }>
  > = {},
  closesNextDay = false,
): FormData {
  const fd = new FormData()
  for (const d of DAYS) {
    const day = overrides[d] ?? { open: '08:00', close: '23:00' }
    fd.set(`${d}_open`, day.open)
    fd.set(`${d}_close`, day.close)
    if (day.closed) fd.set(`${d}_closed`, 'on')
  }
  if (closesNextDay) fd.set('closes_next_day', 'on')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveWizardScheduleAction — horariosSchema canónico (pages/onboarding.md §4)', () => {
  it('rechaza un día abierto con cierre <= apertura (sin flag de madrugada)', async () => {
    const res = await saveWizardScheduleAction(
      PREV,
      scheduleFormData({ mon: { open: '22:00', close: '08:00' } }),
    )
    // F-019: el mensaje nombra la opción que resuelve el caso (el horario
    // "abre 20:00 / cierra 02:00" es el más común del mercado objetivo, y sin
    // esta pista el paso 2 se lee como "tu negocio no entra en el producto").
    expect(res).toEqual({
      success: false,
      error:
        'Lunes: el horario de cierre debe ser posterior al de apertura. Si cerrás después de medianoche, activá esa opción más abajo.',
    })
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('la misma madrugada con «Cierra después de medianoche» es válida', async () => {
    const res = await saveWizardScheduleAction(
      PREV,
      scheduleFormData({ mon: { open: '22:00', close: '02:00' } }, true),
    )
    expect(res).toEqual({ success: true, next: '/onboarding/canchas' })
    expect(withTenantContext).toHaveBeenCalledTimes(1)
  })

  it("cierre '00:00' cuenta como medianoche y es válido sin flag (bug del wizard v1)", async () => {
    const res = await saveWizardScheduleAction(
      PREV,
      scheduleFormData({ mon: { open: '08:00', close: '00:00' } }),
    )
    expect(res).toEqual({ success: true, next: '/onboarding/canchas' })
  })

  it('rechaza un formato de hora inválido', async () => {
    const res = await saveWizardScheduleAction(
      PREV,
      scheduleFormData({ tue: { open: '8am', close: '23:00' } }),
    )
    expect(res.success).toBe(false)
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('rechaza la semana con todos los días cerrados', async () => {
    const allClosed = Object.fromEntries(
      DAYS.map((d) => [d, { open: '08:00', close: '23:00', closed: true }]),
    )
    const res = await saveWizardScheduleAction(PREV, scheduleFormData(allClosed))
    expect(res).toEqual({ success: false, error: 'Abrí al menos un día de la semana.' })
  })

  it('no exige cierre > apertura en un día cerrado y avanza al paso 2', async () => {
    const res = await saveWizardScheduleAction(
      PREV,
      scheduleFormData({ sun: { open: '10:00', close: '08:00', closed: true } }),
    )
    expect(res).toEqual({ success: true, next: '/onboarding/canchas' })
    expect(withTenantContext).toHaveBeenCalledTimes(1)
    expect(updateOnboardingStep).toHaveBeenCalledWith('tenant-1', 2)
  })
})
