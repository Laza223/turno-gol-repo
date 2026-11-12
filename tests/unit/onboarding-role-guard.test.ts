import { beforeEach, describe, expect, it, vi } from 'vitest'

// caza-bugs #7: los pasos 2-5 del wizard de onboarding (canchas, horarios,
// precios, tu complejo, cerrar onboarding) son Configuración — antes usaban un
// guard local que solo chequeaba "es staff de este tenant", sin mirar el rol. Un
// manager (Encargado) podía invocar las Server Actions directo (sin pasar por la
// UI del wizard, pensada solo para el admin recién creado) y reescribir
// horarios/canchas o cerrar el onboarding. Este archivo prueba que quedan
// gateadas por requireAdminStaffAction/requireAdminStaff (rol leído de DB),
// igual que /settings y /canchas fuera del wizard.
//
// Los mocks de withTenantContext/getCourtCountAndBilled/createCourt están
// configurados para que la acción SIGA HASTA EL FINAL si el guard de rol la
// deja pasar — así "manager bloqueado" es una aserción real (success:false
// ANTES de tocar la DB), no un falso positivo por un mock a medio configurar
// que hubiera hecho fallar la acción por otro motivo.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
  createTenantWithTrial: vi.fn(),
  updateTenantSettings: vi.fn(),
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
  updateCourt: vi.fn(async () => ({ id: 'court-1' })),
  toggleStatus: vi.fn(async () => ({ id: 'court-1' })),
  // Migr. 090/091: ya no hay techo de plan. La funcion devuelve contra que
  // se compara ahora: canchas prendidas vs canchas facturadas.
  getCourtCountAndBilled: vi.fn(async () => ({
    onlineCourts: 0,
    billedCourts: null,
    isTrialing: true,
  })),
  // La idempotencia del paso Precios lee las canchas ya existentes para
  // reutilizarlas en vez de duplicarlas.
  listCourts: vi.fn(async () => []),
  validatePricingRulesCoverage: vi.fn(() => ({ valid: true, gaps: [] })),
}))

import {
  finishOnboardingAction,
  saveWizardCourtsAction,
  saveWizardPricesAction,
  saveWizardProfileAction,
  saveWizardScheduleAction,
} from '@/app/onboarding/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  getStaffTenant,
  completeOnboarding,
  updateTenantSettings,
} from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { createCourt, listCourts, toggleStatus, updateCourt } from '@/modules/courts/court.service'

const STAFF_USER = { type: 'staff', id: 'auth-1', staffUserId: 'staff-1', email: 'staff@test.com' }
const OPEN_ALL_WEEK = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
    d,
    { open: '08:00', close: '23:00' },
  ]),
)
const TENANT = {
  id: 'tenant-1',
  openingHours: OPEN_ALL_WEEK,
  closesNextDay: false,
  settings: { onboarding_step: 4 },
}

const PRICES = { formats: [{ format: 5, count: 1, dayPrice: 6_000_000 }] }
const SCHEDULE = { openHour: 8, closeHour: 0 }
const PROFILE = { bookingIntake: 'whatsapp', hasFixedTeams: true, canteenEnabled: false }

// `tx` de mentira: el lock advisory, el chequeo de reservas y el borrado de sobrantes.
let reservationRows: { id: string }[] = []
const txDeleteWhere = vi.fn(async () => undefined)
const fakeTx = {
  execute: vi.fn(async () => []),
  select: () => ({ from: () => ({ where: () => ({ limit: async () => reservationRows }) }) }),
  delete: () => ({ where: txDeleteWhere }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
}

beforeEach(() => {
  vi.clearAllMocks()
  reservationRows = []
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  // Si el guard de rol deja pasar, la acción llega hasta acá y completa — el
  // punto es probar que el manager NUNCA llega a este mock.
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(fakeTx as never)) as never)
})

