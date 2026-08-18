'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { chargeMode } from './charge-copy'
import type { ChargeInput, SlotPanelActions } from './actions'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * Estado y handlers de "cobrar" del panel del turno: las líneas de pago, el
 * idempotency key, el error y las tres mutaciones (cobrar, marcar ausente,
 * deshacerlo). Extraído de `BookingSlotPanel` para bajarlo de tamaño.
 *
 * `resetLastId` llega inyectada porque el reset por cambio de turno vive en
 * el orquestador (toca también `noShowOpen`/`canteenOpen`/`rescheduleOpen`,
 * que este hook no conoce) — acá sólo se dispara el MISMO `setLastId(null)`
 * que antes vivía inline al final de cada mutación exitosa, para forzar un
 * estado limpio en el próximo render aunque `booking.id` no haya cambiado.
 */
export function useSlotCharges({
  booking,
  hasEnded,
  actions,
  notifyMutated,
  resetLastId,
}: {
  booking: GridBooking | null
  hasEnded: boolean
  actions: SlotPanelActions | undefined
  notifyMutated: () => void
  resetLastId: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChargeLine[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const mode = booking ? chargeMode(booking, hasEnded) : null
  const pending = booking?.pending ?? 0

  function submitCharge() {
    if (!booking || !actions || !mode) return
    setError(null)

    const charges: ChargeInput[] = []
    for (const l of lines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      charges.push({ amount: l.amountCents, method: l.method })
    }
    if (charges.length === 0) {
      setError('Ingresá al menos una línea de cobro.')
      return
    }
    const total = charges.reduce((s, c) => s + c.amount, 0)
    if (total > pending) {
      setError(`El cobro total (${formatArs(total)}) supera lo pendiente (${formatArs(pending)}).`)
      return
    }

    const bookingId = booking.id
    startTransition(async () => {
      try {
        const res =
          mode === 'settle'
            ? await actions.chargeDebtAction({
                bookingId,
                charges,
                clientIdempotencyKey: idempotencyKey,
              })
            : mode === 'finish'
              ? await actions.completeAndChargeBookingAction({
                  bookingId,
                  charges,
                  clientIdempotencyKey: idempotencyKey,
                })
              : await actions.addBookingChargeAction({
                  bookingId,
                  amount: charges[0]!.amount,
                  method: charges[0]!.method,
                  clientIdempotencyKey: idempotencyKey,
                })
        if (!res.success) {
          setError(('error' in res && res.error) || 'No se pudo registrar el cobro.')
          return
        }
        toast({ title: `Cobro registrado — ${formatArs(total)}`, variant: 'success' })
        resetLastId()
        notifyMutated()
      } catch (err) {
        Sentry.captureException(err)
        setError('No se pudo registrar el cobro. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  async function confirmNoShow(): Promise<ActionResult> {
    if (!booking || !actions) return { success: false, error: 'Sin acciones disponibles.' }
    const bookingId = booking.id
    const res = await actions.markNoShowAction(bookingId)
    if (!res.success) return { success: false, error: res.error }
    const revert = actions.revertNoShowAction
    toast({
      title: 'Ausencia registrada',
      variant: 'success',
      ...(revert
        ? {
            action: {
              label: 'Deshacer',
              onClick: () => {
                void revert(bookingId).then((r) => {
                  if (r.success) {
                    toast({ title: 'Ausencia deshecha', variant: 'success' })
                    notifyMutated()
                  }
                })
              },
            },
          }
        : {}),
    })
    resetLastId()
    notifyMutated()
    return { success: true }
  }

  function revertNoShow() {
    if (!booking || !actions?.revertNoShowAction) return
    const bookingId = booking.id
    const revert = actions.revertNoShowAction
    startTransition(async () => {
      const res = await revert(bookingId)
      if (!res.success) {
        setError(res.error ?? 'No se pudo deshacer la ausencia.')
        return
      }
      toast({ title: 'Ausencia deshecha', variant: 'success' })
      resetLastId()
      notifyMutated()
    })
  }

  return {
    isPending,
    error,
    setError,
    lines,
    setLines,
    idempotencyKey,
    setIdempotencyKey,
    mode,
    pending,
    submitCharge,
    confirmNoShow,
    revertNoShow,
  }
}
