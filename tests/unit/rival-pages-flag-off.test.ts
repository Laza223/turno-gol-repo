import { beforeEach, describe, expect, it, vi } from 'vitest'

// Con el flag `rival` apagado, las 5 páginas son 404 ANTES de mirar sesión o tocar el service.
const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => false),
  extractAuthUser: vi.fn(async (): Promise<unknown> => null),
  listBoard: vi.fn(),
  getPublicMatch: vi.fn(),
  getBoardMatch: vi.fn(),
  getMyMatch: vi.fn(),
  listBoardTenants: vi.fn(),
  getBoardPublishPrefill: vi.fn(),
  getRoster: vi.fn(),
  listMyMatches: vi.fn(),
  getRivalWelcomeState: vi.fn(),
  listEligibleTenants: vi.fn(),
  listUpcomingConfirmedBookings: vi.fn(),
  peekAlertUnsub: vi.fn(),
}))

// next/font solo existe en el build de Next: la landing carga su Archivo propia.
vi.mock('next/font/google', () => ({ Archivo: () => ({ variable: 'font-archivo' }) }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`PERMANENT:${url}`)
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.isRivalEnabled }))
vi.mock('@/modules/rival/rival.service', () => ({
  listBoard: mocks.listBoard,
  getPublicMatch: mocks.getPublicMatch,
  getBoardMatch: mocks.getBoardMatch,
  getMyMatch: mocks.getMyMatch,
  listBoardTenants: mocks.listBoardTenants,
  getBoardPublishPrefill: mocks.getBoardPublishPrefill,
  getContactLink: vi.fn(),
  getRoster: mocks.getRoster,
  listMyMatches: mocks.listMyMatches,
  getRivalWelcomeState: mocks.getRivalWelcomeState,
  listEligibleTenants: mocks.listEligibleTenants,
  listUpcomingConfirmedBookings: mocks.listUpcomingConfirmedBookings,
}))
vi.mock('@/modules/rival/rival-alerts.service', () => ({ peekAlertUnsub: mocks.peekAlertUnsub }))
vi.mock('@/app/(player)/rival/actions', () => ({
  acceptRivalWelcomeAction: vi.fn(),
  createMatchAction: vi.fn(),
  cancelMatchAction: vi.fn(),
  leaveMatchAction: vi.fn(),
  requestToJoinAction: vi.fn(),
  acceptWelcomeAndRequestAction: vi.fn(),
  reportMatchAction: vi.fn(),
  reportPlayerAction: vi.fn(),
  subscribeRivalAlertAction: vi.fn(),
  unsubscribeRivalAlertAction: vi.fn(),
}))

import RivalPage from '@/app/(player)/rival/page'
import RivalBoardPage from '@/app/(player)/rival/tablon/page'
import MisPartidosPage from '@/app/(player)/rival/mis-partidos/page'
import NuevoPartidoPage from '@/app/(player)/rival/nuevo/page'
import RivalMatchPage from '@/app/(player)/rival/p/[code]/page'
import RivalBoardMatchPage from '@/app/(player)/rival/partido/[id]/page'
import BajaPage from '@/app/(player)/rival/baja/page'

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ['/rival', () => RivalPage({ searchParams: Promise.resolve({}) })],
  ['/rival/tablon', () => RivalBoardPage({ searchParams: Promise.resolve({}) })],
  ['/rival/nuevo', () => NuevoPartidoPage({ searchParams: Promise.resolve({}) })],
  ['/rival/mis-partidos', () => MisPartidosPage()],
  [
    '/rival/p/[code]',
    () =>
      RivalMatchPage({
        params: Promise.resolve({ code: 'ABC234' }),
        searchParams: Promise.resolve({}),
      }),
  ],
  [
    '/rival/partido/[id]',
    () =>
      RivalBoardMatchPage({
        params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
      }),
  ],
  ['/rival/baja', () => BajaPage({ searchParams: Promise.resolve({ t: 'tok.sig' }) })],
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isRivalEnabled.mockResolvedValue(false)
})

describe('RIVAL con el flag apagado', () => {
  it.each(PAGES)('%s -> notFound, sin sesión ni lecturas', async (_ruta, run) => {
    await expect(run()).rejects.toThrow('NOT_FOUND')
    expect(mocks.extractAuthUser).not.toHaveBeenCalled()
    for (const read of [
      mocks.listBoard,
      mocks.getPublicMatch,
      mocks.getBoardMatch,
      mocks.getMyMatch,
      mocks.listBoardTenants,
      mocks.getBoardPublishPrefill,
      mocks.getRoster,
      mocks.listMyMatches,
      mocks.getRivalWelcomeState,
      mocks.listEligibleTenants,
      mocks.listUpcomingConfirmedBookings,
      mocks.peekAlertUnsub,
    ]) {
      expect(read).not.toHaveBeenCalled()
    }
  })
})
