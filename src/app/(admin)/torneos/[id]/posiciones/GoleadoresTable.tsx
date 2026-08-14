import { EmptyState } from '@/components/ui/empty-state'
import type { TopScorersResult } from '@/modules/tournaments/tournament.types'

/**
 * Tabla de goleadores.
 *
 * El marcador y el acta pueden diferir por diseño: el complejo carga el 3-1 y
 * después, si quiere, los goleadores. El faltante se AVISA, no se bloquea —
 * obligar a cerrar el acta trabaría al encargado un sábado.
 */
export function GoleadoresTable({ scorers }: { scorers: TopScorersResult }) {
  if (scorers.rows.length === 0) {
    // El aviso de goles sin autor vivía SOLO en el footer de la tabla real, o sea
    // en código inalcanzable mientras no hubiera ni un goleador cargado — que es
    // justo el caso en que más falta hace (🟡 QA 2026-08-13). Con partidos ya
    // jugados y ningún autor cargado, la pantalla decía "todavía no hay
    // goleadores" y no mencionaba los goles pendientes de atribuir.
    return (
      <EmptyState
        title="Todavía no hay goleadores"
        description={
          scorers.unattributedGoals > 0
            ? `Hay ${scorers.unattributedGoals} gol(es) en el marcador sin autor cargado. Anotá quién los hizo desde el acta de cada partido y la tabla se arma sola.`
            : 'Cargá los goles desde el acta de cada partido y la tabla se arma sola.'
        }
      />
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-medium text-foreground">Goleadores</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jugador
              </th>
              <th className="p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Equipo
              </th>
              <th className="p-2 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Goles
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scorers.rows.map((row, i) => (
              <tr key={row.teamPlayerId}>
                <td className="p-2 pl-4 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="p-2 font-medium text-foreground">
                  {row.playerName}
                  {row.shirtNumber !== null ? (
                    <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                      #{row.shirtNumber}
                    </span>
                  ) : null}
                </td>
                <td className="p-2 text-muted-foreground">{row.teamName}</td>
                <td className="p-2 pr-4 text-right font-semibold tabular-nums text-foreground">
                  {row.goals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scorers.unattributedGoals > 0 ? (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          Faltan {scorers.unattributedGoals} gol(es) sin autor: están en el marcador pero todavía no
          se cargó quién los hizo.
        </p>
      ) : null}
    </div>
  )
}
