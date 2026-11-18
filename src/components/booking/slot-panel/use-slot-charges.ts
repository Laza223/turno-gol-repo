'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { newChargeLine, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import type { MethodKey } from '@/lib/payment-method'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingConsumo } from '@/modules/canteen/canteen.types'
import { chargeMode } from './charge-copy'
import type { ChargeInput, SlotPanelActions } from './actions'
import type { ActionResult } from '@/shared/types/action-result'

/** Medios con los que un consumo se puede cobrar (la cantina no admite "Otro"). */
type ConsumoMethod = 'cash' | 'transfer' | 'mercadopago'

/**
 * Un consumo anotado que se cobra junto con el turno: su clave de idempotencia va
 * adentro para que el reintento tras un corte de red repita EXACTO el mismo envío.
 */
type ConsumoLeg = { tabId: string; total: number; key: string; method: ConsumoMethod }

/** Un cobro que salió y cuya respuesta no llegó: no se sabe si entró. */
type UnconfirmedCharge = {
  key: string
  charges: ChargeInput[]
  total: number
  /** Los consumos que viajaban con ese cobro (vacío en la enorme mayoría). */
  legs: ConsumoLeg[]
}

const NO_CONSUMOS: BookingConsumo[] = []

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
  withConsumos = false,
}: {
  booking: GridBooking | null
  hasEnded: boolean
  actions: SlotPanelActions | undefined
  notifyMutated: () => void
  resetLastId: () => void
  /**
   * Solo el modal de cobro de Hoy suma los consumos anotados al cobro de "Todo junto".
   * Los demás (la tarjeta de "Cobrar varios", el cobro de /reservas/[id]) comparten
   * este hook pero no los muestran: sin esta marca cada tarjeta leería los consumos
   * del servidor para nada.
   */
  withConsumos?: boolean
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

  // ── Consumos anotados al turno (migr. 115, docs/decisions/2026-11-17-consumos-
  // anotados-al-turno.md). Se cobran JUNTO con el turno, pero son otro circuito de
  // plata (cantina, no `category='booking'`): primero se saldan los anotados con
  // `settleTab` y después corre la acción de cobro del turno de siempre, sin
  // tocarla. Cada pata es idempotente y verdadera por sí sola, así que si la
  // segunda falla el consumo queda cobrado y el turno sigue por cobrar.
  const consumosEnabled =
    withConsumos &&
    Boolean(
      actions?.listBookingConsumosAction && actions.settleTabAction && actions.cancelTabAction,
    )
  const listConsumos = consumosEnabled ? actions?.listBookingConsumosAction : undefined
  const bookingId = booking?.id ?? null
  const canCharge = mode !== null
  const [consumosState, setConsumosState] = useState<{
    bookingId: string
    items: BookingConsumo[]
  } | null>(null)
  // El turno cuya primera lectura falló: sin esto un fallo (límite de pedidos, red) se
  // veía igual que "no hay anotados" y se cobraba solo la cancha sin avisar.
  const [consumosFailedFor, setConsumosFailedFor] = useState<string | null>(null)
  const [consumosTick, setConsumosTick] = useState(0)
  // El turno para el que se destildó "Cobrar con el turno": otro turno arranca tildado.
  const [leftOutFor, setLeftOutFor] = useState<string | null>(null)
  const includeConsumos = leftOutFor !== bookingId
  // Una clave por anotado, estable hasta que se sepa cómo terminó el cobro.
  const consumoKeys = useRef(new Map<string, string>())
  const consumos =
    consumosState && consumosState.bookingId === bookingId ? consumosState.items : NO_CONSUMOS

  // Hasta que llega la primera lectura de ESTE turno no se sabe si hay anotados: el botón de
  // cobrar espera, para no cobrar solo la cancha con las birras todavía en camino.
  const consumosLoaded = consumosState?.bookingId === bookingId
  const consumosAwaited = consumosEnabled && canCharge && bookingId !== null
  const consumosFailed = consumosAwaited && !consumosLoaded && consumosFailedFor === bookingId
  const consumosLoading = consumosAwaited && !consumosLoaded && consumosFailedFor !== bookingId

  useEffect(() => {
    if (!bookingId || !listConsumos || !canCharge) return
    let alive = true
    listConsumos({ bookingId })
      .then((res) => {
        if (!alive) return
        if (res.success) {
          setConsumosState({ bookingId, items: res.consumos })
          setConsumosFailedFor(null)
        } else {
          setConsumosFailedFor(bookingId)
        }
      })
      .catch((err: unknown) => {
        Sentry.captureException(err)
        if (alive) setConsumosFailedFor(bookingId)
      })
    return () => {
      alive = false
    }
  }, [bookingId, listConsumos, canCharge, consumosTick])

  function reloadConsumos() {
    setConsumosFailedFor(null)
    setConsumosTick((t) => t + 1)
  }

  function keyForConsumo(tabId: string): string {
    let key = consumoKeys.current.get(tabId)
    if (!key) {
      key = crypto.randomUUID()
      consumoKeys.current.set(tabId, key)
    }
    return key
  }

  /**
   * Corre la mutación real (misma Server Action, mismo guard, mismo toast y
   * manejo de error en los tres modos) a partir de un array de cargos ya
   * validado. La usan `submitCharge` (con `lines`) y `submitPartialCharge`
   * (con el cargo armado en el momento, sin depender de `lines` porque
   * `setState` es async y todavía no se actualizó en el mismo click).
   */
  function runCharge(charges: ChargeInput[], total: number, legs: ConsumoLeg[] = []) {
    const settleConsumo = actions?.settleTabAction
    if (!booking || !actions || !mode) return
    if (legs.length > 0 && !settleConsumo) return
    const bookingId = booking.id
    const key = idempotencyKey
    const legsTotal = legs.reduce((sum, l) => sum + l.total, 0)
    startTransition(async () => {
      try {
        // 1. Los consumos anotados, antes que el turno. Si uno falla, el turno todavía
        // no se tocó: nada quedó a medias salvo los anotados que ya se saldaron.
        let settledCents = 0
        for (const leg of legs) {
          const legRes = await settleConsumo!({
            tabId: leg.tabId,
            charges: [{ amount: leg.total, method: leg.method }],
            clientIdempotencyKey: leg.key,
          })
          if (!legRes.success) {
            startTransition(() => {
              setUnconfirmed(null)
              setError(
                settledCents > 0
                  ? `Ya se cobró parte de lo anotado (${formatArs(settledCents)}). ${legRes.error}`
                  : legRes.error,
              )
              // El servidor contestó: este envío no dejó nada bajo esa clave.
              consumoKeys.current.delete(leg.tabId)
              reloadConsumos()
            })
            return
          }
          settledCents += leg.total
          consumoKeys.current.delete(leg.tabId)
        }

        // 2. El turno, por la acción de siempre.
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
            const reason = ('error' in res && res.error) || 'No se pudo registrar el cobro.'
            setError(
              legsTotal > 0
                ? `Lo anotado ya quedó cobrado (${formatArs(legsTotal)}). Falta cobrar el turno: ${reason}`
                : reason,
            )
            // El servidor contestó, así que este intento no dejó nada escrito bajo
            // la key: se rota para que el próximo cobro no la herede.
            setIdempotencyKey(crypto.randomUUID())
            if (legsTotal > 0) reloadConsumos()
          })
          return
        }
        toast({ title: `Cobro registrado — ${formatArs(total + legsTotal)}`, variant: 'success' })
        // Lo anotado ya está cobrado: no puede quedar en pantalla hasta la próxima lectura.
        if (legsTotal > 0) setConsumosState({ bookingId, items: [] })
        resetLastId()
        notifyMutated()
      } catch (err) {
        Sentry.captureException(err)
        // El aviso lo dibuja SlotChargeSection junto al botón de reintentar.
        startTransition(() => {
          setError(null)
          setUnconfirmed({ key, charges, total, legs })
        })
      }
    })
  }

  /**
   * Los consumos anotados que viajan con un cobro de "Todo junto", o `null` (con el
   * error ya puesto) si no se pueden cobrar así. Un solo medio de pago para todo, y
   * no "Otro": `settleTab` no lo admite, y partir el medio entre la cancha y la
   * cantina sería inventar a cuál de los dos le toca cada línea. Con el pago ya
   * dividido en varios medios los consumos no viajan (el modal lo muestra con la
   * casilla destildada) y quedan anotados para después.
   */
  function consumoLegsFor(charges: ChargeInput[]): ConsumoLeg[] | null {
    if (!consumosEnabled || !includeConsumos || consumos.length === 0) return []
    const first = charges[0]
    if (charges.length !== 1 || !first) return []
    const method = first.method
    if (method === 'other') {
      setError(
        'Los consumos no se cobran con "Otro". Elegí efectivo, transferencia o MercadoPago, o destildá "Cobrar con el turno".',
      )
      return null
    }
    return consumos.map((c) => ({
      tabId: c.tabId,
      total: c.totalAmount,
      key: keyForConsumo(c.tabId),
      method,
    }))
  }

  /** Quita un consumo anotado por error: devuelve el stock (`cancelTab`). */
  function removeConsumo(tabId: string) {
    const cancelConsumo = actions?.cancelTabAction
    if (!cancelConsumo || retryCharge) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await cancelConsumo({ tabId, reason: 'Se quitó del turno al cobrar' })
        startTransition(() => {
          if (!res.success) {
            setError(res.error)
            return
          }
          toast({ title: 'Consumo quitado del turno', variant: 'success' })
          consumoKeys.current.delete(tabId)
          reloadConsumos()
        })
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() => setError('No se pudo quitar. Revisá tu conexión y probá de nuevo.'))
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
    // "Todo junto" es el único cobro que trae los consumos anotados (el equipo y el
    // jugador cobran solo cancha).
    const legs = consumoLegsFor(charges)
    if (legs === null) return
    runCharge(charges, total, legs)
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
  function submitPartialCharge(amountCents: number, method: MethodKey, team?: 1 | 2) {
    if (!booking || !mode || pending <= 0 || retryCharge) return
    const amount = Math.min(amountCents, pending)
    if (amount <= 0) return
    setError(null)
    setLines([newChargeLine(amount, method, team)])
    runCharge([{ amount, method, team }], amount)
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
  function submitTeamCharge(teamLines: ChargeLine[], team?: 1 | 2) {
    if (!booking || !mode || retryCharge) return
    setError(null)
    const charges: ChargeInput[] = []
    for (const l of teamLines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      charges.push({ amount: l.amountCents, method: l.method, team: team ?? l.team })
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
    runCharge(retryCharge.charges, retryCharge.total, retryCharge.legs)
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
    retryTotal: retryCharge
      ? retryCharge.total + retryCharge.legs.reduce((s, l) => s + l.total, 0)
      : null,
    retryUnconfirmedCharge,
    consumosEnabled,
    consumosLoading,
    consumosFailed,
    consumos,
    includeConsumos,
    setIncludeConsumos: (include: boolean) => setLeftOutFor(include ? null : bookingId),
    removeConsumo,
    reloadConsumos,
    confirmNoShow,
    revertNoShow,
  }
}
