import type {
  TournamentMatchView,
  TournamentStageRow,
} from '@/modules/tournaments/tournament.types'
import {
  MATCH_STATUS_LABELS,
  formatMatchWhen,
  formatScore,
  matchStatusBadgeClass,
  roundLabel,
} from '@/app/(admin)/torneos/torneos-lib'

/**
 * Fixture público, agrupado por fase y fecha.
 *
 * Los partidos de llave sin equipos definidos SÍ se muestran ("A definir"): en
 * un cuadro publicado el hueco es información — dice cuándo se juega la semi
 * aunque todavía no se sepa quién.
 */
export function PublicFixture({
  matches,
  stages,
  knockoutStageIds,
}: {
  matches: TournamentMatchView[]
  stages: TournamentStageRow[]
  knockoutStageIds: Set<string>
}) {
  if (matches.length === 0) return null

  const stageById = new Map(stages.map((s) => [s.id, s]))
  // Rondas por fase: `roundLabel` necesita el total para saber cuál es la final.
  const totalRounds = new Map<string, number>()
  for (const m of matches) {
    totalRounds.set(m.stageId, Math.max(totalRounds.get(m.stageId) ?? 0, m.round))
  }

  // Orden: fase (order_index) y después ronda. `listFixture` ya viene ordenado
  // por ronda, pero no por fase — un torneo con zonas + playoffs las mezclaría.
  const blocks = new Map<string, TournamentMatchView[]>()
  for (const m of matches) {
    const key = `${m.stageId}::${m.round}`
    const bucket = blocks.get(key)
    if (bucket) bucket.push(m)
    else blocks.set(key, [m])
  }
  const orderedKeys = [...blocks.keys()].sort((a, b) => {
    const [stageA, roundA] = a.split('::')
    const [stageB, roundB] = b.split('::')
    const orderA = stageById.get(stageA!)?.orderIndex ?? 0
    const orderB = stageById.get(stageB!)?.orderIndex ?? 0
    return orderA - orderB || Number(roundA) - Number(roundB)
  })

  return (
    <section aria-labelledby="fixture-heading" className="space-y-4">
      <h2
        id="fixture-heading"
        className="font-display text-xl font-bold tracking-tight text-foreground"
      >
        Fixture
      </h2>

      {orderedKeys.map((key) => {
        const [stageId, roundStr] = key.split('::')
        const stage = stageById.get(stageId!)
        const round = Number(roundStr)
        const kind = knockoutStageIds.has(stageId!) ? 'knockout' : (stage?.kind ?? 'league')
        const heading = roundLabel(round, kind, totalRounds.get(stageId!) ?? round)

        return (
          <div key={key} className="rounded-lg border border-border bg-card">
            <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
              <h3 className="font-medium text-foreground">{heading}</h3>
              {stage && stages.length > 1 ? (
                <span className="text-xs text-muted-foreground">{stage.name}</span>
              ) : null}
            </div>
            <ul className="divide-y divide-border">
              {blocks.get(key)!.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-foreground">
                      {m.homeTeamName ?? 'A definir'}
                    </span>
                    <span className="mx-1.5 text-muted-foreground">vs</span>
                    <span className="font-medium text-foreground">
                      {m.awayTeamName ?? 'A definir'}
                    </span>
                    {m.groupLabel ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Zona {m.groupLabel}
                      </span>
                    ) : null}
                  </span>

                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatScore(m.homeScore, m.awayScore)}
                  </span>

                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMatchWhen(m.startsAt)}
                    {m.courtName ? ` · ${m.courtName}` : ''}
                  </span>

                  {/* Solo lo que no se deduce del marcador: 'Jugado' con un 3-1
                      al lado es ruido, pero 'No se presentó' o 'Postergado' no. */}
                  {m.status !== 'scheduled' && m.status !== 'played' ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${matchStatusBadgeClass(m.status)}`}
                    >
                      {MATCH_STATUS_LABELS[m.status]}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
