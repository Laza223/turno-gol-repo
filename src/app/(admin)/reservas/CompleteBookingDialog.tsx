'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Phone, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type { CompleteAndChargeInput, CompleteAndChargeResult } from './actions'

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
 * "Completar turno": SOLO cambia el estado, con confirmación — el cobro se
 * mudó a "Cobros de turno" (BookingCharges, el mismo componente que Hoy). Si
 * queda saldo, la nota de deuda y el contacto por WhatsApp se conservan acá
 * porque son parte de "dar por terminado un turno con deuda", no del cobro.
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
  const [debtNote, setDebtNote] = useState('')
  const [lastBookingId, setLastBookingId] = useState<string | null>(null)

  // Reset when a new booking is passed
  if (booking && booking.id !== lastBookingId) {
    setLastBookingId(booking.id)
    setError(null)
    setDebtNote('')
  }

  if (!booking) return null

  const summary = summarizeBookingCharges({
    priceSnapshot: booking.priceSnapshot,
    depositAmount: booking.depositAmount,
    depositStatus: booking.depositStatus,
    chargesTotal: booking.chargesTotal,
  })

  const hasDebt = summary.pending > 0

  const contactName = booking.playerName || booking.guestName
  const contactPhone = booking.playerPhone || booking.guestPhone

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastBookingId(null)
      onClose()
    }
  }

  function submit() {
    setError(null)
    const clientIdempotencyKey = crypto.randomUUID()

    startTransition(async () => {
      const res = await completeAndChargeAction({
        bookingId: booking!.id,
        charges: [],
        debtNote: hasDebt ? debtNote : undefined,
        clientIdempotencyKey,
      })
      if (res.success) {
        toast({
          title: hasDebt ? 'Completada con deuda pendiente' : 'Turno completado',
          description: label,
          variant: 'success',
        })
        setLastBookingId(null)
        onClose()
        router.refresh()
      } else {
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setError(res.error))
      }
    })
  }

  const whatsappUrl = contactPhone
    ? `https://wa.me/${contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hola${contactName ? ` ${contactName}` : ''}, te contactamos por el turno del ${label}. Quedó un saldo pendiente de ${formatArs(summary.pending)}. ¿Cuándo podés pasar a saldar?`,
      )}`
    : null

  return (
    <Dialog open={booking !== null} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Completar turno</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{label}</p>

        <div className="space-y-4">
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
                    Seña pagada{' '}
                    <Check
                      aria-hidden
                      className="inline h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400"
                    />
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
                <dt className="font-medium text-foreground">Saldo</dt>
                <dd className="font-bold text-base text-foreground">
                  {hasDebt ? (
                    formatArs(summary.pending)
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Pagado completo
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Debt section */}
          {hasDebt && (
            <div className="space-y-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Queda una deuda de {formatArs(summary.pending)}
              </p>
              <textarea
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
                placeholder="Nota de deuda (opcional) — ej: le faltó a Juan"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              {contactName && contactPhone && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {contactName} — {contactPhone}
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
              {isPending ? 'Procesando…' : hasDebt ? 'Completar con deuda' : 'Completar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
