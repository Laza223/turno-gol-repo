import { describe, it, expect } from 'vitest'
import { PROVINCES, resolveMapCenter } from '@/modules/tenants/tenant.geo'

/** Recuadro continental + austral de Argentina, con margen. */
const AR_BBOX = { minLat: -56, maxLat: -21, minLng: -74, maxLng: -53 }

describe('resolveMapCenter', () => {
  // Prueba las 24 filas de la tabla de centros sin exportarla: knip corre con
  // ignoreExportsUsedInFile en falso y un export usado sólo en su archivo
  // pondría el job en rojo.
  it.each(PROVINCES)('la provincia %s cae dentro de Argentina', (province) => {
    const { center, zoom } = resolveMapCenter(province, null, null)
    const [lat, lng] = center
    expect(lat).toBeGreaterThan(AR_BBOX.minLat)
    expect(lat).toBeLessThan(AR_BBOX.maxLat)
    expect(lng).toBeGreaterThan(AR_BBOX.minLng)
    expect(lng).toBeLessThan(AR_BBOX.maxLng)
    expect(zoom).toBeGreaterThan(4)
  })

  it('el punto cargado gana sobre la provincia', () => {
    const { center, zoom } = resolveMapCenter('Santa Fe', -34.6091, -58.4416)
    expect(center).toEqual([-34.6091, -58.4416])
    expect(zoom).toBeGreaterThanOrEqual(16)
  })

  // Los complejos existentes cargaron la provincia como texto libre antes de
  // que hubiera lista cerrada, así que en la base puede haber una escritura
  // que no matchea. El respaldo no es cosmético: sin él el mapa abre en el
  // Atlántico o revienta.
  it.each([
    ['una escritura distinta', 'Ciudad Autónoma de Buenos Aires'],
    ['cadena vacía', ''],
    ['null', null],
    ['undefined', undefined],
  ])('cae al centro del país con %s', (_label, province) => {
    const { center, zoom } = resolveMapCenter(province, null, null)
    expect(center).toEqual([-38.4161, -63.6167])
    expect(zoom).toBe(4)
  })

  it('tolera espacios alrededor del nombre', () => {
    expect(resolveMapCenter('  Córdoba  ', null, null)).toEqual(
      resolveMapCenter('Córdoba', null, null),
    )
  })

  it('media coordenada no cuenta como punto cargado', () => {
    expect(resolveMapCenter('Santa Fe', -34.6091, null).zoom).toBe(8)
  })
})
