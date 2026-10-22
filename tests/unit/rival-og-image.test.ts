import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Mismo motivo que story-render.test.ts: bajo `singleThread` un `fetch` mockeado por otro archivo
// llega al wasm de `next/og` y revienta con "expected magic word". Se saca mientras dura ESTE
// archivo (antes de evaluar `next/og`) y se devuelve al final.
const leakedFetch = vi.hoisted(() => {
  const saved = globalThis.fetch
  Reflect.deleteProperty(globalThis, 'fetch')
  return saved
})

afterAll(() => {
  globalThis.fetch = leakedFetch
})

const mocks = vi.hoisted(() => ({
  enabled: vi.fn<() => Promise<boolean>>(),
  getPublicMatch: vi.fn(),
}))

vi.mock('@/modules/rival/rival.flags', () => ({ isRivalEnabled: mocks.enabled }))
vi.mock('@/modules/rival/rival.service', () => ({ getPublicMatch: mocks.getPublicMatch }))

import Image, { contentType, size } from '@/app/(player)/rival/p/[code]/opengraph-image'

const TIMEOUT = 30_000
const PNG_SIGNATURE = '89504e470d0a1a0a'

const MATCH = {
  tenantName: 'M10 Menotti',
  // 23:30 UTC = 20:30 ART del mismo día. Un día derivado en UTC diría el siguiente.
  // Lejos en el futuro: el test no puede vencerse con el reloj.
  status: 'open',
  startsAt: new Date('2099-10-22T23:30:00Z'),
  confirmedCount: 7,
  capacity: 10,
}

async function render(code = 'ABC234') {
  const res = await Image({ params: Promise.resolve({ code }) })
  return Buffer.from(await res.arrayBuffer())
}

function expectPng(buf: Buffer) {
  expect(buf.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE)
  expect(buf.readUInt32BE(16)).toBe(1200)
  expect(buf.readUInt32BE(20)).toBe(630)
  expect(buf.length).toBeLessThan(300 * 1024)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockResolvedValue(true)
  mocks.getPublicMatch.mockResolvedValue(MATCH)
})

describe('opengraph-image de /rival/p/[code]', () => {
  it('declara 1200×630 PNG', () => {
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(contentType).toBe('image/png')
  })

  it(
    'con el flag prendido y el partido visible: PNG de 1200×630 bajo 300 KB, leyendo el partido por su código',
    async () => {
      expectPng(await render('ABC234'))
      expect(mocks.getPublicMatch).toHaveBeenCalledWith('ABC234')
    },
    TIMEOUT,
  )

  it(
    'con el flag apagado: imagen genérica y ni siquiera consulta el partido',
    async () => {
      mocks.enabled.mockResolvedValue(false)
      expectPng(await render())
      expect(mocks.getPublicMatch).not.toHaveBeenCalled()
    },
    TIMEOUT,
  )

  it(
    'partido inexistente u oculto (null) o lectura que falla: imagen genérica, sin romper',
    async () => {
      mocks.getPublicMatch.mockResolvedValue(null)
      expectPng(await render())
      mocks.getPublicMatch.mockRejectedValue(new Error('db'))
      expectPng(await render())
    },
    TIMEOUT,
  )

  it(
    'partido cancelado o ya vencido: la misma imagen genérica, sin datos del partido',
    async () => {
      mocks.getPublicMatch.mockResolvedValue(null)
      const generic = await render()
      mocks.getPublicMatch.mockResolvedValue({ ...MATCH, status: 'open' })
      expect((await render()).equals(generic)).toBe(false)
      mocks.getPublicMatch.mockResolvedValue({ ...MATCH, status: 'canceled' })
      expect((await render()).equals(generic)).toBe(true)
      mocks.getPublicMatch.mockResolvedValue({
        ...MATCH,
        startsAt: new Date('2020-01-01T23:30:00Z'),
      })
      expect((await render()).equals(generic)).toBe(true)
    },
    TIMEOUT,
  )

  it('no sale a la red y no lleva contador (WhatsApp cachea la vista previa)', async () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/app/(player)/rival/p/[code]/opengraph-image.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/confirmedCount|capacity|filledAt/)
    expect(globalThis.fetch).toBeUndefined()
  })
})
