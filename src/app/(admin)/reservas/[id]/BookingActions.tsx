'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { toast } from '@/hooks/use-toast'
import { useNowMs } from '@/hooks/use-now'
import { formatArs } from '@/lib/format'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import { getRefundOutcome } from '@/modules/bookings/refund-outcome'
import { refundOutcomeText } from '@/components/booking/slot-panel/refund-outcome-text'
import { CobrarSenaButton, type ConfirmDepositFn } from '@/components/booking/CobrarSenaButton'
import CompleteBookingDialog from '../CompleteBookingDialog'
import type {
  BookingActionResult,
  CompleteAndChargeInput,
  CompleteAndChargeResult,
} from '../actions'

type CancellationType = 'complejo' | 'jugador'

type SimpleBookingFn = (bookingId: string) => Promise<BookingActionResult>
type CancelBookingFn = (
  bookingId: string,
  reason: string,
  cancellationType: CancellationType,
) => Promise<BookingActionResult>
/** `releaseBlockAction` no devuelve `booking`: la fila ya no existe tras el DELETE. */
type ReleaseBlockFn = (bookingId: string) => Promise<ActionResult>

/** El router de Next, para el `router.refresh()` que sigue a cada mutación exitosa. */
type BookingActionsRouter = ReturnType<typeof useRouter>

type Props = {
  bookingId: string
  status: string
  /**
   * 'block' cambia todo el árbol de acciones (RI G2.1): ver el early-return de
   * abajo. Opcional a propósito (mismo criterio que `releaseBlockAction`):
   * sin ella se comporta como hoy y los tests/stories viejos siguen
   * compilando sin tocarlos.
   */
  type?: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
  priceSnapshot: number
  chargesTotal: number
  guestName: string | null
  guestPhone: string | null
  playerName?: string | null
  playerPhone?: string | null
  /** Fecha del turno (YYYY-MM-DD) para evaluar la política de cancelación. */
  bookingDate: string
  /** Hora de inicio (HH:MM:SS). */
  timeStart: string
  /**
   * Instante físico absoluto del inicio del turno (TIMESTAMPTZ ISO,
   * migraciones 040/041) — fuente de verdad para el preview de plazo (R3-1).
   * Si falta (no debería: NOT NULL post-backfill), cae al cálculo manual con
   * offset fijo -3 vía `bookingDate`/`timeStart`.
   */
  startsAt?: string | null
  /**
   * Instante físico absoluto del FIN del turno (TIMESTAMPTZ ISO, migraciones
   * 040/041) — fuente de verdad del guard "turno ya jugado" (clase de B3): si
   * el turno ya terminó, nunca se reembolsa, ni eligiendo 'complejo' (el
   * backend, `decideAdminRefund`, ya lo aplica; acá solo evitamos prometerle
   * al admin un reembolso que el backend no va a ejecutar). Si falta, cae al
   * fallback inicio + `SLOT_DURATION_MINUTES` (el turno es siempre de 60 min
   * fijos).
   */
  endsAt?: string | null
  /**
   * Última modificación del turno (TIMESTAMPTZ ISO). En un turno `no_show` es
   * el instante de la marca de ausencia: decide si la ventana de corrección de
   * 24h (RI #1) sigue abierta. Si falta, el botón "Deshacer ausente" no se
   * muestra — el server igual rechazaría fuera de ventana, pero preferimos no
   * ofrecer una acción que no sabemos si es válida.
   */
  updatedAt?: string | null
  /** Horas de anticipación de la política de cancelación del complejo. */
  cancellationPolicyHours: number
  completeAndChargeBookingAction: (
    input: CompleteAndChargeInput,
  ) => Promise<CompleteAndChargeResult>
  markNoShowAction: SimpleBookingFn
  revertNoShowAction: SimpleBookingFn
  cancelBookingAction: CancelBookingFn
  /**
   * Opcional a propósito (mismo criterio que `SlotPanelActions.releaseBlockAction`):
   * sin ella el botón de bloqueo no se ofrece y stories/callers viejos siguen compilando.
   */
  releaseBlockAction?: ReleaseBlockFn
  /**
   * "Cobrar seña $X" (paso 3, docs/decisions/2026-09-24-navegacion-panel.md):
   * único lugar de la página para confirmar a mano la seña de un
   * `pending_payment`. Opcional, mismo criterio que el resto.
   */
  confirmDepositPaymentAction?: ConfirmDepositFn
}

