'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import * as Sentry from '@sentry/nextjs'
import { CalendarClock, CupSoda, MoveRight, User, UserX, Wallet } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { gridSlotVisual } from '@/lib/booking/slot-visual'
import { NO_SHOW_CONSEQUENCES } from '@/lib/booking/no-show-consequences'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type {
  ListRescheduleSlots,
  RescheduleBooking,
} from './BookingRescheduleDialog'

// Se carga recién al abrirlo: el 90% de las veces que se abre el panel es para
// cobrar, no para mover el turno.
const BookingRescheduleDialog = dynamic(
  () => import('./BookingRescheduleDialog').then((m) => m.BookingRescheduleDialog),
  { ssr: false },
)

/**
 * El diálogo de cantina llega INYECTADO, no importado: reusa el `TicketPanel`
 * real de /caja/cantina, y un componente de `@/components` no puede importar de
 * `@/app` (regla de lint: o pertenece a la ruta, o es genérico). Vive en
 * `app/(admin)/grilla/_components/` y lo enchufa `GrillaView`.
 */
export type RenderCanteenDialog = (args: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  displayName: string | null
}) => React.ReactNode

/**
 * Panel lateral del turno — Fase 3, criterio de salida #2: cobrar, cantina,
 * marcar ausente y reprogramar **sin navegar fuera de la grilla**.
 *
 * Reemplaza el popover de sólo-lectura que abría al hacer hover. El hover se
 * fue a propósito: era una affordance que en touch no existe (el admin en el
 * mostrador usa tablet), y un panel que sólo mira obliga a irse a /reservas
 * justo cuando hay alguien esperando para pagar.
 *
 * Las Server Actions llegan POR PROP, no por import: `'use server'` arrastra
 * `node:async_hooks` al bundle y rompe Storybook (mismo motivo documentado en
 * QuickActions.tsx).
 */

export type ChargeInput = { amount: number; method: ChargeLine['method'] }

export type SlotPanelActions = {
  /** Turno ya jugado con saldo: cobra lo que falta. Admite método mixto. */
  chargeDebtAction: (input: {
    bookingId: string
    charges: ChargeInput[]
    clientIdempotencyKey?: string
  }) => Promise<{ success: true } | { success: false; error: string }>
  /** Turno confirmado que ya terminó: lo marca jugado y cobra en un solo paso. */
  completeAndChargeBookingAction: (input: {
    bookingId: string
    charges: ChargeInput[]
    clientIdempotencyKey?: string
  }) => Promise<{ success: boolean; error?: string }>
  /** Turno que todavía no empezó: adelanto. Una sola línea (el backend no acepta mixto acá). */
  addBookingChargeAction: (input: {
    bookingId: string
    amount: number
    method: ChargeInput['method']
    clientIdempotencyKey?: string
  }) => Promise<{ success: boolean; error?: string }>
  markNoShowAction: (bookingId: string) => Promise<{ success: boolean; error?: string }>
  revertNoShowAction?: (bookingId: string) => Promise<{ success: boolean; error?: string }>
  /** Reprogramar. Las dos van juntas o ninguna (T5). */
  listRescheduleSlotsAction?: ListRescheduleSlots
  rescheduleBookingAction?: RescheduleBooking
}

type Props = {
  booking: GridBooking | null
  courtName: string
  onClose: () => void
  /**
   * Se cobró o se marcó ausente: el padre tiene que refrescar la grilla. NO
   * alcanza con `router.refresh()` desde acá — el hook de Realtime lee sus
   * datos iniciales sólo al montar, así que la celda seguiría pintando el
   * estado viejo (y una alarma de "sin cobrar" que no se apaga después de
   * cobrar es peor que no tenerla).
   */
  onMutated?: () => void
  /**
   * ¿El turno ya terminó? Lo decide la grilla, no este panel: la respuesta
   * depende del día operativo (un slot de madrugada de un complejo
   * `closes_next_day` sucede FÍSICAMENTE mañana, así que a las 02:00 de hoy
   * todavía es futuro) y esa lógica ya vive en `useGridLayout.isSlotPast`.
   * Recalcularla acá con `Date.now()` daría una respuesta más simple y
   * equivocada, y además impura en render.
   */
  hasEnded?: boolean
  /** Canchas del complejo — sólo las necesita el diálogo de reprogramar. */
  courts?: Array<{ id: string; name: string; status?: 'online' | 'offline' }>
  /** Ver `RenderCanteenDialog`. Sin esto, el panel no ofrece cargar cantina. */
  renderCanteenDialog?: RenderCanteenDialog
  actions?: SlotPanelActions
}

