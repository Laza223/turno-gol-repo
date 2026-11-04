import { afterAll, describe, expect, it, vi } from 'vitest'

// Mismo motivo que rival-og-image.test.ts: sin `fetch` mientras dura este archivo, para que
// `next/og` no choque con un mock filtrado de otro archivo.
const leakedFetch = vi.hoisted(() => {
  const saved = globalThis.fetch
  Reflect.deleteProperty(globalThis, 'fetch')
  return saved
})

afterAll(() => {
  globalThis.fetch = leakedFetch
})

import Image, { contentType, size } from '@/app/(player)/rival/opengraph-image'

describe('opengraph-image de /rival', () => {
  it('declara 1200×630 PNG', () => {
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(contentType).toBe('image/png')
  })

  it('renderiza un PNG de 1200×630 bajo 300 KB, sin red ni datos', async () => {
    const res = await Image()
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(buf.readUInt32BE(16)).toBe(1200)
    expect(buf.readUInt32BE(20)).toBe(630)
    expect(buf.length).toBeLessThan(300 * 1024)
    expect(globalThis.fetch).toBeUndefined()
  }, 30_000)
})
