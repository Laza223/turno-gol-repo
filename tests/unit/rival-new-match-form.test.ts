import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseNewMatchForm,
  resolveReservaPrefill,
  type NewMatchBooking,
} from '@/modules/rival/rival-form'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const BOOKING = '33333333-3333-4333-8333-333333333333'

// Jueves 2026-10-22, 12:00 ART.
const NOW = new Date('2026-10-22T15:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

const base = {
  tenantId: TENANT,
  date: '2026-10-24',
  time: '21:00',
  format: '5',
  capacity: '',
  level: 'parejo',
  courtDeclared: 'on',
}

describe('parseNewMatchForm', () => {
  it('arma el borrador: hora ART guardada como instante UTC y cupo = formato x 2', () => {
    const r = parseNewMatchForm(base, [])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.startsAt.toISOString()).toBe('2026-10-25T00:00:00.000Z')
    expect(r.draft.capacity).toBe(10)
    expect(r.draft.bookingId).toBeNull()
    expect(r.draft.courtDeclared).toBe(true)
    expect(r.draft.board).toBeNull()
  })

  it('sin reserva que coincida, "Ya tengo la cancha" es obligatoria', () => {
    const r = parseNewMatchForm({ ...base, courtDeclared: '' }, [])
    expect(r).toEqual({ ok: false, error: 'Confirmá que tenés la cancha.', field: 'courtDeclared' })
  })

  it('con una reserva propia a la misma hora y complejo, la vincula y no pide la casilla', () => {
    const bookings: NewMatchBooking[] = [
      { id: BOOKING, tenantId: TENANT, startsAt: new Date('2026-10-25T00:00:00Z'), format: 5 },
    ]
    const r = parseNewMatchForm({ ...base, courtDeclared: '' }, bookings)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft.bookingId).toBe(BOOKING)
  })

  it('una reserva de otro complejo o de otra hora no se vincula', () => {
    const bookings: NewMatchBooking[] = [
      {
        id: BOOKING,
        tenantId: OTHER_TENANT,
        startsAt: new Date('2026-10-25T00:00:00Z'),
        format: 5,
      },
      { id: BOOKING, tenantId: TENANT, startsAt: new Date('2026-10-25T01:00:00Z'), format: 5 },
    ]
    const r = parseNewMatchForm({ ...base, courtDeclared: '' }, bookings)
    expect(r.ok).toBe(false)
  })

  it('valida hora en punto o y media, a futuro y hasta 7 días', () => {
    expect(parseNewMatchForm({ ...base, time: '21:15' }, [])).toMatchObject({
      ok: false,
      error: 'La hora tiene que ser en punto o y media.',
    })
    expect(parseNewMatchForm({ ...base, date: '2026-10-22', time: '09:00' }, [])).toMatchObject({
      ok: false,
      error: 'El partido tiene que ser a futuro.',
    })
    expect(parseNewMatchForm({ ...base, date: '2026-10-30' }, [])).toMatchObject({
      ok: false,
      error: 'Solo se puede armar hasta 7 días adelante.',
    })
    expect(parseNewMatchForm({ ...base, date: '2026-10-29' }, []).ok).toBe(true)
  })

  it('valida cuántos juegan (2 a 22) y que haya complejo, día y nivel', () => {
    expect(parseNewMatchForm({ ...base, capacity: '1' }, [])).toMatchObject({
      ok: false,
      field: 'capacity',
    })
    expect(parseNewMatchForm({ ...base, capacity: '23' }, [])).toMatchObject({
      ok: false,
      field: 'capacity',
    })
    expect(parseNewMatchForm({ ...base, capacity: '12' }, []).ok).toBe(true)
    expect(parseNewMatchForm({ ...base, tenantId: '' }, [])).toMatchObject({
      ok: false,
      field: 'tenantId',
    })
    expect(parseNewMatchForm({ ...base, date: '' }, [])).toMatchObject({ ok: false })
    expect(parseNewMatchForm({ ...base, level: 'pro' }, [])).toMatchObject({
      ok: false,
      field: 'level',
    })
  })
})

describe('resolveReservaPrefill (?reserva=<id>)', () => {
  // 22:30 ART del sábado 2026-10-24 = 01:30 UTC del domingo.
  const mine: NewMatchBooking[] = [
    { id: BOOKING, tenantId: TENANT, startsAt: new Date('2026-10-25T01:30:00Z'), format: 7 },
  ]

  it('precarga complejo, día, hora y formato en ART', () => {
    expect(resolveReservaPrefill(BOOKING, mine, [TENANT])).toEqual({
      tenantId: TENANT,
      date: '2026-10-24',
      time: '22:30',
      format: 7,
    })
  })

  it('un id ajeno (no está entre MIS reservas) se ignora sin error', () => {
    expect(resolveReservaPrefill('44444444-4444-4444-8444-444444444444', mine, [TENANT])).toBeNull()
  })

  it('sin id, con basura o con un complejo que ya no es elegible, se ignora', () => {
    expect(resolveReservaPrefill(undefined, mine, [TENANT])).toBeNull()
    expect(resolveReservaPrefill('no-es-un-uuid', mine, [TENANT])).toBeNull()
    expect(resolveReservaPrefill(BOOKING, mine, [OTHER_TENANT])).toBeNull()
  })
})