/**
 * Qué significa "cobrar" para este turno. Los tres caminos existen porque el
 * backend valida estados distintos, no por gusto:
 *  - `settle`  — el turno ya se jugó y quedó saldo (chargeDebtAction exige
 *                status 'completed').
 *  - `finish`  — está confirmado y ya terminó: cobrar y darlo por jugado en el
 *                mismo movimiento, que es lo que realmente pasa en el mostrador.
 *  - `advance` — todavía no terminó: es un adelanto, y el backend sólo acepta
 *                una línea, así que el mixto se deshabilita en vez de mentir.
 */
type ChargeMode = 'settle' | 'finish' | 'advance' | null

function chargeMode(booking: GridBooking, hasEnded: boolean): ChargeMode {
  const pending = booking.pending
  if (typeof pending !== 'number' || pending <= 0) return null
  if (booking.type === 'block' || booking.type === 'tournament') return null
  if (booking.status === 'completed') return 'settle'
  if (booking.status === 'confirmed') return hasEnded ? 'finish' : 'advance'
  return null
}

const CHARGE_COPY: Record<Exclude<ChargeMode, null>, { title: string; cta: string }> = {
  settle: { title: 'Cobrar lo que falta', cta: 'Cobrar' },
  finish: { title: 'Cobrar y dar por jugado', cta: 'Cobrar y cerrar turno' },
  advance: { title: 'Cobrar por adelantado', cta: 'Registrar cobro' },
}

