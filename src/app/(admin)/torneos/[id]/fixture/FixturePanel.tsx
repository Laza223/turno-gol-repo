'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CalendarPlus, Trash2, Trophy } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import type {
  TournamentFormat,
  TournamentMatchView,
  TournamentStageRow,
} from '@/modules/tournaments/tournament.types'
import type { GenerateFixtureActionResult, TournamentActionResult } from '../../actions'
import {
  MATCH_STATUS_LABELS,
  formatMatchWhen,
  formatScore,
  matchStatusBadgeClass,
  roundLabel,
} from '../../torneos-lib'

export type GenerateFixtureAction = (
  input: unknown,
) => Promise<GenerateFixtureActionResult>
export type ClearFixtureAction = (input: unknown) => Promise<TournamentActionResult>

const LEGS_OPTIONS: ComboboxOption[] = [
  { value: '1', label: 'Solo ida', hint: 'Cada equipo juega una vez contra cada rival' },
  { value: '2', label: 'Ida y vuelta', hint: 'El doble de fechas' },
]

const GROUPS_OPTIONS: ComboboxOption[] = [2, 3, 4, 6, 8].map((n) => ({
  value: String(n),
  label: `${n} zonas`,
}))

const ADVANCE_OPTIONS: ComboboxOption[] = [1, 2, 4].map((n) => ({
  value: String(n),
  label: n === 1 ? 'Clasifica 1 por zona' : `Clasifican ${n} por zona`,
}))