describe('onboarding wizard actions — manager (rol no-admin) es rechazado (caza-bugs #7)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
  })

  it('saveWizardScheduleAction no reescribe horarios para un manager', async () => {
    const res = await saveWizardScheduleAction(SCHEDULE)
    expect(res.success).toBe(false)
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('saveWizardCourtsAction no guarda la cantidad de canchas para un manager', async () => {
    const res = await saveWizardCourtsAction({ '5': 1 })
    expect(res.success).toBe(false)
    expect(vi.mocked(updateTenantSettings)).not.toHaveBeenCalled()
  })

  it('saveWizardPricesAction no crea canchas para un manager', async () => {
    const res = await saveWizardPricesAction(PRICES)
    expect(res.success).toBe(false)
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
  })

  it('saveWizardProfileAction no guarda las respuestas para un manager', async () => {
    const res = await saveWizardProfileAction(PROFILE)
    expect(res.success).toBe(false)
    expect(vi.mocked(updateTenantSettings)).not.toHaveBeenCalled()
  })

  it('finishOnboardingAction rebota a /dashboard para un manager, sin completar el onboarding', async () => {
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/dashboard')
    expect(vi.mocked(completeOnboarding)).not.toHaveBeenCalled()
  })
})

describe('onboarding wizard actions — admin sigue funcionando (paridad)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(listCourts).mockResolvedValue([])
  })

  it('saveWizardCourtsAction guarda la cantidad por formato y avanza a Horarios', async () => {
    const res = await saveWizardCourtsAction({ '5': 2, '7': 0 })
    expect(res).toEqual({ success: true, next: '/onboarding/horarios' })
    // Cambiar Canchas baja el paso (el tenant estaba en el 4): Precios se repasa.
    expect(vi.mocked(updateTenantSettings)).toHaveBeenCalledWith('tenant-1', {
      onboarding_draft_courts: { '5': 2 },
      onboarding_step: 2,
    })
  })

  it('saveWizardScheduleAction baja el paso a Horarios aunque ya estuviera en el 5', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue({
      ...TENANT,
      settings: { onboarding_step: 5 },
    } as never)
    const res = await saveWizardScheduleAction(SCHEDULE)
    expect(res).toEqual({ success: true, next: '/onboarding/precios' })
    expect(vi.mocked(updateTenantSettings)).toHaveBeenCalledWith('tenant-1', {
      onboarding_step: 3,
    })
  })

  it('saveWizardCourtsAction rechaza cero canchas', async () => {
    const res = await saveWizardCourtsAction({ '5': 0 })
    expect(res).toEqual({ success: false, error: 'Elegí al menos una cancha.' })
  })

  it('saveWizardPricesAction crea las canchas para un admin y sigue a Tu complejo', async () => {
    const res = await saveWizardPricesAction({
      formats: [{ format: 5, count: 2, dayPrice: 6_000_000 }],
    })
    expect(res).toEqual({ success: true, next: '/onboarding/tu-complejo' })
    expect(vi.mocked(createCourt)).toHaveBeenCalledTimes(2)
    const names = vi.mocked(createCourt).mock.calls.map((c) => (c[1] as { name: string }).name)
    expect(names).toEqual(['Cancha 1', 'Cancha 2'])
  })

  it('saveWizardPricesAction vuelve directo al resumen si ya había terminado los 5 pasos', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue({
      ...TENANT,
      settings: { onboarding_step: 5 },
    } as never)
    const res = await saveWizardPricesAction(PRICES)
    expect(res).toEqual({ success: true, next: '/onboarding/resumen' })
  })

  // 🔴 QA 2026-08-13: reenviar el paso (doble POST, o volver con "Cambiar" y
  // enviar de nuevo) creaba una fila más por cada envío — columnas "Cancha 1"
  // indistinguibles en la grilla, todas online y bookeables.
  it('saveWizardPricesAction no duplica una cancha ya creada: la reutiliza y le actualiza el precio', async () => {
    vi.mocked(listCourts).mockResolvedValue([{ id: 'c1', name: '  cancha 1  ' }] as never)
    const res = await saveWizardPricesAction(PRICES)
    expect(res.success).toBe(true)
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
    expect(vi.mocked(updateCourt)).toHaveBeenCalledWith(
      'c1',
      'tenant-1',
      expect.objectContaining({ format: 5 }),
      expect.anything(),
    )
  })

  // Complejos del wizard viejo: sus canchas tienen nombres propios. Llegan a
  // Precios con las canchas ya creadas y no se tienen que duplicar.
  it('saveWizardPricesAction reutiliza por orden las canchas con otro nombre', async () => {
    vi.mocked(listCourts).mockResolvedValue([{ id: 'c9', name: 'Cancha Fénix' }] as never)
    const res = await saveWizardPricesAction(PRICES)
    expect(res.success).toBe(true)
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
    expect(vi.mocked(updateCourt)).toHaveBeenCalledWith(
      'c9',
      'tenant-1',
      expect.anything(),
      expect.anything(),
    )
  })

  // Bajó la cantidad (3 → 1): las sobrantes se borran, salvo las que tienen reservas.
  const THREE = [
    { id: 'c1', name: 'Cancha 1' },
    { id: 'c2', name: 'Cancha 2' },
    { id: 'c3', name: 'Cancha 3' },
  ]

  it('saveWizardPricesAction borra las canchas sobrantes sin reservas y toma el lock por complejo', async () => {
    vi.mocked(listCourts).mockResolvedValue(THREE as never)
    const res = await saveWizardPricesAction(PRICES)
    expect(res.success).toBe(true)
    expect(fakeTx.execute).toHaveBeenCalledTimes(1)
    expect(txDeleteWhere).toHaveBeenCalledTimes(2)
    expect(vi.mocked(toggleStatus)).not.toHaveBeenCalled()
  })

  it('saveWizardPricesAction apaga (no borra) las sobrantes que tienen reservas', async () => {
    vi.mocked(listCourts).mockResolvedValue(THREE as never)
    reservationRows = [{ id: 'b1' }]
    const res = await saveWizardPricesAction(PRICES)
    expect(res.success).toBe(true)
    expect(txDeleteWhere).not.toHaveBeenCalled()
    expect(vi.mocked(toggleStatus)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(toggleStatus)).toHaveBeenCalledWith('c2', 'tenant-1', 'offline', fakeTx)
  })

  it('con el onboarding cerrado, ningún paso del wizard escribe', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue({
      ...TENANT,
      settings: { onboarding_step: 5, onboarding_completed: true },
    } as never)
    vi.mocked(listCourts).mockResolvedValue(THREE as never)
    const results = [
      await saveWizardCourtsAction({ '5': 1 }),
      await saveWizardScheduleAction(SCHEDULE),
      await saveWizardPricesAction(PRICES),
      await saveWizardProfileAction(PROFILE),
    ]
    for (const r of results) expect(r.success).toBe(false)
    expect(vi.mocked(updateTenantSettings)).not.toHaveBeenCalled()
    expect(txDeleteWhere).not.toHaveBeenCalled()
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
  })

  it('saveWizardProfileAction guarda las tres respuestas y va al resumen', async () => {
    const res = await saveWizardProfileAction(PROFILE)
    expect(res).toEqual({ success: true, next: '/onboarding/resumen' })
    expect(vi.mocked(updateTenantSettings)).toHaveBeenCalledWith('tenant-1', {
      booking_intake: 'whatsapp',
      has_fixed_teams: true,
      canteen_enabled: false,
      onboarding_step: 5,
    })
  })

  it('finishOnboardingAction completa el onboarding con los 5 pasos hechos', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue({
      ...TENANT,
      settings: { onboarding_step: 5 },
    } as never)
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/onboarding/listo')
    expect(vi.mocked(completeOnboarding)).toHaveBeenCalledWith('tenant-1')
  })

  it('finishOnboardingAction no cierra si falta algún paso: vuelve al primero que falta', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue({
      ...TENANT,
      settings: { onboarding_step: 3 },
    } as never)
    await expect(finishOnboardingAction()).rejects.toThrow('REDIRECT:/onboarding/precios')
    expect(vi.mocked(completeOnboarding)).not.toHaveBeenCalled()
  })
})
