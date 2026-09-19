import { describe, expect, it } from 'vitest'
import { countCourtsWithoutPhoto, getProfileGaps } from '@/modules/tenants/setup-gaps'

const complete = {
  coverUrl: 'https://media.turnogol.com/t1/cover.webp',
  logoUrl: 'https://media.turnogol.com/t1/logo.webp',
  latitude: -34.55,
  longitude: -59.11,
}

describe('getProfileGaps', () => {
  it('perfil completo: no falta nada', () => {
    expect(getProfileGaps(complete)).toEqual([])
  })

  it('perfil vacío: avisa portada, logo y ubicación, en ese orden', () => {
    const gaps = getProfileGaps({ coverUrl: null, logoUrl: null, latitude: null, longitude: null })
    expect(gaps.map((g) => g.key)).toEqual(['cover', 'logo', 'map_location'])
  })

  it('cada faltante dice qué se pierde', () => {
    const [gap] = getProfileGaps({ ...complete, coverUrl: null })
    expect(gap).toMatchObject({ key: 'cover', label: 'Portada' })
    expect(gap!.impact).not.toBe('')
  })

  it('con una sola de las dos coordenadas la ubicación sigue faltando', () => {
    expect(getProfileGaps({ ...complete, longitude: null }).map((g) => g.key)).toEqual([
      'map_location',
    ])
    expect(getProfileGaps({ ...complete, latitude: null }).map((g) => g.key)).toEqual([
      'map_location',
    ])
  })
})

describe('countCourtsWithoutPhoto', () => {
  it('cuenta solo las canchas sin ninguna foto', () => {
    expect(countCourtsWithoutPhoto([{ photos: [] }, { photos: ['a.webp'] }, { photos: [] }])).toBe(
      2,
    )
  })

  it('sin canchas, cero', () => {
    expect(countCourtsWithoutPhoto([])).toBe(0)
  })
})
