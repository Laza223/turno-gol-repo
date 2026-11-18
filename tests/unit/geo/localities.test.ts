import { describe, expect, it } from 'vitest'
import data from '@/modules/geo/data/localities.json'
import { nearestLocality, searchLocalities } from '@/modules/geo/localities.service'
import { cleanPlaceName, normalizeProvince } from '@/modules/geo/normalize'
import { PROVINCES } from '@/shared/geo/argentina'

describe('dataset de localidades', () => {
  it('trae las 24 provincias y más de 4000 filas', () => {
    expect(data.provinces).toEqual([...PROVINCES])
    expect(new Set(data.rows.map((r) => r[1])).size).toBe(PROVINCES.length)
    expect(data.rows.length).toBeGreaterThanOrEqual(4000)
  })

  it('ninguna fila tiene guion blando ni invisibles', () => {
    const dirty = data.rows.filter((r) => /[­​-‏﻿]/.test(JSON.stringify(r)))
    expect(dirty).toEqual([])
  })

  it('"Open Door" existe', () => {
    expect(searchLocalities('open door')[0]?.city).toBe('Open Door')
  })
})

describe('searchLocalities', () => {
  it('rodriguez encuentra General Rodríguez, sin importar tildes ni mayúsculas', () => {
    expect(searchLocalities('rodriguez').map((l) => l.city)).toContain('General Rodríguez')
    expect(searchLocalities('RODRÍGUEZ').map((l) => l.city)).toContain('General Rodríguez')
  })

  it('lujan devuelve Luján (Buenos Aires) antes que Luján de Cuyo', () => {
    const cities = searchLocalities('lujan')
    expect(cities[0]).toMatchObject({ city: 'Luján', province: 'Buenos Aires' })
    const cuyo = cities.findIndex((l) => l.city === 'Luján de Cuyo')
    expect(cuyo).toBeGreaterThan(0)
  })

  it('mercedes trae varias provincias y la cabecera de Buenos Aires primero', () => {
    const results = searchLocalities('mercedes')
    expect(results[0]).toMatchObject({ city: 'Mercedes', province: 'Buenos Aires' })
    expect(new Set(results.map((l) => l.province)).size).toBeGreaterThanOrEqual(3)
  })

  it('acepta la provincia en la consulta', () => {
    expect(searchLocalities('mercedes corrientes')[0]).toMatchObject({
      city: 'Mercedes',
      province: 'Corrientes',
    })
    expect(searchLocalities('lujan buenos aires')[0]).toMatchObject({
      city: 'Luján',
      province: 'Buenos Aires',
    })
  })

  it('exige 2 caracteres y respeta el límite', () => {
    expect(searchLocalities('l')).toEqual([])
    expect(searchLocalities('san', { limit: 3 })).toHaveLength(3)
    expect(searchLocalities('san')).toHaveLength(8)
  })
})

describe('nearestLocality', () => {
  it('el centro de Luján cae en Luján', () => {
    expect(nearestLocality(-34.5663, -59.1147, { maxKm: 6 })).toMatchObject({
      city: 'Luján',
      province: 'Buenos Aires',
    })
  })

  it('devuelve null si no hay nada dentro del radio', () => {
    expect(nearestLocality(-34.5663, -59.1147, { maxKm: 6, departmentId: '99999' })).toBeNull()
  })
})

describe('normalize', () => {
  it('limpia guion blando y espacios', () => {
    expect(cleanPlaceName('  General Rodri­guez  ')).toBe('General Rodriguez')
  })

  it('mapea las provincias de Georef a PROVINCES', () => {
    expect(normalizeProvince('Ciudad Autónoma de Buenos Aires')).toBe('CABA')
    expect(normalizeProvince('Tierra del Fuego, Antártida e Islas del Atlántico Sur')).toBe(
      'Tierra del Fuego',
    )
    expect(normalizeProvince('Cordoba')).toBe('Córdoba')
  })
})
