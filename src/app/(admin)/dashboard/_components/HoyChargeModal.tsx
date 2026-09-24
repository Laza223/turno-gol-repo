'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { CheckCircle2, CupSoda, MoreHorizontal, Trash2, Trophy, UserX } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/hooks/use-toast'
import { newChargeLine } from '@/components/admin/SplitPaymentFields'
import { CobrarSenaButton } from '@/components/booking/CobrarSenaButton'
import { useSlotCharges } from '@/components/booking/slot-panel/use-slot-charges'
import { SlotPriceSummary } from '@/components/booking/slot-panel/SlotPriceSummary'
import { SlotCancelDialog } from '@/components/booking/slot-panel/SlotCancelDialog'
import { slotGates } from '@/components/booking/slot-panel/slot-gates'
import type { RenderCanteenDialog, SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { hasEndedAt, startLabel } from '@/lib/dashboard/today-board'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import { relativeTimeEs } from '@/lib/format'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtPricingData } from '@/modules/courts/court.types'
import { HoyChargeSection } from '@/components/booking/slot-panel/HoyChargeSection'

/**
 * El turno que recibe el modal desde la Grilla no siempre trae los instantes
 * físicos (un evento de Realtime crudo puede no traerlos — ver
 * `use-booking-realtime.ts`): a diferencia de Hoy, que SIEMPRE los tiene
 * (`dashboard/page.tsx` los mapea desde `listDayGridBookings`), así que acá
 * quedan opcionales (mismo shape que `GridBooking`) y el modal cae a los
 * fallbacks documentados en cada uso.
 */
type ChargeBooking = GridBooking

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

export type HoyCourt = {
  id: string
  name: string
  status: 'online' | 'offline'
  capacity: number
  pricing: CourtPricingData
}

