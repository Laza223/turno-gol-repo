import { AlertTriangle } from 'lucide-react'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { EmptyState } from '@/components/ui/empty-state'
import type { StandingsGroup } from '@/modules/tournaments/standings/types'
import { decidedByLabel, formatGoalDiff, qualificationBadgeClass } from '../../torneos-lib'

/**
 * Tabla de posiciones, una por zona.
 *
 * `advancePerGroup` dibuja la línea de clasificación. La columna de equipo va
 * sticky porque son 10 columnas y en mobile no entran.
 */
export function PosicionesTable({
  groups,
  advancePerGroup,
}: {
  groups: StandingsGroup[]
  advancePerGroup?: number | null
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay tabla"
        description="La tabla se arma sola con los resultados que vayas cargando."
      />
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ResponsiveList
          key={`${group.stageId}-${group.groupLabel ?? ''}`}
          header={
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-medium text-foreground">
                {group.groupLabel ? `Zona ${group.groupLabel}` : 'Posiciones'}
              </h3>
            </div>
          }
          cards={
            <ul className="divide-y divide-border">
              {group.rows.map((row) => (
                <li key={row.teamId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                    {row.position}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {row.teamName}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {row.points}
                  </span>
                </li>
              ))}
            </ul>
          }
          table={
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    #
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Equipo
                  </th>
                  {[
                    ['PJ', 'Partidos jugados'],
                    ['G', 'Ganados'],
                    ['E', 'Empatados'],
                    ['P', 'Perdidos'],
                    ['GF', 'Goles a favor'],
                    ['GC', 'Goles en contra'],
                    ['DG', 'Diferencia de gol'],
                    ['Pts', 'Puntos'],
                  ].map(([short, full]) => (
                    <th
                      key={short}
                      scope="col"
                      title={full}
                      className="p-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {group.rows.map((row) => {
                  const qualifies = advancePerGroup != null && row.position <= advancePerGroup
                  const isCutLine = advancePerGroup != null && row.position === advancePerGroup
                  return (
                    <tr
                      key={row.teamId}
                      className={`transition-colors hover:bg-accent/50 ${
                        isCutLine ? 'border-b-2 border-b-success/40' : ''
                      }`}
                    >
                      <td className="p-2.5 pl-4 tabular-nums text-muted-foreground">
                        {row.position}
                      </td>
                      <td className="sticky left-0 z-10 bg-card p-2.5">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{row.teamName}</span>
                          {qualifies ? (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${qualificationBadgeClass}`}
                            >
                              Clasifica
                            </span>
                          ) : null}
                          {row.teamStatus === 'withdrawn' ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              Se bajó
                            </span>
                          ) : null}
                          {row.teamStatus === 'disqualified' ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-red-700 dark:text-red-300">
                              Descalificado
                            </span>
                          ) : null}
                          {row.unresolvedTie ? (
                            <span
                              title="Ningún criterio de desempate los separa. Si están en el puesto de corte, definí el sorteo desde “Cerrar zonas y sortear cruces”."
                              className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              Empate sin resolver
                            </span>
                          ) : null}
                        </span>
                        {decidedByLabel(row.decidedBy) ? (
                          <span className="sr-only">{decidedByLabel(row.decidedBy)}</span>
                        ) : null}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.played}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.won}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.drawn}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.lost}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.goalsFor}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {row.goalsAgainst}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                        {formatGoalDiff(row.goalDiff)}
                      </td>
                      <td className="p-2.5 pr-4 text-right font-semibold tabular-nums text-foreground">
                        {row.points}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          }
        />
      ))}
    </div>
  )
}
