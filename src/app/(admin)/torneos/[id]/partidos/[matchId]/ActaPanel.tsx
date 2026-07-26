'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, Ban, Plus, Trash2 } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import type {
  TournamentEventType,
  TournamentMatchEventView,
  TournamentMatchView,
  TournamentStageKind,
  TournamentTeamPlayerRow,
} from '@/modules/tournaments/tournament.types'
import type { TournamentActionResult } from '../../../actions'
import { EVENT_TYPE_LABELS, eventTypeBadgeClass, formatScore } from '../../../torneos-lib'

export type ResultAction = (input: unknown) => Promise<TournamentActionResult>

const EVENT_TYPE_OPTIONS: ComboboxOption[] = (
  ['goal', 'own_goal', 'yellow_card', 'red_card'] as const
).map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))

/** Plantel de cada equipo, para elegir el autor del gol o la tarjeta. */
export type ActaRoster = {
  teamId: string
  teamName: string
  players: TournamentTeamPlayerRow[]
}

export function ActaPanel({
  match,
  stageKind,
  events,
  rosters,
  suspendedPlayerIds,
  saveResultAction,
  walkoverAction,
  clearResultAction,
  addEventAction,
  deleteEventAction,
}: {
  match: TournamentMatchView
  stageKind: TournamentStageKind
  events: TournamentMatchEventView[]
  rosters: ActaRoster[]
  /** Jugadores del acta que arrastran fechas: se AVISA, no se bloquea. */
  suspendedPlayerIds: string[]
  saveResultAction: ResultAction
  walkoverAction: ResultAction
  clearResultAction: ResultAction
  addEventAction: ResultAction
  deleteEventAction: ResultAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [homeScore, setHomeScore] = useState(String(match.homeScore ?? 0))
  const [awayScore, setAwayScore] = useState(String(match.awayScore ?? 0))
  const [homePenalties, setHomePenalties] = useState(
    match.homePenalties === null ? '' : String(match.homePenalties),
  )
  const [awayPenalties, setAwayPenalties] = useState(
    match.awayPenalties === null ? '' : String(match.awayPenalties),
  )

  const [eventTeamId, setEventTeamId] = useState(rosters[0]?.teamId ?? '')
  const [eventPlayerId, setEventPlayerId] = useState('')
  const [eventType, setEventType] = useState<TournamentEventType>('goal')
  const [minute, setMinute] = useState('')

  const isKnockout = stageKind === 'knockout'
  const isDraw = homeScore === awayScore
  const undefinedTeams = match.homeTeamId === null || match.awayTeamId === null

  const run = (fn: () => Promise<TournamentActionResult>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  const roster = rosters.find((r) => r.teamId === eventTeamId)
  const suspendedInActa = events.filter(
    (e) => e.teamPlayerId !== null && suspendedPlayerIds.includes(e.teamPlayerId),
  )

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      {undefinedTeams ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          Todavía no se sabe qué equipos juegan este partido: primero se tiene que definir la
          llave.
        </p>
      ) : null}

      {suspendedInActa.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Hay {suspendedInActa.length} jugador(es) en el acta que arrastran fechas de
            suspensión. Es un aviso: si el árbitro los dejó jugar, el resultado vale.
          </span>
        </p>
      ) : null}

      {/* ── Marcador ── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-medium text-foreground">Resultado</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[140px]">
            <span className="mb-1 block text-xs text-muted-foreground">
              {match.homeTeamName ?? 'Local'}
            </span>
            <input
              type="number"
              min={0}
              max={99}
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              disabled={undefinedTeams}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex-1 min-w-[140px]">
            <span className="mb-1 block text-xs text-muted-foreground">
              {match.awayTeamName ?? 'Visitante'}
            </span>
            <input
              type="number"
              min={0}
              max={99}
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              disabled={undefinedTeams}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
        </div>

        {/* Los penales solo tienen sentido en una llave empatada. */}
        {isKnockout && isDraw ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
            <p className="w-full text-xs text-muted-foreground">
              Una llave no puede terminar empatada: cargá la definición por penales.
            </p>
            <label className="flex-1 min-w-[140px]">
              <span className="mb-1 block text-xs text-muted-foreground">Penales local</span>
              <input
                type="number"
                min={0}
                value={homePenalties}
                onChange={(e) => setHomePenalties(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="flex-1 min-w-[140px]">
              <span className="mb-1 block text-xs text-muted-foreground">
                Penales visitante
              </span>
              <input
                type="number"
                min={0}
                value={awayPenalties}
                onChange={(e) => setAwayPenalties(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              />
            </label>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || undefinedTeams}
            onClick={() =>
              run(() =>
                saveResultAction({
                  matchId: match.id,
                  homeScore: Number(homeScore),
                  awayScore: Number(awayScore),
                  homePenalties: homePenalties === '' ? null : Number(homePenalties),
                  awayPenalties: awayPenalties === '' ? null : Number(awayPenalties),
                }),
              )
            }
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            Guardar resultado
          </button>

          {rosters.map((r) => (
            <button
              key={r.teamId}
              type="button"
              disabled={pending || undefinedTeams}
              onClick={() =>
                run(() => walkoverAction({ matchId: match.id, winnerTeamId: r.teamId }))
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Ganó {r.teamName} por no presentación
            </button>
          ))}

          {match.status !== 'scheduled' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => clearResultAction({ matchId: match.id }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Borrar resultado
            </button>
          ) : null}
        </div>

        {match.status !== 'scheduled' ? (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            Cargado: {formatScore(match.homeScore, match.awayScore)}
          </p>
        ) : null}
      </div>

      {/* ── Acta ── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Acta del partido</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Goles y tarjetas. Un evento cargado por error se borra; queda registro en la
            auditoría.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay goles ni tarjetas cargados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${eventTypeBadgeClass(ev.type)}`}
                >
                  {EVENT_TYPE_LABELS[ev.type]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {ev.playerName ?? 'Sin autor'}
                  <span className="ml-1.5 text-xs text-muted-foreground">{ev.teamName}</span>
                </span>
                {ev.minute !== null ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {ev.minute}&apos;
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Borrar ${EVENT_TYPE_LABELS[ev.type].toLowerCase()} de ${ev.playerName ?? 'sin autor'}`}
                  disabled={pending}
                  onClick={() => run(() => deleteEventAction({ eventId: ev.id }))}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Alta de evento */}
        <div className="flex flex-wrap items-end gap-2 border-t border-border p-4">
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <label htmlFor="acta-equipo" className="text-sm font-medium text-foreground">
              Equipo
            </label>
            <Combobox
              id="acta-equipo"
              value={eventTeamId}
              onChange={(v) => {
                setEventTeamId(v)
                setEventPlayerId('')
              }}
              options={rosters.map((r) => ({ value: r.teamId, label: r.teamName }))}
              listboxLabel="Equipo del evento"
            />
          </div>
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <label htmlFor="acta-jugador" className="text-sm font-medium text-foreground">
              Jugador
            </label>
            <Combobox
              id="acta-jugador"
              value={eventPlayerId}
              onChange={setEventPlayerId}
              options={(roster?.players ?? []).map((p) => ({
                value: p.id,
                label: p.fullName,
                hint: p.shirtNumber !== null ? `#${p.shirtNumber}` : undefined,
              }))}
              listboxLabel="Jugador del evento"
              emptyMessage="Ese equipo no tiene plantel cargado"
            />
          </div>
          <div className="min-w-[130px] flex-1 space-y-1.5">
            <label htmlFor="acta-tipo" className="text-sm font-medium text-foreground">
              Tipo
            </label>
            <Combobox
              id="acta-tipo"
              value={eventType}
              onChange={(v) => setEventType(v as TournamentEventType)}
              options={EVENT_TYPE_OPTIONS}
              listboxLabel="Tipo de evento"
            />
          </div>
          <label className="w-20 space-y-1.5">
            <span className="block text-sm font-medium text-foreground">Minuto</span>
            <input
              type="number"
              min={0}
              max={200}
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            disabled={pending || eventTeamId === '' || undefinedTeams}
            onClick={() =>
              run(() =>
                addEventAction({
                  matchId: match.id,
                  teamId: eventTeamId,
                  teamPlayerId: eventPlayerId === '' ? null : eventPlayerId,
                  type: eventType,
                  minute: minute === '' ? null : Number(minute),
                }),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
