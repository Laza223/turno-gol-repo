'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MoneyInput } from '@/components/ui/money-input'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS, type MethodKey } from '@/lib/payment-method'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type { CompleteAndChargeInput, CompleteAndChargeResult } from './actions'

const METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS

type Method = MethodKey

type ChargeLine = {
  id: string
  amountCents: number | null
  method: Method
}

const chipClass = (active: boolean) =>
  `h-9 rounded-lg px-3 text-xs font-semibold transition-all duration-200 ${
    active
      ? 'bg-primary text-primary-foreground shadow-xs'
      : 'border border-border bg-card text-foreground hover:bg-accent'
  }`

type CompleteBookingDialogBooking = {
  id: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  paymentMethod: string | null
  guestName: string | null
  guestPhone: string | null
  /** Contacto del jugador registrado (null para guest bookings) */
  playerPhone?: string | null
  playerName?: string | null
  /** Charges already registered */
  chargesTotal: number
}

type Props = {
  booking: CompleteBookingDialogBooking | null
  label: string
  onClose: () => void
  completeAndChargeAction: (input: CompleteAndChargeInput) => Promise<CompleteAndChargeResult>
}

/**
 * Modal de "Completar + Cobrar" con soporte de pagos divididos.
 * El encargado ve el desglose del turno (precio, seña, saldo) y puede
 * agregar N líneas de cobro con método de pago distinto (efectivo,
 * transferencia, MercadoPago, otro). Si hay deuda, se registra una nota.
 */
