import Link from 'next/link'
import { XCircle } from 'lucide-react'
import type { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'

const ctaClass =
  'inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25'

/** Sin reserva (inexistente, purgada, o de otro jugador via RLS): estado neutro, sin afirmar que el pago falló. */
export function BookingErrorNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">No encontramos tu reserva.</p>
      <Link href="/mis-reservas" className={`mt-8 ${ctaClass}`}>
        Ver mis reservas
      </Link>
    </div>
  )
}

/**
 * Card de pago rechazado/cancelado. `withinWindow` decide el CTA: dentro del
 * hold real (`DEFAULT_EXPIRY_SECONDS`) ofrece reintentar el mismo booking;
 * fuera de ventana manda a reservar de nuevo (el worker ya liberó el slot).
 *
 * `retryAction` entra por prop: `.../reservar/actions` es `'use server'` y
 * arrastra `node:async_hooks` si se importa como valor.
 */
export function BookingErrorCard({
  bookingId,
  tenantSlug,
  withinWindow,
  retryAction,
}: {
  bookingId: string
  tenantSlug: string | null
  withinWindow: boolean
  retryAction: typeof retryDepositPaymentAction
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-100 dark:bg-red-500/15 dark:ring-red-500/10">
        <XCircle className="h-8 w-8 text-red-700 dark:text-red-300" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">El pago no se procesó.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        El pago fue rechazado o cancelado. Podés intentar de nuevo con otro medio.
      </p>
      <span className="sr-only">Reserva {bookingId}</span>
      {withinWindow ? (
        <form action={retryAction} className="mt-8">
          <input type="hidden" name="bookingId" value={bookingId} />
          <button type="submit" className={ctaClass}>
            Reintentar pago
          </button>
        </form>
      ) : (
        <Link href={tenantSlug ? `/${tenantSlug}` : '/'} className={`mt-8 ${ctaClass}`}>
          Reservar de nuevo
        </Link>
      )}
    </div>
  )
}
