import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => ({ type: 'player', playerId: 'player-1' })),
  enforce: vi.fn(async () => ({ ok: true })),
  createMatch: vi.fn(),
  cancelMatch: vi.fn(),
  acceptRivalWelcome: vi.fn(),
  listUpcomingConfirmedBookings: vi.fn(async () => []),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  captureException: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/sentry', () => ({ captureException: mocks.captureException }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/shared/rate-limit', () => ({ enforce: mocks.enforce }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/modules/rival/rival.service', () => ({
  createMatch: mocks.createMatch,
  cancelMatch: mocks.cancelMatch,
  acceptRivalWelcome: mocks.acceptRivalWelcome,
  listUpcomingConfirmedBookings: mocks.listUpcomingConfirmedBookings,
}))

import {
  acceptRivalWelcomeAction,
  cancelMatchAction,
  createMatchAction,
} from '@/app/(player)/rival/actions'
import { RivalError } from '@/modules/rival/rival.errors'

const TENANT = '11111111-1111-4111-8111-111111111111'
const MATCH = '22222222-2222-4222-8222-222222222222'

function createForm(over: Record<string, string> = {}): FormData {
  const f = new FormData()
  const base: Record<string, string> = {
    tenantId: TENANT,
    date: '2026-10-24',
    time: '21:00',
    format: '5',
    capacity: '',
    level: 'parejo',
    courtDeclared: 'on',
    ...over,
  }
  for (const [k, v] of Object.entries(base)) f.set(k, v)
  return f
}

function welcomeForm(): FormData {
  const f = new FormData()
  f.set('firstName', 'Lazaro')
  f.set('position', 'any')
  f.set('zone', 'Luján')
  return f
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(true)
  mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'player-1' })
  mocks.enforce.mockResolvedValue({ ok: true })
})

describe('acciones de RIVAL: flag, sesión y rate limit antes que nada', () => {
  it('con el flag apagado ninguna acción mira la sesión ni toca el service', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    const results = [
      await createMatchAction({ success: true }, createForm()),
      await acceptRivalWelcomeAction({ success: true }, welcomeForm()),
      await cancelMatchAction(MATCH),
    ]
    for (const r of results) expect(r).toMatchObject({ success: false })
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.createMatch).not.toHaveBeenCalled()
    expect(mocks.cancelMatch).not.toHaveBeenCalled()
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
  })

  it('sin sesión de jugador (anónimo o staff) no llega al rate limit ni al service', async () => {
    for (const user of [null, { type: 'staff' }]) {
      mocks.extractAuthUser.mockResolvedValue(user)
      expect(await createMatchAction({ success: true }, createForm())).toMatchObject({
        success: false,
        error: 'Ingresá a tu cuenta para seguir.',
      })
    }
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.createMatch).not.toHaveBeenCalled()
  })

  it('con el rate limit vencido corta antes de validar y de tocar el service', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    expect(await createMatchAction({ success: true }, createForm())).toEqual({
      success: false,
      error: 'Demasiadas solicitudes. Esperá un momento.',
    })
    expect(mocks.enforce).toHaveBeenCalledWith('rivalCreate', 'player-1')
    expect(mocks.createMatch).not.toHaveBeenCalled()
  })
})

describe('createMatchAction', () => {
  it('crea el partido con el borrador validado y va a la vista del organizador', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: 'ABCDEFGHJK' })
    await expect(createMatchAction({ success: true }, createForm())).rejects.toThrow(
      'REDIRECT:/rival/p/ABCDEFGHJK?creado=1',
    )
    const [playerId, draft] = mocks.createMatch.mock.calls[0] as [string, { tenantId: string }]
    expect(playerId).toBe('player-1')
    expect(draft.tenantId).toBe(TENANT)
  })

  it('un error de validación vuelve con el campo y no toca el service', async () => {
    const r = await createMatchAction({ success: true }, createForm({ courtDeclared: '' }))
    expect(r).toEqual({
      success: false,
      error: 'Confirmá que tenés la cancha.',
      field: 'courtDeclared',
    })
    expect(mocks.createMatch).not.toHaveBeenCalled()
  })

  it('un error de dominio sale como texto humano, sin código técnico y sin ir a Sentry', async () => {
    mocks.createMatch.mockRejectedValue(new RivalError('rival_limit_active'))
    const r = await createMatchAction({ success: true }, createForm())
    expect(r).toEqual({
      success: false,
      error: 'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
    })
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('un fallo de infraestructura va a Sentry y sale genérico', async () => {
    mocks.createMatch.mockRejectedValue(new Error('connection reset'))
    const r = await createMatchAction({ success: true }, createForm())
    expect(r).toEqual({
      success: false,
      error: 'No pudimos completar la acción. Probá de nuevo en unos segundos.',
    })
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })
})

describe('cancelMatchAction y bienvenida', () => {
  it('cancela con el jugador de la sesión; un id que no es uuid es "no encontrado"', async () => {
    mocks.cancelMatch.mockResolvedValue(undefined)
    expect(await cancelMatchAction(MATCH)).toEqual({ success: true })
    expect(mocks.cancelMatch).toHaveBeenCalledWith('player-1', MATCH)
    expect(await cancelMatchAction('no-es-uuid')).toEqual({
      success: false,
      error: 'No encontramos ese partido.',
    })
  })

  it('la bienvenida exige zona de la lista cerrada', async () => {
    const f = welcomeForm()
    f.set('zone', 'Marte')
    expect(await acceptRivalWelcomeAction({ success: true }, f)).toMatchObject({
      success: false,
      field: 'zone',
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    mocks.acceptRivalWelcome.mockResolvedValue(undefined)
    expect(await acceptRivalWelcomeAction({ success: true }, welcomeForm())).toEqual({
      success: true,
    })
  })
})
