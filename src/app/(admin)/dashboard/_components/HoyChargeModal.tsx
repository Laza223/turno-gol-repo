'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { newChargeLine } from '@/components/admin/SplitPaymentFields'
import { useSlotCharges } from '@/components/booking/slot-panel/use-slot-charges'
import { SlotPriceSummary } from '@/components/booking/slot-panel/SlotPriceSummary'
import { slotGates } from '@/components/booking/slot-panel/slot-gates'
import type { RenderCanteenDialog, SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { hasEndedAt, whenLabel } from '@/lib/dashboard/today-board'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtPricingData } from '@/modules/courts/court.types'
import { HoyChargeModalHeader } from './HoyChargeModalHeader'
import { HoyChargeModalMenu } from './HoyChargeModalMenu'
import { HoyChargeModalPaymentStatus } from './HoyChargeModalPaymentStatus'
import { HoyChargeModalActions } from './HoyChargeModalActions'
import { HoyChargeModalDialogs } from './HoyChargeModalDialogs'

/**
 * El turno que recibe el modal desde la Grilla no siempre trae los instantes
 * físicos (un evento de Realtime crudo puede no traerlos — ver
 * `use-booking-realtime.ts`): a diferencia de Hoy, que SIEMPRE los tiene
 * (`dashboard/page.tsx` los mapea desde `listDayGridBookings`), así que acá
 * quedan opcionales (mismo shape que `GridBooking`) y el modal cae a los
 * fallbacks documentados en cada uso.
 */
export type ChargeBooking = GridBooking

/** El siguiente turno para cobrar, para seguir sin cerrar el modal (solo Hoy). */
export type NextToCharge = { name: string; courtName: string; onOpen: () => void }

export type HoyCourt = {
  id: string
  name: string
  status: 'online' | 'offline'
  capacity: number
  pricing: CourtPricingData
}

/**
 * El turno de Hoy, en un modal: cobrar sin salir de la pantalla del mostrador.
 *
 * Es UN diálogo, no un panel lateral ni una hoja desde abajo: `ui/dialog` va
 * anclado arriba en el teléfono a propósito, porque en iOS el teclado tapa un
 * formulario anclado abajo. Cobra por el hook de siempre (`useSlotCharges`) y
 * comparte con el panel de la Grilla las compuertas de qué acciones ofrece
 * (`slotGates`) y el diálogo de cancelar con sus avisos de reembolso.
 *
 * **Se queda abierto después de cobrar.** Los datos se refrescan solos
 * (`onMutated` dispara el `router.refresh()` del shell); cuando ya no falta
 * nada aparece "Cobrado ✓" y, en Hoy, "Cobrar el siguiente": cobrar cinco turnos
 * seguidos no obliga a cerrar y buscar cada uno. Mientras hay un cobro en curso o los datos
 * se están refrescando (`locked`), nada de cobro se puede tocar: el segundo cobro
 * nunca sale con el saldo viejo, y tras "dar por jugado" el modo pasa de `finish`
 * a `settle` con la clave de idempotencia ya rotada.
 *
 * Las Server Actions llegan POR PROP, no por import: `'use server'` arrastra
 * `node:async_hooks` al bundle y rompe Storybook (mismo motivo que el panel).
 */
