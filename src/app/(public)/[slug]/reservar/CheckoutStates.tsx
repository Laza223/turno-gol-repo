import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  PORTAL_BUTTON,
  PORTAL_COLUMN,
  PORTAL_LINK,
  PORTAL_TITLE,
} from '@/components/world/PortalAuthFrame'
import { buildFichaHref } from '@/lib/booking/reserve-url'
import { formatDayHeader } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/** La columna de la pantalla de confirmar y de su carga: ~560 px en el celular y en escritorio. */
export const RESERVAR_COLUMN = PORTAL_COLUMN

export type CheckoutErrorCode =
  'banned' | 'too_many_holds' | 'rate_limited' | 'unavailable' | 'date_out_of_range' | 'too_soon'

const NOTICE_LINK = cn(
  PORTAL_LINK,
  'inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300',
)

/**
 * Aviso de La Reserva: `bg-muted` con borde `border`, esquina de 12 px y el ícono en `destructive`.
 * Todo lo que se avisa acá frena la reserva, así que es un error y no una advertencia: el ámbar es
 * de la escasez ("Queda 1") y de nada más. Dice qué pasó y deja una salida (un aviso sin salida
 * obliga a usar el "atrás" del navegador).
 */
function Notice({ href, action, children }: { href: string; action: string; children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4"
    >
      <AlertTriangle className={cn('mt-0.5 size-5 shrink-0', TONE_TEXT.destructive)} aria-hidden />
      <div>
        <p className="text-base text-foreground">{children}</p>
        <Link href={href} className={NOTICE_LINK}>
          {action}
        </Link>
      </div>
    </div>
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
  turnHref,
  error,
  until,
  reason,
}: {
  /**
   * La salida de "Elegir otro turno": la misma ficha que el "Volver" de la página, con el día, la
   * hora y el formato que eligió (a esa hora puede haber otra cancha libre). La arma la page.
   */
  turnHref: string
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
    // El bloqueo es del complejo, no de TurnoGol: lo dice como tal, con el motivo si hay uno.
    const sentence = untilLabel
      ? `No podés reservar en este complejo hasta el ${untilLabel}.`
      : 'No podés reservar en este complejo.'
    return (
      // Reservar en OTRO turno de este complejo daría el mismo error: la salida es otro complejo.
      <Notice href="/explorar" action="Buscar otro complejo">
        {reason ? `${sentence} Motivo: ${reason.replace(/\.$/, '')}.` : sentence}
      </Notice>
    )
  }
  if (error === 'too_many_holds') {
    return (
      <Notice href={turnHref} action="Elegir otro turno">
        Tenés reservas esperando el pago de la seña en este complejo. Si no las pagás, se liberan
        solas en unos minutos; después podés reservar otra.
      </Notice>
    )
  }
  if (error === 'rate_limited') {
    return (
      <Notice href={turnHref} action="Elegir otro turno">
        Estás yendo muy rápido. Esperá unos segundos e intentá de nuevo.
      </Notice>
    )
  }
  if (error === 'unavailable') {
    return (
      <Notice href={turnHref} action="Elegir otro turno">
        No pudimos reservar este turno. Probá con otro horario o con otra cancha.
      </Notice>
    )
  }
  if (error === 'date_out_of_range') {
    return (
      <Notice href={turnHref} action="Elegir otro turno">
        Ese turno ya no se puede reservar: quedó fuera de la fecha disponible para reservar online.
        Elegí otro turno.
      </Notice>
    )
  }
  if (error === 'too_soon') {
    return (
      <Notice href={turnHref} action="Elegir otro turno">
        Ese turno empieza muy pronto: este complejo pide reservar con más anticipación. Elegí otro
        turno.
      </Notice>
    )
  }
  return null
}

/** Por qué no se puede mostrar la pantalla de confirmar. Cada uno dice qué pasó y adónde seguir. */
export type CheckoutInvalidKind =
  'no-online' | 'missing' | 'not-found' | 'taken' | 'taken-on-return'

const INVALID: Record<CheckoutInvalidKind, { title: string; message?: string; cta: string }> = {
  'no-online': {
    title: 'Este complejo no toma reservas online por ahora',
    message: 'Consultá con el complejo para reservar tu turno.',
    cta: 'Ver el complejo',
  },
  missing: {
    title: 'No pudimos abrir este turno',
    message: 'Falta el día, la hora o la cancha. Elegilos de nuevo desde la página del complejo.',
    cta: 'Elegir un turno',
  },
  'not-found': {
    title: 'No encontramos ese turno',
    message: 'Puede que la cancha o el horario hayan cambiado. Elegí otro turno.',
    cta: 'Elegir otro turno',
  },
  taken: {
    title: 'Ese turno ya no está disponible',
    message: 'Otra persona lo reservó o ya pasó la hora. Elegí otro horario.',
    cta: 'Elegir otro turno',
  },
  // El jugador entró para confirmar (tocó "Continuar" y volvió del ingreso) y alguien se adelantó.
  // Sin mensaje: el título lo dice todo; la salida es el mismo día, sin la hora que ya no está.
  'taken-on-return': {
    title: 'Ese turno se ocupó mientras entrabas',
    cta: 'Ver otras horas',
  },
}

/**
 * Estado inválido de la pantalla de confirmar (complejo sin reservas online, datos faltantes,
 * turno inexistente o ya no libre). `ReservarPage` lo usa antes de validar el slot. La salida de
 * "no encontramos" y "ya no está" es la misma ficha que el "Volver" (`turnHref`): con el día, la
 * hora y el formato que eligió, no la ficha pelada. La de "se ocupó mientras entrabas" es la ficha
 * de ese día SIN la hora (`turnHref` la arma la page) y lo dice con el día: "Ver otras horas del
 * sábado 14 de marzo".
 */
export function CheckoutInvalidState({
  slug,
  kind,
  turnHref,
  date,
}: {
  slug: string
  kind: CheckoutInvalidKind
  /** Solo se usa en los estados donde el turno ya se validó (`not-found`, `taken` y `taken-on-return`). */
  turnHref?: string
  /** YYYY-MM-DD: el día que nombra la salida de `taken-on-return`. */
  date?: string
}) {
  const { title, message, cta } = INVALID[kind]
  const href =
    (kind === 'not-found' || kind === 'taken' || kind === 'taken-on-return'
      ? turnHref
      : undefined) ?? buildFichaHref(slug, {})
  const label = kind === 'taken-on-return' && date ? `${cta} del ${formatDayHeader(date)}` : cta
  return (
    <div className={cn(RESERVAR_COLUMN, 'pb-12')}>
      <div className="flex min-h-[50dvh] flex-col justify-center">
        <AlertTriangle className="size-8 text-muted-foreground" aria-hidden />
        <h1 className={cn(PORTAL_TITLE, 'mt-4 text-balance')}>{title}</h1>
        {message && <p className="mt-2 text-pretty text-base text-muted-foreground">{message}</p>}
        <Link href={href} className={cn(buttonVariants(), PORTAL_BUTTON, 'mt-8')}>
          {label}
        </Link>
      </div>
    </div>
  )
}
