import { beforeEach, describe, expect, it, vi } from 'vitest'

// Panel /super-admin/rival: la página y las 3 acciones de moderación quedan detrás del
// guard REAL (triple chequeo); acá se mockea solo la sesión y los servicios para probar
// que, sin ser system admin, el servicio nunca se llama.

const h = vi.hoisted(() => {
  const state = { dbRows: [] as Array<Record<string, unknown>> }
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.dbRows }) }) }),
  }
  return { state, tx }
})

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractRealAuthUser: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withSystemAdminContext: vi.fn() }))
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: vi.fn() }))
vi.mock('@/modules/super-admin/rival-monitor.service', () => ({
  getRivalMonitor: vi.fn(async () => ({})),
  listRivalReports: vi.fn(async () => []),
}))
vi.mock('@/modules/super-admin/rival-moderation.service', () => ({
  hideMatch: vi.fn(async () => undefined),
  restoreMatch: vi.fn(async () => undefined),
  removePlayerAvatar: vi.fn(async () => undefined),
}))

import { extractRealAuthUser } from '@/modules/auth/auth.middleware'
import { withSystemAdminContext } from '@/shared/db/client'
import { enforce } from '@/shared/rate-limit/apply'
import { getRivalMonitor, listRivalReports } from '@/modules/super-admin/rival-monitor.service'
import {
  hideMatch,
  removePlayerAvatar,
  restoreMatch,
} from '@/modules/super-admin/rival-moderation.service'
import SuperAdminRivalPage from '@/app/(super-admin)/super-admin/rival/page'
import {
  hideRivalMatchAction,
  removeRivalAvatarAction,
  restoreRivalMatchAction,
} from '@/app/(super-admin)/super-admin/rival/actions'

const UUID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b'
const UUID2 = '4a3c9d2f-6e5b-4c70-8b8f-2d3e4f5a6b7c'

const SYSTEM_ADMIN_USER = {
  type: 'system_admin' as const,
  id: 'auth-user-1',
  email: 'owner@turnogol.test',
  systemAdminId: 'sa-row-1',
}
const ACTIVE_ROW = {
  id: 'sa-row-1',
  email: 'owner@turnogol.test',
  firstName: 'Marce',
  lastName: 'Dueño',
  status: 'active',
}

const NOT_ADMIN: Array<[string, unknown]> = [
  ['sin sesión', null],
  [
    'staff',
    {
      type: 'staff',
      id: 'a',
      email: 'staff@x.com',
      staffUserId: 's',
      tenantId: 't',
      role: 'admin',
    },
  ],
  ['jugador', { type: 'player', id: 'b', playerId: 'p', email: 'p@x.com' }],
]

const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['hideRivalMatchAction', () => hideRivalMatchAction({ matchId: UUID })],
  ['restoreRivalMatchAction', () => restoreRivalMatchAction({ matchId: UUID })],
  ['removeRivalAvatarAction', () => removeRivalAvatarAction({ playerId: UUID, matchId: UUID2 })],
]

beforeEach(() => {
  vi.clearAllMocks()
  h.state.dbRows = [ACTIVE_ROW]
  process.env.SYSTEM_ADMIN_EMAILS = 'owner@turnogol.test'
  vi.mocked(extractRealAuthUser).mockResolvedValue(SYSTEM_ADMIN_USER as never)
  vi.mocked(withSystemAdminContext).mockImplementation((async (
    _id: string,
    fn: (tx: never) => Promise<unknown>,
  ) => fn(h.tx as never)) as never)
  vi.mocked(enforce).mockResolvedValue({
    ok: true,
    limit: 60,
    remaining: 59,
    reset: 0,
    unavailable: false,
  })
})

describe.each(NOT_ADMIN)('%s', (_label, user) => {
  beforeEach(() => {
    vi.mocked(extractRealAuthUser).mockResolvedValue(user as never)
  })

  it('no entra a la página: redirect a /login y no lee nada', async () => {
    await expect(SuperAdminRivalPage()).rejects.toThrow('REDIRECT:/login')
    expect(getRivalMonitor).not.toHaveBeenCalled()
    expect(listRivalReports).not.toHaveBeenCalled()
  })

  it.each(ACTIONS)('%s devuelve error y no llama al servicio', async (_name, run) => {
    const res = await run()
    expect(res).toMatchObject({ success: false })
    expect(hideMatch).not.toHaveBeenCalled()
    expect(restoreMatch).not.toHaveBeenCalled()
    expect(removePlayerAvatar).not.toHaveBeenCalled()
  })
})

describe('system admin válido', () => {
  it('ocultar y restaurar llaman al servicio con el id del admin', async () => {
    expect(await hideRivalMatchAction({ matchId: UUID })).toEqual({ success: true })
    expect(hideMatch).toHaveBeenCalledWith(UUID, 'sa-row-1')
    expect(await restoreRivalMatchAction({ matchId: UUID })).toEqual({ success: true })
    expect(restoreMatch).toHaveBeenCalledWith(UUID, 'sa-row-1')
  })

  it('quitar foto llama al servicio', async () => {
    expect(await removeRivalAvatarAction({ playerId: UUID, matchId: UUID2 })).toEqual({
      success: true,
    })
    expect(removePlayerAvatar).toHaveBeenCalledWith(UUID, UUID2, 'sa-row-1')
  })

  it('un id que no es uuid se rechaza sin llamar al servicio', async () => {
    expect(await hideRivalMatchAction({ matchId: 'x' })).toMatchObject({ success: false })
    expect(hideMatch).not.toHaveBeenCalled()
  })

  it('la página lee el monitor y las denuncias', async () => {
    await SuperAdminRivalPage()
    expect(getRivalMonitor).toHaveBeenCalled()
    expect(listRivalReports).toHaveBeenCalled()
  })
})
