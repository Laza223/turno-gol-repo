import { ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Th, Td, Tr } from '@/components/ui/table'
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
      {/* H170: 420px de ancho mínimo no entra a 393px — sin esta pista, "Goles"
          queda fuera de vista sin ningún indicio de que se puede arrastrar
          (mismo problema que ScrollTabs ya resuelve con fade en scroll-tabs.tsx,
          acá estático porque la tabla es server component sin tracking de
          scroll). */}
      <div className="relative">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th className="pl-4">#</Th>
                <Th>Jugador</Th>
                <Th>Equipo</Th>
                <Th align="right" className="pr-4">
                  Goles
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scorers.rows.map((row, i) => (
                <Tr key={row.teamPlayerId}>
                  <Td className="pl-4 tabular-nums text-muted-foreground">{i + 1}</Td>
                  <Td className="font-medium text-foreground">
                    {row.playerName}
                    {row.shirtNumber !== null ? (
                      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                        #{row.shirtNumber}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-muted-foreground">{row.teamName}</Td>
                  <Td numeric className="pr-4 font-semibold">
                    {row.goals}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-card to-transparent pr-1"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
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
