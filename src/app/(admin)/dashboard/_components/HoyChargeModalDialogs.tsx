import type { ActionResult } from '@/shared/types/action-result'
import dynamic from 'next/dynamic'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SlotCancelDialog } from '@/components/booking/slot-panel/SlotCancelDialog'
import type { SlotGates } from '@/components/booking/slot-panel/slot-gates'
import type { RenderCanteenDialog, SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { chargeMode } from '@/components/booking/slot-panel/charge-copy'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import { getRefundOutcome, type RefundOutcome } from '@/modules/bookings/refund-outcome'
import type { ChargeBooking, HoyCourt } from './HoyChargeModal'
import type { AbonadoSettlementTarget } from '@/app/(admin)/abonados/AbonadoSettlementDialog'

// Se cargan recién al abrirlos: cobrar es de todos los días, mover o corregir
// un turno es de una vez por semana.
const BookingRescheduleDialog = dynamic(
  () =>
    import('@/components/booking/BookingRescheduleDialog').then((m) => m.BookingRescheduleDialog),
  { ssr: false },
)
const BookingEditDialog = dynamic(
  () => import('@/components/booking/BookingEditDialog').then((m) => m.BookingEditDialog),
  { ssr: false },
)
const AbonadoSettlementDialog = dynamic(
  () =>
    import('@/app/(admin)/abonados/AbonadoSettlementDialog').then((m) => m.AbonadoSettlementDialog),
  { ssr: false },
)

/**
 * Los 6 diálogos del modal de cobro de Hoy: cantina, reprogramar, editar,
 * marcar ausente, cancelar y liberar bloqueo. Extraído de `HoyChargeModal` —
 * se MONTAN al abrirse (el catálogo de cantina y los huecos libres se piden
 * una vez por apertura, con el estado limpio).
 */
export function HoyChargeModalDialogs({
  booking,
  name,
  hasEnded,
  nowMs,
  cancellationPolicyHours,
  lateCancelHours = 0,
  courts,
  court,
  dayBookings,
  daySlots,
  gates,
  actions,
  renderCanteenDialog,
  canteenOpen,
  setCanteenOpen,
  rescheduleOpen,
  setRescheduleOpen,
  editOpen,
  setEditOpen,
  noShowOpen,
  setNoShowOpen,
  cancelOpen,
  setCancelOpen,
  releaseBlockOpen,
  setReleaseBlockOpen,
  alreadySettledOpen = false,
  setAlreadySettledOpen,
  undoSettlementOpen = false,
  setUndoSettlementOpen,
  abonadoTarget = null,
  setAbonadoTarget,
  onMutated,
  onConsumoNoted,
  setLastId,
  onConfirmNoShow,
  onConfirmReleaseBlock,
  onConfirmAlreadySettled,
  onConfirmUndoSettlement,
}: {
  booking: ChargeBooking
  name: string
  hasEnded: boolean
  nowMs: number
  /** `null` si el caller no tiene la política a mano: `SlotCancelDialog` degrada solo. */
  cancellationPolicyHours: number | null
  lateCancelHours?: number
  courts: HoyCourt[]
  court: HoyCourt | undefined
  dayBookings: ChargeBooking[]
  daySlots: string[]
  gates: SlotGates
  actions: SlotPanelActions
  renderCanteenDialog?: RenderCanteenDialog
  canteenOpen: boolean
  setCanteenOpen: (open: boolean) => void
  rescheduleOpen: boolean
  setRescheduleOpen: (open: boolean) => void
  editOpen: boolean
  setEditOpen: (open: boolean) => void
  noShowOpen: boolean
  setNoShowOpen: (open: boolean) => void
  cancelOpen: boolean
  setCancelOpen: (open: boolean) => void
  releaseBlockOpen: boolean
  setReleaseBlockOpen: (open: boolean) => void
  alreadySettledOpen?: boolean
  setAlreadySettledOpen?: (open: boolean) => void
  undoSettlementOpen?: boolean
  setUndoSettlementOpen?: (open: boolean) => void
  abonadoTarget?: AbonadoSettlementTarget | null
  setAbonadoTarget?: (target: AbonadoSettlementTarget | null) => void
  onMutated: () => void
  /** Se anotó un consumo al turno desde el diálogo de cantina: el cobro vuelve a leer lo anotado. */
  onConsumoNoted?: () => void
  setLastId: (id: string | null) => void
  onConfirmNoShow: () => Promise<ActionResult>
  onConfirmReleaseBlock: () => Promise<ActionResult>
  onConfirmAlreadySettled?: () => Promise<ActionResult>
  onConfirmUndoSettlement?: () => Promise<ActionResult>
}) {
  return (
    <>
      {gates.canSellCanteen &&
        canteenOpen &&
        renderCanteenDialog?.({
          open: true,
          onOpenChange: setCanteenOpen,
          bookingId: booking.id,
          displayName: name,
          onNoted: onConsumoNoted,
          // Lo anotado se cobra desde el cobro de este turno: sin saldo no hay dónde.
          canNoteConsumo: chargeMode(booking, hasEnded) !== null,
        })}

      {gates.canReschedule &&
        rescheduleOpen &&
        actions.listRescheduleSlotsAction &&
        actions.rescheduleBookingAction && (
          <BookingRescheduleDialog
            open
            onOpenChange={setRescheduleOpen}
            booking={booking}
            courts={courts}
            listSlotsAction={actions.listRescheduleSlotsAction}
            rescheduleAction={actions.rescheduleBookingAction}
            onSuccess={() => {
              setRescheduleOpen(false)
              setLastId(null)
              onMutated()
            }}
          />
        )}

      {gates.canEdit &&
        editOpen &&
        actions.editBookingAction &&
        actions.getBookingEditDetailAction && (
          <BookingEditDialog
            open
            onOpenChange={setEditOpen}
            booking={booking}
            dayBookings={dayBookings}
            daySlots={daySlots}
            pricing={court?.pricing}
            getDetailAction={actions.getBookingEditDetailAction}
            editAction={actions.editBookingAction}
            onSuccess={() => {
              setEditOpen(false)
              setLastId(null)
              onMutated()
            }}
          />
        )}

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description={`${name} no vino al turno de las ${booking.timeStart}.`}
        consequences={NO_SHOW_CONSEQUENCES}
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        variant="destructive"
        onConfirm={onConfirmNoShow}
      />

      {actions.cancelBookingAction && (
        <SlotCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          booking={booking}
          label={name}
          hasEnded={hasEnded}
          computeRefundOutcome={(cancellationType): RefundOutcome | null =>
            booking.startsAtMs != null &&
            booking.endsAtMs != null &&
            cancellationPolicyHours != null
              ? getRefundOutcome({
                  depositStatus: booking.depositStatus ?? 'not_required',
                  depositAmountCents: booking.depositAmount ?? 0,
                  paymentMethod: booking.paymentMethod ?? null,
                  bookingStartUtcMs: booking.startsAtMs,
                  bookingEndUtcMs: booking.endsAtMs,
                  policyHours: cancellationPolicyHours,
                  lateCancelHours,
                  hasPlayer: booking.playerFirstName != null,
                  nowMs,
                  cancellationType,
                })
              : null
          }
          cancelAction={actions.cancelBookingAction}
          onCancelled={() => {
            setLastId(null)
            onMutated()
          }}
        />
      )}

      {actions.releaseBlockAction && (
        <ConfirmDialog
          open={releaseBlockOpen}
          onOpenChange={setReleaseBlockOpen}
          title="Liberar bloqueo"
          description={`${name}, ${booking.timeStart}–${booking.timeEnd}. La cancha queda libre para reservar.`}
          variant="destructive"
          confirmLabel="Liberar cancha"
          cancelLabel="Volver"
          consequences={[
            'El bloqueo se elimina: no queda como reserva cancelada.',
            'Si te equivocaste de horario, volvé a bloquear con el horario correcto.',
          ]}
          onConfirm={onConfirmReleaseBlock}
        />
      )}

      {onConfirmAlreadySettled && setAlreadySettledOpen && (
        <ConfirmDialog
          open={alreadySettledOpen}
          onOpenChange={setAlreadySettledOpen}
          title="Marcar turno como saldado"
          description={`${name} · ${booking.timeStart}–${booking.timeEnd}.`}
          confirmLabel="Sí, marcar saldado"
          cancelLabel="Volver"
          consequences={[
            'El turno queda en $ 0 por cobrar.',
            'No suma plata a Caja: usalo solo si ya estaba pago.',
            'Podés deshacerlo después.',
          ]}
          onConfirm={onConfirmAlreadySettled}
        />
      )}

      {onConfirmUndoSettlement && setUndoSettlementOpen && (
        <ConfirmDialog
          open={undoSettlementOpen}
          onOpenChange={setUndoSettlementOpen}
          title="Deshacer saldado"
          description="El turno vuelve a quedar con su saldo por cobrar."
          confirmLabel="Deshacer saldado"
          cancelLabel="Volver"
          onConfirm={onConfirmUndoSettlement}
        />
      )}

      {abonadoTarget && setAbonadoTarget && actions.settleAbonadoPeriodAction && (
        <AbonadoSettlementDialog
          target={abonadoTarget}
          defaultYearMonth={booking.date.slice(0, 7)}
          settleAction={actions.settleAbonadoPeriodAction}
          onClose={() => setAbonadoTarget(null)}
          onSuccess={() => {
            setAbonadoTarget(null)
            setLastId(null)
            onMutated()
          }}
        />
      )}
    </>
  )
}
