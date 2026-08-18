'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CalendarClock } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { newChargeLine } from '@/components/admin/SplitPaymentFields'
import { formatArs } from '@/lib/format'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { useSlotCharges } from './slot-panel/use-slot-charges'
import { SlotPriceSummary } from './slot-panel/SlotPriceSummary'
import { SlotChargeSection } from './slot-panel/SlotChargeSection'
import { SlotActionButtons } from './slot-panel/SlotActionButtons'
import type { RenderCanteenDialog, SlotPanelActions } from './slot-panel/actions'

// Los tipos de las Server Actions (y el de RenderCanteenDialog) viven en
// slot-panel/actions.ts, self-contained: son la parte del "contrato" del panel
// que use-slot-charges y SlotActionButtons también necesitan, sin depender de
// este archivo (evita un import circular tipo-only).
export type { RenderCanteenDialog, SlotPanelActions } from './slot-panel/actions'

// Se carga recién al abrirlo: el 90% de las veces que se abre el panel es para
// cobrar, no para mover el turno.
const BookingRescheduleDialog = dynamic(
  () => import('./BookingRescheduleDialog').then((m) => m.BookingRescheduleDialog),
  { ssr: false },
)

/**
 * Panel lateral del turno — Fase 3, criterio de salida #2: cobrar, cantina,
 * marcar ausente y reprogramar **sin navegar fuera de la grilla**.
 *
 * Reemplaza el popover de sólo-lectura que abría al hacer hover. El hover se
 * fue a propósito: era una affordance que en touch no existe (el admin en el
 * mostrador usa tablet), y un panel que sólo mira obliga a irse a /reservas
 * justo cuando hay alguien esperando para pagar.
 *
 * Las Server Actions llegan POR PROP, no por import: `'use server'` arrastra
 * `node:async_hooks` al bundle y rompe Storybook (mismo motivo documentado en
 * QuickActions.tsx).
 */

type Props = {
  booking: GridBooking | null
  courtName: string
  onClose: () => void
  /**
   * Se cobró o se marcó ausente: el padre tiene que refrescar la grilla. NO
   * alcanza con `router.refresh()` desde acá — el hook de Realtime lee sus
   * datos iniciales sólo al montar, así que la celda seguiría pintando el
   * estado viejo (y una alarma de "sin cobrar" que no se apaga después de
   * cobrar es peor que no tenerla).
   */
  onMutated?: () => void
  /**
   * ¿El turno ya terminó? Lo decide la grilla, no este panel: la respuesta
   * depende del día operativo (un slot de madrugada de un complejo
   * `closes_next_day` sucede FÍSICAMENTE mañana, así que a las 02:00 de hoy
   * todavía es futuro) y esa lógica ya vive en `useGridLayout.isSlotPast`.
   * Recalcularla acá con `Date.now()` daría una respuesta más simple y
   * equivocada, y además impura en render.
   */
  hasEnded?: boolean
  /** Canchas del complejo — sólo las necesita el diálogo de reprogramar. */
  courts?: Array<{ id: string; name: string; status?: 'online' | 'offline' }>
  /** Ver `RenderCanteenDialog`. Sin esto, el panel no ofrece cargar cantina. */
  renderCanteenDialog?: RenderCanteenDialog
  actions?: SlotPanelActions
}

