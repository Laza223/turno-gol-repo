'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { AlertTriangle, ArrowRight, Ban, CalendarClock, Move, X } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { toast } from '@/hooks/use-toast'
import { formatDateLong } from '@/lib/format'
import { openingsForMatch, type MatchOpening } from '@/modules/tournaments/fixture/placement'
import type { TournamentMatchView, TournamentSlotRow } from '@/modules/tournaments/tournament.types'
import type { TournamentActionResult } from '../../actions'
import {
  MATCH_STATUS_LABELS,
  formatArtTime,
  formatScore,
  matchStatusBadgeClass,
} from '../../torneos-lib'

/**
 * La Planilla: las horas que el torneo posee, dibujadas como lo que son.
 *
 * El fixture generado es una propuesta (`rescheduleMatch` existe justamente
 * para editarlo), pero mover un partido tiene tres reglas que desde la UI son
 * invisibles: tiene que entrar entero en una hora que el torneo posee EN ESA
 * CANCHA, ningún equipo puede quedar con dos partidos pisados, y la cancha no
 * puede terminar con dos encima. Un selector de fecha y hora libre haría que el
 * encargado adivine y coma un error casi siempre; el tablero le muestra los
 * destinos legales y le dice el motivo de los que no lo son.
 *
 * Interacción: click-to-place, no arrastrar. Tocás "Mover" y el tablero entra
 * en modo mover; tocás un destino y listo. Sale gratis en teclado y en el
 * teléfono del mostrador, que es donde esto se usa un sábado a la mañana.
 */

export type RescheduleMatchAction = (input: unknown) => Promise<TournamentActionResult>

type Opening = MatchOpening<TournamentSlotRow>

/** Un día del tablero, ya resuelto: qué canchas, qué horas y qué hay en cada celda. */
type BoardDay = {
  date: string
  dayCourts: Array<{ id: string; name: string }>
  times: number[]
  byCell: Map<string, Opening>
  chronological: Opening[]
}

type Props = {
  tournamentId: string
  slots: TournamentSlotRow[]
  matches: TournamentMatchView[]
  courts: Array<{ id: string; name: string }>
  matchDurationMinutes: number
  restBetweenMatchesMinutes: number
  rescheduleAction: RescheduleMatchAction
}

/** Clave de un hueco dentro de su día: cancha + instante. */
function cellKey(courtId: string, timeMs: number): string {
  return `${courtId}|${timeMs}`
}

