import { describe, expect, it } from 'vitest'
import {
  generateSlots,
  getPriceForSlot,
  type CourtPricingData,
  type GenerateSlotsParams,
} from '@/modules/tenants/public.service'
import { holdExpiresAtIso } from '@/lib/booking/hold'

const SAMPLE_PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      price: 800000,
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      price: 1200000,
    },
    {
      days: ['fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1500000,
    },
  ],
}

// Base params: 2-slot window (08:00–10:00), future date → all slots free
const BASE_PARAMS: GenerateSlotsParams = {
  courtId: 'court-1',
  pricing: SAMPLE_PRICING,
  dayKey: 'mon',
  openHhmm: '08:00',
  closeHhmm: '10:00',
  closedDay: false,
  courtBookings: [],
  durationMins: 60,
  date: '2026-04-28',
  nowDateStr: '2026-04-27', // yesterday → all slots in the future
  nowMins: 0,
}

describe('getPriceForSlot', () => {
  it('returns price matching day and time window', () => {
    expect(getPriceForSlot(SAMPLE_PRICING.rules, 'mon', '08:00')).toBe(800000)
    expect(getPriceForSlot(SAMPLE_PRICING.rules, 'mon', '17:59')).toBe(800000)
    expect(getPriceForSlot(SAMPLE_PRICING.rules, 'mon', '18:00')).toBe(1200000)
    expect(getPriceForSlot(SAMPLE_PRICING.rules, 'sat', '10:00')).toBe(1500000)
  })

  it('returns null when no rule matches', () => {
    expect(getPriceForSlot(SAMPLE_PRICING.rules, 'mon', '23:30')).toBeNull()
    expect(getPriceForSlot([], 'mon', '08:00')).toBeNull()
  })

  // caza-bugs #11: una regla que cierra a medianoche ('00:00' = fin del día,
  // no el minuto 0) no matcheaba NUNCA (slotMins < 0 es imposible) — todos los
  // slots de esa franja, incluidos los de la tardecita, quedaban con precio
  // null. Mismo tratamiento que court.service.ts calculatePrice.
  it('cierre a medianoche (00:00 = fin del día) cubre toda la franja, no solo el minuto 0', () => {
    const rules = [{ days: ['fri'], from: '20:00', to: '00:00', price: 900000 }]
    expect(getPriceForSlot(rules, 'fri', '20:00')).toBe(900000)
    expect(getPriceForSlot(rules, 'fri', '22:30')).toBe(900000)
    expect(getPriceForSlot(rules, 'fri', '23:59')).toBe(900000)
    // Fuera de la franja: sigue sin matchear.
    expect(getPriceForSlot(rules, 'fri', '19:59')).toBeNull()
  })
})

describe('generateSlots', () => {
  it('returns empty array when closedDay is true', () => {
    expect(generateSlots({ ...BASE_PARAMS, closedDay: true })).toEqual([])
  })

  it('generates correct free slots for an open window', () => {
    const slots = generateSlots(BASE_PARAMS)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ time: '08:00', duration: 60, status: 'free', price: 800000 })
    expect(slots[1]).toMatchObject({ time: '09:00', duration: 60, status: 'free', price: 800000 })
  })

  it('marks all slots past when date is before today', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      date: '2026-04-26', // before nowDateStr '2026-04-27'
    })
    expect(slots).toHaveLength(2)
    expect(slots.every((s) => s.status === 'past')).toBe(true)
  })

  it('marks only slots before nowMins as past when date is today', () => {
    // nowMins = 09:00 → 08:00 slot is past, 09:00 slot is free (not < nowMins)
    const slots = generateSlots({
      ...BASE_PARAMS,
      date: '2026-04-27', // same as nowDateStr
      nowMins: 9 * 60,
    })
    expect(slots[0].status).toBe('past') // 08:00 < 09:00
    expect(slots[1].status).toBe('free') // 09:00 is not < 09:00
  })

  it('marks slot occupied when a booking overlaps it', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      courtBookings: [
        // booking 08:00–10:00 covers both slots
        { courtId: 'court-1', timeStartMins: 8 * 60, timeEndMins: 10 * 60, type: 'spontaneous' },
      ],
    })
    expect(slots[0].status).toBe('occupied') // 08:00–09:00 overlaps
    expect(slots[1].status).toBe('occupied') // 09:00–10:00 overlaps
  })

  it('marks slot fixed when overlapping booking is a turno fijo (abonado)', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      courtBookings: [
        { courtId: 'court-1', timeStartMins: 8 * 60, timeEndMins: 9 * 60, type: 'fixed' },
      ],
    })
    expect(slots[0].status).toBe('fixed')
    expect(slots[1].status).toBe('free')
  })

  it('marks slot blocked when overlapping booking is a block', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      courtBookings: [
        { courtId: 'court-1', timeStartMins: 9 * 60, timeEndMins: 10 * 60, type: 'block' },
      ],
    })
    expect(slots[0].status).toBe('free')
    expect(slots[1].status).toBe('blocked')
  })
})

