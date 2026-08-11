import { describe, it, expect, vi } from 'vitest'
import {
  appendCourtPhoto,
  removeCourtPhoto,
  reorderCourtPhotos,
} from '@/modules/courts/court.service'

function fakeTx(existingPhotos: string[], returningPhotos: string[]) {
  const returning = vi.fn().mockResolvedValue([{ photos: returningPhotos }])
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })

  const limit = vi.fn().mockResolvedValue([{ photos: existingPhotos }])
  const selWhere = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where: selWhere })
  const select = vi.fn().mockReturnValue({ from })

  return { update, select, set, where } as never
}

describe('appendCourtPhoto', () => {
  it('agrega la url al array existente', async () => {
    const tx = fakeTx(['a.webp'], ['a.webp', 'b.webp'])
    const result = await appendCourtPhoto('court-1', 'tenant-1', 'b.webp', tx)
    expect(result).toEqual(['a.webp', 'b.webp'])
  })

  it('rechaza cuando ya hay 6 fotos', async () => {
    const six = Array.from({ length: 6 }, (_, i) => `${i}.webp`)
    const tx = fakeTx(six, six)
    await expect(appendCourtPhoto('court-1', 'tenant-1', 'seven.webp', tx)).rejects.toThrow(/6/)
  })
})

describe('removeCourtPhoto', () => {
  it('quita la url del array', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], ['a.webp'])
    const result = await removeCourtPhoto('court-1', 'tenant-1', 'b.webp', tx)
    expect(result).toEqual(['a.webp'])
  })
})

describe('reorderCourtPhotos', () => {
  it('persiste el nuevo orden si el conjunto coincide', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], ['b.webp', 'a.webp'])
    const result = await reorderCourtPhotos('court-1', 'tenant-1', ['b.webp', 'a.webp'], tx)
    expect(result).toEqual(['b.webp', 'a.webp'])
  })

  it('rechaza si el conjunto de urls no coincide con el existente', async () => {
    const tx = fakeTx(['a.webp', 'b.webp'], [])
    await expect(
      reorderCourtPhotos('court-1', 'tenant-1', ['a.webp', 'c.webp'], tx),
    ).rejects.toThrow(/no coincide/)
  })
})
