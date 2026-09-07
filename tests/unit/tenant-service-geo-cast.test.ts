import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Borde de conversión de las coordenadas del complejo.
 *
 * La columna es `numeric(10,7)` y drizzle la habla como STRING; el dominio
 * (`TenantRow`, `UpdateTenantInput`) habla NÚMEROS. Los dos lados de esa
 * frontera fallan en silencio si se rompen: `Number(null)` es 0, y un spread
 * ciego en el UPDATE pisaría con NULL el punto guardado.
 */

const mockRow = {
  id: 't1',
  slug: 'complejo-san-martin',
  name: 'Complejo San Martín',
  description: null,
  logoUrl: null,
  coverUrl: null,
  address: 'Av. Siempreviva 742',
  city: 'Luján',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  whatsapp: null,
  email: 'hola@complejo.com',
  status: 'active',
  trialEndsAt: null,
  settings: {},
  openingHours: {},
  closedDates: [],
  closesNextDay: false,
  mpConnectedAt: null,
  mpNickname: null,
  // Como las devuelve postgres-js: texto, con la escala completa de la columna.
  latitude: '-34.6091000',
  longitude: '-58.4416000',
}

const limitMock = vi.fn().mockResolvedValue([mockRow])
const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
const fromMock = vi.fn().mockReturnValue({ where: whereMock })
const selectMock = vi.fn().mockReturnValue({ from: fromMock })

const updateWhereMock = vi.fn().mockResolvedValue(undefined)
const setMock = vi.fn().mockReturnValue({ where: updateWhereMock })
const updateMock = vi.fn().mockReturnValue({ set: setMock })

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => ({ select: selectMock, update: updateMock })),
  getSql: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  selectMock.mockReturnValue({ from: fromMock })
  fromMock.mockReturnValue({ where: whereMock })
  whereMock.mockReturnValue({ limit: limitMock })
  limitMock.mockResolvedValue([mockRow])
  updateMock.mockReturnValue({ set: setMock })
  setMock.mockReturnValue({ where: updateWhereMock })
})

describe('lectura — la columna llega como texto y el dominio quiere número', () => {
  it('convierte el texto de postgres a number', async () => {
    const { getTenantById } = await import('@/modules/tenants/tenant.service')
    const tenant = await getTenantById('t1')
    expect(tenant?.latitude).toBe(-34.6091)
    expect(tenant?.longitude).toBe(-58.4416)
  })

  // `Number(null)` es 0: sin la guarda explícita, un complejo sin ubicación
  // cargada aparecería en el Golfo de Guinea en vez de no aparecer.
  it('preserva el null en vez de convertirlo en cero', async () => {
    limitMock.mockResolvedValue([{ ...mockRow, latitude: null, longitude: null }])
    const { getTenantById } = await import('@/modules/tenants/tenant.service')
    const tenant = await getTenantById('t1')
    expect(tenant?.latitude).toBeNull()
    expect(tenant?.longitude).toBeNull()
  })
})

describe('escritura — el dominio manda número y la columna quiere texto', () => {
  it('escribe las coordenadas como texto con la escala de la columna', async () => {
    const { updateTenant } = await import('@/modules/tenants/tenant.service')
    await updateTenant('t1', { latitude: -34.6091, longitude: -58.4416 })
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: '-34.6091000', longitude: '-58.4416000' }),
    )
  })

  it('el null explícito borra el punto', async () => {
    const { updateTenant } = await import('@/modules/tenants/tenant.service')
    await updateTenant('t1', { latitude: null, longitude: null })
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: null, longitude: null }),
    )
  })

  // El que atrapa el spread ingenuo. `updateTenant` es un update PARCIAL: cada
  // guardado del wizard, del form de contacto o del de horarios pasa por acá
  // sin mandar coordenadas. Si las claves se colaran, el punto cargado se
  // borraría en el próximo guardado de cualquier otra pantalla.
  it('no toca las coordenadas cuando el input no las trae', async () => {
    const { updateTenant } = await import('@/modules/tenants/tenant.service')
    await updateTenant('t1', { name: 'Complejo Nuevo' })
    const written = setMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written).not.toHaveProperty('latitude')
    expect(written).not.toHaveProperty('longitude')
  })

  it('un valor exponencial no llega crudo a la columna', async () => {
    const { updateTenant } = await import('@/modules/tenants/tenant.service')
    await updateTenant('t1', { latitude: 1e-7, longitude: -58.4416 })
    const written = setMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written.latitude).toBe('0.0000001')
  })
})