const ACTION_BUTTON =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60 md:h-10'

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
 * nada aparece "Cobrado ✓" y "Listo". Mientras hay un cobro en curso o los datos
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
  onClose,
  onMutated,
  hasEnded: hasEndedFallback,
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
  const gates = slotGates({
    booking,
    hasEnded,
    actions,
    hasCourts: courts.length > 0,
    hasCanteen: Boolean(renderCanteenDialog),
  })
  const visual = gridSlotVisual(booking)
  const name = rowDisplayName(booking)
  // Un ausente nunca "Cobrado ✓": la seña capturada no es "se cobró todo", es
  // el único costo real de un no-show (veto de producto, CLAUDE.md).
  const settled = pending === 0 && booking.priceSnapshot > 0 && booking.status !== 'no_show'
  const isTournament = booking.type === 'tournament'

  // "Terminó hace 4 min" / "Empieza en 25 min" / "En juego": lo que el mostrador
  // necesita saber para decidir, en una línea. Sin instantes (fallback de la
  // Grilla) no se muestra el renglón — no se inventa una hora relativa.
  const when =
    typeof booking.startsAtMs === 'number' && typeof booking.endsAtMs === 'number'
      ? (() => {
          const startsIn = startLabel(
            { startsAtMs: booking.startsAtMs!, endsAtMs: booking.endsAtMs! },
            nowMs,
          )
          return hasEnded
            ? `Terminó ${relativeTimeEs(new Date(booking.endsAtMs!).toISOString(), nowMs)}`
            : startsIn === 'ahora'
              ? 'En juego'
              : startsIn
        })()
      : null

  const hasMenu = gates.canEdit || gates.canReschedule || gates.canCancel
  const hasActions = gates.canSellCanteen || gates.canMarkNoShow
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
          className="max-w-lg gap-0 p-0 focus:outline-hidden"
          // El foco arranca en el diálogo y no en el primer control: sería el menú
          // ⋯ (o el campo del monto, que en una tablet abre el teclado antes de
          // que se lea nada). El lector anuncia el título y Tab entra al cobro.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
          }}
        >
          <div className="border-b border-border p-5 pr-24">
            <DialogTitle className="font-display text-lg leading-tight">{name}</DialogTitle>
            <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {courtName} · {booking.timeStart}–{booking.timeEnd}
              {when ? ` · ${when}` : ''}
            </p>
            {/* El badge explica por qué NO hay cobro (esperando seña, ausente, hora
                de torneo): con cobro disponible, el renglón de arriba ya alcanza. */}
            {!mode && (
              <div className="pt-2">
                <StatusBadge
                  visual={{ icon: visual.icon, label: visual.label, tone: visual.tone }}
                />
              </div>
            )}
          </div>

          {hasMenu && (
            // A la izquierda del ✕ del diálogo (right-4). `modal={false}` por el
            // mismo motivo que el resto del repo: con el default, Radix marca todo
            // el árbol como aria-hidden, incluido el trigger.
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                disabled={isPending}
                aria-label="Más acciones del turno"
                className="absolute right-11 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <MoreHorizontal aria-hidden className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {gates.canEdit && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>Editar</DropdownMenuItem>
                )}
                {gates.canReschedule && (
                  <DropdownMenuItem onSelect={() => setRescheduleOpen(true)}>
                    Reprogramar
                  </DropdownMenuItem>
                )}
                {gates.canCancel && (
                  <DropdownMenuItem
                    onSelect={() => setCancelOpen(true)}
                    className="text-red-700 focus:text-red-800 dark:text-red-300"
                  >
                    Cancelar reserva
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex flex-col gap-4 p-5">
            <SlotPriceSummary booking={booking} capacity={court?.capacity} />

            {mode ? (
              <HoyChargeSection
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
              />
            ) : settled ? (
              <>
                <p
                  role="status"
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold',
                    TONE_BADGE.success,
                  )}
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  Cobrado ✓
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={locked}
                  className="h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  Listo
                </button>
              </>
            ) : canConfirmDeposit ? (
              <CobrarSenaButton
                bookingId={booking.id}
                depositAmount={booking.depositAmount ?? 0}
                confirmDepositPaymentAction={actions.confirmDepositPaymentAction!}
                onSuccess={onMutated}
                disabled={locked}
                className="w-full"
              />
            ) : null}

            {isTournament && (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Esta hora la ocupa un torneo. La plata del torneo entra por la inscripción, no por
                  turno — se gestiona desde la pantalla del torneo.
                </p>
                {booking.tournamentId && (
                  <Link
                    href={`/torneos/${booking.tournamentId}`}
                    className={cn(
                      ACTION_BUTTON,
                      'flex-none border-border bg-card text-foreground hover:bg-accent',
                    )}
                  >
                    <Trophy aria-hidden className="h-4 w-4" />
                    Ir al torneo
                  </Link>
                )}
              </>
            )}

            {hasActions && (
              <div className="flex gap-2 border-t border-border pt-4">
                {gates.canSellCanteen && (
                  <button
                    type="button"
                    onClick={() => setCanteenOpen(true)}
                    disabled={locked}
                    className={cn(
                      ACTION_BUTTON,
                      'border-border bg-card text-foreground hover:bg-accent',
                    )}
                  >
                    <CupSoda aria-hidden className="h-4 w-4" />
                    Cantina
                  </button>
                )}
                {gates.canMarkNoShow && (
                  <button
                    type="button"
                    onClick={() => setNoShowOpen(true)}
                    disabled={locked}
                    className={cn(
                      ACTION_BUTTON,
                      'border-destructive/40 bg-destructive/5 text-red-700 hover:bg-destructive/10 dark:text-red-300',
                    )}
                  >
                    <UserX aria-hidden className="h-4 w-4" />
                    Marcar ausente
                  </button>
                )}
              </div>
            )}

            {gates.canReleaseBlock && (
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setReleaseBlockOpen(true)}
                  disabled={locked}
                  className={cn(
                    ACTION_BUTTON,
                    'w-full border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10',
                  )}
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Liberar el bloqueo
                </button>
              </div>
            )}

            {gates.canRevertNoShow && (
              <div className="flex flex-col border-t border-border pt-4">
                <button
                  type="button"
                  onClick={revertNoShow}
                  disabled={locked}
                  className={cn(
                    ACTION_BUTTON,
                    'border-border bg-card font-medium text-foreground hover:bg-accent',
                  )}
                >
                  Deshacer la ausencia
                </button>
                {/* En `no_show` no hay sección de cobro que pinte `error`: es el
                    único lugar del modal que lo muestra (mismo criterio que
                    `SlotActionButtons.tsx`). */}
                {error && (
                  <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Los diálogos se MONTAN al abrirse: el catálogo de cantina y los huecos
          libres se piden una vez por apertura, con el estado limpio. */}
      {gates.canSellCanteen &&
        canteenOpen &&
        renderCanteenDialog?.({
          open: true,
          onOpenChange: setCanteenOpen,
          bookingId: booking.id,
          displayName: name,
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
        description={`${name} no se presentó a su turno de ${booking.timeStart}.`}
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
          title="Liberar el bloqueo"
          description={`${name}, ${booking.timeStart}–${booking.timeEnd}. La cancha queda libre para reservar.`}
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