/** Ventana de corrección de asistencia (doc6 §3, trigger de la migración 060). */
const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000

// ART = UTC-3. Fallback cuando no llega `starts_at` — mismo cálculo que usaba
// el server antes de los instantes físicos (artDateAt). No contempla
// complejos `closes_next_day`: un slot de madrugada guarda `bookingDate` =
// día OPERATIVO (la noche anterior), no el día calendario real, así que este
// cálculo puede errar por 24hs para esos turnos (R3-1) — por eso `starts_at`
// es la fuente preferida y este cálculo queda solo de resguardo.
function bookingStartMs(dateStr: string, hhmmss: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmmss.split(':').map(Number)
  return Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0)
}

/**
 * RI G2.1: un bloqueo de mantenimiento no es una reserva de un jugador —
 * "Marcar completada"/"Marcar ausente" no significan nada, y "Cancelar" lo
 * dejaría como `canceled_*` PARA SIEMPRE (exactamente el bug que motiva este
 * fix: g2.md línea 10d). La única acción es liberarlo (DELETE físico, mismo
 * botón/copy que SlotActionButtons.tsx en el panel de la grilla).
 */
function BlockActions({
  bookingId,
  status,
  releaseBlockAction,
  router,
}: {
  bookingId: string
  status: string
  releaseBlockAction: ReleaseBlockFn | undefined
  router: BookingActionsRouter
}) {
  const [releaseBlockOpen, setReleaseBlockOpen] = useState(false)

  if (status !== 'confirmed' && status !== 'pending_payment') return null
  if (!releaseBlockAction) return null

  async function onConfirmReleaseBlock(): Promise<ActionResult> {
    const res = await releaseBlockAction!(bookingId)
    if (res.success) {
      toast({ title: 'Bloqueo liberado', variant: 'success' })
      router.refresh()
    }
    return res
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setReleaseBlockOpen(true)}
        className="h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-60"
      >
        Liberar el bloqueo
      </button>

      <ConfirmDialog
        open={releaseBlockOpen}
        onOpenChange={setReleaseBlockOpen}
        title="Liberar el bloqueo"
        description="La cancha queda libre para reservar."
        variant="destructive"
        confirmLabel="Liberar"
        cancelLabel="Volver"
        onConfirm={onConfirmReleaseBlock}
        consequences={[
          'El bloqueo se elimina: no queda como reserva cancelada.',
          'Si te equivocaste de horario, volvé a bloquear con el horario correcto.',
        ]}
      />
    </div>
  )
}

/**
 * "Cobrar seña $X" (paso 3): la única puerta a `confirmDepositPaymentAction`
 * ahora que se retiró de las filas de /reservas (`QuickActions.tsx`).
 */
function PendingPaymentActions({
  bookingId,
  depositAmount,
  confirmDepositPaymentAction,
  router,
}: {
  bookingId: string
  depositAmount: number
  confirmDepositPaymentAction: ConfirmDepositFn | undefined
  router: BookingActionsRouter
}) {
  if (depositAmount <= 0 || !confirmDepositPaymentAction) return null
  return (
    <CobrarSenaButton
      bookingId={bookingId}
      depositAmount={depositAmount}
      confirmDepositPaymentAction={confirmDepositPaymentAction}
      onSuccess={() => router.refresh()}
    />
  )
}

/**
 * RI #1 — corrección inversa: un turno marcado ausente por error vuelve a
 * 'completed' dentro de las 24h. Única acción disponible fuera de
 * 'confirmed'; pasada la ventana el turno es inmutable y no se ofrece nada.
 */
