import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  signUpStaff: vi.fn(),
  undoStaffSignup: vi.fn(),
  createComplexFromDraft: vi.fn(),
  markGoogleOwnerProfile: vi.fn(),
  extractRealAuthUser: vi.fn(),
  dbLimit: vi.fn(),
  getDb: vi.fn(() => {
    throw new Error('TRAP: getDb() no debe usarse acá — staff_users necesita getWorkerDb()')
  }),
  enforce: vi.fn(),
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
  getUser: vi.fn(),
  cookieSet: vi.fn(),
  originHeader: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: m.originHeader }),
  cookies: async () => ({ set: m.cookieSet }),
}))
vi.mock('@/lib/sentry', () => ({ captureMessage: m.captureMessage }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signOut: m.signOut, signInWithOAuth: m.signInWithOAuth, getUser: m.getUser },
  }),
}))
vi.mock('@/modules/auth/auth.service', () => ({
  signUpStaff: m.signUpStaff,
  undoStaffSignup: m.undoStaffSignup,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractRealAuthUser: m.extractRealAuthUser }))
vi.mock('@/modules/onboarding/signup.service', () => ({
  createComplexFromDraft: m.createComplexFromDraft,
  markGoogleOwnerProfile: m.markGoogleOwnerProfile,
  validateDraft: () => ({ ok: true }),
}))
vi.mock('@/shared/db/client', () => ({
  getDb: m.getDb,
  getWorkerDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: m.dbLimit }) }) }),
  }),
}))
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: m.enforce }))

import {
  finalizeGoogleSignupAction,
  signUpWithMailAction,
  startGoogleOwnerSignupAction,
} from '@/app/(auth)/register/actions'
import {
  OWNER_INTENT_COOKIE_NAME,
  verifyOwnerIntentCookie,
} from '@/shared/security/owner-intent-cookie'

const DRAFT = {
  complex: {
    name: 'Los Pibes',
    address: 'Av. Siempreviva 742',
    city: 'Rosario',
    province: 'Santa Fe',
    latitude: null,
    longitude: null,
  },
  courts: { '5': 1 },
  schedule: { openHour: 10, closeHour: 0 },
  prices: { formats: [{ format: 5, count: 1, dayPrice: 3_000_000 }] },
  profile: { bookingIntake: 'whatsapp', hasFixedTeams: false, canteenEnabled: false },
  phone: '+54 9 11 1234-5678',
  referralCode: null,
}

const mailInput = (over: Record<string, unknown> = {}) => ({
  draft: DRAFT,
  name: 'Marcelo',
  email: 'Marce@Complejo.com',
  password: 'unaClaveSegura',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  m.originHeader.mockReturnValue('http://localhost:3000')
  m.enforce.mockResolvedValue({ ok: true })
  m.dbLimit.mockResolvedValue([])
  m.signUpStaff.mockResolvedValue({
    ok: true,
    path: '/onboarding',
    staffUserId: 'staff-1',
    authUserId: 'auth-1',
  })
  m.createComplexFromDraft.mockResolvedValue({
    ok: true,
    tenantId: 't-1',
    slug: 's',
    created: true,
  })
  m.signOut.mockResolvedValue({})
})

