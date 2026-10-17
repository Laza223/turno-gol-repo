import { beforeEach, describe, expect, it, vi } from 'vitest'

// Los tres emisores del jugador marcan el `redirectTo` con `via=`: es lo que le
// permite al callback distinguir "un jugador pidió este enlace" de un alta o
// invitación de staff (que NO llevan marca) y rechazar a una cuenta de complejo
// sin provisionarla como staff. Mismo mocking que provision-and-route-staff-identity.test.ts.

vi.mock('@/shared/db/client', () => ({ getWorkerSql: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/shared/observability', () => ({ track: { auth: vi.fn() } }))

import { createClient } from '@/lib/supabase/server'
import {
  signInWithExistingPlayerMagicLink,
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
} from '@/modules/auth/auth.service'

const signInWithOtp = vi.fn()
const signInWithOAuth = vi.fn()
const REDIRECT = 'https://turnogol.test/api/auth/callback?next=%2Fmis-reservas'
const PROFILE = { firstName: 'Ana', lastName: 'Gómez', agreedTerms: true, termsVersion: 'v1' }

beforeEach(() => {
  vi.clearAllMocks()
  signInWithOtp.mockResolvedValue({ error: null })
  signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
  vi.mocked(createClient).mockResolvedValue({ auth: { signInWithOtp, signInWithOAuth } } as never)
})

describe('marca de vía en el redirectTo', () => {
  it('magic link del alta (LoginGate): via=email, conserva el next', async () => {
    await signInWithPlayerMagicLink('ana@example.com', REDIRECT, PROFILE)
    expect(signInWithOtp.mock.calls[0]![0].options.emailRedirectTo).toBe(`${REDIRECT}&via=email`)
  })

  it('magic link de re-acceso (/ingresar): via=email', async () => {
    await signInWithExistingPlayerMagicLink('ana@example.com', REDIRECT)
    expect(signInWithOtp.mock.calls[0]![0].options.emailRedirectTo).toBe(`${REDIRECT}&via=email`)
  })

  it('Google: via=google', async () => {
    await signInWithGooglePlayer(REDIRECT)
    expect(signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(`${REDIRECT}&via=google`)
  })

  it('un redirectTo sin query recibe la marca con "?"', async () => {
    await signInWithGooglePlayer('/api/auth/callback')
    expect(signInWithOAuth.mock.calls[0]![0].options.redirectTo).toBe(
      '/api/auth/callback?via=google',
    )
  })
})

describe('signInWithGooglePlayer — selectAccount', () => {
  it('con selectAccount pide el selector de cuentas de Google', async () => {
    await signInWithGooglePlayer(REDIRECT, { selectAccount: true })
    expect(signInWithOAuth.mock.calls[0]![0].options.queryParams).toEqual({
      prompt: 'select_account',
    })
  })

  it('sin la opción el login normal no manda queryParams', async () => {
    await signInWithGooglePlayer(REDIRECT)
    expect(signInWithOAuth.mock.calls[0]![0].options).not.toHaveProperty('queryParams')
  })
})

// Re-acceso por email (/ingresar): la respuesta no puede depender de si la cuenta
// existe. `otp_disabled` = email inexistente; `over_email_send_rate_limit` = email
// existente que volvió a pedir dentro del mínimo de Supabase. Los dos son "enviado".
describe('signInWithExistingPlayerMagicLink — no revela qué emails existen', () => {
  it('otp_disabled (email inexistente) responde ok', async () => {
    signInWithOtp.mockResolvedValue({
      error: { code: 'otp_disabled', message: 'Signups not allowed for otp' },
    })
    await expect(signInWithExistingPlayerMagicLink('nadie@example.com', REDIRECT)).resolves.toEqual(
      { ok: true },
    )
  })

  it('over_email_send_rate_limit (cuenta existente, reenvío) responde ok', async () => {
    signInWithOtp.mockResolvedValue({
      error: {
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this after 42 seconds.',
      },
    })
    await expect(signInWithExistingPlayerMagicLink('ana@example.com', REDIRECT)).resolves.toEqual({
      ok: true,
    })
  })

  it('un error real sigue saliendo como error', async () => {
    signInWithOtp.mockResolvedValue({ error: { code: 'unexpected_failure', message: 'boom' } })
    await expect(signInWithExistingPlayerMagicLink('ana@example.com', REDIRECT)).resolves.toEqual({
      ok: false,
      error: 'boom',
    })
  })
})
