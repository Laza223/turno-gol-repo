import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => ({ type: 'player', playerId: 'player-1' })),
  enforce: vi.fn(async () => ({ ok: true })),
  createMatch: vi.fn(),
  cancelMatch: vi.fn(),
  acceptRivalWelcome: vi.fn(),
  completeRivalProfile: vi.fn(),
  getRivalWelcomeState: vi.fn(),
  getMyMatch: vi.fn(),
  joinByInvite: vi.fn(),
  leaveMatch: vi.fn(),
  getBoardMatch: vi.fn(),
  requestToJoin: vi.fn(),
  decideRequest: vi.fn(),
  removeParticipant: vi.fn(),
  publishToBoard: vi.fn(),
  unpublishFromBoard: vi.fn(),
  reportMatch: vi.fn(),
  reportPlayer: vi.fn(),
  revalidatePath: vi.fn(),
  clearRivalIntentCookie: vi.fn(async () => undefined),
  listUpcomingConfirmedBookings: vi.fn(async () => []),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  captureException: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/sentry', () => ({ captureException: mocks.captureException }))
vi.mock('@/app/(player)/rival/p/[code]/rival-intent.server', () => ({
  clearRivalIntentCookie: mocks.clearRivalIntentCookie,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/shared/rate-limit', () => ({ enforce: mocks.enforce }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/modules/rival/rival.service', () => ({
  createMatch: mocks.createMatch,
  cancelMatch: mocks.cancelMatch,
  acceptRivalWelcome: mocks.acceptRivalWelcome,
  completeRivalProfile: mocks.completeRivalProfile,
  getRivalWelcomeState: mocks.getRivalWelcomeState,
  getMyMatch: mocks.getMyMatch,
  joinByInvite: mocks.joinByInvite,
  leaveMatch: mocks.leaveMatch,
  getBoardMatch: mocks.getBoardMatch,
  requestToJoin: mocks.requestToJoin,
  decideRequest: mocks.decideRequest,
  removeParticipant: mocks.removeParticipant,
  publishToBoard: mocks.publishToBoard,
  unpublishFromBoard: mocks.unpublishFromBoard,
  reportMatch: mocks.reportMatch,
  reportPlayer: mocks.reportPlayer,
  listUpcomingConfirmedBookings: mocks.listUpcomingConfirmedBookings,
}))

import {
  acceptRivalWelcomeAction,
  acceptWelcomeAndJoinAction,
  acceptWelcomeAndRequestAction,
  cancelMatchAction,
  createMatchAction,
  decideRequestAction,
  joinMatchAction,
  leaveMatchAction,
  publishToBoardAction,
  removeParticipantAction,
  reportMatchAction,
  reportPlayerAction,
  requestToJoinAction,
  unpublishFromBoardAction,
} from '@/app/(player)/rival/actions'
import { RivalError } from '@/modules/rival/rival.errors'

const TENANT = '11111111-1111-4111-8111-111111111111'
const MATCH = '22222222-2222-4222-8222-222222222222'
const CODE = 'ABCDEFGHJK'

const NOT_FOUND = 'No encontramos ese partido. Revisá el link con quien te lo pasó.'
const RATE_LIMITED = 'Hiciste muchos cambios seguidos. Esperá un momento y probá de nuevo.'
const GENERIC = 'Algo falló de nuestro lado. Probá de nuevo en unos segundos.'

/** Lo que el servidor lee de la bienvenida: por defecto, nada aceptado y sin perfil. */
function welcomeState(over: Record<string, unknown> = {}) {
  return {
    firstName: 'Lazaro',
    welcomed: false,
    position: null,
    zone: null,
    ...over,
  }
}

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
  mocks.getRivalWelcomeState.mockResolvedValue(welcomeState())
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  // Los tests de errores dejan rechazos persistentes: se vacían para que no se filtren al siguiente.
  mocks.requestToJoin.mockReset()
  mocks.leaveMatch.mockReset()
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
      expect(await createMatchAction({ success: true }, createForm())).toEqual({
        success: false,
        error: 'Ingresá a tu cuenta para seguir.',
        code: 'no_session',
      })
    }
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.createMatch).not.toHaveBeenCalled()
  })

  it('con el rate limit vencido corta antes de validar y de tocar el service', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    expect(await createMatchAction({ success: true }, createForm())).toEqual({
      success: false,
      error: RATE_LIMITED,
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

  it('"Mi equipo busca rival" va a ?creado=rival; un mode raro es "partido completo"', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: 'ABCDEFGHJK' })
    await expect(
      createMatchAction({ success: true }, createForm({ mode: 'rival', capacity: '5' })),
    ).rejects.toThrow('REDIRECT:/rival/p/ABCDEFGHJK?creado=rival')
    await expect(
      createMatchAction({ success: true }, createForm({ mode: 'otra-cosa' })),
    ).rejects.toThrow('REDIRECT:/rival/p/ABCDEFGHJK?creado=1')
  })

  it('el tablón ya no se arma acá: los campos de tablón no llegan al borrador', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: CODE })
    const f = createForm({ seeking: 'rival', whatsapp: '11 5555-1234', whatsappConsent: 'on' })
    await expect(createMatchAction(PREV, f)).rejects.toThrow('REDIRECT')
    const draft = mocks.createMatch.mock.calls[0]?.[1] as Record<string, unknown>
    expect(draft).not.toHaveProperty('board')
    expect(draft).toMatchObject({ format: 5, capacity: 10 })
  })

  it('un error de validación vuelve con el campo y no toca el service', async () => {
    const r = await createMatchAction({ success: true }, createForm({ courtDeclared: '' }))
    expect(r).toEqual({
      success: false,
      error: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      field: 'courtDeclared',
      fieldErrors: {
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })
    expect(mocks.createMatch).not.toHaveBeenCalled()
  })

  it('un envío vacío devuelve los errores de todos los campos juntos', async () => {
    const r = await createMatchAction(
      { success: true },
      createForm({ tenantId: '', time: '', courtDeclared: '', level: '' }),
    )
    expect(r).toMatchObject({
      success: false,
      field: 'tenantId',
      error: 'Elegí el complejo.',
      fieldErrors: {
        tenantId: 'Elegí el complejo.',
        startsAt: 'Elegí la hora.',
        level: expect.any(String),
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })
  })

  it('un error de dominio sale como texto humano, sin código técnico y sin ir a Sentry', async () => {
    mocks.createMatch.mockRejectedValue(new RivalError('rival_limit_active'))
    const r = await createMatchAction({ success: true }, createForm())
    expect(r).toEqual({
      success: false,
      error: 'Ya tenés 3 partidos armados. Cancelá uno o esperá a que se juegue para armar otro.',
      code: 'rival_limit_active',
    })
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('un fallo de infraestructura va a Sentry y sale genérico', async () => {
    mocks.createMatch.mockRejectedValue(new Error('connection reset'))
    const r = await createMatchAction({ success: true }, createForm())
    expect(r).toEqual({ success: false, error: GENERIC })
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
      error: NOT_FOUND,
    })
  })

  it('la bienvenida para armar pide solo el nombre: sin nombre vuelve con el campo', async () => {
    const f = new FormData()
    f.set('firstName', '   ')
    expect(await acceptRivalWelcomeAction({ success: true }, f)).toMatchObject({
      success: false,
      field: 'firstName',
      fieldErrors: { firstName: 'Ingresá tu nombre.' },
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
  })

  it('armar guarda el nombre y NO manda posición ni zona, aunque el form las traiga', async () => {
    mocks.acceptRivalWelcome.mockResolvedValue(undefined)
    expect(await acceptRivalWelcomeAction({ success: true }, welcomeForm())).toEqual({
      success: true,
    })
    expect(mocks.acceptRivalWelcome).toHaveBeenCalledWith('player-1', { firstName: 'Lazaro' })
    expect(mocks.getRivalWelcomeState).not.toHaveBeenCalled()
  })
})

describe('Voy, Estoy adentro y Me bajo', () => {
  it('con el flag apagado ninguna toca la sesión ni el service', async () => {
    mocks.isRivalEnabled.mockResolvedValue(false)
    const f = welcomeForm()
    f.set('code', CODE)
    const results = [
      await joinMatchAction(CODE),
      await acceptWelcomeAndJoinAction({ success: true }, f),
      await leaveMatchAction(MATCH),
    ]
    for (const r of results) expect(r).toMatchObject({ success: false })
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
    expect(mocks.leaveMatch).not.toHaveBeenCalled()
  })

  it('sin sesión de jugador no llegan al rate limit ni al service', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    expect(await joinMatchAction(CODE)).toEqual({
      success: false,
      error: 'Ingresá a tu cuenta para seguir.',
      code: 'no_session',
    })
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
  })

  it('con el rate limit vencido cortan antes del service', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    expect(await joinMatchAction(CODE)).toEqual({
      success: false,
      error: RATE_LIMITED,
    })
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
    expect(mocks.enforce).toHaveBeenCalledWith('rivalWrite', 'player-1')
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
    expect(mocks.leaveMatch).not.toHaveBeenCalled()
  })

  it('joinMatchAction suma con el jugador de la sesión y gasta el intento', async () => {
    mocks.joinByInvite.mockResolvedValue({ status: 'confirmed', joined: true })
    expect(await joinMatchAction(CODE)).toEqual({ success: true })
    expect(mocks.joinByInvite).toHaveBeenCalledWith('player-1', CODE)
    expect(mocks.clearRivalIntentCookie).toHaveBeenCalledTimes(1)
  })

  it('un código mal formado es "no encontrado" y no toca el service', async () => {
    expect(await joinMatchAction('abc')).toEqual({
      success: false,
      error: NOT_FOUND,
    })
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
  })

  it('un error de dominio sale como texto humano (y el intento se gasta igual)', async () => {
    mocks.joinByInvite.mockRejectedValue(new RivalError('rival_expired'))
    expect(await joinMatchAction(CODE)).toEqual({
      success: false,
      error: 'Este partido ya empezó, así que no admite cambios.',
    })
    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.clearRivalIntentCookie).toHaveBeenCalledTimes(1)
  })

  it('un fallo de infraestructura va a Sentry y sale genérico', async () => {
    mocks.joinByInvite.mockRejectedValue(new Error('connection reset'))
    expect(await joinMatchAction(CODE)).toMatchObject({ success: false, error: GENERIC })
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })

  it('"Estoy adentro" sin nada aceptado acepta la bienvenida (con perfil) y suma, en ese orden', async () => {
    mocks.acceptRivalWelcome.mockResolvedValue(undefined)
    mocks.joinByInvite.mockResolvedValue({ status: 'bench', joined: true })
    const f = welcomeForm()
    f.set('code', CODE)
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).toHaveBeenCalledWith('player-1', {
      firstName: 'Lazaro',
      position: 'any',
      zone: 'Luján',
    })
    expect(mocks.completeRivalProfile).not.toHaveBeenCalled()
    expect(mocks.acceptRivalWelcome.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.joinByInvite.mock.invocationCallOrder[0]!,
    )
    expect(mocks.joinByInvite).toHaveBeenCalledWith('player-1', CODE)
  })

  it('con las reglas aceptadas y sin perfil solo completa posición y zona: NO vuelve a consentir', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ welcomed: true }))
    mocks.joinByInvite.mockResolvedValue({ status: 'confirmed', joined: true })
    const f = welcomeForm()
    f.set('code', CODE)
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.completeRivalProfile).toHaveBeenCalledWith('player-1', {
      position: 'any',
      zone: 'Luján',
    })
    expect(mocks.completeRivalProfile.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.joinByInvite.mock.invocationCallOrder[0]!,
    )
  })

  it('reglas de una versión vieja con el perfil completo: re-acepta sin pedir ni pisar posición y zona', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ position: 'any', zone: 'Luján' }))
    mocks.joinByInvite.mockResolvedValue({ status: 'confirmed', joined: true })
    const f = new FormData()
    f.set('firstName', 'Lazaro')
    f.set('code', CODE)
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).toHaveBeenCalledWith('player-1', { firstName: 'Lazaro' })
  })

  it('con todo completo no escribe nada y suma (el servidor decide, no lo que mandó el cliente)', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(
      welcomeState({ welcomed: true, position: 'any', zone: 'Luján' }),
    )
    mocks.joinByInvite.mockResolvedValue({ status: 'confirmed', joined: true })
    const f = new FormData()
    f.set('code', CODE)
    f.set('zone', 'Marte') // basura: no se mira porque no falta nada
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.completeRivalProfile).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).toHaveBeenCalledWith('player-1', CODE)
  })

  it('"Estoy adentro" con zona inválida vuelve con el campo, no suma y no gasta el intento', async () => {
    const f = welcomeForm()
    f.set('code', CODE)
    f.set('zone', 'Marte')
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toMatchObject({
      success: false,
      field: 'zone',
      fieldErrors: { zone: expect.any(String) },
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
    expect(mocks.clearRivalIntentCookie).not.toHaveBeenCalled()
  })

  it('sin posición ni zona en el form vuelve con los dos campos a la vez', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ welcomed: true }))
    const f = new FormData()
    f.set('code', CODE)
    f.set('position', '')
    const r = await acceptWelcomeAndJoinAction({ success: true }, f)
    expect(r).toMatchObject({ success: false, field: 'position' })
    expect(r).toHaveProperty('fieldErrors.zone')
    expect(mocks.completeRivalProfile).not.toHaveBeenCalled()
  })

  it('leaveMatchAction baja con el jugador de la sesión; un id que no es uuid es "no encontrado"', async () => {
    mocks.leaveMatch.mockResolvedValue(undefined)
    expect(await leaveMatchAction(MATCH)).toEqual({ success: true })
    expect(mocks.leaveMatch).toHaveBeenCalledWith('player-1', MATCH)
    expect(await leaveMatchAction('no-es-uuid')).toEqual({
      success: false,
      error: NOT_FOUND,
    })
    mocks.leaveMatch.mockRejectedValue(new RivalError('rival_expired'))
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
  })
})

