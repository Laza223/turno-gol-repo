import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRow = {
  id: 't1',
  slug: 'complejo-san-martin',
  name: 'Complejo San Martín',
  description: null,
  logoUrl: 'https://media.turnogol.com/t1/logo-a.webp',
  coverUrl: 'https://media.turnogol.com/t1/cover-b.webp',
  address: 'Av. Siempreviva 742',
  city: 'Luján',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  email: 'hola@complejo.com',
  status: 'active',
  trialEndsAt: null,
  settings: {},
  openingHours: {},
  closedDates: [],
  closesNextDay: false,
  mpConnectedAt: null,
}

const limitMock = vi.fn().mockResolvedValue([mockRow])
const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
const fromMock = vi.fn().mockReturnValue({ where: whereMock })
const selectMock = vi.fn().mockReturnValue({ from: fromMock })

vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(() => ({ select: selectMock })),
  getSql: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  selectMock.mockReturnValue({ from: fromMock })
  fromMock.mockReturnValue({ where: whereMock })
  whereMock.mockReturnValue({ limit: limitMock })
  limitMock.mockResolvedValue([mockRow])
})

describe('getTenantById — coverUrl', () => {
  it('mapea coverUrl desde la fila de DB', async () => {
    const { getTenantById } = await import('@/modules/tenants/tenant.service')
    const tenant = await getTenantById('t1')
    expect(tenant?.coverUrl).toBe('https://media.turnogol.com/t1/cover-b.webp')
    expect(tenant?.logoUrl).toBe('https://media.turnogol.com/t1/logo-a.webp')
  })
})
