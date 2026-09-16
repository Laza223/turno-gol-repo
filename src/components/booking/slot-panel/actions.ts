import type { ActionResult } from '@/shared/types/action-result'
import type { ChargeLine } from '@/components/admin/SplitPaymentFields'
import type { ListRescheduleSlots, RescheduleBooking } from '../BookingRescheduleDialog'

/**
 * El diálogo de cantina llega INYECTADO, no importado: reusa el `TicketPanel`
 * real de /caja/cantina, y un componente de `@/components` no puede importar de
 * `@/app` (regla de lint: o pertenece a la ruta, o es genérico). Vive en
 * `app/(admin)/grilla/_components/` y lo enchufa `GrillaView`.
 */
export type RenderCanteenDialog = (args: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  displayName: string | null
}) => React.ReactNode

export type ChargeInput = { amount: number; method: ChargeLine['method'] }

export type SlotPanelActions = {
  /** Turno ya jugado con saldo: cobra lo que falta. Admite método mixto. */
  chargeDebtAction: (input: {
    bookingId: string
    charges: ChargeInput[]
    clientIdempotencyKey?: string
  }) => Promise<{ success: true } | { success: false; error: string }>
  /** Turno confirmado que ya terminó: lo marca jugado y cobra en un solo paso. */
  completeAndChargeBookingAction: (input: {
    bookingId: string
    charges: ChargeInput[]
    clientIdempotencyKey?: string
  }) => Promise<ActionResult>
  /** Turno que todavía no empezó: adelanto. Admite método mixto (D3, N líneas). */
  addBookingChargeAction: (input: {
    bookingId: string
    charges: ChargeInput[]
    clientIdempotencyKey?: string
  }) => Promise<ActionResult>
  markNoShowAction: (bookingId: string) => Promise<ActionResult>
  revertNoShowAction?: (bookingId: string) => Promise<ActionResult>
  /** Reprogramar. Las dos van juntas o ninguna (T5). */
  listRescheduleSlotsAction?: ListRescheduleSlots
  rescheduleBookingAction?: RescheduleBooking
  /**
   * Cancelar sin salir de la grilla (hallazgo QA Lote 1 P0: la única forma de
   * cancelar vivía en /reservas → tab Lista). Opcional, mismo criterio que el
   * resto: sin ella no se ofrece "Cancelar" y el panel se comporta como antes.
   */
  cancelBookingAction?: (
    bookingId: string,
    reason: string,
    cancellationType: 'complejo' | 'jugador',
  ) => Promise<ActionResult>
  /**
   * Liberar un bloqueo de mantenimiento (RI G2.1). Opcional a propósito: sin
   * ella el panel no ofrece 'Liberar' y se comporta como hoy, así stories y
   * tests viejos siguen compilando.
   */
  releaseBlockAction?: (bookingId: string) => Promise<ActionResult>
  /**
   * Editar reserva (D2): nombre/teléfono de invitado, duración (evento
   * spontaneous cargado por el staff) y precio. Opcional, mismo criterio que
   * el resto: sin ella el panel no ofrece "Editar".
   */
  editBookingAction?: (input: {
    bookingId: string
    guestName?: string
    guestPhone?: string
    timeEnd?: string
    priceOverride?: number
  }) => Promise<ActionResult>
  /** Lectura para precargar el diálogo de editar (guestPhone/createdByStaff). */
  getBookingEditDetailAction?: (
    bookingId: string,
  ) => Promise<
    | { success: true; guestPhone: string | null; createdByStaff: string | null }
    | { success: false; error: string }
  >
}