describe('un error de estado vencido refresca la vista; el resto no', () => {
  it.each([
    'rival_not_found',
    'rival_expired',
    'rival_canceled',
    'rival_full',
    'rival_forbidden_transition',
    'rival_not_on_board',
    'rival_hidden',
    'rival_captain_taken',
    'rival_welcome_required',
    'rival_profile_required',
  ] as const)('%s: el mensaje se mantiene y se revalida /rival', async (code) => {
    mocks.leaveMatch.mockRejectedValue(new RivalError(code))
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it.each([
    'rival_banned',
    'rival_limit_active',
    'rival_limit_requests',
    'rival_try_again',
  ] as const)('%s: no es estado vencido, no revalida', async (code) => {
    mocks.leaveMatch.mockRejectedValue(new RivalError(code))
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('un fallo de infraestructura tampoco revalida', async () => {
    mocks.leaveMatch.mockRejectedValue(new Error('boom'))
    await leaveMatchAction(MATCH)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('el tope de pedidos lleva su código para ofrecer la salida', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    mocks.getRivalWelcomeState.mockResolvedValue(
      welcomeState({ welcomed: true, position: 'any', zone: 'Luján' }),
    )
    mocks.requestToJoin.mockRejectedValue(new RivalError('rival_limit_requests'))
    expect(await requestToJoinAction(MATCH)).toMatchObject({ code: 'rival_limit_requests' })
  })
})

// ─── Tablón (PR4) ───────────────────────────────────────────────────────

const PARTICIPANT = '33333333-3333-4333-8333-333333333333'
const OTHER_PLAYER = '44444444-4444-4444-8444-444444444444'
const PREV = { success: true } as const

function boardForm(over: Record<string, string> = {}): FormData {
  const f = new FormData()
  const base: Record<string, string> = {
    matchId: MATCH,
    seeking: 'players',
    seekingPosition: 'goalkeeper',
    whatsapp: '11 5555-1234',
    whatsappConsent: 'on',
    ...over,
  }
  for (const [k, v] of Object.entries(base)) if (v !== '') f.set(k, v)
  return f
}

describe('acciones del tablón: flag, sesión y rate limit antes que nada', () => {
  const calls: [string, () => Promise<unknown>, string][] = [
    ['requestToJoinAction', () => requestToJoinAction(MATCH), 'rivalWrite'],
    [
      'acceptWelcomeAndRequestAction',
      () => {
        const f = welcomeForm()
        f.set('matchId', MATCH)
        return acceptWelcomeAndRequestAction(PREV, f)
      },
      'rivalWrite',
    ],
    ['decideRequestAction', () => decideRequestAction(PARTICIPANT, 'accept'), 'rivalWrite'],
    ['removeParticipantAction', () => removeParticipantAction(PARTICIPANT), 'rivalWrite'],
    ['publishToBoardAction', () => publishToBoardAction(PREV, boardForm()), 'rivalWrite'],
    ['unpublishFromBoardAction', () => unpublishFromBoardAction(MATCH), 'rivalWrite'],
    ['reportMatchAction', () => reportMatchAction(MATCH, 'spam'), 'rivalReport'],
    ['reportPlayerAction', () => reportPlayerAction(MATCH, OTHER_PLAYER, 'minor'), 'rivalReport'],
  ]
  const serviceMocks = [
    mocks.getBoardMatch,
    mocks.requestToJoin,
    mocks.decideRequest,
    mocks.removeParticipant,
    mocks.publishToBoard,
    mocks.unpublishFromBoard,
    mocks.reportMatch,
    mocks.reportPlayer,
    mocks.acceptRivalWelcome,
    mocks.completeRivalProfile,
  ]

  it.each(calls)(
    '%s: flag apagado, sin sesión y rate limit cortan antes del service',
    async (_n, call, policy) => {
      mocks.isRivalEnabled.mockResolvedValue(false)
      expect(await call()).toMatchObject({ success: false })
      expect(mocks.extractAuthUser).not.toHaveBeenCalled()
      mocks.isRivalEnabled.mockResolvedValue(true)

      mocks.extractAuthUser.mockResolvedValue(null)
      expect(await call()).toMatchObject({
        success: false,
        error: 'Ingresá a tu cuenta para seguir.',
      })
      expect(mocks.enforce).not.toHaveBeenCalled()
      mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'player-1' })

      mocks.enforce.mockResolvedValue({ ok: false })
      expect(await call()).toEqual({ success: false, error: RATE_LIMITED })
      expect(mocks.enforce).toHaveBeenCalledWith(policy, 'player-1')
      for (const m of serviceMocks) expect(m).not.toHaveBeenCalled()
    },
  )
})

describe('requestToJoinAction y acceptWelcomeAndRequestAction', () => {
  it('pide con el complejo que sale de la tarjeta publicada', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    mocks.requestToJoin.mockResolvedValue({ participantId: PARTICIPANT })
    expect(await requestToJoinAction(MATCH)).toEqual({ success: true })
    expect(mocks.getBoardMatch).toHaveBeenCalledWith(MATCH)
    expect(mocks.requestToJoin).toHaveBeenCalledWith('player-1', {
      matchId: MATCH,
      tenantId: TENANT,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('un id inválido o una tarjeta que ya no está es "no encontrado"', async () => {
    const notFound = { success: false, error: NOT_FOUND }
    expect(await requestToJoinAction('no-es-uuid')).toEqual(notFound)
    mocks.getBoardMatch.mockResolvedValue(null)
    expect(await requestToJoinAction(MATCH)).toEqual(notFound)
    expect(mocks.requestToJoin).not.toHaveBeenCalled()
  })

  it('el ban sale con el texto exacto y el tope de 5 con el suyo', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    mocks.requestToJoin.mockRejectedValueOnce(new RivalError('rival_banned'))
    expect(await requestToJoinAction(MATCH)).toEqual({
      success: false,
      error: 'No podés sumarte a partidos en este complejo.',
    })
    mocks.requestToJoin.mockRejectedValueOnce(new RivalError('rival_limit_requests'))
    expect(await requestToJoinAction(MATCH)).toMatchObject({
      error: expect.stringMatching(/5 pedidos/),
    })
  })

  it('un pedido repetido tras una respuesta perdida es éxito si el pedido ya está; rechazado o bajado, no', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    mocks.requestToJoin.mockRejectedValue(new RivalError('rival_already_participant'))
    for (const myStatus of ['requested', 'confirmed', 'bench']) {
      mocks.getMyMatch.mockResolvedValueOnce({ myStatus })
      expect(await requestToJoinAction(MATCH)).toEqual({ success: true })
    }
    for (const myStatus of ['declined', 'left', 'removed', null]) {
      mocks.getMyMatch.mockResolvedValueOnce({ myStatus })
      expect(await requestToJoinAction(MATCH)).toMatchObject({
        success: false,
        error: 'Ya estás en este partido.',
      })
    }
    mocks.getMyMatch.mockResolvedValueOnce(null)
    expect(await requestToJoinAction(MATCH)).toMatchObject({ success: false })
  })

  it('bienvenida + pedido: acepta, pide con el tenant de la tarjeta y refresca', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    const f = welcomeForm()
    f.set('matchId', MATCH)
    expect(await acceptWelcomeAndRequestAction(PREV, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).toHaveBeenCalledWith('player-1', {
      firstName: 'Lazaro',
      position: 'any',
      zone: 'Luján',
    })
    expect(mocks.requestToJoin).toHaveBeenCalledWith('player-1', {
      matchId: MATCH,
      tenantId: TENANT,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('bienvenida inválida o sin matchId válido no toca el service', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    const bad = welcomeForm()
    bad.set('zone', 'Marte')
    bad.set('matchId', MATCH)
    expect(await acceptWelcomeAndRequestAction(PREV, bad)).toMatchObject({
      success: false,
      field: 'zone',
    })
    const noMatch = welcomeForm()
    noMatch.set('matchId', 'x')
    expect(await acceptWelcomeAndRequestAction(PREV, noMatch)).toMatchObject({
      success: false,
      error: NOT_FOUND,
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.requestToJoin).not.toHaveBeenCalled()
  })

  it('con las reglas aceptadas y sin perfil completa posición y zona y pide, sin re-consentir', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ welcomed: true }))
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    const f = welcomeForm()
    f.set('matchId', MATCH)
    expect(await acceptWelcomeAndRequestAction(PREV, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.completeRivalProfile).toHaveBeenCalledWith('player-1', {
      position: 'any',
      zone: 'Luján',
    })
    expect(mocks.requestToJoin).toHaveBeenCalledTimes(1)
  })

  it('partido que busca rival: el capitán pide con solo la zona, sin pisar la posición', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ welcomed: true }))
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT, seeking: 'rival' })
    const f = new FormData()
    f.set('zone', 'Luján')
    f.set('matchId', MATCH)
    expect(await acceptWelcomeAndRequestAction(PREV, f)).toEqual({ success: true })
    expect(mocks.completeRivalProfile).toHaveBeenCalledWith('player-1', { zone: 'Luján' })
    expect(mocks.requestToJoin).toHaveBeenCalledTimes(1)
  })

  it('el propósito sale del partido, no del form: un partido de jugadores sigue exigiendo posición', async () => {
    mocks.getRivalWelcomeState.mockResolvedValue(welcomeState({ welcomed: true }))
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT, seeking: 'players' })
    const f = new FormData()
    f.set('zone', 'Luján')
    f.set('matchId', MATCH)
    f.set('position', '')
    f.set('purpose', 'desafiar')
    expect(await acceptWelcomeAndRequestAction(PREV, f)).toMatchObject({
      success: false,
      field: 'position',
    })
    expect(mocks.completeRivalProfile).not.toHaveBeenCalled()
    expect(mocks.requestToJoin).not.toHaveBeenCalled()
  })
})

