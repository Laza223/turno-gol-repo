import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  resolveStaffTenants: vi.fn(),
  setStaffTenantClaim: vi.fn(),
  refreshSession: vi.fn(),
  createTenantWithTrial: vi.fn(),
  getTenantById: vi.fn(),
  completeOnboarding: vi.fn(),
  saveOnboardingSchedule: vi.fn(),
  createOnboardingCourts: vi.fn(),
  saveOnboardingProfile: vi.fn(),
  resolveSignupReferrer: vi.fn(),
  getStaffSignupReferral: vi.fn(),
  revalidatePublicListings: vi.fn(),
  onboardingTrack: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { refreshSession: m.refreshSession } }),
}))
vi.mock('@/lib/sentry', () => ({
  captureException: m.captureException,
  captureMessage: m.captureMessage,
}))
vi.mock('@/shared/db/client', () => ({ getWorkerSql: vi.fn() }))
vi.mock('@/shared/cache/public-listings', () => ({
  revalidatePublicListings: m.revalidatePublicListings,
}))
vi.mock('@/shared/observability/breadcrumbs', () => ({ track: { onboarding: m.onboardingTrack } }))
vi.mock('@/modules/auth/auth.service', () => ({
  resolveStaffTenants: m.resolveStaffTenants,
  setStaffTenantClaim: m.setStaffTenantClaim,
}))
vi.mock('@/modules/referrals/referral.service', () => ({
  resolveSignupReferrer: m.resolveSignupReferrer,
}))
vi.mock('@/modules/staff/staff.service', () => ({
  getStaffSignupReferral: m.getStaffSignupReferral,
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  createTenantWithTrial: m.createTenantWithTrial,
  getTenantById: m.getTenantById,
  completeOnboarding: m.completeOnboarding,
}))
// Las funciones puras (buildUniformWeek, planWizardCourts) corren de verdad; las que escriben, no.
vi.mock('@/modules/onboarding/onboarding.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/onboarding/onboarding.service')>()),
  saveOnboardingSchedule: m.saveOnboardingSchedule,
  createOnboardingCourts: m.createOnboardingCourts,
  saveOnboardingProfile: m.saveOnboardingProfile,
}))

import { createComplexFromDraft } from '@/modules/onboarding/signup.service'

const DRAFT = {
  complex: {
    name: 'Los Pibes',
    address: 'Av. Siempreviva 742',
    city: 'Rosario',
    province: 'Santa Fe',
    latitude: -32.9,
    longitude: -60.6,
  },
  courts: { '5': 2 },
  schedule: { openHour: 10, closeHour: 0 },
  prices: { formats: [{ format: 5, count: 2, dayPrice: 3_000_000 }] },
  profile: { bookingIntake: 'whatsapp', hasFixedTeams: true, canteenEnabled: false },
  phone: '+54 9 341 123-4567',
  referralCode: null,
}

const base = {
  staffUserId: 'staff-1',
  authUserId: 'auth-1',
  email: 'dueno@complejo.com',
}

const TENANT_ROW = { id: 't-1', slug: 'los-pibes', settings: { onboarding_completed: false } }

beforeEach(() => {
  vi.clearAllMocks()
  m.resolveStaffTenants.mockResolvedValue([])
  m.createTenantWithTrial.mockResolvedValue({ id: 't-1', slug: 'los-pibes' })
  m.getTenantById.mockResolvedValue(TENANT_ROW)
  m.createOnboardingCourts.mockResolvedValue({ success: true })
  m.getStaffSignupReferral.mockResolvedValue(null)
  m.resolveSignupReferrer.mockResolvedValue(null)
  m.setStaffTenantClaim.mockResolvedValue(undefined)
  m.refreshSession.mockResolvedValue({})
})

