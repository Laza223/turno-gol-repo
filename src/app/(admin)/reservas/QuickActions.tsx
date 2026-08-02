'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatArs } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { hasQuickActions } from './quick-actions-helpers'
import CompleteBookingDialog from './CompleteBookingDialog'
import type { BookingActionResult, CompleteAndChargeInput, CompleteAndChargeResult } from './actions'
import type { GetBookingChargesResult } from './charges-actions'

type QuickActionsBooking = {
  id: string
  status: string
  type: string
  depositStatus: string
  depositAmount: number
  priceSnapshot: number
  paymentMethod: string | null
  guestName: string | null
  guestPhone: string | null
  playerName?: string | null
  playerPhone?: string | null
  /**
   * Instante físico absoluto del FIN del turno (TIMESTAMPTZ ISO, migraciones
   * 040/041) — fuente de verdad del guard "turno ya jugado" (clase de B3):
   * ver comentario homólogo en BookingActions.tsx.
   */
  endsAt?: string | null
  /**
   * Instante físico absoluto del INICIO del turno (TIMESTAMPTZ ISO,
   * migraciones 040/041) — junto con `cancellationPolicyHours` (prop de
   * `Props`, ver más abajo) permite calcular si ESTA reserva puntual está
   * dentro o fuera de la ventana de cancelación, igual que BookingActions.tsx
   * (cluster F bug 2). Opcional/nullable: sin este dato, `refundWarning` cae
   * al mensaje genérico previo (no rompe consumidores/stories viejas).
   */
  startsAt?: string | null
}

type SimpleBookingFn = (bookingId: string) => Promise<BookingActionResult>
type CancelBookingFn = (
  bookingId: string,
  reason: string,
  cancellationType: 'complejo' | 'jugador',
) => Promise<BookingActionResult>
type DepositMethod = 'cash' | 'transfer' | 'other'
type ConfirmDepositFn = (bookingId: string, method: DepositMethod) => Promise<BookingActionResult>

const DEPOSIT_METHOD_LABELS: Record<DepositMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
}

/**
 * Mismo texto en las 3 superficies donde se puede marcar ausente (lista
 * desktop/mobile acá, detalle en BookingActions.tsx) — la matriz
 * deshacer-vs-confirmar (visión v2 §6.2) es una sola gramática, no una por
 * pantalla.
 */
const NO_SHOW_CONSEQUENCES = [
  'La seña pagada queda para el complejo.',
  'Si es su segunda ausencia en 90 días, queda bloqueado 14 días para reservar online.',
  'No se puede deshacer pasadas 24hs.',
]

/**
 * Firma de las Server Actions que consume QuickActions. Se agrupan en un
 * solo tipo para que BookingListItem las reciba y reenvíe de un solo prop.
 *
 * `getBookingChargesAction` es OPCIONAL (mismo criterio que
 * `checkAvailabilityAction` en BookingFormModal): sin ella (stories/tests
 * viejas, o callers que todavía no la cablean) el diálogo de "Completada"
 * abre igual, con chargesTotal=0 — el comportamiento previo al fix, no un
 * crash. `./actions` NO exporta ya `completeBookingAction` acá: el botón
 * "Completada" siempre abre CompleteBookingDialog (nunca completa directo),
 * así que ese prop había quedado muerto tras el rediseño a "Completar +
 * Cobrar".
 */
export type BookingQuickActions = {
  cancelBookingAction: CancelBookingFn
  confirmDepositPaymentAction: ConfirmDepositFn
  markNoShowAction: SimpleBookingFn
  completeAndChargeBookingAction: (input: CompleteAndChargeInput) => Promise<CompleteAndChargeResult>
  /**
   * Inversa de `markNoShowAction` (ventana de 24hs, ver BookingActions.tsx).
   * Opcional (mismo criterio que `getBookingChargesAction`): sin ella
   * (stories/tests viejas) el toast de éxito no ofrece "Deshacer".
   */
  revertNoShowAction?: SimpleBookingFn
  /**
   * Lectura de los cobros de mostrador ya registrados del turno (sin la
   * seña), para que el diálogo de "Completada" abierto desde la LISTA arranque
   * con el mismo saldo pendiente real que ve el detalle (`reservas/[id]`) en
   * vez de asumir chargesTotal=0 (bug: turnos con cobros parciales previos
   * mostraban un pendiente inflado). Fail-open a 0 si la action no está o
   * falla — el server igual re-valida el monto real al cobrar
   * (completeAndChargeBookingAction).
   */
  getBookingChargesAction?: (bookingId: string) => Promise<GetBookingChargesResult>
}

