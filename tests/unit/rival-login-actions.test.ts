import { beforeEach, describe, expect, it, vi } from 'vitest'

// El ingreso de "Voy" en el servidor: flag, `next` de partido, `terms=on`, la cookie de Google y el
// vínculo firmado del mail.

const {
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
  redirect,
  cookieSet,
  cookieDelete,
  flag,
} = vi.hoisted(() => ({
  signInWithGooglePlayer: vi.fn(),
  signInWithPlayerMagicLink: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  flag: vi.fn(async () => true),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithGooglePlayer,
  signInWithPlayerMagicLink,
}))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: flag }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'http://localhost:3000' }),
  cookies: async () => ({ get: () => undefined, set: cookieSet, delete: cookieDelete }),
}))
vi.mock('next/navigation', () => ({ redirect, RedirectType: { push: 'push', replace: 'replace' } }))
vi.mock('@/shared/rate-limit', () => ({
  enforce: vi.fn(async () => ({ ok: true })),
  parseClientIp: () => '1.1.1.1',
}))

import {
  sendRivalMagicLinkAction,
  startGoogleLoginFromRivalAction,
} from '@/app/(player)/rival/p/[code]/login-actions'
import { GOOGLE_TERMS_COOKIE_NAME } from '@/shared/security/google-terms-cookie'
import { checkRivalIntent, RIVAL_INTENT_COOKIE_NAME } from '@/shared/security/rival-intent'

const CODE = 'ABCDEFGHJK'
const NEXT = `/rival/p/${CODE}`
const idle = { status: 'idle' } as const

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  flag.mockResolvedValue(true)
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  signInWithGooglePlayer.mockResolvedValue({ url: 'https://accounts.google.com/o' })
  signInWithPlayerMagicLink.mockResolvedValue({ ok: true })
})

describe('con el flag apagado', () => {
  it('las dos devuelven error sin tocar cookies, mail ni Google', async () => {
    flag.mockResolvedValue(false)
    const form = fd({ next: NEXT, terms: 'on', email: 'a@example.com' })
    expect(await sendRivalMagicLinkAction(idle, form)).toMatchObject({ status: 'error' })
    expect(await startGoogleLoginFromRivalAction(idle, form)).toMatchObject({ status: 'error' })
    expect(signInWithPlayerMagicLink).not.toHaveBeenCalled()
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
  })
})

describe('un next que no es un partido', () => {
  it.each([
    '/mis-reservas',
    '/rival/p/corto',
    '/rival/nuevo',
    'https://evil.com/rival/p/ABCDEFGHJK',
    '',
  ])('da error (%j) y no manda nada', async (next) => {
    const form = fd({ next, terms: 'on', email: 'a@example.com' })
    expect(await sendRivalMagicLinkAction(idle, form)).toMatchObject({ status: 'error' })
    expect(await startGoogleLoginFromRivalAction(idle, form)).toMatchObject({ status: 'error' })
    expect(signInWithPlayerMagicLink).not.toHaveBeenCalled()
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
  })
})

describe('sin terms=on', () => {
  it('el mail no se manda', async () => {
    const r = await sendRivalMagicLinkAction(idle, fd({ next: NEXT, email: 'a@example.com' }))
    expect(r).toMatchObject({ status: 'error', field: 'terms' })
    expect(signInWithPlayerMagicLink).not.toHaveBeenCalled()
  })

  it('Google no setea cookies (y borra las viejas) ni redirige', async () => {
    const r = await startGoogleLoginFromRivalAction(idle, fd({ next: NEXT, terms: 'off' }))
    expect(r).toMatchObject({ status: 'error', field: 'terms' })
    expect(cookieSet).not.toHaveBeenCalled()
    expect(cookieDelete).toHaveBeenCalledWith(GOOGLE_TERMS_COOKIE_NAME)
    expect(cookieDelete).toHaveBeenCalledWith(RIVAL_INTENT_COOKIE_NAME)
    expect(signInWithGooglePlayer).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('la cookie de Google', () => {
  it.each([
    ['production', true],
    ['development', false],
  ])('con NODE_ENV=%s sale httpOnly, lax y secure=%s', async (env, secure) => {
    vi.stubEnv('NODE_ENV', env)
    await expect(
      startGoogleLoginFromRivalAction(idle, fd({ next: NEXT, terms: 'on' })),
    ).rejects.toThrow('NEXT_REDIRECT:https://accounts.google.com/o')
    const intent = cookieSet.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((c) => c.name === RIVAL_INTENT_COOKIE_NAME)
    expect(intent).toMatchObject({ httpOnly: true, sameSite: 'lax', secure, path: '/' })
    expect(checkRivalIntent({ cookieToken: String(intent!.value) }, { code: CODE })).toEqual({
      ok: true,
    })
    expect(signInWithGooglePlayer).toHaveBeenCalledWith(
      `http://localhost:3000/api/auth/callback?next=${encodeURIComponent(NEXT)}`,
    )
  })
})

describe('el mail', () => {
  it('el next lleva ?rival_intent= con un token que verifica para ESE partido y ESE email', async () => {
    const r = await sendRivalMagicLinkAction(
      idle,
      fd({ next: NEXT, terms: 'on', email: 'Ana@Example.com' }),
    )
    expect(r).toMatchObject({ status: 'sent', email: 'ana@example.com' })
    const redirectTo = signInWithPlayerMagicLink.mock.calls[0]![1] as string
    const next = new URL(redirectTo).searchParams.get('next')!
    const url = new URL(next, 'http://localhost')
    expect(url.pathname).toBe(NEXT)
    const token = url.searchParams.get('rival_intent')!
    const check = (email: string, code: string) =>
      checkRivalIntent({ linkToken: token, email }, { code })
    expect(check('ana@example.com', CODE)).toEqual({ ok: true })
    expect(check('otra@example.com', CODE)).toMatchObject({ ok: false })
    expect(check('ana@example.com', 'ZZZZZZZZZZ')).toMatchObject({ ok: false })
  })
})
