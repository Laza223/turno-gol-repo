'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CalendarClock } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { newChargeLine } from '@/components/admin/SplitPaymentFields'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtPricingData } from '@/modules/courts/court.types'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useSlotCharges } from './slot-panel/use-slot-charges'
import { SlotPriceSummary } from './slot-panel/SlotPriceSummary'
import { SlotChargeSection } from './slot-panel/SlotChargeSection'
import { SlotActionButtons } from './slot-panel/SlotActionButtons'
import { chargeSplit } from './slot-panel/charge-copy'
import { slotGates } from './slot-panel/slot-gates'
import { SlotCancelDialog } from './slot-panel/SlotCancelDialog'
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

// D2: mismo motivo que arriba — editar es semanal, no diario.
const BookingEditDialog = dynamic(
  () => import('./BookingEditDialog').then((m) => m.BookingEditDialog),
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
  /**
   * Canchas del complejo. `pricing` es opcional y sólo lo necesita
   * `BookingEditDialog` para sugerir el precio al cambiar la duración — sin
   * él, el diálogo de reprogramar sigue andando igual (nunca lo usó).
   * `capacity` (jugadores que entran = `format × 2`) es lo que necesita el
   * atajo "Pagó uno"; sin él ese botón simplemente no se ofrece, en vez de
   * inventar un monto.
   */
  courts?: Array<{
    id: string
    name: string
    status?: 'online' | 'offline'
    pricing?: CourtPricingData
    capacity?: number
  }>
  /** Todas las reservas del día (todas las canchas) — sólo las necesita BookingEditDialog. */
  dayBookings?: GridBooking[]
  /** Grilla horaria del día — sólo la necesita BookingEditDialog. */
  daySlots?: string[]
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
  dayBookings,
  daySlots,
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

  const isDesktop = useIsDesktop()
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [canteenOpen, setCanteenOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [releaseBlockOpen, setReleaseBlockOpen] = useState(false)

  // Cambio de turno → estado limpio. Patrón "derived state on prop change"
  // (sin useEffect), igual que StreetMoneyChargeDialog.
  const [lastId, setLastId] = useState<string | null>(null)
  // D3: el pendiente con el que se precargó `lines[0]`, para saber si un
  // refetch (otro cobro desde otra pestaña, reconcile de 30s) tiene que
  // resincronizar el campo o si el admin ya lo editó y no hay que pisarlo.
  const [lastSyncedPending, setLastSyncedPending] = useState(0)

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
    submitPartialCharge,
    submitTeamCharge,
    retryTotal,
    retryUnconfirmedCharge,
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
    setLastSyncedPending(booking.pending ?? 0)
    setNoShowOpen(false)
    setCanteenOpen(false)
    setRescheduleOpen(false)
    setEditOpen(false)
    setCancelOpen(false)
    setReleaseBlockOpen(false)
  } else if (
    booking &&
    pending !== lastSyncedPending &&
    lines.length > 0 &&
    lines[0]!.amountCents === lastSyncedPending
  ) {
    // El admin no tocó el monto precargado: si `pending` cambió por un
    // refetch, la precarga se sincroniza con el nuevo pendiente. Si `lines[0]`
    // ya no coincide con lo último sincronizado, es porque lo editó — no se
    // le pisa lo que está tipeando.
    setLastSyncedPending(pending)
    setLines([{ ...lines[0]!, amountCents: pending }, ...lines.slice(1)])
  }

  if (!booking) return null

  const visual = gridSlotVisual(booking)
  // Cobro de a partes: de acá salen "Dividir pago por equipo" / "Pagó uno" y
  // el renglón "Pagaron 4 de 10". Cálculo puro sobre lo que el turno ya trae más
  // la capacidad de SU cancha; nada de esto se guarda.
  const split = chargeSplit(booking, courts?.find((c) => c.id === booking.courtId)?.capacity)

  // Qué acciones se ofrecen además de cobrar: una sola definición compartida con
  // el modal de Hoy (`slot-gates.ts`), así las dos pantallas no discrepan.
  const {
    canMarkNoShow,
    canRevertNoShow,
    canCancel,
    canReleaseBlock,
    canSellCanteen,
    canEdit,
    canReschedule,
  } = slotGates({
    booking,
    hasEnded,
    actions,
    hasCourts: Boolean(courts?.length),
    hasCanteen: Boolean(renderCanteenDialog),
  })
  const editCourt = courts?.find((c) => c.id === booking.courtId)

  const displayName =
    booking.guestName ??
    (booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim()
      : null)

  function openCancel() {
    setCancelOpen(true)
  }

  async function onConfirmReleaseBlock(): Promise<ActionResult> {
    if (!actions?.releaseBlockAction) return { success: false, error: 'Sin acciones disponibles.' }
    const res = await actions.releaseBlockAction(booking!.id)
    if (res.success) {
      // H094: mismo toast que BookingActions.tsx tras la MISMA acción.
      toast({ title: 'Bloqueo liberado', variant: 'success' })
      setLastId(null)
      notifyMutated()
    }
    return res
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
        {/* Desde abajo en el teléfono: el panel es la misma superficie que abre
            una celda de la matriz, y en 375 px una hoja lateral de 24 rem tapa
            la pantalla entera entrando desde el costado equivocado.
            En escritorio va a 30 rem (el Sheet trae 24): con 24 un turno
            confirmado no entraba sin scroll en una notebook al 125 % (pedido
            del dueño, 2026-09-17). El panel tapa la grilla igual, así que el
            ancho de más no le quita columnas de cancha. */}
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          aria-label="Acciones del turno"
          className="gap-0 lg:w-[30rem]"
        >
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

          {/* Una sola columna continua: la plata, el cobro y las acciones separados
              por un filete de 1px en vez de tres recuadros apilados adentro de la
              hoja (plan de diseño 2026-09-17 §5 — "Cards: borde o espacio"). */}
          <div className="flex flex-col gap-4 p-5">
            <SlotPriceSummary
              booking={booking}
              capacity={courts?.find((c) => c.id === booking.courtId)?.capacity}
            />

            {mode && actions && (
              <SlotChargeSection
                // Otro turno = otro formulario: el modo por equipo no se arrastra.
                key={booking.id}
                mode={mode}
                lines={lines}
                // F-010 (QA prod 2026-08-17): sin esto, corregir el monto dejaba el
                // error de sobrecobro viejo en pantalla, contradiciendo lo que el
                // usuario ve mientras toca plata.
                onLinesChange={(next) => {
                  setError(null)
                  setLines(next)
                }}
                pending={pending}
                error={error}
                isPending={isPending}
                onSubmit={submitCharge}
                split={split}
                onPartialCharge={submitPartialCharge}
                onTeamCharge={submitTeamCharge}
                retryTotal={retryTotal}
                onRetry={retryUnconfirmedCharge}
              />
            )}

            <SlotActionButtons
              isPending={isPending}
              isTournament={booking.type === 'tournament'}
              canSellCanteen={canSellCanteen}
              onOpenCanteen={() => setCanteenOpen(true)}
              canEdit={canEdit}
              onOpenEdit={() => setEditOpen(true)}
              canReschedule={canReschedule}
              onOpenReschedule={() => setRescheduleOpen(true)}
              canMarkNoShow={canMarkNoShow}
              actions={actions}
              onOpenNoShow={() => setNoShowOpen(true)}
              canRevertNoShow={canRevertNoShow}
              onRevertNoShow={revertNoShow}
              revertNoShowError={canRevertNoShow ? error : null}
              canCancel={canCancel}
              onOpenCancel={openCancel}
              canReleaseBlock={canReleaseBlock}
              onOpenReleaseBlock={() => setReleaseBlockOpen(true)}
              tournamentId={booking.tournamentId ?? null}
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

      {canEdit && editOpen && actions?.editBookingAction && actions.getBookingEditDetailAction && (
        <BookingEditDialog
          open
          onOpenChange={setEditOpen}
          booking={booking}
          dayBookings={dayBookings ?? [booking]}
          daySlots={daySlots ?? []}
          pricing={editCourt?.pricing}
          getDetailAction={actions.getBookingEditDetailAction}
          editAction={actions.editBookingAction}
          onSuccess={() => {
            setEditOpen(false)
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
        <SlotCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          booking={booking}
          label={displayName ?? visual.label}
          hasEnded={hasEnded}
          cancelAction={actions.cancelBookingAction}
          onCancelled={() => {
            setLastId(null)
            notifyMutated()
          }}
        />
      )}

      {actions?.releaseBlockAction && (
        <ConfirmDialog
          open={releaseBlockOpen}
          onOpenChange={setReleaseBlockOpen}
          title="Liberar el bloqueo"
          description={`${displayName ?? 'Bloqueo'}, ${booking.timeStart}–${booking.timeEnd}. La cancha queda libre para reservar.`}
          variant="destructive"
          confirmLabel="Liberar"
          cancelLabel="Volver"
          consequences={[
            'El bloqueo se elimina: no queda como reserva cancelada.',
            'Si te equivocaste de horario, volvé a bloquear con el horario correcto.',
          ]}
          onConfirm={onConfirmReleaseBlock}
        />
      )}
    </>
  )
}
