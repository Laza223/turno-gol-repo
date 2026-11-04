// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  markZonaApplied,
  mergeZona,
  parseZona,
  roundCoord,
  serializeZona,
  wasZonaApplied,
  type SavedZona,
} from '@/lib/zona-storage'

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('parseZona', () => {
  it('ida y vuelta con serializeZona', () => {
    const zona: SavedZona = { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.1 }
    expect(parseZona(serializeZona(zona))).toEqual(zona)
  })

  it('acepta solo coordenadas (las deja el toolbar de /explorar)', () => {
    expect(parseZona('{"lat":-34.57,"lng":-59.1}')).toEqual({ lat: -34.57, lng: -59.1 })
  })

  it.each([
    ['null', null],
    ['vacío', ''],
    ['JSON roto', '{city:'],
    ['no es un objeto', '"Luján"'],
    ['array', '[1,2]'],
    ['objeto sin nada útil', '{"source":"gps"}'],
    ['ciudad vacía', '{"city":""}'],
    ['una sola coordenada', '{"lat":-34.5}'],
    ['coordenadas fuera de rango', '{"lat":999,"lng":0}'],
    ['coordenadas no numéricas', '{"lat":"a","lng":"b"}'],
  ])('devuelve null con %s', (_name, raw) => {
    expect(parseZona(raw)).toBeNull()
  })

  it('descarta la provincia si no hay ciudad', () => {
    expect(parseZona('{"province":"Córdoba","lat":-31,"lng":-64}')).toEqual({ lat: -31, lng: -64 })
  })
})

describe('mergeZona', () => {
  const lujan: SavedZona = { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.1 }

  it('guardar solo coordenadas conserva la ciudad', () => {
    expect(mergeZona(lujan, { lat: -34.6, lng: -59.2 })).toEqual({
      city: 'Luján',
      province: 'Buenos Aires',
      lat: -34.6,
      lng: -59.2,
    })
  })

  it('elegir OTRA ciudad descarta las coordenadas viejas (si no, "Más cercano" ordena desde Luján)', () => {
    expect(mergeZona(lujan, { city: 'Córdoba', province: 'Córdoba' })).toEqual({
      city: 'Córdoba',
      province: 'Córdoba',
    })
  })

  it('misma ciudad elegida otra vez conserva las coordenadas', () => {
    expect(mergeZona(lujan, { city: 'Luján', province: 'Buenos Aires' })).toEqual(lujan)
  })

  it('mismo nombre en otra provincia cuenta como ciudad distinta', () => {
    expect(mergeZona(lujan, { city: 'Luján', province: 'San Luis' })).toEqual({
      city: 'Luján',
      province: 'San Luis',
    })
  })

  it('ciudad nueva con sus propias coordenadas (GPS) las conserva', () => {
    expect(
      mergeZona(lujan, { city: 'Córdoba', province: 'Córdoba', lat: -31.42, lng: -64.19 }),
    ).toEqual({ city: 'Córdoba', province: 'Córdoba', lat: -31.42, lng: -64.19 })
  })

  it('sin zona previa devuelve el patch', () => {
    expect(mergeZona(null, { city: 'Luján' })).toEqual({ city: 'Luján' })
  })
})

describe('roundCoord', () => {
  it('redondea a 2 decimales (~1 km)', () => {
    expect(roundCoord(-34.570312)).toBe(-34.57)
    expect(roundCoord(-59.10499)).toBe(-59.1)
    expect(roundCoord(-31.4251)).toBe(-31.43)
  })
})

describe('marca de zona aplicada (por pestaña)', () => {
  it('arranca sin marca y la recuerda una vez puesta', () => {
    expect(wasZonaApplied()).toBe(false)
    markZonaApplied()
    expect(wasZonaApplied()).toBe(true)
  })

  it('con sessionStorage bloqueado no explota', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked })
    expect(() => markZonaApplied()).not.toThrow()
    // Queda la marca en memoria: sin ella el filtro de ciudad de /explorar no se podría sacar.
    expect(wasZonaApplied()).toBe(true)
  })
})