/**
 * B15 — el agujero que quema inventario.
 *
 * Un `pending_payment` de OTRO jugador caía en el `else` final de la derivación
 * y salía `'occupied'`: en pantalla, idéntico a una cancha vendida. Viernes
 * 20:30, el jugador B lee "Ocupado" y se va a otro complejo; seis minutos
 * después el hold de A expira, el slot vuelve a estar libre y B ya no está.
 *
 * El control negativo de esto es directo: si se borra la rama `'held'`, el
 * primer test de acá vuelve a decir `'occupied'` y se pone rojo.
 */
describe('generateSlots — hold de otro jugador (B15)', () => {
  const CREATED_AT = '2026-04-28T23:30:00.000Z'
  const held = {
    courtId: 'court-1',
    timeStartMins: 8 * 60,
    timeEndMins: 9 * 60,
    type: 'spontaneous' as const,
    status: 'pending_payment',
    createdAt: CREATED_AT,
  }

  it('un pending_payment sale "held" y NO "occupied"', () => {
    const slots = generateSlots({ ...BASE_PARAMS, courtBookings: [held] })
    expect(slots[0].status).toBe('held')
    // El slot de al lado no se contagia.
    expect(slots[1].status).toBe('free')
  })

  it('viaja el instante ABSOLUTO de vencimiento, no los segundos restantes', () => {
    // Un relativo servido desde la caché del CDN (s-maxage=30) llega corrido
    // por hasta 90 s sobre una ventana de 360: el mismo modo de falla que ya
    // hizo perder slots (caza-bugs #12). Absoluto sale bien de la caché siempre.
    const slots = generateSlots({ ...BASE_PARAMS, courtBookings: [held] })
    expect(slots[0].heldUntil).toBe(holdExpiresAtIso(CREATED_AT))
  })

  it('una reserva confirmada sigue siendo "occupied"', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      courtBookings: [{ ...held, status: 'confirmed', createdAt: undefined }],
    })
    expect(slots[0].status).toBe('occupied')
    expect(slots[0].heldUntil).toBeUndefined()
  })

  it('un hold ya vencido por reloj sigue "held", no "free"', () => {
    // La fila sigue en pending_payment hasta que la barre el worker, o sea que
    // el exclusion constraint la sigue rechazando. Decir "libre" sería la misma
    // mentira al revés: el jugador clickea y le rebota.
    const viejo = { ...held, createdAt: '2020-01-01T00:00:00.000Z' }
    const slots = generateSlots({ ...BASE_PARAMS, courtBookings: [viejo] })
    expect(slots[0].status).toBe('held')
    expect(slots[0].heldUntil).toBe(holdExpiresAtIso('2020-01-01T00:00:00.000Z'))
  })

  it('un turno fijo o un bloqueo NO se confunden con un hold', () => {
    for (const type of ['fixed', 'block', 'tournament'] as const) {
      const slots = generateSlots({
        ...BASE_PARAMS,
        courtBookings: [{ ...held, type }],
      })
      expect(slots[0].status).toBe(type === 'fixed' ? 'fixed' : 'blocked')
      expect(slots[0].heldUntil).toBeUndefined()
    }
  })

  it('un slot pasado gana sobre el hold (no se muestra contador de algo que ya pasó)', () => {
    const slots = generateSlots({
      ...BASE_PARAMS,
      date: '2026-04-26',
      courtBookings: [held],
    })
    expect(slots[0].status).toBe('past')
  })
})
