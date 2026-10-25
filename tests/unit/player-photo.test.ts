import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  deleteImage: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/shared/storage/r2', () => ({ deleteImage: h.deleteImage, putImage: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: h.captureException }))
vi.mock('@/shared/db/client', () => ({ getWorkerDb: vi.fn() }))

import {
  deletePlayerPhotoObject,
  PHOTO_MAX_BYTES,
  validatePhotoUpload,
} from '@/modules/players/player-photo.service'

const BASE = 'https://media.turnogol.test'

/** WebP mínimo: `RIFF` + tamaño + `WEBP` + chunk `VP8 `. */
function webpBytes(extra = 0): Uint8Array {
  const head = [
    ...Array.from('RIFF', (c) => c.charCodeAt(0)),
    0x1a,
    0,
    0,
    0,
    ...Array.from('WEBPVP8 ', (c) => c.charCodeAt(0)),
  ]
  const out = new Uint8Array(head.length + extra)
  out.set(head)
  return out
}

describe('validatePhotoUpload', () => {
  it('acepta un WebP real', () => {
    expect(validatePhotoUpload(webpBytes())).toEqual({ ok: true })
  })

  it('rechaza un archivo vacío', () => {
    const r = validatePhotoUpload(new Uint8Array(0))
    expect(r.ok).toBe(false)
  })

  it('rechaza más de 2MB aunque la firma sea WebP', () => {
    const r = validatePhotoUpload(webpBytes(PHOTO_MAX_BYTES))
    expect(r).toEqual({ ok: false, error: 'La imagen no puede superar 2MB' })
  })

  it('acepta exactamente 2MB', () => {
    expect(validatePhotoUpload(webpBytes(PHOTO_MAX_BYTES - webpBytes().length))).toEqual({
      ok: true,
    })
  })

  it.each([
    ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]],
    ['JPEG', [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]],
    ['GIF', Array.from('GIF89a......', (c) => c.charCodeAt(0))],
    ['HTML', Array.from('<html><script>', (c) => c.charCodeAt(0))],
    // RIFF pero WAVE: la firma son DOS tramos (0-3 y 8-11).
    ['RIFF/WAVE', Array.from('RIFF\x1a\0\0\0WAVEfmt ', (c) => c.charCodeAt(0))],
    ['muy corto', Array.from('RIFF', (c) => c.charCodeAt(0))],
  ])('rechaza %s', (_n, bytes) => {
    expect(validatePhotoUpload(Uint8Array.from(bytes))).toEqual({
      ok: false,
      error: 'La foto tiene que ser una imagen válida',
    })
  })
})

describe('deletePlayerPhotoObject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('R2_PUBLIC_BASE_URL', BASE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('borra una clave de rival/avatars/', async () => {
    h.deleteImage.mockResolvedValue(undefined)
    await deletePlayerPhotoObject(`${BASE}/rival/avatars/abc.webp`, 0)
    expect(h.deleteImage).toHaveBeenCalledExactlyOnceWith('rival/avatars/abc.webp')
  })

  it.each([
    ['null', null],
    ['host ajeno', 'https://evil.example/rival/avatars/abc.webp'],
    ['clave de cancha', `${BASE}/11111111-1111-1111-1111-111111111111/courts/x.webp`],
    ['otro prefijo parecido', `${BASE}/rival/avatars-x/abc.webp`],
    ['traversal', `${BASE}/rival/avatars/../secret.webp`],
    ['no es URL', 'no-es-una-url'],
  ])('no borra nada: %s', async (_n, url) => {
    await deletePlayerPhotoObject(url, 0)
    expect(h.deleteImage).not.toHaveBeenCalled()
  })

  it('reintenta y termina borrando', async () => {
    h.deleteImage.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    await deletePlayerPhotoObject(`${BASE}/rival/avatars/abc.webp`, 0)
    expect(h.deleteImage).toHaveBeenCalledTimes(2)
    expect(h.captureException).not.toHaveBeenCalled()
  })

  it('agota 3 intentos, avisa y NO lanza', async () => {
    h.deleteImage.mockRejectedValue(new Error('boom'))
    await expect(
      deletePlayerPhotoObject(`${BASE}/rival/avatars/abc.webp`, 0),
    ).resolves.toBeUndefined()
    expect(h.deleteImage).toHaveBeenCalledTimes(3)
    expect(h.captureException).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[storage]'),
      expect.objectContaining({ key: 'rival/avatars/abc.webp' }),
    )
  })
})