function NoShowActions({
  bookingId,
  depositStatus,
  depositAmount,
  updatedAt,
  nowMs,
  revertNoShowAction,
  router,
}: {
  bookingId: string
  depositStatus: string
  depositAmount: number
  updatedAt: string | null | undefined
  nowMs: number
  revertNoShowAction: SimpleBookingFn
  router: BookingActionsRouter
}) {
  const [revertNoShowOpen, setRevertNoShowOpen] = useState(false)

  const markedAtMs = updatedAt ? new Date(updatedAt).getTime() : null
  const withinWindow =
    markedAtMs !== null && Number.isFinite(markedAtMs) && nowMs - markedAtMs < CORRECTION_WINDOW_MS
  if (!withinWindow) return null

  const depositWarning =
    depositStatus === 'captured' && depositAmount > 0
      ? ` La seña de ${formatArs(depositAmount)} ya quedó cobrada y NO se devuelve sola: si corresponde reintegrarla, coordinala con el jugador.`
      : ''

  async function onConfirmRevertNoShow(): Promise<ActionResult> {
    const res = await revertNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Ausencia deshecha', variant: 'success' })
      router.refresh()
    }
    return res
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setRevertNoShowOpen(true)}
        className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        Deshacer ausente
      </button>

      <ConfirmDialog
        open={revertNoShowOpen}
        onOpenChange={setRevertNoShowOpen}
        title="Deshacer la ausencia"
        description={`El turno vuelve a quedar como completado y se borra la ausencia del historial del jugador (si el bloqueo por reincidencia lo había disparado esta marca, se levanta).${depositWarning}`}
        confirmLabel="Deshacer ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmRevertNoShow}
      />
    </div>
  )
}

/**
 * Corrección de asistencia (doc6 §3, P5): un turno que quedó `completed` sin
 * que nadie lo mirara vuelve a `no_show` dentro de las 24h de esa marca.
 *
 * El motor, la state machine y el trigger de la migración 060 ya lo
 * soportaban desde siempre; lo que faltaba era la puerta. Sin ella, la
 * ÚNICA ventana real para registrar una ausencia eran los ≤30 minutos entre
 * que el turno termina y que el cron `auto-complete-bookings` lo pasa a
 * "Jugada" — un plazo que nadie que esté atendiendo el complejo puede
 * cumplir, y que dejaba la falta sin registrar (y por lo tanto sin contar
 * para el bloqueo por reincidencia).
 *
 * Sin `updatedAt` no se ofrece: el server igual rechazaría fuera de ventana,
 * pero no ofrecemos una acción que no sabemos si es válida (mismo criterio
 * que "Deshacer ausente" arriba).
 */
function CompletedActions({
  bookingId,
  updatedAt,
  nowMs,
  markNoShowAction,
  revertNoShowAction,
  router,
}: {
  bookingId: string
  updatedAt: string | null | undefined
  nowMs: number
  markNoShowAction: SimpleBookingFn
  revertNoShowAction: SimpleBookingFn
  router: BookingActionsRouter
}) {
  const [noShowOpen, setNoShowOpen] = useState(false)

  const completedAtMs = updatedAt ? new Date(updatedAt).getTime() : null
  const withinWindow =
    completedAtMs !== null &&
    Number.isFinite(completedAtMs) &&
    nowMs - completedAtMs < CORRECTION_WINDOW_MS
  if (!withinWindow) return null

  async function onConfirmRevertNoShow(): Promise<ActionResult> {
    const res = await revertNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Ausencia deshecha', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmNoShow(): Promise<ActionResult> {
    const res = await markNoShowAction(bookingId)
    if (res.success) {
      toast({
        title: 'Marcada como ausente',
        variant: 'success',
        action: { label: 'Deshacer', onClick: () => void onConfirmRevertNoShow() },
      })
      router.refresh()
    }
    return res
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setNoShowOpen(true)}
        className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
      >
        Marcar ausente
      </button>
      <p className="text-xs text-muted-foreground">
        El turno figura como jugado. Si el equipo no vino, se puede corregir hasta 24 h después.
      </p>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description="El turno figura como jugado. Se corrige a ausente y queda registrado que el jugador no se presentó."
        consequences={NO_SHOW_CONSEQUENCES}
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />
    </div>
  )
}

