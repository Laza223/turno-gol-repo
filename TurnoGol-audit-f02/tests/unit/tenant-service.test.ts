import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSlug, generateUniqueSlug } from '@/modules/tenants/tenant.service'
import { getDb } from '@/shared/db/client'

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(),
}))

const mockGetDb = vi.mocked(getDb)

function makeDbMock(results: { slug: string }[]) {
  const where = vi.fn().mockResolvedValue(results)
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return { select } as unknown as ReturnType<typeof getDb>
}

describe('generateSlug', () => {
  it('removes accents', () => {
    expect(generateSlug('Fútbol Rápido')).toBe('futbol-rapido')
  })

  it('removes & and special chars', () => {
    expect(generateSlug('Fútbol & Amigos')).toBe('futbol-amigos')
  })

  it('handles comma and period', () => {
    expect(generateSlug('San Martín, S.A.')).toBe('san-martin-sa')
  })

  it('returns complejo for empty string', () => {
    expect(generateSlug('')).toBe('complejo')
  })

  it('returns complejo for string with only special chars', () => {
    expect(generateSlug('&&& !!!')).toBe('complejo')
  })

  it('truncates to 50 chars', () => {
    const long = 'a'.repeat(60)
    expect(generateSlug(long)).toHaveLength(50)
  })
})

describe('generateUniqueSlug', () => {
  beforeEach(() => {
    mockGetDb.mockReset()
  })

  it('returns base slug when no collision', async () => {
    mockGetDb.mockReturnValue(makeDbMock([]))
    const slug = await generateUniqueSlug('Complejo San Martín')
    expect(slug).toBe('complejo-san-martin')
  })

  it('appends -2 on single collision', async () => {
    mockGetDb.mockReturnValue(makeDbMock([{ slug: 'complejo-san-martin' }]))
    const slug = await generateUniqueSlug('Complejo San Martín')
    expect(slug).toBe('complejo-san-martin-2')
  })

  it('skips to -3 when both base and -2 exist', async () => {
    mockGetDb.mockReturnValue(
      makeDbMock([
        { slug: 'futbol-amigos' },
        { slug: 'futbol-amigos-2' },
      ]),
    )
    const slug = await generateUniqueSlug('Fútbol Amigos')
    expect(slug).toBe('futbol-amigos-3')
  })

  it('handles special chars in name', async () => {
    mockGetDb.mockReturnValue(makeDbMock([]))
    const slug = await generateUniqueSlug('Fútbol & Amigos, S.A.')
    expect(slug).toBe('futbol-amigos-sa')
  })
})
