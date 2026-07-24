'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import CompleteBookingDialog from '../CompleteBookingDialog'
import type { BookingActionResult, CompleteAndChargeInput, CompleteAndChargeResult } from '../actions'

type CancellationType = 'complejo' | 'jugador'

type SimpleBookingFn = (bookingId: string) => Promise<BookingActionResult>
type CancelBookingFn = (
  bookingId: string,
  reason: string,
  cancellationType: CancellationType,
) => Promise<BookingActionResult>

type Props = {
  bookingId: string
  status: string
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
  completeAndChargeBookingAction: (input: CompleteAndChargeInput) => Promise<CompleteAndChargeResult>
  markNoShowAction: SimpleBookingFn
  revertNoShowAction: SimpleBookingFn
  cancelBookingAction: CancelBookingFn
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
 * Las 3 Server Actions llegan por PROP, no por import (ver comentario
 * homólogo en ReservasPolicyForm.tsx / QuickActions.tsx): '../actions' es
 * `'use server'` y arrastra node:async_hooks, que rompe Storybook.
 */
export default function BookingActions({
  bookingId,
  status,
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
}: Props) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [revertNoShowOpen, setRevertNoShowOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [cancelType, setCancelType] = useState<CancellationType | null>(null)
  const [reason, setReason] = useState('')

  async function onConfirmRevertNoShow(): Promise<{ success: boolean; error?: string }> {
    const res = await revertNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Ausencia deshecha', variant: 'success' })
      router.refresh()
    }
    return res
  }

  // RI #1 — corrección inversa: un turno marcado ausente por error vuelve a
  // 'completed' dentro de las 24h. Única acción disponible fuera de
  // 'confirmed'; pasada la ventana el turno es inmutable y no se ofrece nada.
  if (status === 'no_show') {
    const markedAtMs = updatedAt ? new Date(updatedAt).getTime() : null
    const withinWindow =
      markedAtMs !== null &&
      Number.isFinite(markedAtMs) &&
      Date.now() - markedAtMs < CORRECTION_WINDOW_MS
    if (!withinWindow) return null

    const depositWarning =
      depositStatus === 'captured' && depositAmount > 0
        ? ` La seña de ${formatArs(depositAmount)} ya quedó cobrada y NO se devuelve sola: si corresponde reintegrarla, coordinala con el jugador.`
        : ''

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

  if (status !== 'confirmed') return null

  const hasPaidDeposit = depositStatus === 'paid' && depositAmount > 0
  const bookingStartUtcMs = startsAt ? new Date(startsAt).getTime() : bookingStartMs(bookingDate, timeStart)
  const bookingEndUtcMs = endsAt ? new Date(endsAt).getTime() : bookingStartUtcMs + SLOT_DURATION_MINUTES * 60_000
  const inPolicy = Date.now() < bookingStartUtcMs - cancellationPolicyHours * 3_600_000

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (!cancelType) return { success: false, error: 'Indicá quién cancela la reserva.' }
    if (reason.trim().length < 3) return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    const res = await cancelBookingAction(bookingId, reason.trim(), cancelType)
    if (res.success) {
      toast({ title: 'Reserva cancelada', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmNoShow(): Promise<{ success: boolean; error?: string }> {
    const res = await markNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Marcada como ausente', variant: 'success' })
      router.refresh()
    }
    return res
  }

  // ENS-2: qué pasa con la seña de ESTE turno si se cancela AHORA. Visible
  // desde que se abre el diálogo (antes solo aparecía tras elegir "quién
  // cancela"), usando la política real: sin seña no hay nada que decidir;
  // con seña, la ventana horaria decide salvo que el complejo asuma la culpa
  // (reembolsa siempre, Tarea #3).
  let refundPreview: string
  if (!hasPaidDeposit) {
    refundPreview = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
  } else if (!cancelType) {
    refundPreview = inPolicy
      ? `Corresponde devolver la seña de ${formatArs(depositAmount)} (dentro del plazo de cancelación).`
      : `La seña de ${formatArs(depositAmount)} quedó fuera de la ventana de devolución (política de ${cancellationPolicyHours}h).`
  } else {
    const turnoEnded = Date.now() >= bookingEndUtcMs
    const willRefund = turnoEnded ? false : cancelType === 'complejo' ? true : inPolicy
    if (willRefund) {
      refundPreview =
        paymentMethod === 'mercadopago'
          ? `Se reembolsará la seña de ${formatArs(depositAmount)} vía MercadoPago.`
          : `Coordiná el reembolso de ${formatArs(depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
    } else if (turnoEnded) {
      refundPreview = `El turno ya se jugó: la seña de ${formatArs(depositAmount)} queda para el complejo (sin reembolso).`
    } else {
      refundPreview = `Fuera del plazo de cancelación (${cancellationPolicyHours}h): la seña de ${formatArs(depositAmount)} queda para el complejo (sin reembolso).`
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCompleteDialogOpen(true)}
          className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          Marcar completada
        </button>
        <button
          type="button"
          onClick={() => setNoShowOpen(true)}
          className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          onClick={() => { setReason(''); setCancelType(null); setCancelOpen(true) }}
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
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cancel-type"
                className="mt-0.5"
                checked={cancelType === 'complejo'}
                onChange={() => setCancelType('complejo')}
              />
              <span>
                <span className="font-medium">El complejo necesita cancelar</span>
                <span className="block text-xs text-muted-foreground">Rotura, mantenimiento o error. Reembolso automático de la seña.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cancel-type"
                className="mt-0.5"
                checked={cancelType === 'jugador'}
                onChange={() => setCancelType('jugador')}
              />
              <span>
                <span className="font-medium">El jugador pidió cancelar</span>
                <span className="block text-xs text-muted-foreground">Se aplica la política de cancelación del complejo.</span>
              </span>
            </label>
          </fieldset>

          <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
            {refundPreview}
          </div>

          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">Motivo (obligatorio)</label>
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
        description="Se registrará que el jugador no se presentó. La seña pagada queda para el complejo; si es su segunda ausencia en 90 días, queda bloqueado 14 días para reservar online. Esta acción no se puede deshacer pasadas 24hs."
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
