import { beforeEach, describe, expect, it, vi } from 'vitest'

// La entrada de `/rival/partido/[id]`: uuid inválido, organizador y quien no participa.
const ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => true),
  extractAuthUser: vi.fn(async (): Promise<unknown> => null),
  getBoardMatch: vi.fn(),
  getMyMatch: vi.fn(),
  getRoster: vi.fn(),
  getContactLink: vi.fn(),
  getRivalWelcomeState: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/modules/rival/rival.service', () => ({
  getBoardMatch: mocks.getBoardMatch,
  getMyMatch: mocks.getMyMatch,
  getRoster: mocks.getRoster,
  getContactLink: mocks.getContactLink,
  getRivalWelcomeState: mocks.getRivalWelcomeState,
}))
vi.mock('@/app/(player)/rival/actions', () => ({
  leaveMatchAction: vi.fn(),
  requestToJoinAction: vi.fn(),
  acceptWelcomeAndRequestAction: vi.fn(),
  reportMatchAction: vi.fn(),
  reportPlayerAction: vi.fn(),
}))

import RivalBoardMatchPage from '@/app/(player)/rival/partido/[id]/page'

const run = (id = ID) => RivalBoardMatchPage({ params: Promise.resolve({ id }) })
const player = { type: 'player', playerId: 'p1', email: 'a@b.c' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(true)
  mocks.extractAuthUser.mockResolvedValue(null)
  mocks.getMyMatch.mockResolvedValue(null)
  mocks.getBoardMatch.mockResolvedValue(null)
})

describe('/rival/partido/[id]', () => {
  it('un id que no es uuid es 404 sin tocar nada', async () => {
    await expect(run('no-es-un-uuid')).rejects.toThrow('NOT_FOUND')
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
    expect(mocks.getBoardMatch).not.toHaveBeenCalled()
  })

  it('el organizador va a su vista por código', async () => {
    mocks.extractAuthUser.mockResolvedValue(player)
    mocks.getMyMatch.mockResolvedValue({ id: ID, isOrganizer: true, inviteCode: 'ABCDEFGHJK' })
    await expect(run()).rejects.toThrow('REDIRECT:/rival/p/ABCDEFGHJK')
  })

  it('sin sesión, un partido que no está en el tablón es 404 (y no mira "mis partidos")', async () => {
    await expect(run()).rejects.toThrow('NOT_FOUND')
    expect(mocks.getMyMatch).not.toHaveBeenCalled()
    expect(mocks.getBoardMatch).toHaveBeenCalledWith(ID)
  })

  it('con sesión y sin participar, cae en el tablón y 404 si no está', async () => {
    mocks.extractAuthUser.mockResolvedValue(player)
    await expect(run()).rejects.toThrow('NOT_FOUND')
    expect(mocks.getMyMatch).toHaveBeenCalledWith('p1', ID)
    expect(mocks.getBoardMatch).toHaveBeenCalledWith(ID)
  })

  it('el participante (cualquier estado) no pasa por el tablón', async () => {
    mocks.extractAuthUser.mockResolvedValue(player)
    mocks.getMyMatch.mockResolvedValue({
      id: ID,
      isOrganizer: false,
      inviteCode: null,
      myStatus: 'declined',
      myOrigin: 'board',
    })
    mocks.getRoster.mockResolvedValue([])
    await run()
    expect(mocks.getBoardMatch).not.toHaveBeenCalled()
    // El contacto es solo del aceptado desde el tablón.
    expect(mocks.getContactLink).not.toHaveBeenCalled()
  })
})