export function BookingSlotPanel({
  booking,
  courtName,
  onClose,
  onMutated,
  hasEnded = false,
  courts,
  renderCanteenDialog,
  actions,
}: Props) {
  const router = useRouter()

  /**
   * Cerrar + refrescar tras una mutación. El fallback a `router.refresh()` es
   * para los callers que no pasan `onMutated` (stories): refresca lo que puede
   * en vez de no hacer nada.
   */
  function notifyMutated() {
    if (onMutated) {
      onMutated()
      return
    }
    onClose()
    router.refresh()
  }

  const [noShowOpen, setNoShowOpen] = useState(false)
  const [canteenOpen, setCanteenOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelType, setCancelType] = useState<'complejo' | 'jugador' | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Cambio de turno → estado limpio. Patrón "derived state on prop change"
  // (sin useEffect), igual que StreetMoneyChargeDialog.
  const [lastId, setLastId] = useState<string | null>(null)

  const {
    isPending,
    error,
    setError,
    lines,
    setLines,
    setIdempotencyKey,
    mode,
    pending,
    submitCharge,
    confirmNoShow,
    revertNoShow,
  } = useSlotCharges({
    booking,
    hasEnded,
    actions,
    notifyMutated,
    // Mismo `setLastId(null)` que antes vivía inline al final de cada
    // mutación exitosa del hook: fuerza un estado limpio en el próximo
    // render aunque `booking.id` no haya cambiado.
    resetLastId: () => setLastId(null),
  })

  if (booking && booking.id !== lastId) {
    setLastId(booking.id)
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setLines([newChargeLine(booking.pending ?? null, 'cash')])
    setNoShowOpen(false)
    setCanteenOpen(false)
    setRescheduleOpen(false)
    setCancelOpen(false)
  }

  if (!booking) return null

  const visual = gridSlotVisual(booking)

  // Marcar ausente: sólo sobre un turno de un cliente que ya terminó. Una hora
  // de torneo no tiene a quién dar por ausente (el torneo es dueño del horario,
  // no un jugador) y un bloqueo de mantenimiento tampoco.
  const canMarkNoShow =
    booking.status === 'confirmed' &&
    hasEnded &&
    booking.type !== 'tournament' &&
    booking.type !== 'block'
  const canRevertNoShow = booking.status === 'no_show' && Boolean(actions?.revertNoShowAction)

  // Un bloqueo de mantenimiento y una hora de torneo no son el turno de nadie:
  // no hay a quién venderle ni a quién mover.
  const isClientBooking = booking.type !== 'block' && booking.type !== 'tournament'

  // Mismo criterio que QuickActions.tsx (lista de /reservas): cancelar solo
  // aplica a un turno `confirmed` — `pending_payment` expira solo (hold de 6
  // min) y el resto de estados ya son terminales. Sin `cancelBookingAction`
  // (stories/tests viejas) el botón no se ofrece, como el resto del panel.
  const canCancel =
    isClientBooking && booking.status === 'confirmed' && Boolean(actions?.cancelBookingAction)

  // La cantina sigue disponible con el turno ya jugado: lo normal es que la
  // gente consuma durante el partido y pague todo junto al final.
  const canSellCanteen = isClientBooking && Boolean(renderCanteenDialog)

  // Mismos estados Y tipos que acepta `rescheduleBooking`: un botón que el
  // backend siempre va a rechazar es peor que no tener el botón.
  //
  // `fixed` (sesión de abonado) SÍ entra desde la decisión del dueño del
  // 2026-08-05: se mueve conservando el precio del contrato (el backend lo
  // impone, no depende de esta UI).
  const canReschedule =
    isClientBooking &&
    (booking.status === 'confirmed' || booking.status === 'pending_payment') &&
    Boolean(actions?.listRescheduleSlotsAction && actions?.rescheduleBookingAction) &&
    Boolean(courts?.length)

  const displayName =
    booking.guestName ??
    (booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim()
      : null)

  function openCancel() {
    setCancelReason('')
    setCancelType(null)
    setCancelOpen(true)
  }

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (!actions?.cancelBookingAction) return { success: false, error: 'Sin acciones disponibles.' }
    if (!cancelType) return { success: false, error: 'Indicá quién cancela la reserva.' }
    if (cancelReason.trim().length < 3) {
      return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    }
    const res = await actions.cancelBookingAction(booking!.id, cancelReason.trim(), cancelType)
    if (res.success) {
      setLastId(null)
      notifyMutated()
    }
    return res
  }

  // Sin `startsAt`/`cancellationPolicyHours` a mano en este panel (GridBooking
  // no los trae — ver su comentario): mismo fallback genérico que usa
  // QuickActions.tsx cuando esos datos faltan (`inPolicy === null`), no un
  // mensaje inventado nuevo.
  const hasPaidDeposit = booking.depositStatus === 'paid' && (booking.depositAmount ?? 0) > 0
  let cancelRefundWarning: string | null = null
  if (cancelType) {
    if (!hasPaidDeposit) {
      cancelRefundWarning = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    } else if (hasEnded) {
      cancelRefundWarning = 'El turno ya se jugó: la seña queda para el complejo (sin reembolso).'
    } else if (cancelType === 'complejo') {
      cancelRefundWarning =
        booking.paymentMethod === 'mercadopago'
          ? `Se reembolsará la seña de ${formatArs(booking.depositAmount ?? 0)} vía MercadoPago.`
          : `Coordiná el reembolso de ${formatArs(booking.depositAmount ?? 0)} en efectivo/transferencia con el jugador (no es automático).`
    } else {
      cancelRefundWarning = `Se aplica la política de cancelación: reembolso de ${formatArs(booking.depositAmount ?? 0)} si está dentro del plazo, retención si no.`
    }
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastId(null)
      onClose()
    }
  }

  return (
    <>
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent side="right" aria-label="Acciones del turno" className="gap-0">
          <SheetHeader className="border-b border-border p-5 pr-12">
            <SheetTitle className="font-display text-lg">{displayName ?? visual.label}</SheetTitle>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              {courtName} · {booking.timeStart}–{booking.timeEnd}
            </p>
            <div className="pt-1">
              <StatusBadge visual={{ icon: visual.icon, label: visual.label, tone: visual.tone }} />
            </div>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-5">
            <SlotPriceSummary booking={booking} displayName={displayName} />

            {mode && actions && (
              <SlotChargeSection
                mode={mode}
                lines={lines}
                // F-010 (QA prod 2026-08-17): sin esto, corregir el monto (o tocar
                // "Pagar todo en efectivo") dejaba el error de sobrecobro viejo en
                // pantalla, contradiciendo lo que el usuario ve mientras toca plata.
                onLinesChange={(next) => {
                  setError(null)
                  setLines(next)
                }}
                pending={pending}
                error={error}
                isPending={isPending}
                onSubmit={submitCharge}
              />
            )}

            <SlotActionButtons
              isPending={isPending}
              isTournament={booking.type === 'tournament'}
              canSellCanteen={canSellCanteen}
              onOpenCanteen={() => setCanteenOpen(true)}
              canReschedule={canReschedule}
              onOpenReschedule={() => setRescheduleOpen(true)}
              canMarkNoShow={canMarkNoShow}
              actions={actions}
              onOpenNoShow={() => setNoShowOpen(true)}
              canRevertNoShow={canRevertNoShow}
              onRevertNoShow={revertNoShow}
              canCancel={canCancel}
              onOpenCancel={openCancel}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Los dos diálogos se MONTAN al abrirse (patrón de BookingFormModal en la
          grilla): el catálogo de cantina y los huecos libres se piden una vez
          por apertura, con estado limpio y sin resetearlo a mano. */}
      {canSellCanteen &&
        canteenOpen &&
        renderCanteenDialog?.({
          open: true,
          onOpenChange: setCanteenOpen,
          bookingId: booking.id,
          displayName,
        })}

      {canReschedule &&
        rescheduleOpen &&
        courts &&
        actions?.listRescheduleSlotsAction &&
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
              notifyMutated()
            }}
          />
        )}

      {actions && (
        <ConfirmDialog
          open={noShowOpen}
          onOpenChange={setNoShowOpen}
          title="Marcar como ausente"
          description={`${displayName ?? 'El cliente'} no se presentó a su turno de ${booking.timeStart}.`}
          consequences={NO_SHOW_CONSEQUENCES}
          confirmLabel="Marcar ausente"
          cancelLabel="Volver"
          variant="destructive"
          onConfirm={confirmNoShow}
        />
      )}

      {actions?.cancelBookingAction && (
        <ConfirmDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title="Cancelar reserva"
          description={`${displayName ?? visual.label}, ${booking.timeStart}–${booking.timeEnd}. Esta acción cancela el turno y libera el horario. Ingresá el motivo.`}
          variant="destructive"
          confirmLabel="Cancelar reserva"
          cancelLabel="Volver"
          onConfirm={onConfirmCancel}
        >
          <div className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
              <RadioChipGroup
                value={cancelType ?? ''}
                onValueChange={(v) => setCancelType(v as 'complejo' | 'jugador')}
              >
                <RadioChip
                  value="complejo"
                  description="Rotura, mantenimiento o error. Reembolso automático."
                >
                  El complejo necesita cancelar
                </RadioChip>
                <RadioChip
                  value="jugador"
                  description="Se aplica la política de cancelación del complejo."
                >
                  El jugador pidió cancelar
                </RadioChip>
              </RadioChipGroup>
            </fieldset>
            {cancelRefundWarning && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
                {cancelRefundWarning}
              </div>
            )}
            <div className="space-y-1">
              <label
                htmlFor={`slot-cancel-reason-${booking.id}`}
                className="text-xs font-medium text-foreground"
              >
                Motivo (obligatorio)
              </label>
              <textarea
                id={`slot-cancel-reason-${booking.id}`}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
          </div>
        </ConfirmDialog>
      )}
    </>
  )
}
