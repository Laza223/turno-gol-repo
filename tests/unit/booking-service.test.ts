import { describe, expect, it } from 'vitest'
import { generateSlots } from '@/modules/bookings/booking.service'
import type { CourtPricingData } from '@/modules/courts/court.types'

const PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      prices: { '60': 800000, '120': 1500000 },
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      prices: { '60': 1200000, '120': 2300000 },
    },
  ],
}

describe('generateSlots', () => {
  it('returns empty when closedDay=true', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: true,
      occupied: [],
      durationMins: 60,
    })
    expect(slots).toHaveLength(0)
  })

  it('generates 60-min slots from 08:00 to 22:00 → 15 slots', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    expect(slots).toHaveLength(15)
    expect(slots[0]?.timeStart).toBe('08:00')
    expect(slots[0]?.timeEnd).toBe('09:00')
    expect(slots[slots.length - 1]?.timeStart).toBe('22:00')
  })

  it('marks overlapping slots as not available', () => {
    // Booking from 14:00 to 16:00 occupies slots 14:00-15:00 and 15:00-16:00.
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [{ timeStartMins: 14 * 60, timeEndMins: 16 * 60 }],
      durationMins: 60,
    })
    const occ = slots.filter((s) => !s.available)
    expect(occ.map((s) => s.timeStart)).toEqual(['14:00', '15:00'])
  })

  it('attaches the correct price per duration and rule', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    const morning = slots.find((s) => s.timeStart === '09:00')
    const evening = slots.find((s) => s.timeStart === '19:00')
    expect(morning?.price).toBe(800000)
    expect(evening?.price).toBe(1200000)
  })

  it('returns null price when no rule matches the slot', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'fri', // not covered by PRICING (only mon-thu)
      openHhmm: '08:00',
      closeHhmm: '23:00',
      closedDay: false,
      occupied: [],
      durationMins: 60,
    })
    expect(slots.every((s) => s.price === null)).toBe(true)
  })

  it('120-min slots advance by 120 mins', () => {
    const slots = generateSlots({
      pricing: PRICING,
      dayKey: 'mon',
      openHhmm: '08:00',
      closeHhmm: '12:00',
      closedDay: false,
      occupied: [],
      durationMins: 120,
    })
    expect(slots).toHaveLength(2)
    expect(slots[0]?.timeStart).toBe('08:00')
    expect(slots[1]?.timeStart).toBe('10:00')
    expect(slots[0]?.price).toBe(1500000)
  })
})