export function BookingSlotPanel({
  booking,
  courtName,
  onClose,
  onMutated,
  hasEnded = false,
  courts,
  renderCanteenDialog,
  actions,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChargeLine[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [canteenOpen, setCanteenOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)

  // Cambio de turno → estado limpio. Patrón "derived state on prop change"
  // (sin useEffect), igual que StreetMoneyChargeDialog.
  const [lastId, setLastId] = useState<string | null>(null)
  if (booking && booking.id !== lastId) {
    setLastId(booking.id)
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setLines([newChargeLine(booking.pending ?? null, 'cash')])
    setNoShowOpen(false)
    setCanteenOpen(false)
    setRescheduleOpen(false)
  }

  if (!booking) return null

  const visual = gridSlotVisual(booking)
  const mode = chargeMode(booking, hasEnded)
  const pending = booking.pending ?? 0

  // Marcar ausente: sólo sobre un turno de un cliente que ya terminó. Una hora
  // de torneo no tiene a quién dar por ausente (el torneo es dueño del horario,
  // no un jugador) y un bloqueo de mantenimiento tampoco.
  const canMarkNoShow =
    booking.status === 'confirmed' &&
    hasEnded &&
    booking.type !== 'tournament' &&
    booking.type !== 'block'
  const canRevertNoShow = booking.status === 'no_show' && Boolean(actions?.revertNoShowAction)

  // Un bloqueo de mantenimiento y una hora de torneo no son el turno de nadie:
  // no hay a quién venderle ni a quién mover.
  const isClientBooking = booking.type !== 'block' && booking.type !== 'tournament'

  // La cantina sigue disponible con el turno ya jugado: lo normal es que la
  // gente consuma durante el partido y pague todo junto al final.
  const canSellCanteen = isClientBooking && Boolean(renderCanteenDialog)

  // Mismos estados Y tipos que acepta `rescheduleBooking`: un botón que el
  // backend siempre va a rechazar es peor que no tener el botón.
  //
  // `fixed` (sesión de abonado) queda afuera aunque SÍ sea el turno de un
  // cliente: su precio sale del contrato, no de la grilla de tarifas, y
  // reprogramarla lo pisaría con el de lista.
  const canReschedule =
    isClientBooking &&
    booking.type !== 'fixed' &&
    (booking.status === 'confirmed' || booking.status === 'pending_payment') &&
    Boolean(actions?.listRescheduleSlotsAction && actions?.rescheduleBookingAction) &&
    Boolean(courts?.length)

  const displayName =
    booking.guestName ??
    (booking.playerFirstName
      ? `${booking.playerFirstName} ${booking.playerLastName ?? ''}`.trim()
      : null)

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastId(null)
      onClose()
    }
  }

  /**
   * Cerrar + refrescar tras una mutación. El fallback a `router.refresh()` es
   * para los callers que no pasan `onMutated` (stories): refresca lo que puede
   * en vez de no hacer nada.
   */
  function notifyMutated() {
    if (onMutated) {
      onMutated()
      return
    }
    onClose()
    router.refresh()
  }

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
      setError(
        `El cobro total (${formatArs(total)}) supera lo pendiente (${formatArs(pending)}).`,
      )
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
        setLastId(null)
        notifyMutated()
      } catch (err) {
        Sentry.captureException(err)
        setError('No se pudo registrar el cobro. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  async function confirmNoShow() {
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
    setLastId(null)
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
      setLastId(null)
      notifyMutated()
    })
  }

  return (
    <>
      <Sheet open onOpenChange={handleOpenChange}>
        <SheetContent side="right" aria-label="Acciones del turno" className="gap-0">
          <SheetHeader className="border-b border-border p-5 pr-12">
            <SheetTitle className="font-display text-lg">
              {displayName ?? visual.label}
            </SheetTitle>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              {courtName} · {booking.timeStart}–{booking.timeEnd}
            </p>
            <div className="pt-1">
              <StatusBadge visual={{ icon: visual.icon, label: visual.label, tone: visual.tone }} />
            </div>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-5">
            <section className="rounded-lg border border-border p-3">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Precio del turno</dt>
                  <dd className="font-semibold tabular-nums">{formatArs(booking.priceSnapshot)}</dd>
                </div>
                {typeof booking.totalPaid === 'number' && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cobrado</dt>
                    <dd className="font-semibold tabular-nums">{formatArs(booking.totalPaid)}</dd>
                  </div>
                )}
                {typeof booking.pending === 'number' && (
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt className="font-medium">Pendiente</dt>
                    <dd
                      className={`font-semibold tabular-nums ${
                        booking.pending > 0 ? 'text-red-700 dark:text-red-300' : ''
                      }`}
                    >
                      {formatArs(booking.pending)}
                    </dd>
                  </div>
                )}
                {booking.paymentMethod && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Pago</dt>
                    <dd>{METHOD_LABELS[booking.paymentMethod]}</dd>
                  </div>
                )}
              </dl>
              {displayName && (
                <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs text-muted-foreground">
                  <User aria-hidden className="h-3.5 w-3.5" />
                  {displayName}
                </p>
              )}
            </section>

            {mode && actions && (
              <section className="rounded-lg border border-border p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Wallet aria-hidden className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  {CHARGE_COPY[mode].title}
                </h3>
                <SplitPaymentFields
                  lines={lines}
                  onChange={setLines}
                  // El adelanto va por addBookingChargeAction, que acepta UNA
                  // línea: mostrar el mixto y después mandar sólo la primera
                  // sería cobrar de menos sin avisar.
                  maxLines={mode === 'advance' ? 1 : 5}
                  quickAllCashCents={pending}
                  disabled={isPending}
                />
                {error && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={submitCharge}
                  disabled={isPending}
                  className="mt-3 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
                >
                  {isPending ? 'Procesando…' : CHARGE_COPY[mode].cta}
                </button>
              </section>
            )}

            {canSellCanteen && (
              <button
                type="button"
                onClick={() => setCanteenOpen(true)}
                disabled={isPending}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
              >
                <CupSoda aria-hidden className="h-4 w-4" />
                Cargar cantina
              </button>
            )}

            {canReschedule && (
              <button
                type="button"
                onClick={() => setRescheduleOpen(true)}
                disabled={isPending}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
              >
                <MoveRight aria-hidden className="h-4 w-4" />
                Reprogramar
              </button>
            )}

            {canMarkNoShow && actions && (
              <button
                type="button"
                onClick={() => setNoShowOpen(true)}
                disabled={isPending}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 text-sm font-semibold text-red-700 transition-colors hover:bg-destructive/10 disabled:opacity-60 dark:text-red-300 md:h-10"
              >
                <UserX aria-hidden className="h-4 w-4" />
                Marcar ausente
              </button>
            )}

            {canRevertNoShow && (
              <button
                type="button"
                onClick={revertNoShow}
                disabled={isPending}
                className="h-11 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
              >
                Deshacer la ausencia
              </button>
            )}

            {booking.type === 'tournament' && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Esta hora la ocupa un torneo. La plata del torneo entra por la inscripción, no por
                turno — se gestiona desde la pantalla del torneo.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Los dos diálogos se MONTAN al abrirse (patrón de BookingFormModal en la
          grilla): el catálogo de cantina y los huecos libres se piden una vez
          por apertura, con estado limpio y sin resetearlo a mano. */}
      {canSellCanteen &&
        canteenOpen &&
        renderCanteenDialog?.({
          open: true,
          onOpenChange: setCanteenOpen,
          bookingId: booking.id,
          displayName,
        })}

      {canReschedule &&
        rescheduleOpen &&
        courts &&
        actions?.listRescheduleSlotsAction &&
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
              notifyMutated()
            }}
          />
        )}

      {actions && (
        <ConfirmDialog
          open={noShowOpen}
          onOpenChange={setNoShowOpen}
          title="Marcar como ausente"
          description={`${displayName ?? 'El cliente'} no se presentó a su turno de ${booking.timeStart}.`}
          consequences={NO_SHOW_CONSEQUENCES}
          confirmLabel="Marcar ausente"
          cancelLabel="Volver"
          variant="destructive"
          onConfirm={confirmNoShow}
        />
      )}
    </>
  )
}
