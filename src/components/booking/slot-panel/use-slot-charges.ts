'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { newChargeLine, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import type { MethodKey } from '@/lib/payment-method'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { chargeMode } from './charge-copy'
import type { ChargeInput, SlotPanelActions } from './actions'
import type { ActionResult } from '@/shared/types/action-result'

/** Un cobro que salió y cuya respuesta no llegó: no se sabe si entró. */
type UnconfirmedCharge = { key: string; charges: ChargeInput[]; total: number }

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
  /**
   * R3 de la revisión del PR #326: la key sobrevive a un corte de red a
   * propósito (si el cobro entró, un reintento con key nueva lo cobraría dos
   * veces). Pero mientras sobrevive, cualquier OTRO cobro con el mismo monto y
   * método —el segundo "Pagó uno", el Equipo 2— viaja con ella y el servidor
   * lo toma por reintento del primero: aviso verde y plata que no entra. El
   * servidor no puede distinguirlo, así que se resuelve acá: después de un
   * corte, lo único que se puede mandar es ESE mismo cobro. Atado a la key: si
   * la key rota (cambio de turno), deja de valer solo.
   */
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedCharge | null>(null)
  const retryCharge = unconfirmed?.key === idempotencyKey ? unconfirmed : null

  const mode = booking ? chargeMode(booking, hasEnded) : null
  const pending = booking?.pending ?? 0

  /**
   * Corre la mutación real (misma Server Action, mismo guard, mismo toast y
   * manejo de error en los tres modos) a partir de un array de cargos ya
   * validado. La usan `submitCharge` (con `lines`) y `submitPartialCharge`
   * (con el cargo armado en el momento, sin depender de `lines` porque
   * `setState` es async y todavía no se actualizó en el mismo click).
   */
  function runCharge(charges: ChargeInput[], total: number) {
    if (!booking || !actions || !mode) return
    const bookingId = booking.id
    const key = idempotencyKey
    startTransition(async () => {
      try {
        const res =
          mode === 'settle'
            ? await actions.chargeDebtAction({
                bookingId,
                charges,
                clientIdempotencyKey: key,
              })
            : mode === 'finish'
              ? await actions.completeAndChargeBookingAction({
                  bookingId,
                  charges,
                  clientIdempotencyKey: key,
                })
              : await actions.addBookingChargeAction({
                  bookingId,
                  charges,
                  clientIdempotencyKey: key,
                })
        setUnconfirmed(null)
        if (!res.success) {
          // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
          // render antes de que `pending` bajara, con los controles todavía deshabilitados.
          startTransition(() => {
            setError(('error' in res && res.error) || 'No se pudo registrar el cobro.')
            // El servidor contestó, así que este intento no dejó nada escrito bajo
            // la key: se rota para que el próximo cobro no la herede.
            setIdempotencyKey(crypto.randomUUID())
          })
          return
        }
        toast({ title: `Cobro registrado — ${formatArs(total)}`, variant: 'success' })
        resetLastId()
        notifyMutated()
      } catch (err) {
        Sentry.captureException(err)
        // El aviso lo dibuja SlotChargeSection junto al botón de reintentar.
        startTransition(() => {
          setError(null)
          setUnconfirmed({ key, charges, total })
        })
      }
    })
  }

  /**
   * Valida `lines` y cobra. Único caller manual de la mutación: el "Cobrar
   * todo en efectivo" de un toque se fue con D3 — ahora `lines[0]` SIEMPRE
   * arranca precargada con el pendiente, así que el botón de siempre ya manda
   * el monto completo salvo que el admin lo haya editado.
   */
  function submitCharge() {
    if (!booking || !actions || !mode || retryCharge) return
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
    runCharge(charges, total)
  }

  /**
   * Cobra una PARTE de lo pendiente: la mitad (un equipo) o lo de un jugador.
   *
   * Mismo camino que `submitCharge` — misma Server Action, mismo guard,
   * mismo toast: lo único que cambia es el monto. El resto queda como saldo del
   * turno y aparece en Deudas hasta que lo paguen, que es exactamente el
   * control que pidió el mostrador.
   *
   * Tope defensivo contra lo pendiente: el backend ya lo valida y devolvería el
   * error, pero cobrar de más nunca puede depender de que el cliente calcule
   * bien. Con el turno casi saldado, "Pagó uno" cobra lo que queda y no más.
   */
  function submitPartialCharge(amountCents: number, method: MethodKey) {
    if (!booking || !mode || pending <= 0 || retryCharge) return
    const amount = Math.min(amountCents, pending)
    if (amount <= 0) return
    setError(null)
    setLines([newChargeLine(amount, method)])
    runCharge([{ amount, method }], amount)
  }

  /**
   * Cobra las líneas de UN equipo del pago dividido (el "Cobrar" de su
   * bloque), sin tocar `lines`.
   *
   * Recibe N líneas y no una sola porque un equipo puede juntar la plata con
   * más de un medio (mitad efectivo, mitad transferencia): las manda en UN
   * solo llamado, que es lo que hace la Server Action atómica desde #326 —
   * dos llamados serían dos movimientos de caja que pueden quedar a medias.
   *
   * Por qué no reusa `submitPartialCharge`: ese reemplaza las líneas por una
   * sola, y si el cobro falla (red, caja cerrada) el admin se queda sin las
   * filas del otro equipo y con los montos que había corregido pisados. Acá
   * las filas sobreviven al error; si el cobro sale bien, el refresco del
   * turno las resincroniza solo.
   */
  function submitTeamCharge(teamLines: ChargeLine[]) {
    if (!booking || !mode || retryCharge) return
    setError(null)
    const charges: ChargeInput[] = []
    for (const l of teamLines) {
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
      setError(`El cobro (${formatArs(total)}) supera lo pendiente (${formatArs(pending)}).`)
      return
    }
    runCharge(charges, total)
  }

  /** Reenvía el cobro que quedó sin confirmar: mismas líneas, misma key. */
  function retryUnconfirmedCharge() {
    if (!retryCharge) return
    setError(null)
    runCharge(retryCharge.charges, retryCharge.total)
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
                // El panel pudo haberse cerrado: el fallo se avisa en otro toast,
                // no en el `error` del hook, que nadie estaría mirando.
                void revert(bookingId)
                  .then((r) => {
                    if (!r.success) {
                      toast({
                        title: r.error ?? 'No se pudo deshacer la ausencia.',
                        variant: 'destructive',
                      })
                      return
                    }
                    toast({ title: 'Ausencia deshecha', variant: 'success' })
                    notifyMutated()
                  })
                  .catch((err: unknown) => {
                    Sentry.captureException(err)
                    toast({ title: 'No se pudo deshacer la ausencia.', variant: 'destructive' })
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
    setError(null)
    startTransition(async () => {
      const res = await revert(bookingId)
      // React 19: un set* después del await queda fuera de la transición y se
      // pinta con isPending todavía en true. Se re-envuelve.
      startTransition(() => {
        if (!res.success) {
          setError(res.error ?? 'No se pudo deshacer la ausencia.')
          return
        }
        toast({ title: 'Ausencia deshecha', variant: 'success' })
        resetLastId()
        notifyMutated()
      })
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
    submitPartialCharge,
    submitTeamCharge,
    retryTotal: retryCharge?.total ?? null,
    retryUnconfirmedCharge,
    confirmNoShow,
    revertNoShow,
  }
}
