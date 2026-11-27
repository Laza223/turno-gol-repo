'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CalendarCheck2, CheckCheck, CheckCircle2, Undo2 } from 'lucide-react'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { AbonadoSettlementTarget } from '@/app/(admin)/abonados/AbonadoSettlementDialog'
import { newChargeLine } from '@/components/admin/SplitPaymentFields'
import { useSlotCharges } from '@/components/booking/slot-panel/use-slot-charges'
import { HoyChargeSection } from '@/components/booking/slot-panel/HoyChargeSection'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { hasEndedAt } from '@/lib/dashboard/today-board'
import { useNowMs } from '@/hooks/use-now'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { resolveDepositDisplayStatus, type RefundState } from '../deposit-display'
import type { BookingChargeRow } from '../queries'

const AbonadoSettlementDialog = dynamic(
  () =>
    import('@/app/(admin)/abonados/AbonadoSettlementDialog').then((m) => m.AbonadoSettlementDialog),
  { ssr: false },
)

/**
 * Las cuatro acciones de plata que puede disparar el control de cobro
 * compartido (`useSlotCharges`, `chargeMode`): `markNoShowAction` es
 * obligatoria en `SlotPanelActions` pero acá nunca se usa — "Marcar ausente"
 * vive en `BookingActions.tsx`, no en este bloque — así que llega igual desde
 * la page (mismo import que ya usa `BookingActions`) solo para que el tipo
 * cierre.
 */
type ChargeActions = Pick<
  SlotPanelActions,
  | 'chargeDebtAction'
  | 'completeAndChargeBookingAction'
  | 'addBookingChargeAction'
  | 'markNoShowAction'
> &
  Partial<
    Pick<
      SlotPanelActions,
      | 'settleBookingsBatchAction'
      | 'voidSettlementAction'
      | 'settleAbonadoPeriodAction'
      | 'getAbonadoBillingOverviewAction'
    >
  >

type Props = {
  booking: GridBooking
  /** Ver `deposit-display.ts`: `depositStatus` se congela al cancelar, así que `payments` manda. */
  refundState?: RefundState
  charges: BookingChargeRow[]
  chargesTotal: number
  actions: ChargeActions
  /** Mes (AAAA-MM) desde el que ofrece "Saldar mes"; sin esto, el mes del turno. */
  defaultYearMonth?: string
}

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  // La plata todavía no se movió: el complejo la debe. Ver `deposit-display.ts`.
  refund_pending: 'a devolver',
  refunded: 'devuelta',
  not_required: 'no requerida',
}

/**
 * 2026-09-24: arma el cobro con el MISMO control que Hoy y la Grilla
 * (`HoyChargeSection` + `useSlotCharges`) — antes tenía su propio form con
 * `SplitPaymentFields` a mano y siempre cobraba por `addBookingChargeAction`,
 * sin importar si el turno ya había terminado. Ahora `chargeMode` decide como
 * en cualquier otra pantalla: adelanto, cobrar-y-dar-por-jugado, o saldo de un
 * turno ya jugado (`caja/deudas`).
 */