describe('signUpWithMailAction', () => {
  it('crea la cuenta y el complejo y devuelve /onboarding/listo', async () => {
    await expect(signUpWithMailAction(mailInput())).resolves.toEqual({
      ok: true,
      path: '/onboarding/listo',
    })
    expect(m.signUpStaff).toHaveBeenCalledWith({
      email: 'marce@complejo.com',
      password: 'unaClaveSegura',
      firstName: 'Marcelo',
      phone: DRAFT.phone,
      referralCode: null,
    })
    expect(m.createComplexFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({ staffUserId: 'staff-1', authUserId: 'auth-1' }),
    )
    expect(m.getDb).not.toHaveBeenCalled()
  })

  it('manda el referralCode válido a signUpStaff y descarta el roto', async () => {
    await signUpWithMailAction(mailInput({ draft: { ...DRAFT, referralCode: 'AH2K9MZP' } }))
    expect(m.signUpStaff).toHaveBeenLastCalledWith(
      expect.objectContaining({ referralCode: 'AH2K9MZP' }),
    )
    await signUpWithMailAction(mailInput({ draft: { ...DRAFT, referralCode: 'no-es-codigo' } }))
    expect(m.signUpStaff).toHaveBeenLastCalledWith(expect.objectContaining({ referralCode: null }))
  })

  it.each([
    ['email inválido', { email: 'no-es-email' }, 'email'],
    ['contraseña corta', { password: 'corta' }, 'password'],
    ['nombre vacío', { name: ' ' }, 'name'],
    ['celular inválido', { draft: { ...DRAFT, phone: '12' } }, 'phone'],
    ['borrador roto', { draft: { ...DRAFT, courts: {} } }, 'form'],
  ])('%s: error de campo y no toca DB ni Auth', async (_n, over, field) => {
    const res = await signUpWithMailAction(mailInput(over))
    expect(res).toMatchObject({ ok: false, field })
    expect(m.dbLimit).not.toHaveBeenCalled()
    expect(m.signUpStaff).not.toHaveBeenCalled()
  })

  it('input que no es un objeto: error, sin efectos', async () => {
    await expect(signUpWithMailAction(null)).resolves.toMatchObject({ ok: false })
    expect(m.signUpStaff).not.toHaveBeenCalled()
  })

  it('rate limit: corta antes de crear nada', async () => {
    m.enforce.mockResolvedValue({ ok: false })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'form',
    })
    expect(m.enforce).toHaveBeenCalledWith('authRegister', expect.any(String))
    expect(m.signUpStaff).not.toHaveBeenCalled()
  })

  it('mail ya registrado: existing y no crea cuenta', async () => {
    m.dbLimit.mockResolvedValue([{ id: 'staff-9' }])
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'email',
      existing: true,
    })
    expect(m.signUpStaff).not.toHaveBeenCalled()
  })

  it('si falla la consulta de existencia sigue al alta', async () => {
    m.dbLimit.mockRejectedValue(new Error('db down'))
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({ ok: true })
  })

  it('email_exists de Auth (carrera) se informa como existing', async () => {
    m.signUpStaff.mockResolvedValue({ ok: false, error: 'dup', code: 'email_exists' })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      existing: true,
    })
  })

  it('weak_password y email_address_invalid van a su campo', async () => {
    m.signUpStaff.mockResolvedValueOnce({ ok: false, error: 'weak', code: 'weak_password' })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'password',
    })
    m.signUpStaff.mockResolvedValueOnce({ ok: false, error: 'x', code: 'email_address_invalid' })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'email',
    })
  })

  it('código sin mapear: error genérico y queda en Sentry', async () => {
    m.signUpStaff.mockResolvedValue({ ok: false, error: 'raro', code: 'otra_cosa' })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'form',
    })
    expect(m.captureMessage).toHaveBeenCalled()
  })

  it('el complejo no se pudo crear: deshace la cuenta y cierra la sesión (el mail queda libre)', async () => {
    m.createComplexFromDraft.mockResolvedValue({
      ok: false,
      error: 'No pudimos crear el complejo.',
      tenantCreated: false,
    })
    await expect(signUpWithMailAction(mailInput())).resolves.toMatchObject({
      ok: false,
      field: 'form',
    })
    expect(m.undoStaffSignup).toHaveBeenCalledWith('auth-1', 'staff-1')
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('complejo creado pero a medias: NO deshace nada y sigue en el wizard', async () => {
    m.createComplexFromDraft.mockResolvedValue({ ok: false, error: 'x', tenantCreated: true })
    await expect(signUpWithMailAction(mailInput())).resolves.toEqual({
      ok: true,
      path: '/onboarding',
    })
    expect(m.undoStaffSignup).not.toHaveBeenCalled()
  })
})

describe('startGoogleOwnerSignupAction', () => {
  it('devuelve la URL de Google y deja la cookie firmada de intención owner', async () => {
    m.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/x' },
      error: null,
    })

    const res = await startGoogleOwnerSignupAction()

    expect(res).toEqual({ ok: true, url: 'https://accounts.google.com/x' })
    expect(m.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        skipBrowserRedirect: true,
        redirectTo: `http://localhost:3000/api/auth/callback?next=${encodeURIComponent('/register/finalizar')}`,
      }),
    })
    const cookie = m.cookieSet.mock.calls[0]![0] as Record<string, unknown>
    expect(cookie).toMatchObject({
      name: OWNER_INTENT_COOKIE_NAME,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
    expect(verifyOwnerIntentCookie(cookie.value as string)).toBe(true)
  })

  it('si Supabase no da URL: error y NO deja cookie', async () => {
    m.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'x' } })
    await expect(startGoogleOwnerSignupAction()).resolves.toMatchObject({ ok: false })
    expect(m.cookieSet).not.toHaveBeenCalled()
  })
})

