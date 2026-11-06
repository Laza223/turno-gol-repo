import { artDateOf } from '@/shared/time/art-date'

export type AgendaBooking = { id: string; startsAt: Date; courtName: string }
export type AgendaSnapshot = {
  operatingDate: string
  firstBookingId: string | null
  firstStartsAt: string | null
  revision: number
  started: boolean
}

type AgendaNotification = {
  type: 'agenda.daily' | 'agenda.first_changed'
  title: string
  body: string
  expiresAt: Date
}

/** El reloj puede cerrar la jornada de avisos, pero nunca generar un cambio. */
export function decideAgendaNotification(input: {
  date: string
  now: Date
  previous: AgendaSnapshot | null
  bookings: AgendaBooking[]
  dayEndsAt: Date
}): { snapshot: AgendaSnapshot; notification: AgendaNotification | null } {
  const { date, now, bookings, dayEndsAt } = input
  const previous = input.previous?.operatingDate === date ? input.previous : null
  const initial = !previous || previous.revision === 0
  const first = bookings[0]
  const firstStartsAt = first?.startsAt.toISOString() ?? null
  const alreadyStarted =
    previous?.started === true ||
    (previous?.firstStartsAt != null && new Date(previous.firstStartsAt) <= now)
  const changed = previous?.firstStartsAt !== firstStartsAt
  const shouldNotify = initial || (!alreadyStarted && changed)
  const snapshot: AgendaSnapshot = {
    operatingDate: date,
    firstBookingId: first?.id ?? null,
    firstStartsAt,
    revision: initial ? 1 : previous.revision + Number(shouldNotify),
    started: alreadyStarted || (first != null && first.startsAt <= now),
  }
  if (!shouldNotify) return { snapshot, notification: null }

  const time = first?.startsAt.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let title: string
  if (!first) {
    title = initial ? 'Hoy todavía no tenés reservas.' : 'Hoy ya no tenés reservas.'
  } else if (first.startsAt <= now) {
    title = `Tu primera reserva de hoy empezó a las ${time}`
  } else if (artDateOf(first.startsAt) !== date) {
    title = `Tu primera reserva es mañana a las ${time}`
  } else {
    title = initial ? `Hoy empezás a las ${time}` : `Tu primera reserva pasó a las ${time}`
  }
  return {
    snapshot,
    notification: {
      type: initial ? 'agenda.daily' : 'agenda.first_changed',
      title,
      body: first
        ? `${first.courtName} · Tenés ${bookings.length} ${bookings.length === 1 ? 'reserva' : 'reservas'}.`
        : 'Si entra una reserva, te avisamos.',
      expiresAt: first && first.startsAt > now ? first.startsAt : dayEndsAt,
    },
  }
}
