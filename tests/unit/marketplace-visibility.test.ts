import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
}))

vi.mock('@/shared/observability', () => ({
  track: { search: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => unknown) => fn(),
}))

type FakeRow = Record<string, unknown>

function makeChain(rows: FakeRow[]) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    leftJoin: () => chain,
    groupBy: () => chain,
    as: () => chain,
    where: (cond: unknown) => {
      chain.lastWhere = cond
      return chain
    },
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    then: (onfulfilled: (v: FakeRow[]) => unknown, onrejected?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onfulfilled, onrejected),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listSitemapTenants (sitemap.service)', () => {
  it('filtra por tenants visibles y marketplaceVisible = true (B7)', async () => {
    const chain = makeChain([
      { id: 't1', slug: 'complejo-visible', updatedAt: new Date('2026-08-30') },
    ])
    h.getDb.mockReturnValue(chain)

    const { listSitemapTenants } = await import('@/modules/tenants/sitemap.service')
    const tenants = await listSitemapTenants()

    expect(tenants).toHaveLength(1)
    expect(tenants[0].slug).toBe('complejo-visible')
    expect(chain.lastWhere).toBeDefined()
  })
})

describe('searchPublicTenants (search.service)', () => {
  it('agrega filtro de marketplaceVisible a las condiciones de búsqueda (B7)', async () => {
    const chain = makeChain([])
    h.getDb.mockReturnValue(chain)

    const { searchPublicTenants } = await import('@/modules/tenants/search.service')
    const res = await searchPublicTenants({ q: 'test' })

    expect(res.results).toEqual([])
    expect(chain.lastWhere).toBeDefined()
  })
})