describe('createComplexFromDraft', () => {
  it('crea tenant, horario, canchas, perfil y cierra el onboarding', async () => {
    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toEqual({ ok: true, tenantId: 't-1', slug: 'los-pibes', created: true })
    expect(m.createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 'staff-1',
        name: 'Los Pibes',
        // Teléfono del dueño (del borrador) y mail de la cuenta.
        phone: DRAFT.phone,
        email: 'dueno@complejo.com',
        latitude: -32.9,
        longitude: -60.6,
        referredByTenantId: null,
      }),
    )
    expect(m.setStaffTenantClaim).toHaveBeenCalledWith('auth-1', 't-1', 'staff-1')
    expect(m.refreshSession).toHaveBeenCalled()
    expect(m.saveOnboardingSchedule).toHaveBeenCalledWith('t-1', expect.any(Object), false, 3)
    expect(m.createOnboardingCourts).toHaveBeenCalledWith(TENANT_ROW, DRAFT.prices, 4)
    expect(m.saveOnboardingProfile).toHaveBeenCalledWith('t-1', DRAFT.profile, 5)
    expect(m.completeOnboarding).toHaveBeenCalledWith('t-1')
    expect(m.revalidatePublicListings).toHaveBeenCalledTimes(1)
  })

  it('cierre de madrugada prende closesNextDay', async () => {
    await createComplexFromDraft({
      ...base,
      draft: { ...DRAFT, schedule: { openHour: 16, closeHour: 2 } },
    })
    expect(m.saveOnboardingSchedule).toHaveBeenCalledWith('t-1', expect.any(Object), true, 3)
  })

  it('borrador inválido: no crea nada', async () => {
    const res = await createComplexFromDraft({
      ...base,
      draft: { ...DRAFT, complex: { ...DRAFT.complex, name: 'x' } },
    })
    expect(res).toMatchObject({ ok: false, tenantCreated: false })
    expect(m.createTenantWithTrial).not.toHaveBeenCalled()
  })

  it('borrador que no es un objeto: no crea nada', async () => {
    const res = await createComplexFromDraft({ ...base, draft: 'basura' })
    expect(res).toMatchObject({ ok: false, tenantCreated: false })
    expect(m.createTenantWithTrial).not.toHaveBeenCalled()
  })

  it('canchas y precios que no coinciden: no crea nada', async () => {
    const res = await createComplexFromDraft({
      ...base,
      draft: { ...DRAFT, courts: { '5': 3 } },
    })
    expect(res).toMatchObject({ ok: false, tenantCreated: false })
    expect(m.createTenantWithTrial).not.toHaveBeenCalled()
  })

  it('una sola coordenada se descarta: se cargan las dos o ninguna', async () => {
    await createComplexFromDraft({
      ...base,
      draft: { ...DRAFT, complex: { ...DRAFT.complex, longitude: null } },
    })
    expect(m.createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: null, longitude: null }),
    )
  })

  it('idempotente: con complejo ya cerrado lo devuelve y no escribe nada', async () => {
    m.resolveStaffTenants.mockResolvedValue([{ tenantId: 't-9' }])
    m.getTenantById.mockResolvedValue({
      id: 't-9',
      slug: 'ya-existe',
      settings: { onboarding_completed: true },
    })

    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toEqual({ ok: true, tenantId: 't-9', slug: 'ya-existe', created: false })
    expect(m.createTenantWithTrial).not.toHaveBeenCalled()
    expect(m.saveOnboardingSchedule).not.toHaveBeenCalled()
    expect(m.createOnboardingCourts).not.toHaveBeenCalled()
    expect(m.completeOnboarding).not.toHaveBeenCalled()
  })

  it('con un complejo a medias lo retoma sin crear otro', async () => {
    m.resolveStaffTenants.mockResolvedValue([{ tenantId: 't-1' }])

    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toMatchObject({ ok: true, tenantId: 't-1', created: false })
    expect(m.createTenantWithTrial).not.toHaveBeenCalled()
    expect(m.completeOnboarding).toHaveBeenCalledWith('t-1')
  })

  it('falla la creación del tenant: tenantCreated false (el caller puede deshacer la cuenta)', async () => {
    m.createTenantWithTrial.mockRejectedValue(new Error('db caída'))

    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toMatchObject({ ok: false, tenantCreated: false })
    expect(m.saveOnboardingSchedule).not.toHaveBeenCalled()
    expect(m.captureException).toHaveBeenCalled()
  })

  it('falla un paso posterior: tenantCreated true, no cierra el onboarding ni lo hace visible', async () => {
    m.createOnboardingCourts.mockResolvedValue({ success: false, error: 'Precios sin cubrir' })

    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toMatchObject({ ok: false, tenantCreated: true })
    expect(m.completeOnboarding).not.toHaveBeenCalled()
    expect(m.revalidatePublicListings).not.toHaveBeenCalled()
  })

  it('falla el refresh de sesión: no es fatal', async () => {
    m.setStaffTenantClaim.mockRejectedValue(new Error('boom'))

    const res = await createComplexFromDraft({ ...base, draft: DRAFT })

    expect(res).toMatchObject({ ok: true, created: true })
    expect(m.captureMessage).toHaveBeenCalled()
  })

  it('referidor: el código del borrador se resuelve contra el tenant nuevo; uno roto se ignora', async () => {
    m.resolveSignupReferrer.mockResolvedValue('t-ref')
    await createComplexFromDraft({ ...base, draft: { ...DRAFT, referralCode: 'AH2K9MZP' } })
    expect(m.resolveSignupReferrer).toHaveBeenCalledWith({
      code: 'AH2K9MZP',
      excludeTenantId: expect.any(String),
    })
    expect(m.createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ referredByTenantId: 't-ref' }),
    )

    m.resolveSignupReferrer.mockClear()
    await createComplexFromDraft({ ...base, draft: { ...DRAFT, referralCode: 'no-es-un-codigo' } })
    expect(m.resolveSignupReferrer).toHaveBeenCalledWith(expect.objectContaining({ code: null }))
  })

  it('si falla resolver el referidor, el alta sigue sin referidor', async () => {
    m.resolveSignupReferrer.mockRejectedValue(new Error('boom'))
    const res = await createComplexFromDraft({ ...base, draft: DRAFT })
    expect(res).toMatchObject({ ok: true })
    expect(m.createTenantWithTrial).toHaveBeenCalledWith(
      expect.objectContaining({ referredByTenantId: null }),
    )
  })
})
