import { describe, it, expect } from 'vitest'
import { createManualBookingSchema } from '@/modules/bookings/booking.schema'

const STAFF = '00000000-0000-0000-0000-000000000001'
const COURT = '00000000-0000-0000-0000-000000000002'
const PLAYER = '00000000-0000-0000-0000-000000000003'

const base = {
  courtId: COURT,
  date: '2026-06-21',
  timeStart: '18:00',
  timeEnd: '19:00',
  durationMins: 60 as const,
  staffUserId: STAFF,
}

describe('createManualBookingSchema — manual block flow', () => {
  it('accepts an internal block with an auto-filled reason name and no phone', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Mantenimiento',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a free internal block: priceOverride 0', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Escuelita de Fútbol',
      priceOverride: 0,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a spontaneous phone reservation with name only (no phone)', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      guestName: 'Juan',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a spontaneous phone reservation with phone only (no name)', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      guestPhone: '11-1234-5678',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a spontaneous reservation with both name and phone', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      guestName: 'Juan',
      guestPhone: '11-1234-5678',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a spontaneous reservation with neither name nor phone', () => {
    const r = createManualBookingSchema.safeParse({ ...base, type: 'spontaneous' })
    expect(r.success).toBe(true)
  })

  it('rejects mixing a registered playerId with guest contact data', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      playerId: PLAYER,
      guestName: 'Juan',
    })
    expect(r.success).toBe(false)
  })

  it('accepts priceOverride 0 on a spontaneous booking', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      priceOverride: 0,
    })
    expect(r.success).toBe(true)
  })

  it('rejects a negative priceOverride', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'spontaneous',
      priceOverride: -1,
    })
    expect(r.success).toBe(false)
  })
})

// Rediseño 2026-09-14: un `block` nunca carga plata.
describe('createManualBookingSchema — un block nunca carga plata', () => {
  it('rejects a block with a positive priceOverride', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Mantenimiento',
      priceOverride: 500000,
    })
    expect(r.success).toBe(false)
  })

  it('rejects a block with depositAmount/depositMethod/depositStatus', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Mantenimiento',
      depositAmount: 100000,
      depositMethod: 'cash',
      depositStatus: 'paid',
    })
    expect(r.success).toBe(false)
  })

  it('rejects a block with depositMethod alone, even with depositAmount 0', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Mantenimiento',
      depositAmount: 0,
      depositMethod: 'cash',
    })
    expect(r.success).toBe(false)
  })

  it('accepts a plain block: no price, no deposit', () => {
    const r = createManualBookingSchema.safeParse({
      ...base,
      type: 'block',
      guestName: 'Mantenimiento',
    })
    expect(r.success).toBe(true)
  })
})
