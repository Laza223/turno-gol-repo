import { ResponsiveList } from '@/components/ui/responsive-list'
import type { StandingsGroup } from '@/modules/tournaments/standings/types'
import { formatGoalDiff, qualificationBadgeClass } from '@/app/(admin)/torneos/torneos-lib'

/**
 * Tabla de posiciones pública.
 *
 * Deliberadamente NO es `PosicionesTable` del panel: esa avisa "Empate sin
 * resolver — cargales el número de siembra", que es una instrucción para el
 * complejo. Acá un empate sin resolver se muestra como lo que es para el que
 * mira: dos equipos en la misma línea, sin pedirle nada a nadie.
 */
export function PublicPosiciones({
  groups,
  advancePerGroup,
}: {
  groups: StandingsGroup[]
  advancePerGroup: number | null
}) {
  if (groups.length === 0) return null

  return (
    <section aria-labelledby="posiciones-heading" className="space-y-4">
      <h2
        id="posiciones-heading"
        className="font-display text-xl font-bold tracking-tight text-foreground"
      >
        Posiciones
      </h2>

      {groups.map((group) => (
        <ResponsiveList
          key={`${group.stageId}-${group.groupLabel ?? ''}`}
          header={
            group.groupLabel ? (
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-medium text-foreground">Zona {group.groupLabel}</h3>
              </div>
            ) : undefined
          }
          cards={
            <ul className="divide-y divide-border">
              {group.rows.map((row) => (
                <li key={row.teamId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                    {row.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {row.teamName}
                    </span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {row.played} PJ · {formatGoalDiff(row.goalDiff)} DG
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {row.points}
                  </span>
                </li>
              ))}
            </ul>
          }
          table={
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">
                {group.groupLabel ? `Tabla de la zona ${group.groupLabel}` : 'Tabla de posiciones'}
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th
                    scope="col"
                    className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    #
                  </th>
                  <th
                    scope="col"
                    className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
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
                      className={isCutLine ? 'border-b-2 border-b-success/40' : ''}
                    >
                      <td className="p-2.5 pl-4 tabular-nums text-muted-foreground">
                        {row.position}
                      </td>
                      <td className="p-2.5">
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
                        </span>
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
    </section>
  )
}