export function PlanillaBoard({
  tournamentId,
  slots,
  matches,
  courts,
  matchDurationMinutes,
  restBetweenMatchesMinutes,
  rescheduleAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo(
    () => ({ matchDurationMinutes, restBetweenMatchesMinutes }),
    [matchDurationMinutes, restBetweenMatchesMinutes],
  )

  const openings = useMemo(
    () => openingsForMatch({ slots, matches, movingMatchId: movingId, options }),
    [slots, matches, movingId, options],
  )

  const courtName = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), [courts])

  const moving = movingId ? (matches.find((m) => m.id === movingId) ?? null) : null

  /**
   * Dónde se dibuja la ficha de cada partido. Un partido corrido a mano puede
   * pisar dos huecos; la ficha va en el primero y el segundo queda como
   * continuación, para no mostrar el mismo partido dos veces.
   */
  const chipAt = useMemo(() => {
    const out = new Map<string, TournamentMatchView>()
    const seen = new Set<string>()
    for (const opening of openings) {
      const match = opening.occupiedBy
      if (!match || seen.has(match.id)) continue
      seen.add(match.id)
      out.set(
        `${opening.slot.date}|${cellKey(opening.slot.courtId, opening.startsAt.getTime())}`,
        match as TournamentMatchView,
      )
    }
    return out
  }, [openings])

  const days = useMemo(() => {
    const byDate = new Map<string, Opening[]>()
    for (const opening of openings) {
      const list = byDate.get(opening.slot.date) ?? []
      list.push(opening)
      byDate.set(opening.slot.date, list)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => {
        const present = new Set(list.map((o) => o.slot.courtId))
        const times = [...new Set(list.map((o) => o.startsAt.getTime()))].sort((a, b) => a - b)
        const byCell = new Map(list.map((o) => [cellKey(o.slot.courtId, o.startsAt.getTime()), o]))
        return {
          date,
          // Orden de canchas del complejo, no orden de aparición.
          dayCourts: courts.filter((c) => present.has(c.id)),
          times,
          byCell,
          chronological: list,
        }
      })
  }, [openings, courts])

  const sinAgendar = useMemo(() => matches.filter((m) => m.startsAt === null), [matches])

  /**
   * Partidos con día y hora que no caen en ninguna hora del torneo — quedaron
   * fuera al liberar horarios. Sin esto el tablero los escondería, que es la
   * forma más silenciosa de perder un partido.
   */
  const fueraDeHorario = useMemo(() => {
    const shown = new Set<string>()
    for (const opening of openings) {
      if (opening.occupiedBy) shown.add(opening.occupiedBy.id)
    }
    return matches.filter((m) => m.startsAt !== null && !shown.has(m.id))
  }, [openings, matches])

  const cancelMove = useCallback(() => {
    setMovingId(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (!movingId) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelMove()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [movingId, cancelMove])

  function moveTo(opening: Opening) {
    if (!moving) return
    const label = matchLabel(moving)
    // Se captura ANTES de mover: es lo que necesita el "Deshacer". Un partido
    // que nunca estuvo agendado no tiene a dónde volver, así que ahí no se
    // ofrece — un botón que no hace nada es peor que no tenerlo.
    const previous =
      moving.courtId && moving.startsAt
        ? { courtId: moving.courtId, startsAt: moving.startsAt.toISOString() }
        : null

    setError(null)
    startTransition(async () => {
      const result = await rescheduleAction({
        matchId: moving.id,
        courtId: opening.slot.courtId,
        startsAt: opening.startsAt.toISOString(),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setMovingId(null)
      toast({
        title: 'Partido movido',
        description: `${label} · ${formatArtTime(opening.startsAt)} · ${courtName.get(opening.slot.courtId) ?? 'Cancha'}`,
        variant: 'success',
        ...(previous
          ? {
              action: {
                label: 'Deshacer',
                onClick: () => {
                  startTransition(async () => {
                    const undone = await rescheduleAction({
                      matchId: moving.id,
                      ...previous,
                    })
                    // Volver puede fallar: en el rato del toast alguien pudo
                    // haber puesto otro partido en el lugar que se liberó.
                    if (!undone.success) setError(undone.error)
                    router.refresh()
                  })
                },
              },
            }
          : {}),
      })
      router.refresh()
    })
  }

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="El torneo todavía no tiene horas tomadas"
        description="Los partidos se juegan adentro de las horas que el torneo ocupa en la grilla. Tomá horarios y después acomodá el fixture acá."
        action={
          <Link
            href={`/torneos/${tournamentId}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-10"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Tomar horarios
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {moving && (
        // Sin `sticky`: en mobile el aviso ocupa tres líneas y pegado arriba se
        // come un tercio de la pantalla tapando los propios destinos. Salir del
        // modo mover ya tiene dos caminos que no dependen de verlo: Escape, y
        // tocar cualquier destino completa la operación.
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 dark:border-emerald-400/30 dark:bg-emerald-500/10"
        >
          <Move
            className="h-4 w-4 shrink-0 text-emerald-800 dark:text-emerald-400"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            Moviendo <span className="font-semibold">{matchLabel(moving)}</span>. Elegí una hora del
            torneo.
          </p>
          <button
            type="button"
            onClick={cancelMove}
            disabled={pending}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 md:min-h-9"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <PendingRail
        title="Sin agendar"
        description="Estos partidos no entraron en las horas del torneo. Tomá más horarios o movelos a una hora con lugar."
        matches={sinAgendar}
        tournamentId={tournamentId}
        movingId={movingId}
        disabled={pending}
        onMove={setMovingId}
      />

      <PendingRail
        title="Fuera de las horas del torneo"
        description="Tienen día y hora, pero el torneo ya no ocupa esa hora en la grilla. Movelos a una hora vigente."
        matches={fueraDeHorario}
        tournamentId={tournamentId}
        movingId={movingId}
        disabled={pending}
        onMove={setMovingId}
      />

      {days.map((day) => (
        <PlanillaDay
          key={day.date}
          day={day}
          chipAt={chipAt}
          courtName={courtName}
          tournamentId={tournamentId}
          isMoving={movingId !== null}
          disabled={pending}
          onMove={setMovingId}
          onPlace={moveTo}
        />
      ))}
    </div>
  )
}

/**
 * Un día del tablero: matriz hora × cancha en `sm+`, lista cronológica en
 * mobile. Una matriz de dos dimensiones a 360px es ilegible, así que abajo de
 * `sm` la cancha pasa de ser una columna a ser una etiqueta de la fila.
 */
function PlanillaDay({
  day,
  chipAt,
  courtName,
  tournamentId,
  isMoving,
  disabled,
  onMove,
  onPlace,
}: {
  day: BoardDay
  chipAt: Map<string, TournamentMatchView>
  courtName: Map<string, string>
  tournamentId: string
  isMoving: boolean
  disabled: boolean
  onMove: (id: string) => void
  onPlace: (opening: Opening) => void
}) {
  const cellFor = (courtId: string, time: number) => ({
    opening: day.byCell.get(cellKey(courtId, time)),
    chip: chipAt.get(`${day.date}|${cellKey(courtId, time)}`),
  })

  return (
    <ResponsiveList
      header={
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
          <h3 className="font-medium text-foreground">{formatDateLong(day.date)}</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {day.chronological.length} {day.chronological.length === 1 ? 'lugar' : 'lugares'} ·{' '}
            {day.dayCourts.length} {day.dayCourts.length === 1 ? 'cancha' : 'canchas'}
          </p>
        </div>
      }
      table={
        <table
          className="w-full text-sm"
          style={{ minWidth: `${8 + day.dayCourts.length * 13}rem` }}
        >
          <caption className="sr-only">
            Horas del torneo el {formatDateLong(day.date)}, por cancha
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th
                scope="col"
                className="w-24 p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Hora
              </th>
              {day.dayCourts.map((court) => (
                <th
                  key={court.id}
                  scope="col"
                  className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {day.times.map((time) => (
              <tr key={time}>
                <th
                  scope="row"
                  className="p-2.5 pl-4 text-left align-top text-sm font-medium text-muted-foreground tabular-nums"
                >
                  {formatArtTime(new Date(time))}
                </th>
                {day.dayCourts.map((court) => {
                  const { opening, chip } = cellFor(court.id, time)
                  return (
                    <td key={court.id} className="p-2 align-top">
                      {opening ? (
                        <OpeningCell
                          opening={opening}
                          chip={chip}
                          tournamentId={tournamentId}
                          courtLabel={court.name}
                          isMoving={isMoving}
                          disabled={disabled}
                          onMove={onMove}
                          onPlace={onPlace}
                        />
                      ) : (
                        <span className="block px-1 py-2 text-xs text-muted-foreground">
                          El torneo no tiene esta hora
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
      cards={
        <ul className="divide-y divide-border">
          {day.chronological.map((opening) => {
            const label = courtName.get(opening.slot.courtId) ?? 'Cancha'
            return (
              <li
                key={`${opening.slot.courtId}-${opening.startsAt.getTime()}`}
                className="space-y-1.5 px-4 py-3"
              >
                <p className="text-xs font-medium text-muted-foreground tabular-nums">
                  {formatArtTime(opening.startsAt)} · {label}
                </p>
                <OpeningCell
                  opening={opening}
                  chip={cellFor(opening.slot.courtId, opening.startsAt.getTime()).chip}
                  tournamentId={tournamentId}
                  courtLabel={label}
                  isMoving={isMoving}
                  disabled={disabled}
                  onMove={onMove}
                  onPlace={onPlace}
                />
              </li>
            )
          })}
        </ul>
      }
    />
  )
}

function matchLabel(match: { homeTeamName: string | null; awayTeamName: string | null }): string {
  return `${match.homeTeamName ?? 'A definir'} vs ${match.awayTeamName ?? 'A definir'}`
}

/** Riel de partidos que no están en el tablero: sin agendar o fuera de hora. */
function PendingRail({
  title,
  description,
  matches,
  tournamentId,
  movingId,
  disabled,
  onMove,
}: {
  title: string
  description: string
  matches: TournamentMatchView[]
  tournamentId: string
  movingId: string | null
  disabled: boolean
  onMove: (id: string) => void
}) {
  if (matches.length === 0) return null

  return (
    <section className="rounded-xl border border-warning/40 bg-warning/10 p-4 dark:border-warning/30 dark:bg-amber-500/10">
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        {title} <span className="tabular-nums">({matches.length})</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {matches.map((match) => (
          <li key={match.id}>
            <MatchCard
              match={match}
              tournamentId={tournamentId}
              isBeingMoved={movingId === match.id}
              disabled={disabled}
              onMove={onMove}
              moveLabel={match.startsAt ? 'Mover' : 'Ubicar'}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ficha de un partido: quiénes juegan, cómo va, y el botón para moverlo. */
function MatchCard({
  match,
  tournamentId,
  isBeingMoved,
  disabled,
  onMove,
  moveLabel = 'Mover',
}: {
  match: TournamentMatchView
  tournamentId: string
  isBeingMoved: boolean
  disabled: boolean
  onMove: (id: string) => void
  moveLabel?: string
}) {
  const action = isBeingMoved ? 'Moviendo…' : moveLabel
  return (
    <div
      className={`min-w-0 rounded-lg border bg-card px-2.5 py-2 ${
        isBeingMoved ? 'border-primary ring-2 ring-ring' : 'border-border'
      }`}
    >
      <Link
        href={`/torneos/${tournamentId}/partidos/${match.id}`}
        className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
      >
        {matchLabel(match)}
      </Link>
      <div className="mt-1 flex items-center gap-2">
        {match.status === 'scheduled' ? (
          <span className="text-xs text-muted-foreground">Sin jugar</span>
        ) : (
          <>
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {formatScore(match.homeScore, match.awayScore)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${matchStatusBadgeClass(match.status)}`}
            >
              {MATCH_STATUS_LABELS[match.status]}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => onMove(match.id)}
          disabled={disabled || isBeingMoved}
          // El nombre accesible nombra al partido (hay muchos "Mover" en la
          // pantalla) y arranca con la etiqueta visible, que es lo que pide
          // WCAG 2.5.3. Va como aria-label y no como <span class="sr-only">
          // para no duplicar el texto del partido en el DOM.
          aria-label={`${action} ${matchLabel(match)}`}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-500/15 md:min-h-8"
        >
          <Move className="h-3.5 w-3.5" aria-hidden="true" />
          {action}
        </button>
      </div>
    </div>
  )
}

/** Qué muestra un hueco del tablero según su estado. */
function OpeningCell({
  opening,
  chip,
  tournamentId,
  courtLabel,
  isMoving,
  disabled,
  onMove,
  onPlace,
}: {
  opening: Opening
  chip: TournamentMatchView | undefined
  tournamentId: string
  courtLabel: string
  isMoving: boolean
  disabled: boolean
  onMove: (id: string) => void
  onPlace: (opening: Opening) => void
}) {
  // Un partido corrido a mano puede pisar dos huecos: la ficha va en el
  // primero y acá se dice qué partido lo está tomando, que es la única forma
  // de entender por qué este lugar no está libre si no se ve ninguna ficha.
  if (opening.occupiedBy && !chip) {
    return (
      <span className="flex items-start gap-1.5 px-1 py-2 text-xs text-muted-foreground">
        <Ban className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {opening.reason}
      </span>
    )
  }

  if (chip) {
    return (
      <div className="space-y-1">
        <MatchCard
          match={chip}
          tournamentId={tournamentId}
          isBeingMoved={opening.status === 'current'}
          disabled={disabled}
          onMove={onMove}
        />
        {opening.status === 'current' && (
          <p className="px-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
            Está acá ahora
          </p>
        )}
      </div>
    )
  }

  if (!isMoving) {
    return <span className="block px-1 py-2 text-xs text-muted-foreground">Libre</span>
  }

  if (opening.status === 'free') {
    return (
      <button
        type="button"
        onClick={() => onPlace(opening)}
        disabled={disabled}
        aria-label={`Mover el partido acá: ${formatArtTime(opening.startsAt)}, ${courtLabel}`}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary bg-primary/5 px-2 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:border-emerald-400/60 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
      >
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        Mover acá
      </button>
    )
  }

  return (
    <span className="flex items-start gap-1.5 px-1 py-2 text-xs text-muted-foreground">
      <Ban className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {opening.reason}
    </span>
  )
}
