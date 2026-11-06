import { describe, expect, it } from 'vitest'
import {
  decideAgendaNotification,
  type AgendaBooking,
  type AgendaSnapshot,
} from '@/modules/notifications/staff-agenda'

const date = '2030-05-06'
const morning = new Date(`${date}T11:00:00Z`)
const evening = new Date(`${date}T21:00:00Z`)
const end = new Date('2030-05-07T03:00:00Z')
const booking = (id = 'first', startsAt = evening): AgendaBooking => ({
  id,
  startsAt,
  courtName: 'Cancha 2',
})
const snapshot = (patch: Partial<AgendaSnapshot> = {}): AgendaSnapshot => ({
  operatingDate: date,
  firstBookingId: 'first',
  firstStartsAt: evening.toISOString(),
  revision: 1,
  started: false,
  ...patch,
})
const decide = (
  previous: AgendaSnapshot | null,
  bookings: AgendaBooking[],
  now = morning,
  operationalDate = date,
) => decideAgendaNotification({ date: operationalDate, now, previous, bookings, dayEndsAt: end })

describe('agenda del complejo', () => {
  it('avisa un día vacío, sólo una vez', () => {
    const first = decide(null, [])
    expect(first.notification?.title).toBe('Hoy todavía no tenés reservas.')
    expect(first.snapshot.revision).toBe(1)
    expect(decide(first.snapshot, []).notification).toBeNull()
  })

  it('muestra la hora física, cancha y cantidad; vence al empezar', () => {
    const result = decide(null, [booking(), booking('second', new Date(`${date}T22:00:00Z`))])
    expect(result.notification?.title).toBe('Hoy empezás a las 18:00')
    expect(result.notification?.body).toBe('Cancha 2 · Tenés 2 reservas.')
    expect(result.notification?.expiresAt).toEqual(evening)
  })

  it('un catchup después de la primera reserva no afirma que todavía no empezó', () => {
    const result = decide(null, [booking('early', new Date(`${date}T10:00:00Z`))])
    expect(result.notification?.title).toBe('Tu primera reserva de hoy empezó a las 07:00')
    expect(result.snapshot.started).toBe(true)
    expect(result.notification?.expiresAt).toEqual(end)
  })

  it('respeta el día operativo: un turno de madrugada ocurre mañana', () => {
    const first = booking('night', new Date('2030-05-07T04:00:00Z'))
    const result = decide(null, [first])
    expect(result.notification?.title).toBe('Tu primera reserva es mañana a las 01:00')
  })

  it('un nuevo día emite su propia agenda aunque el anterior ya había empezado', () => {
    const result = decide(snapshot({ operatingDate: '2030-05-05', started: true }), [booking()])
    expect(result.notification?.type).toBe('agenda.daily')
    expect(result.snapshot.revision).toBe(1)
  })

  it('avisa cuando se adelanta o posterga el primer horario', () => {
    for (const hour of ['20', '22']) {
      const first = booking('changed', new Date(`${date}T${hour}:00:00Z`))
      const result = decide(snapshot(), [first])
      expect(result.notification?.type).toBe('agenda.first_changed')
      expect(result.snapshot.revision).toBe(2)
    }
  })

  it('no avisa sólo por otro id/cancha que empieza a la misma hora', () => {
    const result = decide(snapshot(), [booking('other')])
    expect(result.notification).toBeNull()
    expect(result.snapshot.firstBookingId).toBe('other')
    expect(result.snapshot.revision).toBe(1)
  })

  it('avisa si desaparece la última reserva y si después aparece una nueva', () => {
    const empty = decide(snapshot(), [])
    expect(empty.notification?.title).toBe('Hoy ya no tenés reservas.')
    const next = decide(empty.snapshot, [booking()])
    expect(next.notification?.type).toBe('agenda.first_changed')
    expect(next.snapshot.revision).toBe(3)
  })

  it('el paso del reloj no genera un aviso ni hace avanzar la primera reserva', () => {
    const now = new Date(`${date}T22:00:00Z`)
    const result = decide(snapshot(), [booking()], now)
    expect(result.notification).toBeNull()
    expect(result.snapshot.started).toBe(true)
    expect(decide(result.snapshot, [], now).notification).toBeNull()
  })
})