/** Las acciones de un turno `confirmed`: completar, marcar ausente, cancelar. */
function ConfirmedActions({
  bookingId,
  depositStatus,
  depositAmount,
  paymentMethod,
  bookingDate,
  timeStart,
  startsAt,
  endsAt,
  cancellationPolicyHours,
  priceSnapshot,
  chargesTotal,
  guestName,
  guestPhone,
  playerName,
  playerPhone,
  completeAndChargeBookingAction,
  markNoShowAction,
  revertNoShowAction,
  cancelBookingAction,
  nowMs,
  router,
}: {
  bookingId: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
  bookingDate: string
  timeStart: string
  startsAt: string | null | undefined
  endsAt: string | null | undefined
  cancellationPolicyHours: number
  priceSnapshot: number
  chargesTotal: number
  guestName: string | null
  guestPhone: string | null
  playerName: string | null | undefined
  playerPhone: string | null | undefined
  completeAndChargeBookingAction: (
    input: CompleteAndChargeInput,
  ) => Promise<CompleteAndChargeResult>
  markNoShowAction: SimpleBookingFn
  revertNoShowAction: SimpleBookingFn
  cancelBookingAction: CancelBookingFn
  nowMs: number
  router: BookingActionsRouter
}) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelType, setCancelType] = useState<CancellationType | null>(null)
  const [reason, setReason] = useState('')

  const hasPaidDeposit = depositStatus === 'paid' && depositAmount > 0
  const bookingStartUtcMs = startsAt
    ? new Date(startsAt).getTime()
    : bookingStartMs(bookingDate, timeStart)
  const bookingEndUtcMs = endsAt
    ? new Date(endsAt).getTime()
    : bookingStartUtcMs + SLOT_DURATION_MINUTES * 60_000
  // MEJORA-UX QA: "Marcar completada"/"Marcar ausente" abrían el diálogo
  // entero sin aviso — recién al confirmar el server devolvía "El turno
  // todavía no terminó...". "Cancelar" ya usaba este mismo cálculo (antes
  // recalculado adentro del bloque de abajo) para su propio preview; acá se
  // sube para poder deshabilitar los otros dos botones de entrada. Mismo
  // criterio que ya aplica `chargeMode`/`canMarkNoShow` en el panel de la
  // grilla (BookingSlotPanel): ninguno de los dos tiene sentido antes de que
  // el turno termine.
  const turnoEnded = nowMs >= bookingEndUtcMs

  async function onConfirmCancel(): Promise<ActionResult> {
    if (!cancelType) return { success: false, error: 'Indicá quién cancela la reserva.' }
    if (reason.trim().length < 3)
      return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    const res = await cancelBookingAction(bookingId, reason.trim(), cancelType)
    if (res.success) {
      toast({ title: 'Reserva cancelada', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmRevertNoShow(): Promise<ActionResult> {
    const res = await revertNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Ausencia deshecha', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmNoShow(): Promise<ActionResult> {
    const res = await markNoShowAction(bookingId)
    if (res.success) {
      toast({
        title: 'Marcada como ausente',
        variant: 'success',
        action: { label: 'Deshacer', onClick: () => void onConfirmRevertNoShow() },
      })
      router.refresh()
    }
    return res
  }

  const refundPreview = refundOutcomeText(
    getRefundOutcome({
      depositStatus,
      depositAmountCents: depositAmount,
      paymentMethod,
      bookingStartUtcMs,
      bookingEndUtcMs,
      policyHours: cancellationPolicyHours,
      nowMs,
      cancellationType: cancelType,
    }),
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!turnoEnded}
          title={turnoEnded ? undefined : 'El turno todavía no terminó'}
          onClick={() => setCompleteDialogOpen(true)}
          // H078: "Marcar completada" es un estado del SISTEMA, no de la
          // plata — el primario (sólido) de la vista es "+ Agregar cobro"
          // (BookingCharges.tsx). Regla del dueño §8.4 + BONUS-62.
          className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={!turnoEnded}
          title={turnoEnded ? undefined : 'El turno todavía no terminó'}
          onClick={() => setNoShowOpen(true)}
          className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          onClick={() => {
            setReason('')
            setCancelType(null)
            setCancelOpen(true)
          }}
          className="h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar reserva"
        description="Primero indicá por qué se cancela. Eso define si corresponde reembolsar la seña."
        variant="destructive"
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
            <RadioChipGroup
              // '' (nunca undefined) — ver comentario homólogo en QuickActions.tsx.
              value={cancelType ?? ''}
              onValueChange={(v) => setCancelType(v as CancellationType)}
            >
              <RadioChip
                value="complejo"
                description={
                  hasPaidDeposit
                    ? 'Rotura, mantenimiento o error. La seña queda para que se la devuelvas vos.'
                    : 'Rotura, mantenimiento o error.'
                }
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

          <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
            {refundPreview}
          </div>

          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">
              Motivo (obligatorio)
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description="Se registrará que el jugador no se presentó."
        consequences={NO_SHOW_CONSEQUENCES}
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />

      {completeDialogOpen && (
        <CompleteBookingDialog
          booking={{
            id: bookingId,
            priceSnapshot,
            depositAmount,
            depositStatus,
            paymentMethod,
            guestName,
            guestPhone,
            playerName,
            playerPhone,
            chargesTotal,
          }}
          label={`Reserva`}
          onClose={() => setCompleteDialogOpen(false)}
          completeAndChargeAction={completeAndChargeBookingAction}
        />
      )}
    </div>
  )
}

/**
 * Las Server Actions llegan por PROP, no por import (ver comentario
 * homólogo en ReservasPolicyForm.tsx / QuickActions.tsx): '../actions' es
 * `'use server'` y arrastra node:async_hooks, que rompe Storybook.
 *
 * Máquina de estados con early-returns por `status` (block, pending_payment,
 * no_show, completed, resto/confirmed): cada rama es su propio componente,
 * este solo despacha según `type`/`status`.
 */
export default function BookingActions({
  bookingId,
  status,
  type,
  depositStatus,
  depositAmount,
  paymentMethod,
  bookingDate,
  timeStart,
  startsAt,
  endsAt,
  updatedAt,
  cancellationPolicyHours,
  priceSnapshot,
  chargesTotal,
  guestName,
  guestPhone,
  playerName,
  playerPhone,
  completeAndChargeBookingAction,
  markNoShowAction,
  revertNoShowAction,
  cancelBookingAction,
  releaseBlockAction,
  confirmDepositPaymentAction,
}: Props) {
  const router = useRouter()
  // Reloj reactivo (ver use-now.ts). Lo consumen las ramas `no_show`,
  // `completed` y `confirmed`: si todavía se puede deshacer la ausencia, si la
  // cancelación entra en política, y si el turno ya terminó. Con `Date.now()`
  // en el render, una pestaña abierta cruzaba cualquiera de esos límites sin
  // enterarse.
  const nowMs = useNowMs()

  if (type === 'block') {
    return (
      <BlockActions
        bookingId={bookingId}
        status={status}
        releaseBlockAction={releaseBlockAction}
        router={router}
      />
    )
  }

  if (status === 'pending_payment') {
    return (
      <PendingPaymentActions
        bookingId={bookingId}
        depositAmount={depositAmount}
        confirmDepositPaymentAction={confirmDepositPaymentAction}
        router={router}
      />
    )
  }

  if (status === 'no_show') {
    return (
      <NoShowActions
        bookingId={bookingId}
        depositStatus={depositStatus}
        depositAmount={depositAmount}
        updatedAt={updatedAt}
        nowMs={nowMs}
        revertNoShowAction={revertNoShowAction}
        router={router}
      />
    )
  }

  if (status === 'completed') {
    return (
      <CompletedActions
        bookingId={bookingId}
        updatedAt={updatedAt}
        nowMs={nowMs}
        markNoShowAction={markNoShowAction}
        revertNoShowAction={revertNoShowAction}
        router={router}
      />
    )
  }

  if (status !== 'confirmed') return null

  return (
    <ConfirmedActions
      bookingId={bookingId}
      depositStatus={depositStatus}
      depositAmount={depositAmount}
      paymentMethod={paymentMethod}
      bookingDate={bookingDate}
      timeStart={timeStart}
      startsAt={startsAt}
      endsAt={endsAt}
      cancellationPolicyHours={cancellationPolicyHours}
      priceSnapshot={priceSnapshot}
      chargesTotal={chargesTotal}
      guestName={guestName}
      guestPhone={guestPhone}
      playerName={playerName}
      playerPhone={playerPhone}
      completeAndChargeBookingAction={completeAndChargeBookingAction}
      markNoShowAction={markNoShowAction}
      revertNoShowAction={revertNoShowAction}
      cancelBookingAction={cancelBookingAction}
      nowMs={nowMs}
      router={router}
    />
  )
}
