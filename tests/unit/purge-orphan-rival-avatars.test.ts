import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  listImages: vi.fn(),
  deleteImage: vi.fn(),
  getWorkerSql: vi.fn(),
}))

vi.mock('@/shared/storage/r2', () => ({
  listImages: h.listImages,
  deleteImage: h.deleteImage,
}))
vi.mock('@/shared/db/client', () => ({
  getWorkerSql: h.getWorkerSql,
  getWorkerDb: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { purgeOrphanRivalAvatars } from '@/shared/jobs/workers/data-retention-cleanup.worker'

const BASE = 'https://media.turnogol.test'
const HOUR = 3_600_000
const old = () => new Date(Date.now() - 3 * HOUR)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('R2_PUBLIC_BASE_URL', BASE)
  for (const v of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
    vi.stubEnv(v, 'x')
  h.deleteImage.mockResolvedValue(undefined)
  h.getWorkerSql.mockReturnValue(() => Promise.resolve([]))
})

describe('purgeOrphanRivalAvatars', () => {
  it('borra un huérfano viejo', async () => {
    h.listImages.mockResolvedValue([{ key: 'rival/avatars/a.webp', lastModified: old() }])
    await purgeOrphanRivalAvatars()
    expect(h.listImages).toHaveBeenCalledWith('rival/avatars/')
    expect(h.deleteImage).toHaveBeenCalledExactlyOnceWith('rival/avatars/a.webp')
  })

  it('respeta el referenciado por un jugador', async () => {
    h.listImages.mockResolvedValue([
      { key: 'rival/avatars/keep.webp', lastModified: old() },
      { key: 'rival/avatars/orphan.webp', lastModified: old() },
    ])
    h.getWorkerSql.mockReturnValue(() =>
      Promise.resolve([{ avatar_url: `${BASE}/rival/avatars/keep.webp` }]),
    )
    await purgeOrphanRivalAvatars()
    expect(h.deleteImage).toHaveBeenCalledExactlyOnceWith('rival/avatars/orphan.webp')
  })

  it('respeta el referenciado aunque la URL guardada tenga otro host (cambió R2_PUBLIC_BASE_URL)', async () => {
    h.listImages.mockResolvedValue([{ key: 'rival/avatars/keep.webp', lastModified: old() }])
    h.getWorkerSql.mockReturnValue(() =>
      Promise.resolve([{ avatar_url: 'https://pub-viejo.r2.dev/rival/avatars/keep.webp' }]),
    )
    await purgeOrphanRivalAvatars()
    expect(h.deleteImage).not.toHaveBeenCalled()
  })

  it('no borra nada si hay una URL guardada que no se puede leer', async () => {
    h.listImages.mockResolvedValue([{ key: 'rival/avatars/a.webp', lastModified: old() }])
    h.getWorkerSql.mockReturnValue(() => Promise.resolve([{ avatar_url: 'no es una url' }]))
    await purgeOrphanRivalAvatars()
    expect(h.deleteImage).not.toHaveBeenCalled()
  })

  it('respeta el reciente (subida en curso)', async () => {
    h.listImages.mockResolvedValue([
      { key: 'rival/avatars/new.webp', lastModified: new Date(Date.now() - 5 * 60_000) },
    ])
    await purgeOrphanRivalAvatars()
    expect(h.deleteImage).not.toHaveBeenCalled()
  })

  it('R2 sin configurar: no hace nada', async () => {
    vi.stubEnv('R2_BUCKET', '')
    await purgeOrphanRivalAvatars()
    expect(h.listImages).not.toHaveBeenCalled()
    expect(h.deleteImage).not.toHaveBeenCalled()
  })
})
