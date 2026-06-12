'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import {
  cancelBookingAction,
  completeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
} from './actions'

export type QuickActionsBooking = {
  id: string
  status: string
  type: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
}

type Props = {
  booking: QuickActionsBooking
  /** Nombre + horario para que el menú mobile y los toasts tengan contexto. */
  label: string
}

export function hasQuickActions(booking: Pick<QuickActionsBooking, 'status' | 'type'>): boolean {
  if (booking.type === 'block') return false
  return booking.status === 'pending_payment' || booking.status === 'confirmed'
}

/**
 * Acciones rápidas sin salir de la lista: confirmar pago / completar
 * directas, "ausente" con confirmación en dos pasos inline (genera deuda o
 * ban si hay penalidad — pero sin modal), cancelar con diálogo porque el
 * backend exige motivo. En mobile viven detrás de un menú contextual.
 */
export function QuickActions({ booking, label }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [noShowArmed, setNoShowArmed] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [shouldRefund, setShouldRefund] = useState(false)
  const [reason, setReason] = useState('')
  const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (disarmRef.current) clearTimeout(disarmRef.current)
    }
  }, [])

  if (!hasQuickActions(booking)) return null

  const hasPaidDeposit = booking.depositStatus === 'paid' && booking.depositAmount > 0

  function run(fn: () => Promise<{ success: boolean; error?: string }>, successTitle: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.success) {
        toast({ title: successTitle, description: label, variant: 'success' })
        router.refresh()
      } else {
        toast({
          title: 'No se pudo completar la acción',
          description: res.error,
          variant: 'destructive',
        })
      }
    })
  }

  function onNoShowClick() {
    if (!noShowArmed) {
      setNoShowArmed(true)
      if (disarmRef.current) clearTimeout(disarmRef.current)
      disarmRef.current = setTimeout(() => setNoShowArmed(false), 4000)
      return
    }
    if (disarmRef.current) clearTimeout(disarmRef.current)
    setNoShowArmed(false)
    run(() => markNoShowAction(booking.id), 'Marcada como ausente')
  }

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (reason.trim().length < 3) {
      return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    }
    const res = await cancelBookingAction(
      booking.id,
      reason.trim(),
      hasPaidDeposit ? shouldRefund : false,
    )
    if (res.success) {
      toast({ title: 'Reserva cancelada', description: label, variant: 'success' })
      router.refresh()
    }
    return res
  }

  function openCancel() {
    setReason('')
    setShouldRefund(false)
    setCancelOpen(true)
  }

  const refundWarning = !hasPaidDeposit
    ? 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    : shouldRefund
      ? booking.paymentMethod === 'mercadopago'
        ? `Se reembolsará la seña de ${formatArs(booking.depositAmount)} vía MercadoPago.`
        : `Coordiná el reembolso de ${formatArs(booking.depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
      : `La seña de ${formatArs(booking.depositAmount)} queda para el complejo (sin reembolso).`

  const isPendingPayment = booking.status === 'pending_payment'

  const inlineBtn =
    'h-8 rounded-md px-2.5 text-xs font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'

  return (
    <>
      {/* Desktop: botones inline. */}
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {isPendingPayment ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmDepositPaymentAction(booking.id), 'Pago confirmado')}
            className={cn(inlineBtn, 'bg-emerald-600 text-white hover:bg-emerald-700')}
          >
            Confirmar pago
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => completeBookingAction(booking.id), 'Marcada como completada')}
              className={cn(inlineBtn, 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
            >
              Completada
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onNoShowClick}
              aria-live="polite"
              className={cn(
                inlineBtn,
                noShowArmed
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {noShowArmed ? '¿Confirmar ausente?' : 'Ausente'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={openCancel}
              className={cn(inlineBtn, 'border border-red-200 bg-white text-red-600 hover:bg-red-50')}
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Mobile: menú contextual, sin botones siempre visibles. */}
      <div className="absolute right-1.5 top-1.5 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            aria-label={`Acciones para ${label}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
          >
            <MoreVertical aria-hidden className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isPendingPayment ? (
              <DropdownMenuItem
                onSelect={() => run(() => confirmDepositPaymentAction(booking.id), 'Pago confirmado')}
              >
                Confirmar pago
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={() => run(() => completeBookingAction(booking.id), 'Marcada como completada')}
                >
                  Marcar completada
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => run(() => markNoShowAction(booking.id), 'Marcada como ausente')}
                >
                  Marcar ausente
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openCancel} className="text-red-600 focus:text-red-700">
                  Cancelar reserva
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar reserva"
        description={`${label}. Esta acción cancela el turno y libera el horario. Ingresá el motivo.`}
        variant="destructive"
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-3">
          {hasPaidDeposit && (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-slate-700">¿Reembolsar la seña?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name={`refund-${booking.id}`} checked={!shouldRefund} onChange={() => setShouldRefund(false)} />
                Sin reembolso (la seña queda para el complejo)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name={`refund-${booking.id}`} checked={shouldRefund} onChange={() => setShouldRefund(true)} />
                Con reembolso
              </label>
            </fieldset>
          )}
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {refundWarning}
          </div>
          <div className="space-y-1">
            <label htmlFor={`cancel-reason-${booking.id}`} className="text-xs font-medium text-slate-700">
              Motivo (obligatorio)
            </label>
            <textarea
              id={`cancel-reason-${booking.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
