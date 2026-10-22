import { beforeEach, describe, expect, it, vi } from 'vitest'

// Con el flag `rival` apagado, las 4 páginas son 404 ANTES de mirar sesión o tocar el service.
const mocks = vi.hoisted(() => ({
  isRivalEnabled: vi.fn(async () => false),
  extractAuthUser: vi.fn(async (): Promise<unknown> => null),
  listBoard: vi.fn(),
  getPublicMatch: vi.fn(),
  getRoster: vi.fn(),
  listMyMatches: vi.fn(),
  getRivalWelcomeState: vi.fn(),
  listEligibleTenants: vi.fn(),
  listUpcomingConfirmedBookings: vi.fn(),
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
  listBoard: mocks.listBoard,
  getPublicMatch: mocks.getPublicMatch,
  getRoster: mocks.getRoster,
  listMyMatches: mocks.listMyMatches,
  getRivalWelcomeState: mocks.getRivalWelcomeState,
  listEligibleTenants: mocks.listEligibleTenants,
  listUpcomingConfirmedBookings: mocks.listUpcomingConfirmedBookings,
}))
vi.mock('@/app/(player)/rival/actions', () => ({
  acceptRivalWelcomeAction: vi.fn(),
  createMatchAction: vi.fn(),
  cancelMatchAction: vi.fn(),
}))

import RivalPage from '@/app/(player)/rival/page'
import MisPartidosPage from '@/app/(player)/rival/mis-partidos/page'
import NuevoPartidoPage from '@/app/(player)/rival/nuevo/page'
import RivalMatchPage from '@/app/(player)/rival/p/[code]/page'

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ['/rival', () => RivalPage({ searchParams: Promise.resolve({}) })],
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
      mocks.getRoster,
      mocks.listMyMatches,
      mocks.getRivalWelcomeState,
      mocks.listEligibleTenants,
      mocks.listUpcomingConfirmedBookings,
    ]) {
      expect(read).not.toHaveBeenCalled()
    }
  })
})