type Props = BookingQuickActions & {
  booking: QuickActionsBooking
  /** Nombre + horario para que el menú mobile y los toasts tengan contexto. */
  label: string
  /**
   * Horas de anticipación de la política de cancelación del complejo (mismo
   * dato que `ReservaDetail.cancellationPolicyHours` en BookingActions.tsx).
   * Opcional: sin ella (callers/stories/tests viejas) `refundWarning` cae al
   * mensaje genérico previo al fix (cluster F bug 2) en vez de romper.
   */
  cancellationPolicyHours?: number
}

/**
 * Acciones rápidas sin salir de la lista: confirmar pago directa, "completada"
 * abre CompleteBookingDialog (Completar + Cobrar), "ausente" con confirmación
 * en dos pasos inline (captura la seña y a la 2da ausencia en 90 días aplica
 * softban de 14 días — pero sin modal), cancelar con diálogo porque el
 * backend exige motivo. En mobile viven detrás de un menú contextual.
 *
 * Las Server Actions llegan por PROP, no por import. './actions' es
 * `'use server'` y arrastra request-context → node:async_hooks, que Vite
 * externaliza en el browser y rompe Storybook. El type import de
 * BookingActionResult sí es seguro: se borra en compilación.
 */
export function QuickActions({
  booking,
  label,
  cancellationPolicyHours,
  cancelBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  revertNoShowAction,
  completeAndChargeBookingAction,
  getBookingChargesAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelType, setCancelType] = useState<'complejo' | 'jugador' | null>(null)
  const [reason, setReason] = useState('')
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [chargesTotal, setChargesTotal] = useState(0)
  const [confirmDepositOpen, setConfirmDepositOpen] = useState(false)
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('cash')

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

  function onUndoNoShow() {
    if (!revertNoShowAction) return
    run(() => revertNoShowAction(booking.id), 'Ausencia deshecha')
  }

  async function onConfirmNoShow(): Promise<{ success: boolean; error?: string }> {
    const res = await markNoShowAction(booking.id)
    if (res.success) {
      toast({
        title: 'Marcada como ausente',
        description: label,
        variant: 'success',
        action: revertNoShowAction ? { label: 'Deshacer', onClick: onUndoNoShow } : undefined,
      })
      router.refresh()
    }
    return res
  }

  /**
   * El staff elige el medio de cobro (Efectivo/Transferencia/Otro, default
   * Efectivo) antes de confirmar la seña — no se asume siempre efectivo.
   * Mismo lenguaje visual que "Cancelar" (ConfirmDialog + onConfirm que
   * devuelve {success,error}: el error se muestra inline y el diálogo se
   * mantiene abierto para reintentar).
   */
  function openConfirmDeposit() {
    setDepositMethod('cash')
    setConfirmDepositOpen(true)
  }

  async function onConfirmDeposit(): Promise<{ success: boolean; error?: string }> {
    const res = await confirmDepositPaymentAction(booking.id, depositMethod)
    if (res.success) {
      toast({ title: 'Pago confirmado', description: label, variant: 'success' })
      router.refresh()
    }
    return res
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

  /**
   * Trae los cobros de mostrador ya registrados ANTES de abrir el diálogo de
   * "Completada" — sin esto, el diálogo arrancaba siempre con chargesTotal=0
   * hardcodeado, inflando el saldo pendiente si el turno ya tenía cobros
   * parciales. Sin `getBookingChargesAction` (stories/tests viejas) abre
   * directo con 0, igual que antes del fix.
   */
  function openCompleteDialog() {
    if (!getBookingChargesAction) {
      setChargesTotal(0)
      setCompleteDialogOpen(true)
      return
    }
    startTransition(async () => {
      const res = await getBookingChargesAction(booking.id)
      setChargesTotal(res.ok ? res.chargesTotal : 0)
      setCompleteDialogOpen(true)
    })
  }

  // Preview del destino de la seña según el motivo. Con `startsAt` +
  // `cancellationPolicyHours` a mano (cluster F bug 2) calculamos el mismo
  // `inPolicy` que BookingActions.tsx para ESTA reserva puntual; sin esos
  // datos (callers/stories/tests viejas) cae al mensaje genérico previo.
  const bookingStartUtcMs = booking.startsAt ? new Date(booking.startsAt).getTime() : null
  const inPolicy =
    bookingStartUtcMs !== null && Number.isFinite(bookingStartUtcMs) && cancellationPolicyHours !== undefined
      ? Date.now() < bookingStartUtcMs - cancellationPolicyHours * 3_600_000
      : null

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
    } else if (inPolicy === null) {
      refundWarning = `Se aplica la política de cancelación: reembolso de ${formatArs(booking.depositAmount)} si está dentro del plazo, retención si no.`
    } else if (inPolicy) {
      refundWarning =
        booking.paymentMethod === 'mercadopago'
          ? `Se reembolsará la seña de ${formatArs(booking.depositAmount)} vía MercadoPago.`
          : `Coordiná el reembolso de ${formatArs(booking.depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
    } else {
      refundWarning = `Fuera del plazo de cancelación (${cancellationPolicyHours}h): la seña de ${formatArs(booking.depositAmount)} queda para el complejo (sin reembolso).`
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
            onClick={openConfirmDeposit}
            className={cn(inlineBtn, 'bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            Confirmar pago
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={openCompleteDialog}
              className={cn(inlineBtn, 'border border-border bg-card text-foreground hover:bg-accent')}
            >
              Completada
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setNoShowOpen(true)}
              className={cn(inlineBtn, 'border border-border bg-card text-foreground hover:bg-accent')}
            >
              Ausente
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
              <DropdownMenuItem onSelect={openConfirmDeposit}>
                Confirmar pago
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={openCompleteDialog}
                >
                  Marcar completada
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNoShowOpen(true)}>
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
        open={confirmDepositOpen}
        onOpenChange={setConfirmDepositOpen}
        title="Confirmar pago"
        description={`${label}. Indicá cómo se cobró la seña.`}
        confirmLabel="Confirmar"
        cancelLabel="Volver"
        onConfirm={onConfirmDeposit}
      >
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground">¿Cómo se cobró la seña?</legend>
          <RadioChipGroup
            value={depositMethod}
            onValueChange={(v) => setDepositMethod(v as DepositMethod)}
          >
            {(['cash', 'transfer', 'other'] as const).map((m) => (
              <RadioChip key={m} value={m}>
                {DEPOSIT_METHOD_LABELS[m]}
              </RadioChip>
            ))}
          </RadioChipGroup>
        </fieldset>
      </ConfirmDialog>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description={`${label}. Se registrará que el jugador no se presentó.`}
        consequences={NO_SHOW_CONSEQUENCES}
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />

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
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
            <RadioChipGroup
              // '' (nunca undefined): RadioGroup debe ser controlado desde el
              // primer render — pasar undefined al no haber selección todavía
              // lo arranca "uncontrolled" y React tira warning al pasar a
              // 'complejo'/'jugador'. '' no matchea ningún <RadioChip value>,
              // así que el efecto visual (nada seleccionado) es el mismo.
              value={cancelType ?? ''}
              onValueChange={(v) => setCancelType(v as 'complejo' | 'jugador')}
            >
              <RadioChip value="complejo" description="Rotura, mantenimiento o error. Reembolso automático.">
                El complejo necesita cancelar
              </RadioChip>
              <RadioChip value="jugador" description="Se aplica la política de cancelación del complejo.">
                El jugador pidió cancelar
              </RadioChip>
            </RadioChipGroup>
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

      {completeDialogOpen && (
        <CompleteBookingDialog
          booking={{
            id: booking.id,
            priceSnapshot: booking.priceSnapshot,
            depositAmount: booking.depositAmount,
            depositStatus: booking.depositStatus,
            paymentMethod: booking.paymentMethod,
            guestName: booking.guestName,
            guestPhone: booking.guestPhone,
            playerName: booking.playerName,
            playerPhone: booking.playerPhone,
            chargesTotal,
          }}
          label={label}
          onClose={() => setCompleteDialogOpen(false)}
          completeAndChargeAction={completeAndChargeBookingAction}
        />
      )}
    </>
  )
}
