// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PRESET_CONFIG, resizeToPreset } from '@/shared/images/resize-image'

class FakeImage {
  width = 800
  height = 600
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  set src(v: string) {
    this._src = v
    queueMicrotask(() => this.onload?.())
  }
  get src() {
    return this._src
  }
}

let originalCreateElement: typeof document.createElement

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })

  const fakeCtx = { drawImage: vi.fn() }
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => fakeCtx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/webp' }))),
  }

  originalCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
    return originalCreateElement(tag) as HTMLElement
  })
})

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
  })

  it('devuelve un Blob webp para un archivo imagen válido', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await resizeToPreset(file, 'court')
    expect(blob.type).toBe('image/webp')
  })
})
