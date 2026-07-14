import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import ReservaShell from '@/components/booking/ReservaDarkShell'

// Banners de error del checkout — badge dual §6.5 (tinte + texto legible en
// ambos temas), severidad destructive o warning según el caso.
// `(public)/[slug]/reservar` es superficie CLARA (ReservaDarkShell acá es
// theme-adaptive, no forzado a dark). El fill light tiene que ser OPACO:
// `bg-destructive/10`/`bg-warning/10` (translúcido) compone contra lo que
// haya detrás — con el fondo real del portal daba 3.34:1 / 3.68:1. `bg-red-50`
// / `bg-amber-50` (igual que los badges de MisReservasView) fijan el
// contraste sin importar el fondo.
const alertDestructive =
  'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-destructive/25 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30'
const alertWarning =
  'rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-warning/30 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30'

export type CheckoutErrorCode =
  | 'slot_taken'
  | 'banned'
  | 'too_many_holds'
  | 'rate_limited'
  | 'unavailable'

function formatBannedUntilArt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/**
 * Banner de error del checkout — `createBookingAndCheckout` redirige de vuelta
 * a `/reservar?error=<code>` cuando la Server Action falla (booking.errors.ts).
 * Sin `error` (o un código desconocido) no renderiza nada.
 */
export function CheckoutErrorBanner({
  error,
  until,
}: {
  error: CheckoutErrorCode | string | undefined
  /** ISO — solo aplica a `error=banned`, cuándo termina el softban. */
  until?: string
}) {
  if (error === 'slot_taken') {
    return <p role="alert" className={alertDestructive}>Ese turno acaba de ser tomado. Elegí otro horario.</p>
  }
  if (error === 'banned') {
    const untilLabel = until ? formatBannedUntilArt(until) : null
    return (
      <p role="alert" className={alertDestructive}>
        {untilLabel
          ? `Te bloqueamos temporalmente por ausencias. Volvés a poder reservar el ${untilLabel}.`
          : 'No podés reservar en este complejo actualmente.'}
      </p>
    )
  }
  if (error === 'too_many_holds') {
    return (
      <p role="alert" className={alertWarning}>
        Ya tenés reservas pendientes de pago en este complejo. Completá o esperá a que venzan antes de reservar otra.
      </p>
    )
  }
  if (error === 'rate_limited') {
    return <p role="alert" className={alertWarning}>Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.</p>
  }
  if (error === 'unavailable') {
    return (
      <p role="alert" className={alertDestructive}>
        No pudimos procesar la reserva: la cancha no está disponible o no tiene precio configurado para ese horario.
      </p>
    )
  }
  return null
}

/**
 * Estado inválido del checkout (slug sin reservas online, query params
 * faltantes/inconsistentes, turno inexistente o ya no libre) — `ReservarPage`
 * lo usa 4 veces con distinto `message` antes de llegar a validar el slot.
 */
export function CheckoutInvalidState({ slug, message }: { slug: string; message: string }) {
  return (
    <ReservaShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 text-amber-700 ring-1 ring-inset ring-warning/35 dark:bg-amber-500/12 dark:text-amber-300 dark:ring-amber-500/35">
          <AlertTriangle className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          href={`/${slug}`}
          className="mt-7 inline-flex h-12 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25"
        >
          Elegir otro turno
        </Link>
      </div>
    </ReservaShell>
  )
}