export default function BookingCharges({
  booking,
  refundState,
  charges,
  chargesTotal,
  actions,
  defaultYearMonth,
}: Props) {
  const router = useRouter()
  const nowMs = useNowMs()
  const [open, setOpen] = useState(false)
  const [alreadySettledOpen, setAlreadySettledOpen] = useState(false)
  const [undoSettlementOpen, setUndoSettlementOpen] = useState(false)
  const [abonadoTarget, setAbonadoTarget] = useState<AbonadoSettlementTarget | null>(null)
  const [settlementKey, setSettlementKey] = useState(() => crypto.randomUUID())
  const [loadingAbonado, startLoadingAbonado] = useTransition()
  // `resetLastId` corre DENTRO de la transición del hook (después de un cobro
  // resuelto), así que no puede tocar el `setIdempotencyKey` de ESTE render
  // directamente. Se marca acá y se resuelve en el cuerpo del render (mismo
  // patrón "derived state" que `HoyChargeModal`, sin `useEffect`): sin esto,
  // el próximo cobro reusaría la key del anterior y el backend lo rechazaría
  // por "ya se había registrado" (`resolveIdempotentCharges`).
  const [needsKeyReset, setNeedsKeyReset] = useState(false)
  const hasEnded =
    typeof booking.endsAtMs === 'number' ? hasEndedAt({ endsAtMs: booking.endsAtMs }, nowMs) : false

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
  } = useSlotCharges({
    booking,
    hasEnded,
    actions,
    notifyMutated: () => router.refresh(),
    // Cierra el form (lo que hacía este componente al final de cada cobro
    // exitoso) y pide la rotación de la key para el próximo cobro.
    resetLastId: () => {
      setOpen(false)
      setNeedsKeyReset(true)
    },
  })

  if (needsKeyReset) {
    setNeedsKeyReset(false)
    setIdempotencyKey(crypto.randomUUID())
  }

  const {
    depositCounted,
    totalPaid,
    pending: pendingAmount,
  } = useMemo(
    () =>
      summarizeBookingCharges({
        priceSnapshot: booking.priceSnapshot,
        depositAmount: booking.depositAmount ?? 0,
        depositStatus: booking.depositStatus ?? 'not_required',
        chargesTotal,
        writtenOff: booking.writtenOff ?? 0,
        settlementId: booking.settlementId,
      }),
    [
      booking.priceSnapshot,
      booking.depositAmount,
      booking.depositStatus,
      booking.writtenOff,
      booking.settlementId,
      chargesTotal,
    ],
  )
  const isSettled = Boolean(booking.settlementId)
  const isUnsettledMonthly = booking.abonadoBillingMode === 'monthly' && !booking.settlementId
  const canManageAbonado = Boolean(
    booking.abonadoId &&
    actions.settleAbonadoPeriodAction &&
    actions.getAbonadoBillingOverviewAction,
  )
  const canMarkAlreadySettled = Boolean(
    !booking.settlementId &&
    (booking.status === 'confirmed' || booking.status === 'completed') &&
    booking.type !== 'block' &&
    booking.type !== 'tournament' &&
    (booking.writtenOff ?? 0) === 0 &&
    (mode !== null || isUnsettledMonthly || pendingAmount > 0) &&
    actions.settleBookingsBatchAction,
  )
  const canUndoSettlement = Boolean(
    booking.settlementId &&
    booking.settlementOrigin === 'already_settled' &&
    actions.voidSettlementAction,
  )

  function openAbonadoManager() {
    if (!booking.abonadoId || !actions.getAbonadoBillingOverviewAction) return
    setError(null)
    startLoadingAbonado(async () => {
      const res = await actions.getAbonadoBillingOverviewAction!(booking.abonadoId!)
      if (!res.success) {
        startLoadingAbonado(() => setError(res.error))
        return
      }
      setAbonadoTarget({
        abonadoId: res.overview.abonadoId,
        contactName: res.overview.contactName,
        pricePerSession: res.overview.pricePerSession,
        billingMode: res.overview.billingMode,
        agreedAmount: res.overview.agreedAmount,
        coveredMonths: res.overview.coverage.coveredMonths,
        remainingPackSessions: res.overview.coverage.remainingPackSessions,
      })
    })
  }
  // Dado por perdido (2026-11-07): saldo 0 pero no se pagó entero.
  const balance = balanceLabel(
    pendingAmount,
    booking.writtenOff ?? 0,
    isSettled,
    isUnsettledMonthly,
  )
  // Solo la ETIQUETA. `summarizeBookingCharges` de arriba sigue recibiendo el
  // `depositStatus` crudo: los totales son plata, no texto.
  const depositDisplayStatus = resolveDepositDisplayStatus(
    booking.depositStatus ?? 'not_required',
    refundState,
  )

  function openForm() {
    setError(null)
    // Precargado con lo que falta, en efectivo: se corrige para abajo, no se
    // escribe de cero (mismo criterio que el panel del turno en la grilla).
    // La idempotencyKey NO se toca acá: si queda un cobro sin confirmar
    // (`retryTotal`), tiene que sobrevivir a un cierre y reapertura del form —
    // la rota `resetLastId` recién cuando el cobro se resuelve.
    setLines([newChargeLine(pending > 0 ? pending : null, 'cash')])
    setOpen(true)
  }

  return (
    // Sin recuadro: la página ya separa este bloque de la ficha por columna (en
    // escritorio) o por espacio (en el teléfono). La caja con borde y sombra
    // era la que "hacía bordes a los costados" (pedido del dueño, 2026-09-17).
    <section aria-labelledby="cobros-de-turno">
      <h2 id="cobros-de-turno" className="text-sm font-semibold text-foreground">
        Cobros de turno
      </h2>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Precio del turno</dt>
          <dd className="font-semibold text-foreground">{formatArs(booking.priceSnapshot)}</dd>
        </div>
        {(booking.depositAmount ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Seña{' '}
              {depositCounted > 0 ? (
                <span className="text-emerald-800 dark:text-emerald-400">✓ pagada</span>
              ) : (
                <span className="text-muted-foreground">
                  ({DEPOSIT_STATUS_LABELS[depositDisplayStatus] ?? depositDisplayStatus})
                </span>
              )}
            </dt>
            <dd className="text-foreground">{formatArs(booking.depositAmount ?? 0)}</dd>
          </div>
        )}
        {charges.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              {/* Cobro por equipo: cuando el turno se cobró en DOS veces, cada
                  fila dice de qué equipo salió. Con una sola, o con tres o más,
                  el rótulo mentiría — ahí vuelve a decir "Cobro" a secas. */}
              {charges.length === 2 ? `Equipo ${i + 1}` : 'Cobro'} ·{' '}
              {(METHOD_LABELS as Record<string, string>)[c.method] ?? c.method}
              {c.description && c.description !== 'Cobro de turno' ? ` · ${c.description}` : ''}
            </dt>
            <dd className="text-foreground">{formatArs(c.amount)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="font-medium text-foreground">Pagado</dt>
          <dd className="font-semibold text-foreground">{formatArs(totalPaid)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium text-foreground">Saldo pendiente</dt>
          <dd className={`text-lg font-semibold tabular-nums ${balance.className}`}>
            {balance.text}
          </dd>
        </div>
      </dl>

      {isSettled && (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
        >
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
          {booking.settlementOrigin === 'already_settled'
            ? 'Ya estaba saldado (no suma a Caja)'
            : booking.settlementKind === 'monthly'
              ? 'Saldado con el mes'
              : booking.settlementKind === 'pack'
                ? 'Saldado con el pack de turnos'
                : 'Cobrado junto con otros turnos'}
        </p>
      )}

      {isUnsettledMonthly && (
        <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Este turno fijo se cobra por mes, no por turno.
        </p>
      )}

      {open && mode ? (
        // 2026-09-24: el mismo control de cobro que Hoy, la Grilla y Caja
        // (pestañas Todo junto / Por equipo / Por jugador). Antes este era el
        // último lugar con un form propio y una sola forma de cobrar.
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <HoyChargeSection
            booking={booking}
            mode={mode}
            // Esta página no trae la capacidad de la cancha (`getBookingDetail`
            // solo pide `courtName`): "Por jugador" no se ofrece sin inventar un
            // monto, mismo criterio que cuando la Grilla no la conoce.
            capacity={undefined}
            lines={lines}
            onLinesChange={(next) => {
              setError(null)
              setLines(next)
            }}
            error={error}
            isPending={isPending}
            locked={isPending}
            onSubmit={submitCharge}
            onPartialCharge={submitPartialCharge}
            onTeamCharge={submitTeamCharge}
            retryTotal={retryTotal}
            onRetry={retryUnconfirmedCharge}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => setOpen(false)}
            className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openForm}
            disabled={!mode}
            title={
              !mode
                ? isUnsettledMonthly
                  ? 'Este turno fijo se salda por mes.'
                  : 'Este turno ya está pagado por completo.'
                : undefined
            }
            // H078: este es el CTA que cobra la plata que se debe — es el
            // primario (sólido) de la vista, no "Marcar completada" (estado del
            // sistema). BONUS-62 / regla del dueño §8.4.
            className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Agregar cobro
          </button>

          {canManageAbonado && (
            <button
              type="button"
              disabled={isPending || loadingAbonado}
              onClick={openAbonadoManager}
              className={SECONDARY_ACTION}
            >
              <CalendarCheck2 aria-hidden className="h-4 w-4" />
              Gestionar mes / pack
            </button>
          )}

          {canMarkAlreadySettled && (
            <button
              type="button"
              disabled={isPending || loadingAbonado}
              onClick={() => setAlreadySettledOpen(true)}
              className={SECONDARY_ACTION}
            >
              <CheckCheck aria-hidden className="h-4 w-4" />
              Marcar como saldado
            </button>
          )}

          {canUndoSettlement && (
            <button
              type="button"
              disabled={isPending || loadingAbonado}
              onClick={() => setUndoSettlementOpen(true)}
              className={SECONDARY_ACTION}
            >
              <Undo2 aria-hidden className="h-4 w-4" />
              Deshacer saldado
            </button>
          )}
        </div>
      )}

      {!open && error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {actions.settleBookingsBatchAction && (
        <ConfirmDialog
          open={alreadySettledOpen}
          onOpenChange={setAlreadySettledOpen}
          title="Marcar turno como saldado"
          description="El turno queda en $ 0 por cobrar."
          confirmLabel="Sí, marcar saldado"
          cancelLabel="Volver"
          consequences={[
            'No suma plata a Caja: usalo solo si ya estaba pago.',
            'Podés deshacerlo después.',
          ]}
          onConfirm={async () => {
            const res = await actions.settleBookingsBatchAction!({
              bookingIds: [booking.id],
              paymentOrigin: 'already_settled',
              amount: 0,
              clientIdempotencyKey: settlementKey,
            })
            if (res.success) {
              setSettlementKey(crypto.randomUUID())
              toast({ title: 'Turno marcado como saldado', variant: 'success' })
              router.refresh()
              return { success: true }
            }
            return { success: false, error: res.error }
          }}
        />
      )}

      {actions.voidSettlementAction && booking.settlementId && (
        <ConfirmDialog
          open={undoSettlementOpen}
          onOpenChange={setUndoSettlementOpen}
          title="Deshacer saldado"
          description="El turno vuelve a quedar con su saldo por cobrar."
          confirmLabel="Deshacer saldado"
          cancelLabel="Volver"
          onConfirm={async () => {
            const res = await actions.voidSettlementAction!({
              settlementId: booking.settlementId!,
            })
            if (res.success) {
              toast({ title: 'Saldado deshecho', variant: 'success' })
              router.refresh()
            }
            return res
          }}
        />
      )}

      {abonadoTarget && actions.settleAbonadoPeriodAction && (
        <AbonadoSettlementDialog
          target={abonadoTarget}
          defaultYearMonth={defaultYearMonth ?? booking.date.slice(0, 7)}
          settleAction={actions.settleAbonadoPeriodAction}
          onClose={() => setAbonadoTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </section>
  )
}

const SECONDARY_ACTION =
  'inline-flex h-11 md:h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60'

/**
 * El renglón "Saldo pendiente": saldado por un acuerdo, pagado entero, dado por perdido
 * (2026-11-07) o lo que falta.
 */
function balanceLabel(
  pendingCents: number,
  writtenOffCents: number,
  settled: boolean,
  unsettledMonthly: boolean,
): { text: string; className: string; paidInFull: boolean } {
  if (settled) {
    return {
      text: 'Saldado',
      className: 'text-emerald-800 dark:text-emerald-400',
      paidInFull: true,
    }
  }
  if (unsettledMonthly) {
    return { text: 'Por mes', className: 'text-muted-foreground', paidInFull: false }
  }
  if (pendingCents === 0 && writtenOffCents === 0) {
    return {
      text: 'Pagado completo',
      className: 'text-emerald-800 dark:text-emerald-400',
      paidInFull: true,
    }
  }
  if (writtenOffCents > 0) {
    return {
      text: `Perdido ${formatArs(writtenOffCents)}`,
      className: 'text-muted-foreground',
      paidInFull: false,
    }
  }
  return {
    text: formatArs(pendingCents),
    className: 'text-amber-800 dark:text-amber-400',
    paidInFull: false,
  }
}