describe('decideRequestAction y removeParticipantAction', () => {
  it('deciden con el jugador de la sesión como organizador', async () => {
    expect(await decideRequestAction(PARTICIPANT, 'accept')).toEqual({ success: true })
    expect(mocks.decideRequest).toHaveBeenCalledWith('player-1', PARTICIPANT, 'accept')
    expect(await decideRequestAction(PARTICIPANT, 'decline')).toEqual({ success: true })
    expect(mocks.decideRequest).toHaveBeenLastCalledWith('player-1', PARTICIPANT, 'decline')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
    mocks.revalidatePath.mockClear() // lo de abajo lo tiene que probar `removeParticipantAction` solo
    expect(await removeParticipantAction(PARTICIPANT)).toEqual({ success: true })
    expect(mocks.removeParticipant).toHaveBeenCalledWith('player-1', PARTICIPANT)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('ids inválidos son "no encontrado"; aceptar sin lugar y capitán tomado salen en español', async () => {
    expect(await decideRequestAction('x', 'accept')).toMatchObject({ success: false })
    expect(await removeParticipantAction('x')).toMatchObject({ success: false })
    expect(mocks.decideRequest).not.toHaveBeenCalled()
    mocks.decideRequest.mockRejectedValueOnce(new RivalError('rival_full'))
    expect(await decideRequestAction(PARTICIPANT, 'accept')).toMatchObject({
      error: expect.stringMatching(/^No queda lugar/),
    })
    mocks.decideRequest.mockRejectedValueOnce(new RivalError('rival_captain_taken'))
    expect(await decideRequestAction(PARTICIPANT, 'accept')).toMatchObject({
      error: 'Ya hay un equipo rival confirmado para este partido.',
    })
  })
})

describe('publishToBoardAction', () => {
  it('publica con el borrador del form (WhatsApp normalizado) y refresca', async () => {
    expect(await publishToBoardAction(PREV, boardForm())).toEqual({ success: true })
    expect(mocks.publishToBoard).toHaveBeenCalledWith('player-1', MATCH, {
      seeking: 'players',
      seekingPosition: 'goalkeeper',
      whatsappDigits: '5491155551234',
      savePhone: false,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('"Guardar este número en mi cuenta" viaja aparte del consentimiento y es opt-in', async () => {
    await publishToBoardAction(PREV, boardForm({ savePhone: 'on' }))
    expect(mocks.publishToBoard).toHaveBeenLastCalledWith(
      'player-1',
      MATCH,
      expect.objectContaining({ savePhone: true }),
    )
    // Sin la casilla de consentimiento no publica, aunque pida guardar el número.
    mocks.publishToBoard.mockClear()
    expect(
      await publishToBoardAction(PREV, boardForm({ savePhone: 'on', whatsappConsent: '' })),
    ).toMatchObject({ success: false, field: 'whatsappConsent' })
    expect(mocks.publishToBoard).not.toHaveBeenCalled()
  })

  it('buscando rival no manda posición, aunque el form la traiga', async () => {
    await publishToBoardAction(PREV, boardForm({ seeking: 'rival' }))
    expect(mocks.publishToBoard).toHaveBeenCalledWith('player-1', MATCH, {
      seeking: 'rival',
      seekingPosition: null,
      whatsappDigits: '5491155551234',
      savePhone: false,
    })
  })

  it('los errores llevan el nombre del campo del form y no tocan el service', async () => {
    expect(await publishToBoardAction(PREV, boardForm({ seeking: '' }))).toMatchObject({
      success: false,
      field: 'seeking',
    })
    expect(await publishToBoardAction(PREV, boardForm({ whatsapp: '123' }))).toMatchObject({
      success: false,
      field: 'whatsapp',
    })
    expect(await publishToBoardAction(PREV, boardForm({ whatsappConsent: '' }))).toMatchObject({
      success: false,
      field: 'whatsappConsent',
    })
    expect(await publishToBoardAction(PREV, boardForm({ matchId: 'x' }))).toMatchObject({
      success: false,
      error: NOT_FOUND,
    })
    expect(mocks.publishToBoard).not.toHaveBeenCalled()
  })

  it('un envío vacío devuelve los errores de los tres campos juntos', async () => {
    const r = await publishToBoardAction(
      PREV,
      boardForm({ seeking: '', whatsapp: '', whatsappConsent: '' }),
    )
    expect(r).toMatchObject({
      success: false,
      field: 'seeking',
      fieldErrors: {
        seeking: 'Elegí si buscás jugadores o rival.',
        whatsapp: 'Ingresá tu WhatsApp.',
        whatsappConsent: 'Marcá la casilla para publicar: tu WhatsApp lo ve solo quien aceptes.',
      },
    })
  })

  it('unpublishFromBoardAction saca el partido propio; id inválido es "no encontrado"', async () => {
    expect(await unpublishFromBoardAction(MATCH)).toEqual({ success: true })
    expect(mocks.unpublishFromBoard).toHaveBeenCalledWith('player-1', MATCH)
    expect(await unpublishFromBoardAction('x')).toMatchObject({ success: false })
  })
})

describe('reportMatchAction y reportPlayerAction', () => {
  it('denuncian con el jugador de la sesión', async () => {
    expect(await reportMatchAction(MATCH, 'spam')).toEqual({ success: true })
    expect(mocks.reportMatch).toHaveBeenCalledWith('player-1', MATCH, 'spam')
    expect(await reportPlayerAction(MATCH, OTHER_PLAYER, 'minor')).toEqual({ success: true })
    expect(mocks.reportPlayer).toHaveBeenCalledWith('player-1', MATCH, OTHER_PLAYER, 'minor')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('ids o motivo inválidos no llegan al service', async () => {
    expect(await reportMatchAction('x', 'spam')).toMatchObject({ success: false })
    expect(await reportMatchAction(MATCH, 'otro' as never)).toMatchObject({ success: false })
    expect(await reportPlayerAction(MATCH, 'x', 'spam')).toMatchObject({ success: false })
    expect(mocks.reportMatch).not.toHaveBeenCalled()
    expect(mocks.reportPlayer).not.toHaveBeenCalled()
  })

  it('la denuncia repetida (respuesta perdida y reintento) es éxito: ya había entrado', async () => {
    mocks.reportMatch.mockRejectedValueOnce(new RivalError('rival_already_reported'))
    expect(await reportMatchAction(MATCH, 'spam')).toEqual({ success: true })
    mocks.reportPlayer.mockRejectedValueOnce(new RivalError('rival_already_reported'))
    expect(await reportPlayerAction(MATCH, OTHER_PLAYER, 'minor')).toEqual({ success: true })
    expect(mocks.captureException).not.toHaveBeenCalled()
  })
})
