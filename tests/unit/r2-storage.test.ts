import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: vi.fn((input) => ({ input, __type: 'Put' })),
  DeleteObjectCommand: vi.fn((input) => ({ input, __type: 'Delete' })),
}))

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.R2_ACCOUNT_ID = 'acc123'
  process.env.R2_ACCESS_KEY_ID = 'key123'
  process.env.R2_SECRET_ACCESS_KEY = 'secret123'
  process.env.R2_BUCKET = 'turnogol-media'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.turnogol.com'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('isR2Configured', () => {
  it('true cuando las 5 env vars están seteadas', async () => {
    const { isR2Configured } = await import('@/shared/storage/r2')
    expect(isR2Configured()).toBe(true)
  })

  it('false si falta R2_ACCOUNT_ID', async () => {
    delete process.env.R2_ACCOUNT_ID
    vi.resetModules()
    const { isR2Configured } = await import('@/shared/storage/r2')
    expect(isR2Configured()).toBe(false)
  })
})

describe('publicUrl', () => {
  it('arma la URL pública a partir de la key', async () => {
    const { publicUrl } = await import('@/shared/storage/r2')
    expect(publicUrl('tenant-1/logo-abc.webp')).toBe(
      'https://media.turnogol.com/tenant-1/logo-abc.webp',
    )
  })
})

describe('keyFromPublicUrl', () => {
  it('extrae la key de una URL pública válida', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('https://media.turnogol.com/tenant-1/logo-abc.webp')).toBe(
      'tenant-1/logo-abc.webp',
    )
  })

  it('devuelve null para una URL de otro host', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('https://evil.com/tenant-1/logo-abc.webp')).toBeNull()
  })

  it('devuelve null para una URL malformada', async () => {
    const { keyFromPublicUrl } = await import('@/shared/storage/r2')
    expect(keyFromPublicUrl('no-es-una-url')).toBeNull()
  })
})

describe('putImage / deleteImage', () => {
  it('putImage llama S3Client.send con PutObjectCommand', async () => {
    const { putImage } = await import('@/shared/storage/r2')
    await putImage('tenant-1/logo-abc.webp', new Uint8Array([1, 2, 3]), 'image/webp')
    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0][0]
    expect(call.__type).toBe('Put')
    expect(call.input).toMatchObject({
      Bucket: 'turnogol-media',
      Key: 'tenant-1/logo-abc.webp',
      ContentType: 'image/webp',
    })
  })

  it('deleteImage llama S3Client.send con DeleteObjectCommand', async () => {
    const { deleteImage } = await import('@/shared/storage/r2')
    await deleteImage('tenant-1/logo-abc.webp')
    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0][0]
    expect(call.__type).toBe('Delete')
    expect(call.input).toMatchObject({ Bucket: 'turnogol-media', Key: 'tenant-1/logo-abc.webp' })
  })
})