export function FixturePanel({
  tournamentId,
  format,
  stages,
  matches,
  generateAction,
  clearAction,
}: {
  tournamentId: string
  format: TournamentFormat
  stages: TournamentStageRow[]
  matches: TournamentMatchView[]
  generateAction: GenerateFixtureAction
  clearAction: ClearFixtureAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [legs, setLegs] = useState('1')
  const [groupsCount, setGroupsCount] = useState('2')
  const [advance, setAdvance] = useState('2')
  const [thirdPlace, setThirdPlace] = useState(false)

  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages],
  )

  /** Rondas máximas por fase: hace falta para nombrar "Semifinal" y compañía. */
  const totalRoundsByStage = useMemo(() => {
    const out = new Map<string, number>()
    for (const m of matches) {
      out.set(m.stageId, Math.max(out.get(m.stageId) ?? 0, m.round))
    }
    return out
  }, [matches])

  /** Partidos agrupados por fase y ronda, en el orden en que se juegan. */
  const grouped = useMemo(() => {
    const out: Array<{ key: string; title: string; rows: TournamentMatchView[] }> = []
    for (const m of matches) {
      const stage = stageById.get(m.stageId)
      const kind = stage?.kind ?? 'league'
      const label = roundLabel(m.round, kind, totalRoundsByStage.get(m.stageId) ?? m.round)
      const title = m.groupLabel
        ? `${stage?.name ?? ''} · Zona ${m.groupLabel} · ${label}`
        : stages.length > 1
          ? `${stage?.name ?? ''} · ${label}`
          : label
      const key = `${m.stageId}:${m.groupLabel ?? ''}:${m.round}`
      const bucket = out.find((g) => g.key === key)
      if (bucket) bucket.rows.push(m)
      else out.push({ key, title, rows: [m] })
    }
    return out
  }, [matches, stageById, stages.length, totalRoundsByStage])

  function handleGenerate() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await generateAction({
        tournamentId,
        legs: Number(legs) as 1 | 2,
        ...(format === 'groups_playoff'
          ? {
              groupsCount: Number(groupsCount),
              teamsAdvancePerGroup: Number(advance),
            }
          : {}),
        thirdPlace,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setNotice(
        result.unscheduled > 0
          ? `Se generaron ${result.matches} partidos, pero ${result.unscheduled} quedaron sin día ni hora: no alcanzan las horas tomadas. Tomá más horarios y movelos a mano.`
          : `Se generaron ${result.matches} partidos y todos entraron en los horarios del torneo.`,
      )
      router.refresh()
    })
  }

  function handleClear() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await clearAction({ tournamentId })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  /**
   * Feedback compartido por las dos ramas. Vive acá afuera a propósito: el
   * aviso de "N partidos quedaron sin agendar" se emite generando DESDE la
   * rama vacía, y si solo se renderizara en la rama con fixture se perdería —
   * que es justo el mensaje que el admin no se puede perder.
   */
  const feedback = (
    <>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {notice}
        </div>
      )}
    </>
  )

  if (matches.length === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Generar el fixture
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Arma el calendario con los equipos anotados y lo reparte en las horas que el
              torneo ya tiene tomadas. Después podés mover cualquier partido a mano.
            </p>
          </div>

          {format !== 'knockout' && (
            <div className="space-y-1.5">
              <label htmlFor="fixture-legs" className="text-sm font-medium text-foreground">
                Vueltas
              </label>
              <Combobox
                id="fixture-legs"
                options={LEGS_OPTIONS}
                value={legs}
                onChange={setLegs}
                listboxLabel="Cantidad de vueltas"
              />
            </div>
          )}

          {format === 'groups_playoff' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="fixture-zonas" className="text-sm font-medium text-foreground">
                  Zonas
                </label>
                <Combobox
                  id="fixture-zonas"
                  options={GROUPS_OPTIONS}
                  value={groupsCount}
                  onChange={setGroupsCount}
                  listboxLabel="Cantidad de zonas"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fixture-clasifican" className="text-sm font-medium text-foreground">
                  Clasificados
                </label>
                <Combobox
                  id="fixture-clasifican"
                  options={ADVANCE_OPTIONS}
                  value={advance}
                  onChange={setAdvance}
                  listboxLabel="Equipos que clasifican por zona"
                />
              </div>
            </div>
          )}

          {format !== 'league' && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={thirdPlace}
                onChange={(e) => setThirdPlace(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              Jugar el partido por el tercer puesto
            </label>
          )}

          {feedback}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {pending ? 'Generando…' : 'Generar fixture'}
          </button>
        </div>

        <EmptyState
          icon={Trophy}
          title="Todavía no hay fixture"
          description="Anotá los equipos y tomá los horarios; después generá el calendario de partidos."
        />
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {matches.length} {matches.length === 1 ? 'partido' : 'partidos'}
          {matches.filter((m) => m.startsAt === null).length > 0 &&
            ` · ${matches.filter((m) => m.startsAt === null).length} sin agendar`}
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Borrar fixture
        </button>
      </div>

      {feedback}

      {grouped.map((group) => (
        <ResponsiveList
          key={group.key}
          header={
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-medium text-foreground">{group.title}</h3>
            </div>
          }
          cards={
            <ul className="divide-y divide-border">
              {group.rows.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <Link
                    href={`/torneos/${tournamentId}/partidos/${m.id}`}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {m.homeTeamName ?? 'A definir'} vs {m.awayTeamName ?? 'A definir'}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {formatMatchWhen(m.startsAt)}
                    {m.courtName ? ` · ${m.courtName}` : ''}
                    {' · '}
                    {MATCH_STATUS_LABELS[m.status]}
                  </p>
                </li>
              ))}
            </ul>
          }
          table={
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Local
                  </th>
                  <th className="p-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Resultado
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Visitante
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Día y hora
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cancha
                  </th>
                  <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {group.rows.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-accent/50">
                    <td className="p-2.5 pl-4 font-medium text-foreground">
                      {m.homeTeamName ?? (
                        <span className="text-muted-foreground">A definir</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-foreground">
                      {formatScore(m.homeScore, m.awayScore)}
                    </td>
                    <td className="p-2.5 font-medium text-foreground">
                      {m.awayTeamName ?? (
                        <span className="text-muted-foreground">A definir</span>
                      )}
                    </td>
                    <td className="p-2.5 tabular-nums text-muted-foreground">
                      {formatMatchWhen(m.startsAt)}
                    </td>
                    <td className="p-2.5 text-muted-foreground">{m.courtName ?? '—'}</td>
                    <td className="p-2.5 pr-4 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${matchStatusBadgeClass(m.status)}`}
                      >
                        {MATCH_STATUS_LABELS[m.status]}
                      </span>
                      <Link
                        href={`/torneos/${tournamentId}/partidos/${m.id}`}
                        className="ml-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Acta
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      ))}
    </section>
  )
}
