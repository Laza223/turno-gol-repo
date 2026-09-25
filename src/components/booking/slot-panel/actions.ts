import type { ActionResult } from '@/shared/types/action-result'
import type { ChargeLine } from '@/components/admin/SplitPaymentFields'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
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

/**
 * El modal de cobro de Hoy llega INYECTADO, no importado (paso 3, docs/
 * decisions/2026-09-24-navegacion-panel.md): vive en
 * `app/(admin)/dashboard/_components/HoyChargeModal.tsx` y `@/components` no
 * puede importar de `@/app` — mismo motivo que `RenderCanteenDialog`. Lo
 * enchufa `GrillaView` (dynamic import, mismo patrón que `BookingCanteenDialog`).
 */
export type RenderChargeModal = (args: {
  booking: GridBooking
  courtName: string
  courts: CourtRow[]
  dayBookings: GridBooking[]
  daySlots: string[]
  nowMs: number
  isRefreshing: boolean
  hasEnded: boolean
  actions?: SlotPanelActions
  renderCanteenDialog?: RenderCanteenDialog
  onClose: () => void
  onMutated: () => void
}) => React.ReactNode

export type ChargeInput = {
  amount: number
  method: ChargeLine['method']
  /** Cobro por equipo (decisión del dueño 2026-09-25): equipo al que se atribuye esta línea. */
  team?: 1 | 2
}

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
  /**
   * Confirmar a mano la seña de un turno `pending_payment` (paso 3, docs/
   * decisions/2026-09-24-navegacion-panel.md): "Cobrar seña $X". Opcional,
   * mismo criterio que el resto: sin ella el botón no se ofrece.
   */
  confirmDepositPaymentAction?: (
    bookingId: string,
    method: 'cash' | 'transfer' | 'other',
  ) => Promise<ActionResult>
}
