import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { compressUpload, toPng } from '@/shared/images/compress-image'

// Toda imagen que se sube se recomprime en el server (pedido de Lazar del
// 2026-11-16): el navegador ya la achica, pero un POST directo manda lo que quiere.

async function image(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'webp',
  withExif = false,
): Promise<Uint8Array> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
  if (withExif) {
    pipeline = pipeline.withExif({ IFD0: { Artist: 'alguien', Copyright: 'privado' } })
  }
  return new Uint8Array(await pipeline[format]().toBuffer())
}

describe('compressUpload', () => {
  it('un logo grande en PNG sale en WebP de 512×512', async () => {
    const out = await compressUpload(await image(2000, 2000, 'png'), 'logo')
    expect(out).not.toBeNull()
    const meta = await sharp(out!).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([512, 512])
  })

  it('una foto de cancha se recorta a 4:3 y como mucho 1280 de ancho', async () => {
    const out = await compressUpload(await image(3000, 1000, 'jpeg'), 'court')
    const meta = await sharp(out!).metadata()
    expect([meta.width, meta.height]).toEqual([1280, 960])
  })

  it('una portada se recorta a 16:9 y como mucho 1600 de ancho', async () => {
    const out = await compressUpload(await image(2400, 2400, 'webp'), 'cover')
    const meta = await sharp(out!).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 900])
  })

  it('pesa menos que el original', async () => {
    const original = await image(2000, 2000, 'png')
    const out = await compressUpload(original, 'logo')
    expect(out!.byteLength).toBeLessThan(original.byteLength)
  })

  it('descarta la metadata (EXIF)', async () => {
    const original = await image(800, 800, 'jpeg', true)
    expect((await sharp(original).metadata()).exif).toBeDefined()
    const out = await compressUpload(original, 'logo')
    expect((await sharp(out!).metadata()).exif).toBeUndefined()
  })

  it('devuelve null si los bytes no son una imagen', async () => {
    const out = await compressUpload(new TextEncoder().encode('no soy una imagen'), 'logo')
    expect(out).toBeNull()
  })
})

describe('toPng', () => {
  it('pasa un WebP a PNG del ancho pedido', async () => {
    const png = await toPng(await image(512, 512, 'webp'), 320)
    const meta = await sharp(png).metadata()
    expect(meta.format).toBe('png')
    expect([meta.width, meta.height]).toEqual([320, 320])
  })
})
