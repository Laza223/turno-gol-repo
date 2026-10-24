import { beforeEach, describe, expect, it, vi } from 'vitest'

// Las consultas se reemplazan por filas fijas: lo que se prueba es qué sale
// hacia el jugador, no el SQL. `withTenantContext` devuelve directo lo que la
// transacción habría devuelto.
const db = vi.hoisted(() => ({ result: undefined as unknown }))
vi.mock('@/shared/db/client', () => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(async () => db.result),
}))

import {
  getPublicAvailability,
  getPublicCourtCards,
  getPublicWeeklyAvailability,
  type PublicTenant,
} from '@/modules/tenants/public.service'
import { artTodayStr } from '@/shared/dates/art'
import { publicTenant } from '@/test/fixtures/public'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1_500_000,
    },
  ],
}
const COURT = {
  id: 'court-1',
  name: 'Cancha 1',
  surfaceType: 'synthetic',
  isCovered: false,
  hasLighting: true,
  format: 5,
  capacity: 10,
  photos: [],
  pricing: PRICING,
}
// Lejos en el futuro: todos los slots libres, ninguno "past".
const DATE = '2099-06-15'

function tenant(hidePrices: boolean): PublicTenant {
  return { ...publicTenant(), hidePrices } as PublicTenant
}

function prices(courts: { slots: { price: number | null }[] }[]): (number | null)[] {
  return courts.flatMap((c) => c.slots.map((s) => s.price))
}

describe('settings.hide_public_prices — lo que sale del service público', () => {
  beforeEach(() => {
    db.result = undefined
  })

  it('disponibilidad del día: todos los slots con price null', async () => {
    db.result = { courtsData: [COURT], bookingsData: [] }
    const res = await getPublicAvailability(tenant(true), DATE)
    const all = prices(res.courts)
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((p) => p === null)).toBe(true)
  })

  it('checkout (keepPrices): el precio real sigue disponible para calcular la seña', async () => {
    db.result = { courtsData: [COURT], bookingsData: [] }
    const res = await getPublicAvailability(tenant(true), DATE, { keepPrices: true })
    expect(prices(res.courts).every((p) => p === 1_500_000)).toBe(true)
  })

  it('control: con precios visibles los slots traen su precio', async () => {
    db.result = { courtsData: [COURT], bookingsData: [] }
    const res = await getPublicAvailability(tenant(false), DATE)
    expect(prices(res.courts).every((p) => p === 1_500_000)).toBe(true)
  })

  it('disponibilidad semanal: price null en todos los días', async () => {
    db.result = { courtsData: [COURT], bookingsByDate: new Map() }
    // Arranca hoy: el semanal solo devuelve días dentro de la ventana de reserva.
    const res = await getPublicWeeklyAvailability(tenant(true), artTodayStr())
    const all = res.days.flatMap((d) => prices(d.courts))
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((p) => p === null)).toBe(true)
  })

  it('tarjetas de cancha del perfil: sin "desde $X"', async () => {
    db.result = [COURT]
    expect((await getPublicCourtCards(tenant(true)))[0]!.fromPriceCents).toBeNull()
    db.result = [COURT]
    expect((await getPublicCourtCards(tenant(false)))[0]!.fromPriceCents).toBe(1_500_000)
  })
})

// El Vagón (2026-10-24): domingo abierto sin tarifa. El portal y el bot lo
// ofrecían libre y la reserva explotaba con PriceUnavailableError. Un turno sin
// precio no se ofrece, también cuando el complejo oculta los precios.
describe('turnos sin precio no se ofrecen como libres', () => {
  const HALF_PRICED = {
    ...COURT,
    pricing: { rules: [{ ...PRICING.rules[0]!, to: '18:00' }] },
  }

  function statusByTime(courts: { slots: { time: string; status: string }[] }[]) {
    return Object.fromEntries(courts[0]!.slots.map((s) => [s.time, s.status]))
  }

  it.each([true, false])('con hidePrices=%s, solo lo tarifado queda libre', async (hide) => {
    db.result = { courtsData: [HALF_PRICED], bookingsData: [] }
    const status = statusByTime((await getPublicAvailability(tenant(hide), DATE)).courts)
    expect(status['17:00']).toBe('free')
    expect(status['18:00']).toBe('occupied')
    expect(status['22:00']).toBe('occupied')
  })

  it('el semanal aplica la misma regla', async () => {
    db.result = { courtsData: [{ ...COURT, pricing: { rules: [] } }], bookingsByDate: new Map() }
    const res = await getPublicWeeklyAvailability(tenant(true), artTodayStr())
    const statuses = res.days.flatMap((d) => d.courts.flatMap((c) => c.slots.map((s) => s.status)))
    expect(statuses.length).toBeGreaterThan(0)
    expect(statuses).not.toContain('free')
  })
})
