// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImageResizeError, PRESET_CONFIG, resizeToPreset } from '@/shared/images/resize-image'

class FakeImage {
  static fails = false
  width = 800
  height = 600
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) {
    this._src = v
    queueMicrotask(() => (FakeImage.fails ? this.onerror?.() : this.onload?.()))
  }
  get src() {
    return this._src
  }
}

/** Un navegador que genera el formato que se le pide. */
const asRequested = (type: string): Blob | null => new Blob(['x'], { type })
/** Safari: no genera WebP y devuelve un PNG sin avisar. */
const safari = (type: string): Blob | null =>
  new Blob(['x'], { type: type === 'image/webp' ? 'image/png' : type })

let encode = asRequested
const fakeCtx = {
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  globalCompositeOperation: 'source-over',
}
const toBlob = vi.fn((cb: (b: Blob | null) => void, type: string, _quality: number) =>
  cb(encode(type)),
)

let originalCreateElement: typeof document.createElement

beforeEach(() => {
  vi.clearAllMocks()
  FakeImage.fails = false
  encode = asRequested
  fakeCtx.fillStyle = ''
  fakeCtx.globalCompositeOperation = 'source-over'

  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })

  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => fakeCtx),
    toBlob,
  }

  originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
    return originalCreateElement(tag) as HTMLElement
  })
})

const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
const requested = () => toBlob.mock.calls.map(([, type, quality]) => [type, quality])

describe('PRESET_CONFIG', () => {
  it('logo es 1:1, cover 16:9, court 4:3', () => {
    expect(PRESET_CONFIG.logo.aspect).toBeCloseTo(1)
    expect(PRESET_CONFIG.cover.aspect).toBeCloseTo(16 / 9)
    expect(PRESET_CONFIG.court.aspect).toBeCloseTo(4 / 3)
  })
})

describe('resizeToPreset', () => {
  it('rechaza archivos que no son imagen', async () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await expect(resizeToPreset(file, 'logo')).rejects.toThrow(/imagen/i)
    await expect(resizeToPreset(file, 'logo')).rejects.toBeInstanceOf(ImageResizeError)
  })

  it('devuelve un Blob webp para un archivo imagen válido, de una sola pasada', async () => {
    const blob = await resizeToPreset(photo(), 'court')
    expect(blob.type).toBe('image/webp')
    expect(requested()).toEqual([['image/webp', 0.82]])
    expect(fakeCtx.fillRect).not.toHaveBeenCalled()
  })

  it.each(['court', 'cover'] as const)(
    'en Safari, %s vuelve a exportar en JPEG con fondo blanco',
    async (preset) => {
      encode = safari
      const blob = await resizeToPreset(photo(), preset)
      expect(blob.type).toBe('image/jpeg')
      expect(requested()).toEqual([
        ['image/webp', 0.82],
        ['image/jpeg', 0.85],
      ])
      // El fondo va por detrás de la foto y antes de exportar: si no, lo transparente sale negro.
      expect(fakeCtx.globalCompositeOperation).toBe('destination-over')
      expect(fakeCtx.fillStyle).toBe('#ffffff')
      expect(fakeCtx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
        toBlob.mock.invocationCallOrder[1]!,
      )
    },
  )

  it('en Safari, el logo conserva el PNG para no perder la transparencia', async () => {
    encode = safari
    const blob = await resizeToPreset(photo(), 'logo')
    expect(blob.type).toBe('image/png')
    expect(requested()).toEqual([['image/webp', 0.82]])
    expect(fakeCtx.fillRect).not.toHaveBeenCalled()
  })

  it('en Safari, con jpegFallback el recorte cuadrado también sale en JPEG', async () => {
    encode = safari
    const blob = await resizeToPreset(photo(), 'logo', { jpegFallback: true })
    expect(blob.type).toBe('image/jpeg')
    // 800×600 recortado al centro y achicado al ancho del preset.
    expect(fakeCtx.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 512, 512)
  })

  it('si la imagen no se puede leer, rechaza con ImageResizeError', async () => {
    FakeImage.fails = true
    await expect(resizeToPreset(photo(), 'logo')).rejects.toBeInstanceOf(ImageResizeError)
  })

  it.each([
    ['sin fallback', false],
    ['con fallback', true],
  ])(
    'si el canvas no exporta nada (%s), rechaza con ImageResizeError',
    async (_n, jpegFallback) => {
      encode = () => null
      await expect(resizeToPreset(photo(), 'logo', { jpegFallback })).rejects.toBeInstanceOf(
        ImageResizeError,
      )
    },
  )
})
