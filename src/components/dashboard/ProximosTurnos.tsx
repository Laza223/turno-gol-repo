'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, CalendarOff, ChevronDown, LandPlot } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { TONE_BORDER, TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { capitalizeFirst } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UpcomingCourt, UpcomingTurn } from '@/modules/home/home.types'

/** Turnos visibles por cancha antes de plegar. Un viernes son 5 o 6 por
 *  cancha y el tablero entero deja de entrar en una pantalla; los que
 *  importan a las 17:00 son los de la próxima hora, no los de las 23:00. */
const MAX_VISIBLE_TURNS = 4

/**
 * "Próximos turnos" — el corazón operativo de Hoy desde el rediseño del
 * 2026-09-10 (auditoría de coherencia, H010). El 2026-09-12 cambió de forma:
 * de una lista apilada por cancha a una COLUMNA por cancha en escritorio, en
 * el mismo orden en que la Grilla dibuja las suyas (`courts.created_at`), para
 * que las dos pantallas se lean igual y el ojo no tenga que recorrer 4 canchas
 * verticalmente para saber qué pasa a las 20:00. En teléfono las columnas
 * apilan, que es la forma que ya tenía.
 *
 * El badge sale de `bookingBadgeVisual`, la misma tabla que pinta la grilla y
 * el listado: acá no puede aparecer un quinto nombre para un estado que ya
 * tiene el suyo. Se dibuja con `StatusBadge` (ícono + texto + tono) y no con
 * un pill propio de texto pelado — MASTER §6.5: el color nunca comunica solo.
 */
export function ProximosTurnos({
  courts,
  occupancy,
  dayIsClosed,
}: {
  courts: UpcomingCourt[]
  occupancy: { occupied: number; available: number; blocked: number; pct: number }
  /** El día no tiene horarios (feriado, o el día marcado cerrado). */
  dayIsClosed: boolean
}) {
  const total = courts.reduce((n, c) => n + c.turns.length, 0)
  const showBoard = !dayIsClosed && courts.length > 0 && total > 0

  return (
    <section aria-labelledby="turnos-titulo" className="card-premium overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="turnos-titulo" className="text-base font-semibold text-foreground">
          Próximos turnos
        </h2>
        <p className="text-sm tabular-nums text-muted-foreground">
          {occupancyLabel(occupancy, dayIsClosed)}
        </p>
      </header>

      {dayIsClosed ? (
        <EmptyState
          icon={CalendarOff}
          title="Hoy el complejo está cerrado."
          description="No hay horarios cargados para este día."
          className="rounded-t-none border-0 py-10"
        />
      ) : courts.length === 0 ? (
        <EmptyState
          icon={LandPlot}
          title="No hay ninguna cancha en servicio."
          description="Mientras estén todas pausadas no se puede reservar nada."
          action={
            <Link
              href="/canchas"
              className="flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Ir a Canchas
            </Link>
          }
          className="rounded-t-none border-0 py-10"
        />
      ) : !showBoard ? (
        <EmptyState
          icon={CalendarCheck}
          title="No queda nada por jugar hoy."
          description="Los turnos que quedaban ya se jugaron."
          className="rounded-t-none border-0 py-10"
        />
      ) : (
        // Separadores por BORDE y no por fondo: en tema oscuro `card-premium`
        // es translúcido (`rgba(255,255,255,0.03)` + backdrop-filter) sobre el
        // shell, así que columnas con `bg-card` sólido se verían como parches
        // opacos dentro de la tarjeta. Cada columna lleva su borde superior e
        // izquierdo y el grid se corre `-mt-px -ml-px`: el `overflow-hidden`
        // de la sección recorta la primera fila y la primera columna de
        // bordes, así que no hace falta saber cuál celda empieza cada fila
        // —que con `auto-fill` no se puede saber en CSS—.
        <div
          className="-ml-px -mt-px grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))' }}
        >
          {courts.map((court) => (
            <CourtColumn key={court.courtId} court={court} />
          ))}
        </div>
      )}
    </section>
  )
}

function CourtColumn({ court }: { court: UpcomingCourt }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = court.turns.length - MAX_VISIBLE_TURNS
  const visible = expanded ? court.turns : court.turns.slice(0, MAX_VISIBLE_TURNS)

  return (
    <div className="min-w-0 border-l border-t border-border px-3 pb-2.5 pt-3 sm:px-4">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="truncate text-sm font-semibold text-foreground">{court.courtName}</h3>
        {court.turns.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {court.turns.length === 1 ? '1 turno' : `${court.turns.length} turnos`}
          </span>
        )}
      </div>

      {court.turns.length === 0 ? (
        // Decir "libre" y no dejar la cancha en blanco: una fila vacía se lee
        // como "no cargó", y acá lo vacío es justamente el dato que el dueño
        // usa para ofrecerle el horario a alguien.
        <p className="mt-2.5 px-1 text-sm text-muted-foreground">Libre el resto del día.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1">
          {visible.map((turn) => (
            <li key={turn.bookingId}>
              <TurnRow turn={turn} />
            </li>
          ))}
        </ol>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-0.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'Ver menos' : `Ver ${hidden} más`}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}

function TurnRow({ turn }: { turn: UpcomingTurn }) {
  const badge = bookingBadgeVisual({
    status: turn.status,
    type: turn.type,
    depositStatus: turn.depositStatus,
  })
  const isNow = turn.relativeLabel === 'ahora'

  return (
    <Link
      href={`/reservas/${turn.bookingId}`}
      className={cn(
        'block min-h-11 rounded-lg border-l-[3px] py-1.5 pl-2.5 pr-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        TONE_BORDER[badge.tone],
        // El turno EN CURSO es la única fila teñida del tablero: es el
        // "uno distinto por vista" de Von Restorff (MASTER §9). Teñir
        // también los que vienen dejaría la pantalla sin foco, y apagar
        // los otros para destacarlo rompe AA (§2.4).
        isNow ? TONE_TINT[badge.tone] : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
          {turn.timeLabel}
        </span>
        {turn.relativeLabel && (
          <span
            className={cn(
              'shrink-0 whitespace-nowrap text-xs font-semibold',
              isNow ? TONE_TEXT[badge.tone] : 'text-muted-foreground',
            )}
          >
            {/* Sólo "ahora" se capitaliza: es una etiqueta de estado, no una
                frase. "En 40 min" arranca una oración que no existe. */}
            {isNow ? capitalizeFirst(turn.relativeLabel) : turn.relativeLabel}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">{turn.contactName}</span>
        <StatusBadge visual={badge} className="shrink-0" />
      </div>
    </Link>
  )
}

/**
 * El resumen de ocupación del día, que antes era una tarjeta suelta ("Turnos de
 * hoy"). Vive en el encabezado de este bloque porque el número solo significa
 * algo al lado de las canchas que lo produjeron.
 *
 * Con 0 canchas online (o todo bloqueado) el denominador da 0 pero el numerador
 * puede seguir contando turnos reales: ahí se muestra solo el numerador, para
 * no escribir "N de 0" ni un "0% de ocupación" que engaña.
 */
function occupancyLabel(
  occupancy: { occupied: number; available: number; blocked: number; pct: number },
  dayIsClosed: boolean,
): string {
  if (dayIsClosed) return 'Sin horarios para hoy'
  if (occupancy.available === 0) return `${occupancy.occupied} turnos · sin horarios disponibles`
  const blocked = occupancy.blocked > 0 ? ` · ${occupancy.blocked} bloqueados` : ''
  return `${occupancy.occupied} de ${occupancy.available} · ${occupancy.pct}% de ocupación${blocked}`
}
