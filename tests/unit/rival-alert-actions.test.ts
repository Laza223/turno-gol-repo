import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => ({ type: 'player', playerId: 'player-1' })),
  enforce: vi.fn(async () => ({ ok: true })),
  subscribeAlert: vi.fn(),
  unsubscribeAlert: vi.fn(),
  unsubscribeByToken: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  captureException: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/sentry', () => ({ captureException: mocks.captureException }))
vi.mock('@/app/(player)/rival/p/[code]/rival-intent.server', () => ({
  clearRivalIntentCookie: vi.fn(),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/shared/rate-limit', () => ({ enforce: mocks.enforce }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/modules/rival/rival.service', () => ({}))
vi.mock('@/modules/rival/rival-alerts.service', () => ({
  subscribeAlert: mocks.subscribeAlert,
  unsubscribeAlert: mocks.unsubscribeAlert,
  unsubscribeByToken: mocks.unsubscribeByToken,
}))

import {
  subscribeRivalAlertAction,
  unsubscribeMyRivalAlertAction,
  unsubscribeRivalAlertAction,
} from '@/app/(player)/rival/actions'
import { RivalError } from '@/modules/rival/rival.errors'

const TENANT = '11111111-1111-4111-8111-111111111111'
const IDLE = { success: false as const, error: '' }

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

afterEach(() => {
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(true)
  mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'player-1' })
  mocks.enforce.mockResolvedValue({ ok: true })
})

describe.each([
  ['subscribeRivalAlertAction', subscribeRivalAlertAction, mocks.subscribeAlert],
  ['unsubscribeMyRivalAlertAction', unsubscribeMyRivalAlertAction, mocks.unsubscribeAlert],
] as const)('%s', (_name, action, service) => {
  it('con el flag apagado no mira la sesión ni toca el service', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    expect(await action(IDLE, form({ tenantId: TENANT }))).toMatchObject({ success: false })
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
    expect(service).not.toHaveBeenCalled()
  })

  it('sin sesión de jugador no llega al rate limit ni al service', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    expect(await action(IDLE, form({ tenantId: TENANT }))).toMatchObject({ success: false })
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(service).not.toHaveBeenCalled()
  })

  it('rate limit excedido corta antes del service', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    expect(await action(IDLE, form({ tenantId: TENANT }))).toMatchObject({ success: false })
    expect(service).not.toHaveBeenCalled()
  })

  it('un complejo que no es uuid falla en el campo tenantId', async () => {
    expect(await action(IDLE, form({ tenantId: 'x' }))).toMatchObject({
      success: false,
      field: 'tenantId',
    })
    expect(service).not.toHaveBeenCalled()
  })

  it('un RivalError se traduce a texto', async () => {
    service.mockRejectedValue(new RivalError('rival_tenant_unavailable'))
    expect(await action(IDLE, form({ tenantId: TENANT }))).toEqual({
      success: false,
      error: 'Ese complejo no está disponible para armar partidos. Elegí otro.',
    })
  })
})

describe('subscribeRivalAlertAction: éxito', () => {
  it('pasa el jugador de la sesión y el check de arquero', async () => {
    mocks.subscribeAlert.mockResolvedValue(undefined)
    const r = await subscribeRivalAlertAction(
      IDLE,
      form({ tenantId: TENANT, onlyGoalkeeper: 'on' }),
    )
    expect(r).toEqual({ success: true })
    expect(mocks.subscribeAlert).toHaveBeenCalledWith('player-1', {
      tenantId: TENANT,
      onlyGoalkeeper: true,
    })
  })

  it('sin el check, onlyGoalkeeper es false', async () => {
    mocks.subscribeAlert.mockResolvedValue(undefined)
    await subscribeRivalAlertAction(IDLE, form({ tenantId: TENANT }))
    expect(mocks.subscribeAlert).toHaveBeenCalledWith('player-1', {
      tenantId: TENANT,
      onlyGoalkeeper: false,
    })
  })
})

describe('unsubscribeMyRivalAlertAction: éxito', () => {
  it('da de baja con el jugador de la sesión', async () => {
    mocks.unsubscribeAlert.mockResolvedValue(undefined)
    expect(await unsubscribeMyRivalAlertAction(IDLE, form({ tenantId: TENANT }))).toEqual({
      success: true,
    })
    expect(mocks.unsubscribeAlert).toHaveBeenCalledWith('player-1', TENANT)
  })
})

describe('unsubscribeRivalAlertAction (link del mail)', () => {
  it('sin flag es notFound y no toca el service', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    await expect(unsubscribeRivalAlertAction(form({ t: 'tok' }))).rejects.toThrow('NOT_FOUND')
    expect(mocks.unsubscribeByToken).not.toHaveBeenCalled()
  })

  it('da de baja por token y vuelve a la pantalla de listo, sin sesión', async () => {
    mocks.unsubscribeByToken.mockResolvedValue({ ok: true })
    await expect(unsubscribeRivalAlertAction(form({ t: 'tok' }))).rejects.toThrow(
      'REDIRECT:/rival/baja?listo=1',
    )
    expect(mocks.unsubscribeByToken).toHaveBeenCalledWith('tok')
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
  })

  it('token vacío o gigante no llega al service y da la misma pantalla', async () => {
    for (const t of ['', 'x'.repeat(513)]) {
      await expect(unsubscribeRivalAlertAction(form({ t }))).rejects.toThrow('REDIRECT:')
    }
    expect(mocks.unsubscribeByToken).not.toHaveBeenCalled()
  })

  it('si el service falla va a Sentry y la pantalla es la misma', async () => {
    mocks.unsubscribeByToken.mockRejectedValue(new Error('db'))
    await expect(unsubscribeRivalAlertAction(form({ t: 'tok' }))).rejects.toThrow(
      'REDIRECT:/rival/baja?listo=1',
    )
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })
})
