import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rival: vi.fn<() => Promise<boolean>>(),
  session: vi.fn(),
  user: vi.fn(),
  withPlayerContext: vi.fn(),
  welcome: vi.fn(),
}))

vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.rival }))
vi.mock('@/modules/rival/rival.service', () => ({ getRivalWelcomeState: mocks.welcome }))
vi.mock('@/modules/players/portal-session', () => ({ getPortalSession: mocks.session }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.user }))
vi.mock('@/shared/db/client', () => ({ withPlayerContext: mocks.withPlayerContext }))

import { GET } from '@/app/api/player/session/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue(null)
  mocks.session.mockResolvedValue(null)
  mocks.withPlayerContext.mockResolvedValue([])
  mocks.welcome.mockResolvedValue({ welcomed: true })
})

describe('GET /api/player/session — rivalEnabled', () => {
  it.each([true, false])('anónimo con el flag en %s: lo informa y no se cachea', async (flag) => {
    mocks.rival.mockResolvedValue(flag)
    const res = await GET()
    const json = (await res.json()) as { data: { rivalEnabled: boolean; session: unknown } }
    expect(json.data.rivalEnabled).toBe(flag)
    expect(json.data.session).toBeNull()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('con sesión de jugador también lo informa', async () => {
    mocks.rival.mockResolvedValue(true)
    mocks.session.mockResolvedValue({ playerId: 'p1' })
    const res = await GET()
    const json = (await res.json()) as { data: { rivalEnabled: boolean } }
    expect(json.data.rivalEnabled).toBe(true)
  })

  it('si leer el flag falla, queda apagado (fail-closed) y la sesión sigue', async () => {
    mocks.rival.mockRejectedValue(new Error('db'))
    const res = await GET()
    const json = (await res.json()) as { data: { rivalEnabled: boolean } }
    expect(res.status).toBe(200)
    expect(json.data.rivalEnabled).toBe(false)
  })
})

describe('GET /api/player/session — rivalWelcomed', () => {
  type Body = { data: { rivalWelcomed: boolean } }
  const call = async () => ((await (await GET()).json()) as Body).data.rivalWelcomed

  it('con sesión y flag prendido refleja la bienvenida aceptada', async () => {
    mocks.rival.mockResolvedValue(true)
    mocks.session.mockResolvedValue({ playerId: 'p1' })
    expect(await call()).toBe(true)
    expect(mocks.welcome).toHaveBeenCalledWith('p1')
    mocks.welcome.mockResolvedValue({ welcomed: false })
    expect(await call()).toBe(false)
  })

  it('sin sesión o con el flag apagado es false y ni consulta', async () => {
    mocks.rival.mockResolvedValue(true)
    expect(await call()).toBe(false)
    mocks.rival.mockResolvedValue(false)
    mocks.session.mockResolvedValue({ playerId: 'p1' })
    expect(await call()).toBe(false)
    expect(mocks.welcome).not.toHaveBeenCalled()
  })

  it('si la consulta falla, es false', async () => {
    mocks.rival.mockResolvedValue(true)
    mocks.session.mockResolvedValue({ playerId: 'p1' })
    mocks.welcome.mockRejectedValue(new Error('db'))
    expect(await call()).toBe(false)
  })
})