describe('finalizeGoogleSignupAction', () => {
  const staff = {
    type: 'staff',
    id: 'auth-1',
    email: 'dueno@gmail.com',
    staffUserId: 'staff-1',
  }
  const googleIdentity = { provider: 'google', identity_data: { email_verified: true } }

  beforeEach(() => {
    m.extractRealAuthUser.mockResolvedValue(staff)
    m.getUser.mockResolvedValue({ data: { user: { identities: [googleIdentity] } } })
  })

  it('guarda celular, marca el mail verificado y crea el complejo', async () => {
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toEqual({
      ok: true,
      path: '/onboarding/listo',
    })
    expect(m.markGoogleOwnerProfile).toHaveBeenCalledWith('staff-1', DRAFT.phone, true)
    expect(m.createComplexFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        staffUserId: 'staff-1',
        authUserId: 'auth-1',
        email: 'dueno@gmail.com',
      }),
    )
  })

  it('una sesión que NO es de Google no obtiene el mail verificado', async () => {
    m.getUser.mockResolvedValue({ data: { user: { identities: [{ provider: 'email' }] } } })
    await finalizeGoogleSignupAction(DRAFT)
    expect(m.markGoogleOwnerProfile).toHaveBeenCalledWith('staff-1', DRAFT.phone, false)
  })

  it('Google con mail sin verificar tampoco', async () => {
    m.getUser.mockResolvedValue({
      data: {
        user: { identities: [{ provider: 'google', identity_data: { email_verified: false } }] },
      },
    })
    await finalizeGoogleSignupAction(DRAFT)
    expect(m.markGoogleOwnerProfile).toHaveBeenCalledWith('staff-1', DRAFT.phone, false)
  })

  it.each([
    ['sin sesión', null],
    ['sesión de jugador', { type: 'player', id: 'p', playerId: 'p', email: 'a@b.com' }],
    ['sesión de super admin', { type: 'system_admin', id: 's', email: 'a@b.com' }],
    ['staff sin staffUserId', { ...staff, staffUserId: null }],
  ])('%s: rechaza sin crear nada', async (_n, user) => {
    m.extractRealAuthUser.mockResolvedValue(user)
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toMatchObject({ ok: false })
    expect(m.createComplexFromDraft).not.toHaveBeenCalled()
    expect(m.markGoogleOwnerProfile).not.toHaveBeenCalled()
  })

  it('borrador inválido: error y no escribe', async () => {
    await expect(finalizeGoogleSignupAction({ ...DRAFT, phone: '12' })).resolves.toMatchObject({
      ok: false,
      field: 'phone',
    })
    expect(m.markGoogleOwnerProfile).not.toHaveBeenCalled()
  })

  it('rate limit: corta antes de escribir', async () => {
    m.enforce.mockResolvedValue({ ok: false })
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toMatchObject({ ok: false })
    expect(m.createComplexFromDraft).not.toHaveBeenCalled()
  })

  it('idempotente: complejo ya creado devuelve el mismo destino', async () => {
    m.createComplexFromDraft.mockResolvedValue({
      ok: true,
      tenantId: 't',
      slug: 's',
      created: false,
    })
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toEqual({
      ok: true,
      path: '/onboarding/listo',
    })
  })

  it('complejo a medias: sigue en el wizard; sin complejo: error y la cuenta de Google se conserva', async () => {
    m.createComplexFromDraft.mockResolvedValueOnce({ ok: false, error: 'x', tenantCreated: true })
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toEqual({
      ok: true,
      path: '/onboarding',
    })
    m.createComplexFromDraft.mockResolvedValueOnce({ ok: false, error: 'x', tenantCreated: false })
    await expect(finalizeGoogleSignupAction(DRAFT)).resolves.toMatchObject({ ok: false })
    expect(m.undoStaffSignup).not.toHaveBeenCalled()
  })
})