export default function CompleteBookingDialog({
  booking,
  label,
  onClose,
  completeAndChargeAction,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [charges, setCharges] = useState<ChargeLine[]>([])
  const [debtNote, setDebtNote] = useState('')
  const [lastBookingId, setLastBookingId] = useState<string | null>(null)

  // Reset when a new booking is passed
  if (booking && booking.id !== lastBookingId) {
    setLastBookingId(booking.id)
    setError(null)
    setDebtNote('')

    // Pre-fill with a single charge for the pending amount
    const summary = summarizeBookingCharges({
      priceSnapshot: booking.priceSnapshot,
      depositAmount: booking.depositAmount,
      depositStatus: booking.depositStatus,
      chargesTotal: booking.chargesTotal,
    })
    if (summary.pending > 0) {
      setCharges([
        {
          id: crypto.randomUUID(),
          amountCents: summary.pending,
          method: 'cash',
        },
      ])
    } else {
      setCharges([])
    }
  }

  if (!booking) return null

  const summary = summarizeBookingCharges({
    priceSnapshot: booking.priceSnapshot,
    depositAmount: booking.depositAmount,
    depositStatus: booking.depositStatus,
    chargesTotal: booking.chargesTotal,
  })

  const totalChargingCents = charges.reduce((sum, c) => {
    return sum + (c.amountCents != null && c.amountCents > 0 ? c.amountCents : 0)
  }, 0)

  const remainingAfterCharge = Math.max(0, summary.pending - totalChargingCents)
  const hasDebt = remainingAfterCharge > 0

  const contactName = booking.playerName || booking.guestName
  const contactPhone = booking.playerPhone || booking.guestPhone

  function addChargeLine() {
    setCharges((prev) => [...prev, { id: crypto.randomUUID(), amountCents: null, method: 'cash' }])
  }

  function removeChargeLine(id: string) {
    setCharges((prev) => prev.filter((c) => c.id !== id))
  }

  function updateChargeLine(id: string, patch: Partial<Omit<ChargeLine, 'id'>>) {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function quickAllCash() {
    if (summary.pending <= 0) return
    setCharges([
      {
        id: crypto.randomUUID(),
        amountCents: summary.pending,
        method: 'cash',
      },
    ])
  }

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastBookingId(null)
      onClose()
    }
  }

  function submit() {
    setError(null)

    // Validate charge amounts
    const parsedCharges: { amount: number; method: Method }[] = []
    for (const c of charges) {
      if (c.amountCents == null || c.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      parsedCharges.push({ amount: c.amountCents, method: c.method })
    }

    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)
    if (totalCents > summary.pending) {
      setError(
        `El cobro total (${formatArs(totalCents)}) supera lo pendiente (${formatArs(summary.pending)}).`,
      )
      return
    }

    const clientIdempotencyKey = crypto.randomUUID()

    startTransition(async () => {
      const res = await completeAndChargeAction({
        bookingId: booking!.id,
        charges: parsedCharges,
        debtNote: hasDebt ? debtNote : undefined,
        clientIdempotencyKey,
      })
      if (res.success) {
        const desc = totalCents > 0 ? `${label} — cobrado ${formatArs(totalCents)}` : label
        toast({
          title: hasDebt ? 'Completada con deuda pendiente' : 'Completada y cobrada',
          description: desc,
          variant: 'success',
        })
        setLastBookingId(null)
        onClose()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  const whatsappUrl = contactPhone
    ? `https://wa.me/${contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hola${contactName ? ` ${contactName}` : ''}, te contactamos por el turno del ${label}. Quedó un saldo pendiente de ${formatArs(remainingAfterCharge)}. ¿Cuándo podés pasar a saldar?`,
      )}`
    : null

  return (
    <Dialog open={booking !== null} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Completar turno</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{label}</p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Breakdown de precio y cobro rápido */}
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              {/* h3, no h4: `DialogTitle` renderiza un h2 y saltar a h4 rompe
                  `heading-order` de axe. El tamaño lo da la clase, no el tag. */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resumen de cuenta
              </h3>

              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Precio del turno</dt>
                  <dd className="font-semibold text-foreground">
                    {formatArs(booking.priceSnapshot)}
                  </dd>
                </div>
                {summary.depositCounted > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">
                      Seña pagada <span className="text-emerald-800 dark:text-emerald-400">✓</span>
                    </dt>
                    <dd className="text-foreground">−{formatArs(summary.depositCounted)}</dd>
                  </div>
                )}
                {booking.chargesTotal > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Cobros previos</dt>
                    <dd className="text-foreground">−{formatArs(booking.chargesTotal)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/80 pt-2">
                  <dt className="font-medium text-foreground">Saldo a cobrar</dt>
                  <dd className="font-bold text-base text-foreground">
                    {formatArs(summary.pending)}
                  </dd>
                </div>
              </dl>

              {summary.pending > 0 && (
                <button
                  type="button"
                  onClick={quickAllCash}
                  className="w-full h-10 rounded-lg border border-dashed border-emerald-500/40 text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                >
                  Cobrar todo en efectivo — {formatArs(summary.pending)}
                </button>
              )}
            </div>

            {/* Columna Derecha: Carga de cobros y método */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Registro de pago
              </h3>

              {charges.length > 0 && (
                <div className="space-y-2">
                  {charges.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        {idx === 0 && (
                          <span className="text-xs font-medium text-muted-foreground">Monto</span>
                        )}
                        <MoneyInput
                          valueCents={c.amountCents}
                          onValueChange={(cents) => updateChargeLine(c.id, { amountCents: cents })}
                          minCents={1}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        {idx === 0 && (
                          <span className="text-xs font-medium text-muted-foreground">Método</span>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {METHOD_OPTIONS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => updateChargeLine(c.id, { method: m.value })}
                              className={chipClass(c.method === m.value)}
                            >
                              {m.label === 'Transferencia'
                                ? 'Transf.'
                                : m.label === 'MercadoPago'
                                  ? 'MP'
                                  : m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {charges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeChargeLine(c.id)}
                          aria-label="Eliminar cobro"
                          className="mt-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {charges.length < 10 && summary.pending > 0 && (
                <button
                  type="button"
                  onClick={addChargeLine}
                  // Mismo caso que `SplitPaymentFields`: 12px con `text-primary`
                  // (= emerald-700 en claro) sobre fondo atenuado queda en 4.47:1.
                  className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:underline md:min-h-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Agregar otro cobro (pago dividido)
                </button>
              )}

              {charges.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total cobrado ahora</span>
                    <span className="font-semibold text-foreground">
                      {formatArs(totalChargingCents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Resta</span>
                    <span
                      className={`font-semibold ${hasDebt ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-800 dark:text-emerald-400'}`}
                    >
                      {hasDebt ? formatArs(remainingAfterCharge) : '✓ Pagado completo'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Debt section */}
          {hasDebt && (
            <div className="space-y-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                ⚠ Queda una deuda de {formatArs(remainingAfterCharge)}
              </p>
              <textarea
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
                placeholder="Nota de deuda (opcional) — ej: le faltó a Juan"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              {contactName && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    📞 {contactName}
                    {contactPhone ? ` — ${contactPhone}` : ''}
                  </span>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-10 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <Button type="button" isLoading={isPending} onClick={submit} className="px-5">
              {isPending
                ? 'Procesando…'
                : hasDebt
                  ? 'Completar con deuda'
                  : charges.length > 0
                    ? 'Completar y cobrar'
                    : 'Completar sin cobrar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
