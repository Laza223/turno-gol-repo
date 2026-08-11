import { beforeEach, describe, expect, it, vi } from 'vitest'

// Guards de la Server Action de etiquetas (B12/D3). Mockeamos auth, tenant
// context, rate-limit, service y audit para testear la autorización y la
// validación sin DB.
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/relationships/ptr.service', () => ({ setPlayerTags: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/bans/ban.service', () => ({
  banPlayerManually: vi.fn(),
  liftPlayerBan: vi.fn(),
  resolveManualBanUntil: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setPlayerTagsAction } from '@/app/(admin)/jugadores/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { setPlayerTags } from '@/modules/relationships/ptr.service'
import { insertAuditLog } from '@/shared/db/audit'

const PLAYER_ID = '11111111-1111-4111-8111-111111111111'

const AUTH_OK = {
  ok: true,
  user: { staffUserId: 'staff-1' },
  tenant: { id: 'tenant-1' },
}

/** withTenantContext ejecuta el callback con un tx falso. */
const runsCallback = () =>
  vi
    .mocked(withTenantContext)
    .mockImplementation(async (_tenantId: string, cb: (tx: never) => unknown) => cb({} as never))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue(AUTH_OK as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(setPlayerTags).mockResolvedValue({ before: [], after: ['no_credit'] })
  runsCallback()
})

describe('setPlayerTagsAction — validación', () => {
  it('rechaza una etiqueta fuera del set cerrado, sin tocar la DB', async () => {
    const res = await setPlayerTagsAction(PLAYER_ID, ['vip'])
    expect(res.success).toBe(false)
    expect(withTenantContext).not.toHaveBeenCalled()
    expect(setPlayerTags).not.toHaveBeenCalled()
  })

  it('rechaza "Se le fía" + "No fiar" juntas', async () => {
    const res = await setPlayerTagsAction(PLAYER_ID, ['gets_credit', 'no_credit'])
    expect(res).toEqual({
      success: false,
      error: 'No se puede marcar "Se le fía" y "No fiar" a la vez.',
    })
    expect(setPlayerTags).not.toHaveBeenCalled()
  })

  it('rechaza un playerId que no es UUID', async () => {
    const res = await setPlayerTagsAction('no-soy-un-uuid', ['no_credit'])
    expect(res).toEqual({ success: false, error: 'ID inválido.' })
    expect(setPlayerTags).not.toHaveBeenCalled()
  })

  it('normaliza antes de escribir: llega deduplicado y en orden canónico', async () => {
    await setPlayerTagsAction(PLAYER_ID, ['difficult', 'no_credit', 'difficult'])
    expect(setPlayerTags).toHaveBeenCalledWith(
      'tenant-1',
      PLAYER_ID,
      ['no_credit', 'difficult'],
      expect.anything(),
    )
  })
})

describe('setPlayerTagsAction — autorización', () => {
  it('rechaza a quien no pasa requireOperatorStaff', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'No autorizado.',
    } as never)
    const res = await setPlayerTagsAction(PLAYER_ID, ['no_credit'])
    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('respeta el rate-limit del complejo', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiadas operaciones.')
    const res = await setPlayerTagsAction(PLAYER_ID, ['no_credit'])
    expect(res).toEqual({ success: false, error: 'Demasiadas operaciones.' })
    expect(setPlayerTags).not.toHaveBeenCalled()
  })
})

describe('setPlayerTagsAction — efectos', () => {
  it('audita el antes y el después del cambio', async () => {
    vi.mocked(setPlayerTags).mockResolvedValue({
      before: ['gets_credit'],
      after: ['no_credit', 'difficult'],
    })
    const res = await setPlayerTagsAction(PLAYER_ID, ['no_credit', 'difficult'])
    expect(res).toEqual({ success: true })
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'player.tags_updated',
        resourceType: 'player',
        resourceId: PLAYER_ID,
        metadata: { before: ['gets_credit'], after: ['no_credit', 'difficult'] },
      }),
    )
  })

  // Etiquetar a alguien que no es cliente de este complejo inventaría un vínculo
  // que ninguna reserva creó: el service devuelve null y no se audita nada.
  it('falla sin auditar si el jugador no está vinculado al complejo', async () => {
    vi.mocked(setPlayerTags).mockResolvedValue(null)
    const res = await setPlayerTagsAction(PLAYER_ID, ['no_credit'])
    expect(res).toEqual({
      success: false,
      error: 'Ese jugador no está vinculado a este complejo.',
    })
    expect(insertAuditLog).not.toHaveBeenCalled()
  })

  it('sacar todas las etiquetas es una operación válida', async () => {
    vi.mocked(setPlayerTags).mockResolvedValue({ before: ['no_credit'], after: [] })
    const res = await setPlayerTagsAction(PLAYER_ID, [])
    expect(res).toEqual({ success: true })
    expect(setPlayerTags).toHaveBeenCalledWith('tenant-1', PLAYER_ID, [], expect.anything())
  })
})
