'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ResponsiveList } from '@/components/ui/responsive-list'
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
} from '../../torneos-lib'

/**
 * El fixture como listado, agrupado por fase y fecha.
 *
 * Es la vista para LEER (¿cómo salió la fecha 3?, ¿quién juega la semi?): una
 * fila por partido, en el orden en que se juegan, con el resultado a la vista.
 * Para MOVER partidos está la Planilla, que es la vista por defecto.
 *
 * Extraído tal cual de `FixturePanel` cuando entró la Planilla (B16): mismo
 * markup, cero cambios de comportamiento.
 */
export function FixtureListado({
  tournamentId,
  stages,
  matches,
}: {
  tournamentId: string
  stages: TournamentStageRow[]
  matches: TournamentMatchView[]
}) {
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])

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

  return (
    <div className="space-y-4">
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
                      {m.homeTeamName ?? <span className="text-muted-foreground">A definir</span>}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-foreground">
                      {formatScore(m.homeScore, m.awayScore)}
                    </td>
                    <td className="p-2.5 font-medium text-foreground">
                      {m.awayTeamName ?? <span className="text-muted-foreground">A definir</span>}
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
    </div>
  )
}
