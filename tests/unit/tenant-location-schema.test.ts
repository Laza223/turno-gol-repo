import { describe, it, expect } from 'vitest'
import { tenantLocationSchema } from '@/modules/tenants/tenant.schema'

const base = {
  address: 'Av. Corrientes 1234',
  city: 'Rosario',
  province: 'Santa Fe',
}

describe('tenantLocationSchema — coordenadas', () => {
  // EL caso. `Number('')` es 0 en JavaScript: con `z.coerce.number()` a pelo,
  // un formulario enviado sin marcar el punto guardaría (0, 0) — el Golfo de
  // Guinea — y el complejo aparecería a diez mil kilómetros del jugador, sin
  // ningún error visible en ninguna capa.
  it('un par vacío da null, NUNCA cero', () => {
    const parsed = tenantLocationSchema.safeParse({ ...base, latitude: '', longitude: '' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.latitude).toBeNull()
    expect(parsed.success && parsed.data.longitude).toBeNull()
  })

  it('los campos ausentes se tratan igual que los vacíos', () => {
    const parsed = tenantLocationSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.latitude).toBeNull()
  })

  it('convierte a número, no deja el string del formulario', () => {
    const parsed = tenantLocationSchema.safeParse({
      ...base,
      latitude: '-34.6091',
      longitude: '-58.4416',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.latitude).toBe(-34.6091)
    expect(parsed.success && parsed.data.longitude).toBe(-58.4416)
  })

  it('acepta el cero explícito (el ecuador y el meridiano existen)', () => {
    const parsed = tenantLocationSchema.safeParse({ ...base, latitude: '0', longitude: '0' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.latitude).toBe(0)
  })

  it.each([
    ['latitud arriba de 90', { latitude: '91', longitude: '-58.4' }],
    ['latitud abajo de -90', { latitude: '-91', longitude: '-58.4' }],
    ['longitud arriba de 180', { latitude: '-34.6', longitude: '181' }],
    ['longitud abajo de -180', { latitude: '-34.6', longitude: '-181' }],
    ['texto no numérico', { latitude: 'abc', longitude: '-58.4' }],
  ])('rechaza %s', (_label, coords) => {
    expect(tenantLocationSchema.safeParse({ ...base, ...coords }).success).toBe(false)
  })

  // Media coordenada es un estado que ninguna pantalla sabe renderizar:
  // ExplorarMap exige las dos y el Haversine devuelve NULL si falta una.
  it.each([
    ['latitud sin longitud', { latitude: '-34.6091', longitude: '' }],
    ['longitud sin latitud', { latitude: '', longitude: '-58.4416' }],
  ])('rechaza %s', (_label, coords) => {
    expect(tenantLocationSchema.safeParse({ ...base, ...coords }).success).toBe(false)
  })
})

describe('tenantLocationSchema — dirección', () => {
  it('hereda la validación de createTenantSchema', () => {
    const parsed = tenantLocationSchema.safeParse({ ...base, address: 'A12' })
    expect(parsed.success).toBe(false)
  })
})
