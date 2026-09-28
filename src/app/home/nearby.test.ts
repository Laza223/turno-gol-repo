import { describe, expect, it } from 'vitest'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse, slot } from '@/test/fixtures/public'
import { distanceLabel, formatsLabel, freeSlots, headlineDistance, pickNearby } from './nearby'

const at = (id: string, km: number | null, over: Partial<PublicTenantCard> = {}) =>
  publicTenantCard({
    id,
    slug: id,
    name: id,
    distanceKm: km,
    coverUrl: '/foto.png',
    fromPriceCents: 6000000,
    ...over,
  })

describe('pickNearby', () => {
  it('se queda en el radio más chico que junta tres complejos', () => {
    const r = pickNearby([at('a', 2), at('b', 4), at('c', 4.9), at('d', 8)])
    expect(r.radiusKm).toBe(5)
    expect(r.inZone).toBe(3)
    expect(r.picked.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('abre el radio hasta que entran tres (Luján → General Rodríguez)', () => {
    const r = pickNearby([at('lujan', 3), at('open-door', 9), at('rodriguez', 19.5)])
    expect(r.radiusKm).toBe(20)
    expect(r.picked.map((t) => t.id)).toEqual(['lujan', 'open-door', 'rodriguez'])
  })

  it('más allá de 40 km no hay "cerca": devuelve lo que haya hasta ahí', () => {
    const r = pickNearby([at('cerca', 12), at('lejos', 300)])
    expect(r.radiusKm).toBe(40)
    expect(r.picked.map((t) => t.id)).toEqual(['cerca'])
  })

  it('sin nada a menos de 40 km devuelve vacío', () => {
    expect(pickNearby([at('jujuy', 1400)]).picked).toEqual([])
  })

  it('deja afuera a los que no toman reservas online y a los sin coordenadas', () => {
    const r = pickNearby([
      at('sin-online', 1, { allowOnlineBooking: false }),
      at('sin-coords', null),
      at('ok', 2),
    ])
    expect(r.picked.map((t) => t.id)).toEqual(['ok'])
  })

  it('el perfil completo le gana a la distancia; entre iguales, la distancia', () => {
    const r = pickNearby([
      at('cerca-sin-foto', 1, { coverUrl: null }),
      at('lejos-completo', 4),
      at('medio-completo', 3),
      at('sin-precio', 2, { fromPriceCents: null }),
    ])
    // Los dos incompletos empatan en puntaje: gana el más cerca.
    expect(r.picked.map((t) => t.id)).toEqual([
      'medio-completo',
      'lejos-completo',
      'cerca-sin-foto',
    ])
  })
})

describe('etiquetas', () => {
  it('distancia con coma, entera desde 10 km y "menos de 1 km"', () => {
    expect(distanceLabel(4.24)).toBe('a 4,2 km')
    expect(distanceLabel(4)).toBe('a 4 km')
    expect(distanceLabel(11.4)).toBe('a 11 km')
    expect(distanceLabel(0.4)).toBe('a menos de 1 km')
  })

  it('el titular redondea al km', () => {
    expect(headlineDistance(4.24)).toBe('a 4 km')
    expect(headlineDistance(0.6)).toBe('a menos de 1 km')
  })

  it('formatos ordenados y sin repetir', () => {
    expect(formatsLabel([7, 5, 5])).toBe('Fútbol 5 y 7')
    expect(formatsLabel([11, 5, 7])).toBe('Fútbol 5, 7 y 11')
    expect(formatsLabel([5])).toBe('Fútbol 5')
    expect(formatsLabel([])).toBeNull()
  })
})

describe('freeSlots', () => {
  it('toma los libres sin repetir horario y linkea a la primera cancha libre', () => {
    const a = availabilityResponse({ date: '2026-09-27' })
    const out = freeSlots('complejo-fenix', a, 4)
    expect(out.map((s) => s.time)).toEqual(['10:00', '20:00', '21:00'])
    expect(out[0]!.href).toBe(
      `/complejo-fenix/reservar?court=${a.courts[0]!.id}&date=2026-09-27&time=10:00&dur=60`,
    )
  })

  it('respeta el orden de la grilla cuando el día cruza la medianoche', () => {
    const base = availabilityResponse({ date: '2026-09-27' })
    const a = {
      ...base,
      courts: [
        {
          ...base.courts[0]!,
          slots: [slot({ time: '23:00', status: 'free' }), slot({ time: '00:00', status: 'free' })],
        },
      ],
    }
    expect(freeSlots('x', a, 4).map((s) => s.time)).toEqual(['23:00', '00:00'])
  })

  it('corta en el máximo pedido', () => {
    expect(freeSlots('x', availabilityResponse(), 1)).toHaveLength(1)
  })
})
