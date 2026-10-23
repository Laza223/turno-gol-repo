import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => ({ type: 'player', playerId: 'player-1' })),
  enforce: vi.fn(async () => ({ ok: true })),
  createMatch: vi.fn(),
  cancelMatch: vi.fn(),
  acceptRivalWelcome: vi.fn(),
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
    })
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
  })

  it('con el rate limit vencido cortan antes del service', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    expect(await joinMatchAction(CODE)).toEqual({
      success: false,
      error: 'Demasiadas solicitudes. Esperá un momento.',
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
      error: 'No encontramos ese partido.',
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
    expect(await joinMatchAction(CODE)).toMatchObject({
      success: false,
      error: 'No pudimos completar la acción. Probá de nuevo en unos segundos.',
    })
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
  })

  it('"Estoy adentro" acepta la bienvenida y suma, en ese orden', async () => {
    mocks.acceptRivalWelcome.mockResolvedValue(undefined)
    mocks.joinByInvite.mockResolvedValue({ status: 'bench', joined: true })
    const f = welcomeForm()
    f.set('code', CODE)
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.joinByInvite.mock.invocationCallOrder[0]!,
    )
    expect(mocks.joinByInvite).toHaveBeenCalledWith('player-1', CODE)
  })

  it('"Estoy adentro" con zona inválida vuelve con el campo y no suma', async () => {
    const f = welcomeForm()
    f.set('code', CODE)
    f.set('zone', 'Marte')
    expect(await acceptWelcomeAndJoinAction({ success: true }, f)).toMatchObject({
      success: false,
      field: 'zone',
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
    expect(mocks.joinByInvite).not.toHaveBeenCalled()
  })

  it('leaveMatchAction baja con el jugador de la sesión; un id que no es uuid es "no encontrado"', async () => {
    mocks.leaveMatch.mockResolvedValue(undefined)
    expect(await leaveMatchAction(MATCH)).toEqual({ success: true })
    expect(mocks.leaveMatch).toHaveBeenCalledWith('player-1', MATCH)
    expect(await leaveMatchAction('no-es-uuid')).toEqual({
      success: false,
      error: 'No encontramos ese partido.',
    })
    mocks.leaveMatch.mockRejectedValue(new RivalError('rival_expired'))
    expect(await leaveMatchAction(MATCH)).toMatchObject({ success: false })
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
      expect(await call()).toEqual({
        success: false,
        error: 'Demasiadas solicitudes. Esperá un momento.',
      })
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
    const notFound = { success: false, error: 'No encontramos ese partido.' }
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

  it('bienvenida + pedido: acepta, pide con el tenant de la tarjeta y refresca', async () => {
    mocks.getBoardMatch.mockResolvedValue({ id: MATCH, tenantId: TENANT })
    const f = welcomeForm()
    f.set('matchId', MATCH)
    expect(await acceptWelcomeAndRequestAction(PREV, f)).toEqual({ success: true })
    expect(mocks.acceptRivalWelcome).toHaveBeenCalledWith('player-1', expect.any(Object))
    expect(mocks.requestToJoin).toHaveBeenCalledWith('player-1', {
      matchId: MATCH,
      tenantId: TENANT,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('bienvenida inválida o sin matchId válido no toca el service', async () => {
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
      error: 'No encontramos ese partido.',
    })
    expect(mocks.acceptRivalWelcome).not.toHaveBeenCalled()
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
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/rival', 'layout')
  })

  it('buscando rival no manda posición, aunque el form la traiga', async () => {
    await publishToBoardAction(PREV, boardForm({ seeking: 'rival' }))
    expect(mocks.publishToBoard).toHaveBeenCalledWith('player-1', MATCH, {
      seeking: 'rival',
      seekingPosition: null,
      whatsappDigits: '5491155551234',
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
      error: 'No encontramos ese partido.',
    })
    expect(mocks.publishToBoard).not.toHaveBeenCalled()
  })

  it('unpublishFromBoardAction saca el partido propio; id inválido es "no encontrado"', async () => {
    expect(await unpublishFromBoardAction(MATCH)).toEqual({ success: true })
    expect(mocks.unpublishFromBoard).toHaveBeenCalledWith('player-1', MATCH)
    expect(await unpublishFromBoardAction('x')).toMatchObject({ success: false })
  })
})

describe('createMatchAction con tablón', () => {
  it('sin seeking, con off o vacío: solo el grupo (board null)', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: CODE })
    for (const seeking of [undefined, 'off', '']) {
      const f = createForm()
      if (seeking !== undefined) f.set('seeking', seeking)
      await expect(createMatchAction(PREV, f)).rejects.toThrow('REDIRECT')
    }
    expect(mocks.createMatch).toHaveBeenCalledTimes(3)
    for (const call of mocks.createMatch.mock.calls) {
      expect((call[1] as { board: unknown }).board).toBeNull()
    }
  })

  it('con rival: la capacidad es el formato y el tablón lleva el WhatsApp normalizado', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: CODE })
    const f = createForm({ seeking: 'rival', whatsapp: '11 5555-1234', whatsappConsent: 'on' })
    await expect(createMatchAction(PREV, f)).rejects.toThrow('REDIRECT')
    expect(mocks.createMatch.mock.calls[0]?.[1]).toMatchObject({
      format: 5,
      capacity: 5,
      board: { seeking: 'rival', seekingPosition: null, whatsappDigits: '5491155551234' },
    })
  })

  it('con jugadores: posición elegida; sin consentimiento vuelve con el campo del tablón', async () => {
    mocks.createMatch.mockResolvedValue({ id: MATCH, inviteCode: CODE })
    const ok = createForm({
      seeking: 'players',
      seekingPosition: 'goalkeeper',
      whatsapp: '11 5555-1234',
      whatsappConsent: 'on',
    })
    await expect(createMatchAction(PREV, ok)).rejects.toThrow('REDIRECT')
    expect(mocks.createMatch.mock.calls[0]?.[1]).toMatchObject({
      board: { seeking: 'players', seekingPosition: 'goalkeeper' },
    })

    const noConsent = createForm({ seeking: 'players', whatsapp: '11 5555-1234' })
    expect(await createMatchAction(PREV, noConsent)).toMatchObject({
      success: false,
      field: 'whatsappConsent',
    })
    expect(mocks.createMatch).toHaveBeenCalledTimes(1)
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

  it('la denuncia repetida dice "Ya lo denunciaste."', async () => {
    mocks.reportMatch.mockRejectedValueOnce(new RivalError('rival_already_reported'))
    expect(await reportMatchAction(MATCH, 'spam')).toEqual({
      success: false,
      error: 'Ya lo denunciaste.',
    })
  })
})
