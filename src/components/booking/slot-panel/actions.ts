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
  }) => Promise<{ success: boolean; error?: string }>
  /** Turno que todavía no empezó: adelanto. Una sola línea (el backend no acepta mixto acá). */
  addBookingChargeAction: (input: {
    bookingId: string
    amount: number
    method: ChargeInput['method']
    clientIdempotencyKey?: string
  }) => Promise<{ success: boolean; error?: string }>
  markNoShowAction: (bookingId: string) => Promise<{ success: boolean; error?: string }>
  revertNoShowAction?: (bookingId: string) => Promise<{ success: boolean; error?: string }>
  /** Reprogramar. Las dos van juntas o ninguna (T5). */
  listRescheduleSlotsAction?: ListRescheduleSlots
  rescheduleBookingAction?: RescheduleBooking
}
