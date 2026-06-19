import { describe, expect, it } from 'vitest'
import {
  generateSlots,
  getPriceForSlot,
  type CourtPricingData,
  type GenerateSlotsParams,
} from '@/modules/tenants/public.service'

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
    expect(slots[0].status).toBe('past')  // 08:00 < 09:00
    expect(slots[1].status).toBe('free')  // 09:00 is not < 09:00
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
