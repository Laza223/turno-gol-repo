import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn<() => Promise<boolean>>() }))

vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.enabled }))
vi.mock('@/modules/tenants/sitemap.service', () => ({ listSitemapTenants: async () => [] }))
vi.mock('@/modules/tournaments/tournament-public.service', () => ({
  listPublicTournamentSlugs: async () => [],
}))

import sitemap from '@/app/sitemap'

async function urls() {
  return (await sitemap()).map((e) => e.url)
}

describe('sitemap: /rival', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lo emite con el flag prendido', async () => {
    mocks.enabled.mockResolvedValue(true)
    expect((await urls()).some((u) => u.endsWith('/rival'))).toBe(true)
  })

  it('no lo emite con el flag apagado', async () => {
    mocks.enabled.mockResolvedValue(false)
    expect((await urls()).some((u) => u.endsWith('/rival'))).toBe(false)
  })

  it('no lo emite si la lectura del flag falla, y el resto del sitemap sigue', async () => {
    mocks.enabled.mockRejectedValue(new Error('db'))
    const all = await urls()
    expect(all.some((u) => u.endsWith('/rival'))).toBe(false)
    expect(all.some((u) => u.endsWith('/explorar'))).toBe(true)
  })
})
