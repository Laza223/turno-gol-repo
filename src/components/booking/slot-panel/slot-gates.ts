import { hhmmToMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { SlotPanelActions } from './actions'

/**
 * Qué acciones ofrece el turno además de cobrarlo. Las decide una sola función
 * porque las usan el panel de la Grilla y el modal de Hoy, y un botón que el
 * backend siempre va a rechazar es peor que no tener el botón: si los dos
 * criterios divergieran, una pantalla ofrecería lo que la otra esconde.
 *
 * Todo sale de datos que el turno ya trae y de qué acciones inyectó el caller
 * (sin una acción —stories y tests viejos— el botón correspondiente no se ofrece).
 */
export type SlotGates = {
  /** Un bloqueo de mantenimiento y una hora de torneo no son el turno de nadie. */
  isClientBooking: boolean
  canMarkNoShow: boolean
  canRevertNoShow: boolean
  canCancel: boolean
  canReleaseBlock: boolean
  canSellCanteen: boolean
  canEdit: boolean
  canReschedule: boolean
}

export function slotGates({
  booking,
  hasEnded,
  actions,
  hasCourts,
  hasCanteen,
}: {
  booking: GridBooking
  hasEnded: boolean
  actions: SlotPanelActions | undefined
  /** Reprogramar necesita la lista de canchas para ofrecer destinos. */
  hasCourts: boolean
  /** Hay un diálogo de cantina inyectado. */
  hasCanteen: boolean
}): SlotGates {
  const isClientBooking = booking.type !== 'block' && booking.type !== 'tournament'

  // Marcar ausente: sólo sobre un turno de un cliente que ya terminó. Una hora
  // de torneo no tiene a quién dar por ausente (el torneo es dueño del horario,
  // no un jugador) y un bloqueo de mantenimiento tampoco.
  const canMarkNoShow = booking.status === 'confirmed' && hasEnded && isClientBooking
  const canRevertNoShow = booking.status === 'no_show' && Boolean(actions?.revertNoShowAction)

  // Mismo criterio que QuickActions.tsx (lista de /reservas): cancelar solo
  // aplica a un turno `confirmed` — `pending_payment` expira solo (hold de 6
  // min) y el resto de estados ya son terminales.
  const canCancel =
    isClientBooking && booking.status === 'confirmed' && Boolean(actions?.cancelBookingAction)

  // Liberar un bloqueo de mantenimiento (RI G2.1): sólo para type='block' en un
  // estado que todavía se puede tocar (un `block` siempre nace 'confirmed';
  // 'pending_payment' es defensivo).
  const canReleaseBlock =
    booking.type === 'block' &&
    (booking.status === 'confirmed' || booking.status === 'pending_payment') &&
    Boolean(actions?.releaseBlockAction)

  // La cantina sigue disponible con el turno ya jugado: lo normal es que la
  // gente consuma durante el partido y pague todo junto al final.
  const canSellCanteen = isClientBooking && hasCanteen

  // D2: editar nombre/teléfono, duración y precio — sólo turnos `confirmed`
  // que son la reserva de alguien (un turno terminal ya lo bloquea el trigger
  // de DB, este gate evita ofrecer un botón que el backend siempre rechazaría).
  const canEdit =
    isClientBooking &&
    booking.status === 'confirmed' &&
    Boolean(actions?.editBookingAction && actions?.getBookingEditDetailAction)

  // Mismos estados Y tipos que acepta `rescheduleBooking`. `fixed` (sesión de
  // abonado) SÍ entra desde la decisión del dueño del 2026-08-05: se mueve
  // conservando el precio del contrato (el backend lo impone).
  //
  // Duración: rediseño 2026-09-14. `rescheduleBooking` sólo valida la duración
  // del DESTINO (siempre 60 min, vía `assertSlotDuration`) — nunca mira la del
  // turno que se mueve. Un evento de N horas ofrecido acá se "reprogramaría"
  // recortado a un único slot de 60 min sin que el backend lo frene: el gate
  // vive acá, no allá. `endMins === 0` cubre el legado `time_end='00:00'`
  // (medianoche), mismo criterio que `slotDurationMins`.
  const bookingEndMins = hhmmToMins(booking.timeEnd)
  const bookingDurationMins =
    (bookingEndMins === 0 ? 24 * 60 : bookingEndMins) - hhmmToMins(booking.timeStart)
  const canReschedule =
    isClientBooking &&
    bookingDurationMins === SLOT_DURATION_MINUTES &&
    (booking.status === 'confirmed' || booking.status === 'pending_payment') &&
    Boolean(actions?.listRescheduleSlotsAction && actions?.rescheduleBookingAction) &&
    hasCourts

  return {
    isClientBooking,
    canMarkNoShow,
    canRevertNoShow,
    canCancel,
    canReleaseBlock,
    canSellCanteen,
    canEdit,
    canReschedule,
  }
}
