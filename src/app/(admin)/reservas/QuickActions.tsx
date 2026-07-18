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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { hasQuickActions } from './quick-actions-helpers'
import type { BookingActionResult } from './actions'

type QuickActionsBooking = {
  id: string
  status: string
  type: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
  /**
   * Instante físico absoluto del FIN del turno (TIMESTAMPTZ ISO, migraciones
   * 040/041) — fuente de verdad del guard "turno ya jugado" (clase de B3):
   * ver comentario homólogo en BookingActions.tsx.
   */
  endsAt?: string | null
}

type SimpleBookingFn = (bookingId: string) => Promise<BookingActionResult>
type CancelBookingFn = (
  bookingId: string,
  reason: string,
  cancellationType: 'complejo' | 'jugador',
) => Promise<BookingActionResult>

/**
 * Firma de las 4 Server Actions que consume QuickActions. Se agrupan en un
 * solo tipo para que BookingListItem las reciba y reenvíe de un solo prop.
 */
export type BookingQuickActions = {
  cancelBookingAction: CancelBookingFn
  completeBookingAction: SimpleBookingFn
  confirmDepositPaymentAction: SimpleBookingFn
  markNoShowAction: SimpleBookingFn
}

type Props = BookingQuickActions & {
  booking: QuickActionsBooking
  /** Nombre + horario para que el menú mobile y los toasts tengan contexto. */
  label: string
}

/**
 * Acciones rápidas sin salir de la lista: confirmar pago / completar
 * directas, "ausente" con confirmación en dos pasos inline (captura la seña
 * y a la 2da ausencia en 90 días aplica softban de 14 días — pero sin modal),
 * cancelar con diálogo porque el backend exige motivo. En mobile viven detrás
 * de un menú contextual.
 *
 * Las 4 Server Actions llegan por PROP, no por import. './actions' es
 * `'use server'` y arrastra request-context → node:async_hooks, que Vite
 * externaliza en el browser y rompe Storybook. El type import de
 * BookingActionResult sí es seguro: se borra en compilación.
 */
export function QuickActions({
  booking,
  label,
  cancelBookingAction,
  completeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [noShowArmed, setNoShowArmed] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelType, setCancelType] = useState<'complejo' | 'jugador' | null>(null)
  const [reason, setReason] = useState('')
  const disarmRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (disarmRef.current) clearTimeout(disarmRef.current)
    }
  }, [])

  if (!hasQuickActions(booking)) return null

  const hasPaidDeposit = booking.depositStatus === 'paid' && booking.depositAmount > 0
  const turnoEnded = booking.endsAt ? Date.now() >= new Date(booking.endsAt).getTime() : false

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
    if (!cancelType) {
      return { success: false, error: 'Indicá quién cancela la reserva.' }
    }
    if (reason.trim().length < 3) {
      return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    }
    const res = await cancelBookingAction(booking.id, reason.trim(), cancelType)
    if (res.success) {
      toast({ title: 'Reserva cancelada', description: label, variant: 'success' })
      router.refresh()
    }
    return res
  }

  function openCancel() {
    setReason('')
    setCancelType(null)
    setCancelOpen(true)
  }

  // Preview del destino de la seña según el motivo. En la grilla no calculamos
  // el plazo (no tenemos la política a mano); el server resuelve la retención.
  let refundWarning: string | null = null
  if (cancelType) {
    if (!hasPaidDeposit) {
      // Sin seña pagada no hay nada que reembolsar ni retener — el timing del
      // turno es irrelevante, así que este check va ANTES que `turnoEnded`.
      refundWarning = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    } else if (turnoEnded) {
      refundWarning = 'El turno ya se jugó: la seña queda para el complejo (sin reembolso).'
    } else if (cancelType === 'complejo') {
      refundWarning =
        booking.paymentMethod === 'mercadopago'
          ? `Se reembolsará la seña de ${formatArs(booking.depositAmount)} vía MercadoPago.`
          : `Coordiná el reembolso de ${formatArs(booking.depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
    } else {
      refundWarning = `Se aplica la política de cancelación: reembolso de ${formatArs(booking.depositAmount)} si está dentro del plazo, retención si no.`
    }
  }

  const isPendingPayment = booking.status === 'pending_payment'

  const inlineBtn =
    'h-8 rounded-md px-2.5 text-xs font-semibold transition-colors disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500'

  return (
    <>
      {/* Desktop: botones inline. z-10: encima del Link estirado de la fila. */}
      <div className="relative z-10 hidden shrink-0 items-center gap-1.5 sm:flex">
        {isPendingPayment ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmDepositPaymentAction(booking.id), 'Pago confirmado')}
            className={cn(inlineBtn, 'bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            Confirmar pago
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => completeBookingAction(booking.id), 'Marcada como completada')}
              className={cn(inlineBtn, 'border border-border bg-card text-foreground hover:bg-accent')}
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
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : 'border border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              {noShowArmed ? '¿Confirmar ausente?' : 'Ausente'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={openCancel}
              className={cn(inlineBtn, 'border border-red-200 dark:border-red-500/30 bg-card text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10')}
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Mobile: menú contextual, sin botones siempre visibles. z-10: encima del Link estirado de la fila. */}
      <div className="absolute right-1.5 top-1.5 z-10 sm:hidden">
        {/* modal={false}: menú de acciones rápidas de una fila, no un diálogo. Con el
            default (modal=true) Radix llama hideOthers() y marca aria-hidden todo el
            árbol fuera del portal —incluido el propio trigger, que sigue siendo
            focuseable— violando aria-hidden-focus (axe). Mismo criterio que
            StaffActions, ShareButton, HeroSearch y SearchBar. */}
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                disabled={pending}
                aria-label={`Acciones para ${label}`}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
              >
                <MoreVertical aria-hidden className="h-5 w-5" />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Acciones</TooltipContent>
          </Tooltip>
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
                <DropdownMenuItem onSelect={openCancel} className="text-red-600 dark:text-red-400 focus:text-red-700">
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
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`cancel-type-${booking.id}`}
                className="mt-0.5"
                checked={cancelType === 'complejo'}
                onChange={() => setCancelType('complejo')}
              />
              <span>
                <span className="font-medium">El complejo necesita cancelar</span>
                <span className="block text-xs text-muted-foreground">Rotura, mantenimiento o error. Reembolso automático.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`cancel-type-${booking.id}`}
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
          {refundWarning && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
              {refundWarning}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor={`cancel-reason-${booking.id}`} className="text-xs font-medium text-foreground">
              Motivo (obligatorio)
            </label>
            <textarea
              id={`cancel-reason-${booking.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
