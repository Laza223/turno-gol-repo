import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DayFailure } from './reserve-data'

export type DayEmptyKind = 'error' | 'closed' | 'none' | 'full' | 'noCourts'

/**
 * Salida hacia otro día cuando este no sirve. `searching` = se está buscando · `found` = el botón
 * que lleva · `failed` = la búsqueda falló (no se sabe si hay lugar) · `none` = se miraron
 * `reviewed` días y no hay lugar (0 = no hay ningún día después de este para mirar; con 1,
 * `label` es ese día: "domingo 15").
 */
export type NextDay =
  | { status: 'searching' }
  | { status: 'found'; label: string; onSelect: () => void }
  | { status: 'failed'; onRetry: () => void }
  | { status: 'none'; reviewed: number; label?: string }

/** Enlace en píldora del portal de vidrio (`.link` del mockup), a lo ancho en el celu. */
const SHORT_BUTTON = cn(
  buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
  'w-full sm:w-auto',
)

/** Qué se dice (y si tiene sentido reintentar) según por qué no cargó el día. */
const FAILURE_COPY: Record<DayFailure, { title: (day: string) => string; hint: string }> = {
  network: {
    title: (day) => `No pudimos cargar los horarios del ${day}`,
    hint: 'Fijate si tenés señal o WiFi y probá de nuevo. Tu elección sigue guardada.',
  },
  server: {
    title: (day) => `No pudimos cargar los horarios del ${day}`,
    hint: 'Hubo un problema al consultar. Probá de nuevo en unos segundos.',
  },
  rate: {
    title: () => 'Muchas consultas seguidas',
    hint: 'Esperá unos segundos y volvé a probar.',
  },
  gone: {
    title: () => 'Este complejo no está tomando reservas',
    hint: 'Por ahora no se puede reservar online acá.',
  },
  range: {
    title: () => 'Esa fecha no está habilitada para reservar',
    hint: 'Elegí otro día disponible.',
  },
}

function nextDayHint(kind: DayEmptyKind, nextDay: NextDay | null): string | null {
  if (nextDay?.status === 'failed') return 'No pudimos buscar otro día.'
  if (nextDay?.status !== 'none') return null
  if (nextDay.reviewed === 1 && nextDay.label) return `No hay lugar el ${nextDay.label}.`
  if (nextDay.reviewed > 0) return `No hay lugar en los próximos ${nextDay.reviewed} días.`
  return kind === 'closed'
    ? 'No hay otros días abiertos para reservar.'
    : 'Es el último día habilitado para reservar.'
}

/**
 * Lo que se ve cuando el día no tiene horas para elegir, siempre con salida: reintentar, el
 * próximo día con lugar, o hablar con el complejo. Dice qué pasó y qué hacer, arriba del pliegue.
 * Para 'full' (hay horas, pero todas completas) acompaña a la grilla salvo que haya un día al que
 * ir, que la reemplaza.
 */
export default function DayEmptyState({
  kind,
  failure = 'network',
  dayLabel,
  nextDay = null,
  onRetry,
  contact,
}: {
  kind: DayEmptyKind
  /** Solo para `kind = 'error'`. */
  failure?: DayFailure
  /** "jueves 15" */
  dayLabel: string
  nextDay?: NextDay | null
  onRetry?: () => void
  contact?: { href: string; label: string } | null
}) {
  const copy = FAILURE_COPY[failure]
  const title =
    kind === 'error'
      ? copy.title(dayLabel)
      : kind === 'closed'
        ? `Cerrado el ${dayLabel}`
        : kind === 'noCourts'
          ? 'Todavía no hay canchas cargadas'
          : `No quedan horarios el ${dayLabel}`
  const hint =
    kind === 'error'
      ? copy.hint
      : kind === 'noCourts'
        ? 'Escribile directo al complejo para consultar horarios.'
        : nextDayHint(kind, nextDay)
  const gone = kind === 'error' && failure === 'gone'
  // El día fuera de ventana no mejora reintentando: su salida es el botón "Ver hoy" (`nextDay`).
  const retry = kind === 'error' && !gone && failure !== 'range' ? onRetry : undefined
  const hasActions = Boolean(retry || gone || contact || (nextDay && nextDay.status !== 'none'))

  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className="rounded-3xl border border-portal-inner-line bg-portal-inner p-4 text-portal-ink"
    >
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-portal-soft">{hint}</p>}
      {hasActions && (
        // min-h-11: la fila reserva el alto de un botón, así "Buscando…" → botón no mueve la página.
        <div className="mt-3 flex min-h-11 flex-col justify-center gap-2 sm:flex-row sm:items-center sm:justify-start">
          {retry && (
            <Button
              type="button"
              variant="pill-link"
              size="pill-sm"
              onClick={retry}
              className="w-full sm:w-auto"
            >
              Reintentar
            </Button>
          )}
          {gone && (
            <Link href="/explorar" className={SHORT_BUTTON}>
              Buscar otro complejo
            </Link>
          )}
          {nextDay?.status === 'searching' && (
            <p className="text-sm text-portal-soft">Buscando el próximo día con lugar…</p>
          )}
          {nextDay?.status === 'found' && (
            <Button
              type="button"
              variant="pill-link"
              size="pill-sm"
              onClick={nextDay.onSelect}
              className="w-full sm:w-auto"
            >
              {nextDay.label}
            </Button>
          )}
          {nextDay?.status === 'failed' && (
            <Button
              type="button"
              variant="pill-link"
              size="pill-sm"
              onClick={nextDay.onRetry}
              className="w-full sm:w-auto"
            >
              Reintentar
            </Button>
          )}
          {contact && (
            <a
              href={contact.href}
              {...(contact.href.startsWith('http')
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className={SHORT_BUTTON}
            >
              {contact.label}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
