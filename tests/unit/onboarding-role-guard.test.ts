import { beforeEach, describe, expect, it, vi } from 'vitest'

// caza-bugs #7: los pasos 2-4 del wizard de onboarding (horarios, canchas,
// cerrar onboarding) son Configuración — antes usaban un guard local
// (requireWizardTenant) que solo chequeaba "es staff de este tenant", sin
// mirar el rol. Un manager (Encargado) podía invocar las Server Actions
// directo (sin pasar por la UI del wizard, pensada solo para el admin recién
// creado) y reescribir horarios/canchas o cerrar el onboarding. Este archivo
// prueba que ahora quedan gateadas por requireAdminStaffAction/requireAdminStaff
// (rol leído de DB), igual que /settings y /canchas fuera del wizard.
//
// Los mocks de withTenantContext/getCourtCountAndLimit/createCourt están
// configurados para que la acción SIGA HASTA EL FINAL si el guard de rol la
// deja pasar — así "manager bloqueado" es una aserción real (success:false
// ANTES de tocar la DB), no un falso positivo por un mock a medio configurar
// que hubiera hecho fallar la acción por otro motivo.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
  createTenantWithTrial: vi.fn(),
  updateOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn(async () => null) }))
vi.mock('@/modules/auth/auth.service', () => ({ setStaffTenantClaim: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { refreshSession: vi.fn() } }),
}))
vi.mock('@/modules/courts/court.service', () => ({
  createCourt: vi.fn(async () => ({ id: 'court-1' })),
  getCourtCountAndLimit: vi.fn(async () => ({ count: 0, maxCourts: null, planSlug: null })),
  // El guard de idempotencia del paso Canchas lee las canchas ya existentes
  // para saltear las repetidas por nombre.
  listCourts: vi.fn(async () => []),
  validatePricingRulesCoverage: vi.fn(() => ({ valid: true, gaps: [] })),
}))
// Parcial: `createOnboardingCourts`/`saveOnboardingSchedule` quedan REALES (su
// lógica orquesta funciones ya mockeadas arriba, ver el resto del archivo).
// Solo `hasAnyBooking` (Fase 7, analytics) toca `tx.select(...)` DIRECTO —
// sin este mock, `finishOnboardingAction` explota contra el `{}` que
// `withTenantContext` devuelve como tx falso.
vi.mock('@/modules/onboarding/onboarding.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/onboarding/onboarding.service')>()
  return { ...actual, hasAnyBooking: vi.fn(async () => false) }
})

import {
  createWizardCourtsAction,
  finishOnboardingAction,
  saveWizardScheduleAction,
} from '@/app/onboarding/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant, completeOnboarding } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { createCourt, listCourts } from '@/modules/courts/court.service'

const STAFF_USER = { type: 'staff', id: 'auth-1', staffUserId: 'staff-1', email: 'staff@test.com' }
const OPEN_ALL_WEEK = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
    d,
    { open: '08:00', close: '23:00' },
  ]),
)
const TENANT = { id: 'tenant-1', openingHours: OPEN_ALL_WEEK, closesNextDay: false }

function scheduleFormData(): FormData {
  const fd = new FormData()
  for (const d of Object.keys(OPEN_ALL_WEEK)) {
    fd.set(`${d}_open`, '08:00')
    fd.set(`${d}_close`, '23:00')
  }
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  // Si el guard de rol deja pasar, la acción llega hasta acá y completa — el
  // punto es probar que el manager NUNCA llega a este mock.
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
})

describe('onboarding wizard actions — manager (rol no-admin) es rechazado (caza-bugs #7)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
  })

  it('saveWizardScheduleAction no reescribe horarios para un manager', async () => {
    const res = await saveWizardScheduleAction({ success: true }, scheduleFormData())
    expect(res.success).toBe(false)
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('createWizardCourtsAction no crea canchas para un manager', async () => {
    const res = await createWizardCourtsAction({
      courts: [
        {
          name: 'Cancha 1',
          format: 5,
          surfaceType: 'synthetic_grass',
          isCovered: false,
          priceCents: 100000,
        },
      ],
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
  })

  it('finishOnboardingAction rebota a /dashboard para un manager, sin completar el onboarding', async () => {
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/dashboard')
    expect(vi.mocked(completeOnboarding)).not.toHaveBeenCalled()
  })
})

describe('onboarding wizard actions — admin sigue funcionando (paridad)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
  })

  it('createWizardCourtsAction crea canchas para un admin', async () => {
    const res = await createWizardCourtsAction({
      courts: [
        {
          name: 'Cancha 1',
          format: 5,
          surfaceType: 'synthetic_grass',
          isCovered: false,
          priceCents: 100000,
        },
      ],
    })
    expect(res).toEqual({ success: true, next: '/onboarding/reserva' })
    expect(vi.mocked(createCourt)).toHaveBeenCalledTimes(1)
  })

  // 🔴 QA 2026-08-13: reenviar el paso Canchas (doble POST, o "Volver" + enviar
  // de nuevo) creaba una fila más por cada envío — 3 columnas "Cancha 1"
  // indistinguibles en la grilla, las 3 online y bookeables.
  it('createWizardCourtsAction no duplica una cancha ya creada al reenviar el paso', async () => {
    vi.mocked(listCourts).mockResolvedValue([{ name: 'Cancha 1' }] as never)
    const res = await createWizardCourtsAction({
      courts: [
        {
          name: '  cancha 1  ',
          format: 5,
          surfaceType: 'synthetic_grass',
          isCovered: false,
          priceCents: 100000,
        },
      ],
    })
    expect(res).toEqual({ success: true, next: '/onboarding/reserva' })
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
  })

  it('finishOnboardingAction completa el onboarding para un admin', async () => {
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/onboarding/listo')
    expect(vi.mocked(completeOnboarding)).toHaveBeenCalledWith('tenant-1')
  })
})
