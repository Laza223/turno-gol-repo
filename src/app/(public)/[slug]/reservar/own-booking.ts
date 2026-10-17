import { findOwnLiveBooking, type OwnLiveBooking } from '@/modules/bookings/booking.own'
import { withPlayerContext } from '@/shared/db/client'
import { logger } from '@/shared/lib/logger'

/**
 * ¿Ese turno ocupado es MÍO? Lo usan la page y la action de confirmar. Si la consulta falla, la
 * pantalla no se rompe (cae en el "ya no está disponible" de siempre), pero la falla SE REGISTRA:
 * callarla escondería un bug que le dice "ya no está" a quien lo acaba de reservar. Sin datos de la
 * persona en el log.
 */
export async function findOwnLiveBookingOrNull(
  playerId: string,
  turn: { courtId: string; date: string; timeStart: string },
): Promise<OwnLiveBooking | null> {
  try {
    return await withPlayerContext(playerId, (tx) => findOwnLiveBooking(tx, { playerId, ...turn }))
  } catch (err) {
    logger.warn('reservar.own_booking_lookup_failed', {
      module: 'reservar',
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
