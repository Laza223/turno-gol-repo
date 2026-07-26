'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, MessageCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type { CompleteAndChargeInput, CompleteAndChargeResult } from './actions'

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'other', label: 'Otro' },
] as const

type Method = (typeof METHOD_OPTIONS)[number]['value']

type ChargeLine = {
  id: string
  amountPesos: string
  method: Method
}

const chipClass = (active: boolean) =>
  `h-9 rounded-lg px-3 text-xs font-semibold transition-all duration-200 ${
    active
      ? 'bg-primary text-primary-foreground shadow-xs'
      : 'border border-border bg-card text-foreground hover:bg-accent'
  }`

export type CompleteBookingDialogBooking = {
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
      setCharges([{
        id: crypto.randomUUID(),
        amountPesos: String(Math.round(summary.pending / 100)),
        method: 'cash',
      }])
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
    const pesos = Number(c.amountPesos)
    return sum + (Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : 0)
  }, 0)

  const remainingAfterCharge = Math.max(0, summary.pending - totalChargingCents)
  const hasDebt = remainingAfterCharge > 0

  const contactName = booking.playerName || booking.guestName
  const contactPhone = booking.playerPhone || booking.guestPhone

  function addChargeLine() {
    setCharges((prev) => [
      ...prev,
      { id: crypto.randomUUID(), amountPesos: '', method: 'cash' },
    ])
  }

  function removeChargeLine(id: string) {
    setCharges((prev) => prev.filter((c) => c.id !== id))
  }

  function updateChargeLine(id: string, patch: Partial<Omit<ChargeLine, 'id'>>) {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function quickAllCash() {
    if (summary.pending <= 0) return
    setCharges([{
      id: crypto.randomUUID(),
      amountPesos: String(Math.round(summary.pending / 100)),
      method: 'cash',
    }])
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
      const pesos = Number(c.amountPesos)
      if (!Number.isFinite(pesos) || pesos <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      parsedCharges.push({ amount: Math.round(pesos * 100), method: c.method })
    }

    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)
    if (totalCents > summary.pending) {
      setError(`El cobro total (${formatArs(totalCents)}) supera lo pendiente (${formatArs(summary.pending)}).`)
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
        const desc = totalCents > 0
          ? `${label} — cobrado ${formatArs(totalCents)}`
          : label
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Completar turno</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{label}</p>

        <div className="space-y-4">
          {/* Price breakdown */}
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Precio del turno</dt>
              <dd className="font-semibold text-foreground">{formatArs(booking.priceSnapshot)}</dd>
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
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              <dt className="font-medium text-foreground">Saldo a cobrar</dt>
              <dd className="font-semibold text-foreground">{formatArs(summary.pending)}</dd>
            </div>
          </dl>

          {/* Quick action */}
          {summary.pending > 0 && (
            <button
              type="button"
              onClick={quickAllCash}
              className="w-full h-10 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-500/30 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
            >
              Cobrar todo en efectivo — {formatArs(summary.pending)}
            </button>
          )}

          {/* Charge lines */}
          {charges.length > 0 && (
            <div className="space-y-2">
              {charges.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    {idx === 0 && (
                      <span className="text-xs font-medium text-muted-foreground">Monto</span>
                    )}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={c.amountPesos}
                        onChange={(e) => updateChargeLine(c.id, { amountPesos: e.target.value })}
                        placeholder="0"
                        className="h-11 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-sm tabular-nums shadow-xs focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
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
                          {m.label === 'Transferencia' ? 'Transf.' : m.label === 'MercadoPago' ? 'MP' : m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {charges.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChargeLine(c.id)}
                      aria-label="Eliminar cobro"
                      className="mt-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add charge line */}
          {charges.length < 10 && summary.pending > 0 && (
            <button
              type="button"
              onClick={addChargeLine}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline md:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Agregar otro cobro (pago dividido)
            </button>
          )}

          {/* Summary of what's being charged */}
          {charges.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total cobrado ahora</span>
                <span className="font-semibold text-foreground">{formatArs(totalChargingCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Resta</span>
                <span className={`font-semibold ${hasDebt ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-800 dark:text-emerald-400'}`}>
                  {hasDebt ? formatArs(remainingAfterCharge) : '✓ Pagado completo'}
                </span>
              </div>
            </div>
          )}

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
                  <span>📞 {contactName}{contactPhone ? ` — ${contactPhone}` : ''}</span>
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
          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-11 flex-1 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="h-11 flex-1 rounded-lg bg-primary text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPending
                ? 'Procesando…'
                : hasDebt
                  ? 'Completar con deuda'
                  : charges.length > 0
                    ? 'Completar y cobrar'
                    : 'Completar sin cobrar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
