import { describe, expect, it } from 'vitest'
import { effectiveSort } from '@/modules/tenants/search.service'

// searchPublicTenants ordena por nombre cuando llega sort=distance sin coordenadas
// (case 'distance': hasGeo ? distancia : nombre). /explorar pide 'distance' siempre y confía en esto.
describe('effectiveSort', () => {
  it('distance sin coordenadas cae a nombre', () => {
    expect(effectiveSort('distance', undefined, undefined)).toBe('name')
  })

  it('distance con solo una coordenada también cae a nombre (hasGeo pide las dos)', () => {
    expect(effectiveSort('distance', -34.6, undefined)).toBe('name')
    expect(effectiveSort('distance', undefined, -58.4)).toBe('name')
  })

  it('distance con lat y lng se respeta', () => {
    expect(effectiveSort('distance', -34.6, -58.4)).toBe('distance')
  })

  it('los demás órdenes no dependen de las coordenadas', () => {
    expect(effectiveSort('price', undefined, undefined)).toBe('price')
    expect(effectiveSort('rating', undefined, undefined)).toBe('rating')
    expect(effectiveSort('name', undefined, undefined)).toBe('name')
  })

  it('sin sort es nombre', () => {
    expect(effectiveSort(undefined, undefined, undefined)).toBe('name')
  })
})
