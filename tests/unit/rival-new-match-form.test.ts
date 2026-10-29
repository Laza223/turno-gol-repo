import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toWhatsappDigits } from '@/lib/whatsapp'
import {
  parseBoardForm,
  parseNewMatchForm,
  playerPhoneOf,
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
    expect(r.draft).not.toHaveProperty('board')
  })

  it('los campos del tablón no entran al borrador: se publica después, desde la vista del partido', () => {
    const r = parseNewMatchForm(
      { ...base, seeking: 'rival', whatsapp: '11 5555-1234', whatsappConsent: 'on' },
      [],
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.draft).not.toHaveProperty('board')
  })

  it('sin reserva que coincida, "Ya tengo la cancha" es obligatoria', () => {
    const r = parseNewMatchForm({ ...base, courtDeclared: '' }, [])
    expect(r).toEqual({
      ok: false,
      error: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      field: 'courtDeclared',
      fieldErrors: {
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })
  })

  it('un envío vacío informa todos los errores juntos, con el primero según el orden del form', () => {
    const r = parseNewMatchForm(
      { tenantId: '', date: '2026-10-24', time: '', format: '5', level: '', courtDeclared: '' },
      [],
    )
    expect(r).toMatchObject({
      ok: false,
      field: 'tenantId',
      error: 'Elegí el complejo.',
      fieldErrors: {
        tenantId: 'Elegí el complejo.',
        startsAt: 'Elegí la hora.',
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })
    if (!r.ok) expect(Object.keys(r.fieldErrors)).toContain('level')
  })

  it('la cancha se informa aunque falle otro campo (el superRefine del objeto no corre)', () => {
    const r = parseNewMatchForm({ ...base, tenantId: '', courtDeclared: '' }, [])
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        tenantId: 'Elegí el complejo.',
        courtDeclared: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
      },
    })
  })

  it('con reserva vinculada la cancha no se pide, ni aunque falle otro campo', () => {
    const bookings: NewMatchBooking[] = [
      { id: BOOKING, tenantId: TENANT, startsAt: new Date('2026-10-25T00:00:00Z'), format: 5 },
    ]
    const r = parseNewMatchForm({ ...base, level: '', courtDeclared: '' }, bookings)
    expect(r).toMatchObject({ ok: false, field: 'level' })
    if (!r.ok) expect(r.fieldErrors).not.toHaveProperty('courtDeclared')
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
      error: 'Elegí una hora en punto o y media.',
    })
    expect(parseNewMatchForm({ ...base, date: '2026-10-22', time: '09:00' }, [])).toMatchObject({
      ok: false,
      error: 'Elegí un horario a futuro: ese ya pasó.',
    })
    expect(parseNewMatchForm({ ...base, date: '2026-10-30' }, [])).toMatchObject({
      ok: false,
      error: 'Solo se puede armar hasta 7 días adelante. Elegí un día más cercano.',
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

describe('parseBoardForm (publicar en el tablón)', () => {
  const board = {
    seeking: 'players',
    whatsapp: '11 5555-1234',
    whatsappConsent: 'on',
  }

  it('arma el borrador; guardar el número es opt-in', () => {
    const r = parseBoardForm(board)
    expect(r).toMatchObject({
      ok: true,
      board: { whatsappDigits: '5491155551234', savePhone: false },
    })
    expect(parseBoardForm({ ...board, savePhone: 'on' })).toMatchObject({
      ok: true,
      board: { savePhone: true },
    })
  })

  it('informa los tres campos a la vez, con el primero en field/error', () => {
    const r = parseBoardForm({ seeking: '', whatsapp: '', whatsappConsent: '' })
    expect(r).toMatchObject({
      ok: false,
      field: 'seeking',
      error: 'Elegí si buscás jugadores o rival.',
      fieldErrors: {
        seeking: 'Elegí si buscás jugadores o rival.',
        whatsapp: 'Ingresá tu WhatsApp.',
        whatsappConsent: 'Marcá la casilla para publicar: tu WhatsApp lo ve solo quien aceptes.',
      },
    })
  })
})

describe('playerPhoneOf', () => {
  it('guarda el formato del perfil ("+54 " + nacional sin el 9) y la precarga lo vuelve a entender', () => {
    expect(playerPhoneOf('5491155551234')).toBe('+54 1155551234')
    expect(toWhatsappDigits(playerPhoneOf('5491155551234'))).toBe('5491155551234')
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