export function HoyChargeModal({
  booking,
  courtName,
  courts,
  dayBookings,
  daySlots,
  nowMs,
  isRefreshing,
  actions,
  renderCanteenDialog,
  allowNoShow = true,
  next,
  onClose,
  onMutated,
  hasEnded: hasEndedFallback,
  cancellationPolicyHours = null,
}: {
  booking: ChargeBooking
  courtName: string
  courts: HoyCourt[]
  /** Todas las reservas del día (todas las canchas): el diálogo de editar las necesita. */
  dayBookings: ChargeBooking[]
  daySlots: string[]
  nowMs: number
  /** Los datos se están refrescando tras una mutación. */
  isRefreshing: boolean
  actions: SlotPanelActions
  renderCanteenDialog?: RenderCanteenDialog
  /**
   * Ofrecer "Marcar ausente". La Grilla sí (es donde se anota); Hoy no: su modal
   * es solo para cobrar (pedido del dueño, 2026-09-25).
   */
  allowNoShow?: boolean
  /** El siguiente para cobrar. Sin esto (la Grilla) no se ofrece seguir de largo. */
  next?: NextToCharge
  onClose: () => void
  /** Se cobró (o se movió/canceló): el shell tiene que refrescar la pantalla. */
  onMutated: () => void
  /**
   * "¿Ya terminó?" cuando el turno no trae `endsAtMs` (Realtime crudo, ver
   * `ChargeBooking`). Hoy siempre trae el instante y este prop no hace falta;
   * la Grilla lo pasa ya calculado con `isSlotPast` (día operativo) como red
   * de contención — nunca se usa si `endsAtMs` está presente.
   */
  hasEnded?: boolean
  /**
   * Horas de anticipación de la política de cancelación del complejo, para el
   * aviso de seña de `SlotCancelDialog`. Opcional (default `null`): callers
   * viejos/stories que no la cablean siguen compilando, y el diálogo degrada
   * solo al texto genérico.
   */
  cancellationPolicyHours?: number | null
}) {
  const hasEnded =
    typeof booking.endsAtMs === 'number'
      ? hasEndedAt({ endsAtMs: booking.endsAtMs }, nowMs)
      : (hasEndedFallback ?? false)
  const court = courts.find((c) => c.id === booking.courtId)

  const [noShowOpen, setNoShowOpen] = useState(false)
  const [canteenOpen, setCanteenOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [releaseBlockOpen, setReleaseBlockOpen] = useState(false)

  // Estado limpio tras cada mutación exitosa: mismo patrón "derived state on
  // prop change" que el panel de la Grilla (sin useEffect). `resetLastId` lo
  // dispara el hook al terminar un cobro, y con eso el próximo renglón arranca
  // con la clave de idempotencia rotada y el monto precargado con lo que falta.
  const [lastId, setLastId] = useState<string | null>(null)
  // El pendiente con el que se precargó `lines[0]`, para saber si un refresco
  // tiene que resincronizar el campo o si el admin ya lo editó y no hay que
  // pisarlo.
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
    notifyMutated: onMutated,
    resetLastId: () => setLastId(null),
  })

  if (booking.id !== lastId) {
    setLastId(booking.id)
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setLines([newChargeLine(booking.pending ?? null, 'cash')])
    setLastSyncedPending(booking.pending ?? 0)
  } else if (
    pending !== lastSyncedPending &&
    lines.length > 0 &&
    lines[0]!.amountCents === lastSyncedPending
  ) {
    // El monto precargado sigue intacto: si `pending` cambió por un refresco, se
    // sincroniza. Si `lines[0]` ya no coincide es porque lo editó — no se le pisa
    // lo que está tipeando.
    setLastSyncedPending(pending)
    setLines([{ ...lines[0]!, amountCents: pending }, ...lines.slice(1)])
  }

  const locked = isPending || isRefreshing
  const baseGates = slotGates({
    booking,
    hasEnded,
    actions,
    hasCourts: courts.length > 0,
    hasCanteen: Boolean(renderCanteenDialog),
  })
  const gates = { ...baseGates, canMarkNoShow: baseGates.canMarkNoShow && allowNoShow }
  const visual = gridSlotVisual({ ...booking, ended: hasEnded })
  const name = rowDisplayName(booking)
  // Un ausente nunca "Cobrado ✓": la seña capturada no es "se cobró todo", es
  // el único costo real de un no-show (veto de producto, CLAUDE.md).
  const settled = pending === 0 && booking.priceSnapshot > 0 && booking.status !== 'no_show'
  const isTournament = booking.type === 'tournament'
  // Se jugó y no se cobró: el mismo rojo de "No cobrado" en la Grilla y en Hoy.
  const late = (hasEnded || booking.status === 'completed') && pending > 0 && mode !== null

  // "Terminó hace 4 min" / "Empieza en 25 min" / "En juego": lo que el mostrador
  // necesita saber para decidir, en una línea. Sin instantes (fallback de la
  // Grilla) no se muestra el renglón — no se inventa una hora relativa.
  const when = whenLabel(booking, hasEnded, nowMs)

  const hasMenu = gates.canEdit || gates.canReschedule || gates.canCancel
  // "Cobrar seña $X" (paso 3, docs/decisions/2026-09-24-navegacion-panel.md):
  // única puerta a `confirmDepositPaymentAction` desde que se retiran los
  // botones de las filas de /reservas.
  const canConfirmDeposit =
    booking.status === 'pending_payment' &&
    (booking.depositAmount ?? 0) > 0 &&
    Boolean(actions.confirmDepositPaymentAction)

  // Cerrar con un cobro que se cortó por la red y no se sabe si entró: el aviso de
  // reintento vive en el estado de este modal y se pierde al desmontarlo. Si entró,
  // el saldo que verían al reabrir sería el viejo y "Pagó uno" cobraría de nuevo
  // con una clave nueva. Por eso el cierre refresca: al reabrir, el saldo es el real.
  function closeModal() {
    if (retryTotal !== null) onMutated()
    onClose()
  }

  // Pasar al siguiente es cerrar este y abrir otro: mismo cuidado con un cobro
  // que se cortó por la red.
  function goNext() {
    if (!next) return
    if (retryTotal !== null) onMutated()
    next.onOpen()
  }

  async function onConfirmNoShow() {
    const res = await confirmNoShow()
    // Un ausente no tiene nada más para hacer acá: el "Deshacer" queda en el aviso.
    if (res.success) onClose()
    return res
  }

  async function onConfirmReleaseBlock(): Promise<ActionResult> {
    if (!actions.releaseBlockAction) return { success: false, error: 'Sin acciones disponibles.' }
    const res = await actions.releaseBlockAction(booking.id)
    if (res.success) {
      // Mismo toast que BookingActions.tsx / BookingSlotPanel.tsx tras la MISMA acción.
      // Sin onClose(): el bloqueo desaparece de `bookings` tras el DELETE, y el
      // caller (HoyShell/BookingGrid) cierra el modal solo cuando ya no lo encuentra.
      toast({ title: 'Bloqueo liberado', variant: 'success' })
      setLastId(null)
      onMutated()
    }
    return res
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          // No se cierra a la mitad de un cobro: un cierre por error dejaría el
          // resultado sin mirar.
          if (!next && !locked) closeModal()
        }}
      >
        <DialogContent
          // Ancho para que los dos equipos entren lado a lado (rediseño 2026-09-25):
          // cobrar uno y después el otro sin bajar a buscarlo. `grid-cols-1` fija la
          // columna al ancho del diálogo: sin eso, un renglón que no se parte (el de
          // "Siguiente para cobrar") la estiraba y en el teléfono todo se salía por la
          // derecha. Casi todo el alto de la ventana: en la notebook del mostrador
          // (650 px) el 90% dejaba los dos equipos a medio ver.
          className="max-w-2xl grid-cols-1 gap-0 p-0 focus:outline-hidden md:max-h-[calc(100dvh-2rem)]"
          // El foco arranca en el diálogo y no en el primer control: sería el menú
          // ⋯ (o el campo del monto, que en una tablet abre el teclado antes de
          // que se lea nada). El lector anuncia el título y Tab entra al cobro.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
          }}
        >
          <HoyChargeModalHeader
            name={name}
            courtName={courtName}
            timeStart={booking.timeStart}
            timeEnd={booking.timeEnd}
            when={when}
            late={late}
            showBadge={!mode}
            visual={visual}
          />

          {hasMenu && (
            <HoyChargeModalMenu
              gates={gates}
              isPending={isPending}
              onEdit={() => setEditOpen(true)}
              onReschedule={() => setRescheduleOpen(true)}
              onCancel={() => setCancelOpen(true)}
            />
          )}

          <div className="flex flex-col gap-4 p-5">
            <SlotPriceSummary booking={booking} capacity={court?.capacity} late={late} />

            <HoyChargeModalPaymentStatus
              booking={booking}
              mode={mode}
              capacity={court?.capacity}
              lines={lines}
              // F-010 (QA prod 2026-08-17): sin esto, corregir el monto dejaba el
              // error de sobrecobro viejo en pantalla, contradiciendo lo que el
              // usuario ve mientras toca plata.
              onLinesChange={(next) => {
                setError(null)
                setLines(next)
              }}
              error={error}
              isPending={isPending}
              locked={locked}
              onSubmit={submitCharge}
              onPartialCharge={submitPartialCharge}
              onTeamCharge={submitTeamCharge}
              retryTotal={retryTotal}
              onRetry={retryUnconfirmedCharge}
              settled={settled}
              onClose={onClose}
              next={next ? { ...next, onOpen: goNext } : undefined}
              canConfirmDeposit={canConfirmDeposit}
              confirmDepositPaymentAction={actions.confirmDepositPaymentAction}
              onMutated={onMutated}
              isTournament={isTournament}
            />

            <HoyChargeModalActions
              gates={gates}
              locked={locked}
              error={error}
              onOpenCanteen={() => setCanteenOpen(true)}
              onOpenNoShow={() => setNoShowOpen(true)}
              onOpenReleaseBlock={() => setReleaseBlockOpen(true)}
              onRevertNoShow={revertNoShow}
            />
          </div>

          {/* Seguir de largo sin terminar este: un turno a medias (pagó un equipo)
              queda a medias y vuelve a aparecer en la cola hasta que pague el otro.
              Con el turno saldado el siguiente ya está arriba, en grande. Pegado
              abajo: en la notebook del mostrador (650 px de alto) el modal con los
              dos equipos se desplaza, y esto tiene que estar siempre a la vista. */}
          {next && !settled && (
            <div className="sticky bottom-0 border-t border-border bg-popover">
              <button
                type="button"
                onClick={goNext}
                disabled={locked}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  Siguiente para cobrar:{' '}
                  <span className="font-medium text-foreground">
                    {next.name}
                    {next.courtName ? ` · ${next.courtName}` : ''}
                  </span>
                </span>
                <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <HoyChargeModalDialogs
        booking={booking}
        name={name}
        hasEnded={hasEnded}
        nowMs={nowMs}
        cancellationPolicyHours={cancellationPolicyHours}
        courts={courts}
        court={court}
        dayBookings={dayBookings}
        daySlots={daySlots}
        gates={gates}
        actions={actions}
        renderCanteenDialog={renderCanteenDialog}
        canteenOpen={canteenOpen}
        setCanteenOpen={setCanteenOpen}
        rescheduleOpen={rescheduleOpen}
        setRescheduleOpen={setRescheduleOpen}
        editOpen={editOpen}
        setEditOpen={setEditOpen}
        noShowOpen={noShowOpen}
        setNoShowOpen={setNoShowOpen}
        cancelOpen={cancelOpen}
        setCancelOpen={setCancelOpen}
        releaseBlockOpen={releaseBlockOpen}
        setReleaseBlockOpen={setReleaseBlockOpen}
        onMutated={onMutated}
        setLastId={setLastId}
        onConfirmNoShow={onConfirmNoShow}
        onConfirmReleaseBlock={onConfirmReleaseBlock}
      />
    </>
  )
}
