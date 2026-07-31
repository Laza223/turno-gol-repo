import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: vi.fn((input) => ({ input, __type: 'Put' })),
  DeleteObjectCommand: vi.fn((input) => ({ input, __type: 'Delete' })),
}))

const captureException = vi.fn()
vi.mock('@/lib/sentry', () => ({ captureException: (e: unknown) => captureException(e) }))

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

  it('el cliente pide checksums solo cuando hacen falta (compat R2)', async () => {
    // R2 no implementa todo el protocolo de checksums que el SDK de AWS manda
    // por default desde la v3.729: con 'WHEN_SUPPORTED', PutObject viaja con un
    // CRC32 extra que R2 puede rechazar con 400. Si alguien saca estas dos
    // líneas, el upload se rompe en producción y en ningún test se nota.
    // r2.ts memoiza el cliente en un módulo-level `cachedClient`: sin resetear
    // los módulos, otro test ya lo construyó y acá no se llamaría al
    // constructor.
    vi.resetModules()
    const { putImage } = await import('@/shared/storage/r2')
    const { S3Client } = await import('@aws-sdk/client-s3')
    await putImage('tenant-1/logo-abc.webp', new Uint8Array([1]), 'image/webp')
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    )
  })

  it('putImage loguea el error y lo repropaga, en vez de tragárselo', async () => {
    // Los tres call sites (canchas, perfil, onboarding) hacen `catch {}` y
    // devuelven "No se pudo subir la imagen". Sin este log, un upload fallado
    // en producción no deja NADA: ni el bucket, ni el código de error de R2.
    const boom = new Error('AccessDenied')
    send.mockRejectedValueOnce(boom)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { putImage } = await import('@/shared/storage/r2')

    await expect(
      putImage('tenant-1/foto.webp', new Uint8Array([1, 2]), 'image/webp'),
    ).rejects.toThrow('AccessDenied')

    expect(captureException).toHaveBeenCalledWith(boom)
    const [, contexto] = errorSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(contexto).toMatchObject({ bucket: 'turnogol-media', key: 'tenant-1/foto.webp' })
    // Las credenciales nunca se loguean.
    expect(JSON.stringify(contexto)).not.toMatch(/secret123|key123/)
    errorSpy.mockRestore()
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
