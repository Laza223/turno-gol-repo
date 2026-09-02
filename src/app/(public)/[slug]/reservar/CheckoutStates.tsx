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
  'banned' | 'too_many_holds' | 'rate_limited' | 'unavailable' | 'date_out_of_range'

// MEJORA-UX QA: los 4 banners inline eran solo texto, sin salida — a
// diferencia de `CheckoutInvalidState`, que siempre ofrece "Elegir otro
// turno". Mismo link, mismo estilo, reusado en los 4 `if` de abajo.
function ElegirOtroTurnoLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/${slug}`}
      className="mt-2 inline-flex text-sm font-semibold underline underline-offset-2 hover:no-underline"
    >
      Elegir otro turno
    </Link>
  )
}

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
  slug,
  error,
  until,
  reason,
}: {
  /** Para el link de recuperación "Elegir otro turno" de los 4 banners. */
  slug: string
  error: CheckoutErrorCode | string | undefined
  /** ISO — solo aplica a `error=banned`, cuándo termina el softban. */
  until?: string
  /**
   * Motivo real del ban (ENS-10). `checkPlayerBanned` lo calcula (ban global,
   * ban manual del complejo o el softban automático de `applyNoShowStrike`);
   * antes se asumía siempre "ausencias", que es falso para un ban manual con
   * otro motivo. R3-5: NUNCA lo pasa `page.tsx` desde el query string — lo
   * relee de DB server-side vía `getActiveBanReason` (misma fuente que
   * `checkPlayerBanned`), porque un `?reason=...` en la URL es fabricable
   * (ingeniería social en dominio legítimo) y se filtra a logs/referrers.
   */
  reason?: string
}) {
  if (error === 'banned') {
    const untilLabel = until ? formatBannedUntilArt(until) : null
    const untilSuffix = untilLabel ? ` Volvés a poder reservar el ${untilLabel}.` : ''
    return (
      <div role="alert" className={alertDestructive}>
        <p>
          {reason
            ? `El complejo restringió tu cuenta: ${reason.replace(/\.$/, '')}.${untilSuffix}`
            : untilLabel
              ? `Te bloqueamos temporalmente. Volvés a poder reservar el ${untilLabel}.`
              : 'No podés reservar en este complejo actualmente.'}
        </p>
        <ElegirOtroTurnoLink slug={slug} />
      </div>
    )
  }
  if (error === 'too_many_holds') {
    return (
      <div role="alert" className={alertWarning}>
        <p>
          Ya tenés reservas pendientes de pago en este complejo. Completá o esperá a que venzan
          antes de reservar otra.
        </p>
        <ElegirOtroTurnoLink slug={slug} />
      </div>
    )
  }
  if (error === 'rate_limited') {
    return (
      <div role="alert" className={alertWarning}>
        <p>Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.</p>
        <ElegirOtroTurnoLink slug={slug} />
      </div>
    )
  }
  if (error === 'unavailable') {
    return (
      <div role="alert" className={alertDestructive}>
        <p>
          No pudimos procesar la reserva: la cancha no está disponible o no tiene precio configurado
          para ese horario.
        </p>
        <ElegirOtroTurnoLink slug={slug} />
      </div>
    )
  }
  if (error === 'date_out_of_range') {
    return (
      <div role="alert" className={alertDestructive}>
        <p>
          Ese turno ya no se puede reservar: quedó fuera de la fecha disponible para reservar
          online. Elegí otro turno.
        </p>
        <ElegirOtroTurnoLink slug={slug} />
      </div>
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
