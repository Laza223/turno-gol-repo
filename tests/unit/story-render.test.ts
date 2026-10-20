import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { renderStoryPng } from '@/lib/story-image/render'
import type { StoryModel } from '@/lib/story-image/model'
import { buildStoryModel } from '@/modules/tenants/story-summary'

// Bajo `singleThread` un `global.fetch = vi.fn()` de otro archivo (hay varios
// tests que lo asignan sin restaurar) llega hasta acá, y el wasm de `next/og` lo
// usa para cargarse: el render revienta con "expected magic word" según el orden
// en que corran los archivos. Se saca `fetch` mientras dura ESTE archivo (antes de
// que se evalúe `next/og`) y se devuelve al final. De paso, cualquier intento de
// salir a la red falla en el acto.
const leakedFetch = vi.hoisted(() => {
  const saved = globalThis.fetch
  Reflect.deleteProperty(globalThis, 'fetch')
  return saved
})

afterAll(() => {
  globalThis.fetch = leakedFetch
})

// Render REAL (satori + resvg, sin mocks): lo que se prueba acá es que el PNG
// sale bien formado, del tamaño de una historia y sin tocar la red. La
// fidelidad visual se mira a ojo (ver el checkpoint de diseño), no acá.
//
// Satori en frío tarda ~1 s; el timeout de 10 s por defecto alcanza pero en CI
// compartido queda justo.
const TIMEOUT = 30_000

const PNG_SIGNATURE = '89504e470d0a1a0a'

function hours(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: `${String(17 + i).padStart(2, '0')}:00`,
    freeCourts: (i % 3) + 1,
  }))
}

function model(overrides: Partial<StoryModel> = {}): StoryModel {
  return {
    kicker: 'HOY · MARTES',
    dayWord: 'HOY',
    tenantName: 'M10 Menotti',
    hours: hours(4),
    hiddenHours: 0,
    cta: 'RESERVÁ TU CANCHA',
    portalHost: 'turnogol.app/m10',
    ...overrides,
  }
}

function expectStoryPng(bytes: ArrayBuffer) {
  const buf = Buffer.from(bytes)
  expect(buf.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE)
  // IHDR: ancho y alto, big-endian, en los bytes 16-23.
  expect(buf.readUInt32BE(16)).toBe(1080)
  expect(buf.readUInt32BE(20)).toBe(1920)
  // Una placa de ~300 KB es lo esperable; que se dispare avisa de un degradé o una sombra de más.
  expect(buf.length).toBeGreaterThan(50_000)
  expect(buf.length).toBeLessThan(900_000)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderStoryPng', () => {
  const cases: Array<[string, StoryModel]> = [
    ['un solo horario', model({ hours: hours(1) })],
    ['dos horarios', model({ hours: hours(2) })],
    ['cuatro horarios', model()],
    ['desborde: cuatro horarios y "y N más"', model({ hiddenHours: 3 })],
    [
      'día de nueve letras, nombre largo y tildes',
      model({
        kicker: 'MAÑANA · MIÉRCOLES',
        dayWord: 'MAÑANA',
        tenantName: 'Club Atlético Deportivo y Social Sportivo Nueva Generación de Barrio Ñandú',
        portalHost: 'turnogol.app/club-atletico-deportivo-sportivo-nueva-generacion',
      }),
    ],
    [
      'nombre en mayúsculas de dos líneas y desborde',
      model({
        tenantName: 'CLUB ATLETICO DEPORTIVO SPORTIVO NUEVA GENERACION',
        hiddenHours: 3,
      }),
    ],
    ['sin reserva online', model({ cta: 'MIRÁ LOS HORARIOS' })],
  ]

  it.each(cases)(
    'genera un PNG 1080×1920 válido: %s',
    async (_name, m) => {
      expectStoryPng(await renderStoryPng(m))
    },
    TIMEOUT,
  )

  it(
    'no sale a la red a buscar fuentes ni emojis',
    async () => {
      const fetchSpy = vi.fn(async () => {
        throw new Error('la placa no debería pedir nada por la red')
      })
      vi.stubGlobal('fetch', fetchSpy)

      expectStoryPng(
        await renderStoryPng(model({ kicker: 'SÁBADO · 3 DE OCTUBRE', dayWord: 'SÁBADO' })),
      )
      expect(fetchSpy).not.toHaveBeenCalled()
    },
    TIMEOUT,
  )

  it(
    'un nombre con emoji y otros alfabetos sale sin red: el sanitizado lo cubre de punta a punta',
    async () => {
      const fetchSpy = vi.fn(async () => {
        throw new Error('la placa no debería pedir nada por la red')
      })
      vi.stubGlobal('fetch', fetchSpy)

      const result = buildStoryModel({
        tenant: { name: '⚽ M10 Мяч Menotti 🔥', slug: 'm10', allowOnlineBooking: true },
        availability: {
          date: '2026-09-29',
          courts: [
            {
              id: 'c1',
              name: 'Cancha 1',
              surfaceType: 'synthetic',
              isCovered: false,
              hasLighting: true,
              format: 5,
              slots: [{ time: '21:00', duration: 60, status: 'free', price: 2500000 }],
            },
          ],
        },
        todayStr: '2026-09-29',
        portalUrl: 'https://turnogol.app/m10',
      })
      if (!result.ok) throw new Error(`esperaba ok, vino ${result.reason}`)

      expect(result.model.tenantName).toBe('M10 Menotti')
      expectStoryPng(await renderStoryPng(result.model))
      expect(fetchSpy).not.toHaveBeenCalled()
    },
    TIMEOUT,
  )
})
