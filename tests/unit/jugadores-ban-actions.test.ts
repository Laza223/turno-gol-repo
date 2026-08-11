import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-8: banPlayerAction/liftPlayerBanAction — validación + guard, sin DB
// (mismo patrón que tests/unit/booking-charge-action.test.ts). El path
// transaccional real (banPlayerManually/liftPlayerBan) se cubre en
// tests/unit/ban-manual.test.ts.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/bans/ban.service', () => ({
  banPlayerManually: vi.fn(),
  liftPlayerBan: vi.fn(),
  resolveManualBanUntil: vi.fn(() => new Date('2026-07-21T00:00:00Z')),
}))

import { banPlayerAction, liftPlayerBanAction } from '@/app/(admin)/jugadores/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { insertAuditLog } from '@/shared/db/audit'
import { banPlayerManually, liftPlayerBan } from '@/modules/bans/ban.service'

const PLAYER_ID = '11111111-1111-4111-8111-111111111111'

function mockTx() {
  const tx = {}
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb(tx as never)) as never)
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
})

describe('banPlayerAction', () => {
  it('(e) rechaza reason vacío sin tocar la DB ni el guard', async () => {
    const res = await banPlayerAction(PLAYER_ID, '   ', '7d')
    expect(res.success).toBe(false)
    expect(vi.mocked(requireOperatorStaff)).not.toHaveBeenCalled()
    expect(vi.mocked(banPlayerManually)).not.toHaveBeenCalled()
  })

  it('(f) rebota si el guard rechaza (no-staff / rol insuficiente)', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'Tu rol no permite realizar esta acción.',
    } as never)

    const res = await banPlayerAction(PLAYER_ID, 'Conducta violenta', '7d')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Tu rol no permite realizar esta acción.')
    expect(vi.mocked(banPlayerManually)).not.toHaveBeenCalled()
  })

  it('con guard ok y reason válido: banea, audita y revalida', async () => {
    mockTx()
    const res = await banPlayerAction(PLAYER_ID, '  Rotura de vidrios  ', '7d')

    expect(res.success).toBe(true)
    expect(vi.mocked(banPlayerManually)).toHaveBeenCalledWith(
      'tenant-1',
      PLAYER_ID,
      'staff-1',
      'Rotura de vidrios',
      new Date('2026-07-21T00:00:00Z'),
      expect.anything(),
    )
    expect(vi.mocked(insertAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'player.banned', resourceId: PLAYER_ID }),
    )
  })

  it('rechaza un playerId con formato inválido', async () => {
    const res = await banPlayerAction('no-es-un-uuid', 'motivo', '7d')
    expect(res.success).toBe(false)
    expect(vi.mocked(banPlayerManually)).not.toHaveBeenCalled()
  })
})

describe('liftPlayerBanAction', () => {
  it('rebota si el guard rechaza', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'no autorizado',
    } as never)
    const res = await liftPlayerBanAction(PLAYER_ID)
    expect(res.success).toBe(false)
    expect(vi.mocked(liftPlayerBan)).not.toHaveBeenCalled()
  })

  it('sin ban vigente: liftPlayerBan devuelve false → success:false, sin auditar', async () => {
    mockTx()
    vi.mocked(liftPlayerBan).mockResolvedValue(false)

    const res = await liftPlayerBanAction(PLAYER_ID)

    expect(res.success).toBe(false)
    expect(vi.mocked(insertAuditLog)).not.toHaveBeenCalled()
  })

  it('con ban vigente: lo levanta, audita y revalida', async () => {
    mockTx()
    vi.mocked(liftPlayerBan).mockResolvedValue(true)

    const res = await liftPlayerBanAction(PLAYER_ID)

    expect(res.success).toBe(true)
    expect(vi.mocked(insertAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'player.ban_lifted', resourceId: PLAYER_ID }),
    )
  })
})
