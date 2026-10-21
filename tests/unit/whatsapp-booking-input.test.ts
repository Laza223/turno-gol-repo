import { describe, expect, it } from 'vitest'
import type { DbTx } from '@/shared/db/client'
import {
  createWhatsappBooking,
  type CreateWhatsappBookingInput,
} from '@/modules/bookings/booking.whatsapp'
import {
  BookingDateOutOfRangeError,
  BookingNotOfferedError,
  BookingValidationError,
  CourtOfflineError,
  TooManyWhatsappBookingsError,
} from '@/modules/bookings/booking.errors'

// La entrada del bot la arma un modelo de lenguaje: nada de lo que trae se
// confía. Estas validaciones corren ANTES de tocar la base (sin lock, sin
// consulta), así que se prueban sin Postgres; el resto vive en
// tests/integration/whatsapp-booking.test.ts. El `tx` de acá revienta si alguien
// lo usa: prueba que el rechazo es previo a la base.

const tx = new Proxy(
  {},
  {
    get() {
      throw new Error('la validación de entrada no puede tocar la base')
    },
  },
) as unknown as DbTx

const UUID = '3f2b8c1e-7a4d-4e9b-9c55-0a1b2c3d4e5f'
const VALID: CreateWhatsappBookingInput = {
  chatId: UUID,
  courtId: '6d1f0b52-1c3e-4b7a-8f20-9a8b7c6d5e4f',
  date: '2099-01-15',
  timeStart: '20:00',
  guestName: 'Juan Pérez',
  guestPhone: '5491155551234',
}

function attempt(over: Partial<CreateWhatsappBookingInput>) {
  return createWhatsappBooking(UUID, { ...VALID, ...over }, tx)
}

describe('createWhatsappBooking — la entrada se valida antes de tocar la base', () => {
  it('un chat que no es UUID → BookingValidationError', async () => {
    await expect(attempt({ chatId: 'chat-1' })).rejects.toBeInstanceOf(BookingValidationError)
  })

  it('una cancha que no es UUID → CourtOfflineError (el modelo puede inventar el id)', async () => {
    await expect(attempt({ courtId: 'cancha-1' })).rejects.toBeInstanceOf(CourtOfflineError)
  })

  it.each(['2099-02-30', '15/01/2099', '', '2099-13-01'])(
    'la fecha %j no es un día de calendario → BookingDateOutOfRangeError',
    async (date) => {
      await expect(attempt({ date })).rejects.toBeInstanceOf(BookingDateOutOfRangeError)
    },
  )

  it.each(['24:00', '9:00', '20:60', '8pm', ''])(
    'la hora %j no es HH:MM → BookingValidationError',
    async (timeStart) => {
      await expect(attempt({ timeStart })).rejects.toBeInstanceOf(BookingValidationError)
    },
  )

  it.each(['', '   ', 'x'.repeat(81)])(
    'el nombre %j es vacío o demasiado largo → BookingValidationError',
    async (guestName) => {
      await expect(attempt({ guestName })).rejects.toBeInstanceOf(BookingValidationError)
    },
  )

  it.each(['+5491155551234', '549 11 5555 1234', '1234567', '5'.repeat(16), 'abcdefgh'])(
    'el teléfono %j no son 8 a 15 dígitos → BookingValidationError',
    async (guestPhone) => {
      await expect(attempt({ guestPhone })).rejects.toBeInstanceOf(BookingValidationError)
    },
  )
})

describe('errores de la reserva por WhatsApp', () => {
  it('BookingNotOfferedError es un BookingValidationError con el motivo, para quien no lo conozca', () => {
    const err = new BookingNotOfferedError('closed_day')
    expect(err).toBeInstanceOf(BookingValidationError)
    expect(err.name).toBe('BookingNotOfferedError')
    expect(err.reason).toBe('closed_day')
  })

  it('TooManyWhatsappBookingsError lleva el chat, el motivo y la cuenta', () => {
    const err = new TooManyWhatsappBookingsError(UUID, UUID, 'unpaid_confirmed', 2)
    expect(err.name).toBe('TooManyWhatsappBookingsError')
    expect(err).toMatchObject({ chatId: UUID, reason: 'unpaid_confirmed', activeCount: 2 })
  })
})
