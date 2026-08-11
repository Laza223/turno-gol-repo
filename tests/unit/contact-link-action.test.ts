import { beforeEach, describe, expect, it, vi } from 'vitest'

// Guards de las Server Actions de vinculación manual (B13). Mockeamos auth,
// tenant context, rate-limit, services y audit para testear autorización y
// validación sin DB.
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/relationships/contact-link.service', () => ({
  linkContactToPlayer: vi.fn(),
  unlinkContactFromPlayer: vi.fn(),
}))
vi.mock('@/modules/relationships/ptr.service', () => ({ setPlayerTags: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/bans/ban.service', () => ({
  banPlayerManually: vi.fn(),
  liftPlayerBan: vi.fn(),
  resolveManualBanUntil: vi.fn(),
}))
vi.mock('@/app/(admin)/jugadores/queries', () => ({ searchLinkCandidates: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  linkContactAction,
  unlinkContactAction,
  searchLinkCandidatesAction,
} from '@/app/(admin)/jugadores/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  linkContactToPlayer,
  unlinkContactFromPlayer,
} from '@/modules/relationships/contact-link.service'
import { searchLinkCandidates } from '@/app/(admin)/jugadores/queries'
import { insertAuditLog } from '@/shared/db/audit'

const PLAYER_ID = '11111111-1111-4111-8111-111111111111'
const CONTACT_KEY = '1122334455'

const AUTH_OK = {
  ok: true,
  user: { staffUserId: 'staff-1' },
  tenant: { id: 'tenant-1' },
}

const runsCallback = () =>
  vi
    .mocked(withTenantContext)
    .mockImplementation(async (_tenantId: string, cb: (tx: never) => unknown) => cb({} as never))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue(AUTH_OK as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(linkContactToPlayer).mockResolvedValue({
    abonadosLinked: 1,
    bookingsReassigned: 8,
  })
  vi.mocked(unlinkContactFromPlayer).mockResolvedValue({
    abonadosUnlinked: 1,
    bookingsReverted: 8,
  })
  vi.mocked(searchLinkCandidates).mockResolvedValue([])
  runsCallback()
})

describe('linkContactAction — validación', () => {
  it.each([
    ['texto libre', 'diego'],
    ['pocos dígitos', '1234'],
    ['demasiados dígitos', '11223344556'],
    ['prefijo id: sin uuid', 'id:no-soy-uuid'],
    ['intento de comodín', '%'],
  ])('rechaza una clave de contacto con %s, sin tocar la DB', async (_caso, key) => {
    const res = await linkContactAction(key, PLAYER_ID)
    expect(res.success).toBe(false)
    expect(withTenantContext).not.toHaveBeenCalled()
    expect(linkContactToPlayer).not.toHaveBeenCalled()
  })

  it('acepta la clave por id de fila (teléfono sin dígitos suficientes)', async () => {
    const res = await linkContactAction(`id:${PLAYER_ID}`, PLAYER_ID)
    expect(res).toEqual({ success: true })
  })

  it('rechaza un playerId que no es UUID', async () => {
    const res = await linkContactAction(CONTACT_KEY, 'no-soy-un-uuid')
    expect(res).toEqual({ success: false, error: 'ID de jugador inválido.' })
    expect(linkContactToPlayer).not.toHaveBeenCalled()
  })
})

describe('linkContactAction — autorización', () => {
  it('rechaza a quien no pasa requireOperatorStaff', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'No autorizado.',
    } as never)
    const res = await linkContactAction(CONTACT_KEY, PLAYER_ID)
    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(withTenantContext).not.toHaveBeenCalled()
  })

  it('respeta el rate-limit del complejo', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiadas operaciones.')
    const res = await linkContactAction(CONTACT_KEY, PLAYER_ID)
    expect(res).toEqual({ success: false, error: 'Demasiadas operaciones.' })
    expect(linkContactToPlayer).not.toHaveBeenCalled()
  })
})

describe('linkContactAction — efectos', () => {
  it('audita qué se movió, para que la vinculación quede rastreable', async () => {
    const res = await linkContactAction(CONTACT_KEY, PLAYER_ID)
    expect(res).toEqual({ success: true })
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'player.contact_linked',
        resourceType: 'player',
        resourceId: PLAYER_ID,
        metadata: {
          contactKey: CONTACT_KEY,
          abonadosLinked: 1,
          bookingsReassigned: 8,
        },
      }),
    )
  })

  it('falla sin auditar si el jugador no es cliente del complejo', async () => {
    vi.mocked(linkContactToPlayer).mockResolvedValue(null)
    const res = await linkContactAction(CONTACT_KEY, PLAYER_ID)
    expect(res).toEqual({
      success: false,
      error: 'Ese jugador no está vinculado a este complejo.',
    })
    expect(insertAuditLog).not.toHaveBeenCalled()
  })

  it('avisa cuando no quedaba nada por vincular (doble click)', async () => {
    vi.mocked(linkContactToPlayer).mockResolvedValue({
      abonadosLinked: 0,
      bookingsReassigned: 0,
    })
    const res = await linkContactAction(CONTACT_KEY, PLAYER_ID)
    expect(res).toEqual({
      success: false,
      error: 'Ese contacto ya no tiene turnos fijos sin vincular.',
    })
  })
})

describe('unlinkContactAction', () => {
  it('audita la reversión', async () => {
    const res = await unlinkContactAction(PLAYER_ID)
    expect(res).toEqual({ success: true })
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'player.contact_unlinked',
        metadata: { abonadosUnlinked: 1, bookingsReverted: 8 },
      }),
    )
  })

  it('no audita si el jugador no tenía fijos a su nombre', async () => {
    vi.mocked(unlinkContactFromPlayer).mockResolvedValue({
      abonadosUnlinked: 0,
      bookingsReverted: 0,
    })
    const res = await unlinkContactAction(PLAYER_ID)
    expect(res.success).toBe(false)
    expect(insertAuditLog).not.toHaveBeenCalled()
  })

  it('rechaza a quien no pasa requireOperatorStaff', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'No autorizado.',
    } as never)
    const res = await unlinkContactAction(PLAYER_ID)
    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(unlinkContactFromPlayer).not.toHaveBeenCalled()
  })
})

describe('searchLinkCandidatesAction', () => {
  // El buscador devuelve nombres y teléfonos de clientes del complejo: sin
  // guard sería un buscador de personas abierto.
  it('exige staff del complejo', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'No autorizado.',
    } as never)
    const res = await searchLinkCandidatesAction('diego')
    expect(res).toEqual({ success: false, error: 'No autorizado.' })
    expect(searchLinkCandidates).not.toHaveBeenCalled()
  })

  it('respeta el rate-limit', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiadas operaciones.')
    const res = await searchLinkCandidatesAction('diego')
    expect(res).toEqual({ success: false, error: 'Demasiadas operaciones.' })
    expect(searchLinkCandidates).not.toHaveBeenCalled()
  })

  it('no consulta con menos de 2 caracteres', async () => {
    const res = await searchLinkCandidatesAction('d')
    expect(res).toEqual({ success: true, candidates: [] })
    expect(searchLinkCandidates).not.toHaveBeenCalled()
  })

  it('busca con el término recortado', async () => {
    await searchLinkCandidatesAction('  diego  ')
    expect(searchLinkCandidates).toHaveBeenCalledWith('tenant-1', 'diego', expect.anything())
  })
})
