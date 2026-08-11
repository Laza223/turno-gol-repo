import type { TopScorersResult } from '@/modules/tournaments/tournament.types'

/**
 * Goleadores.
 *
 * Es la única parte del portal que publica nombres de personas, y por eso se
 * limita a los que efectivamente hicieron un gol: la lista completa de los
 * planteles no se publica (ver tournament-public.service.ts).
 *
 * Los goles sin autor NO se muestran acá: al que mira desde afuera no le
 * importa que el complejo no haya terminado de cargar el acta. Eso es un aviso
 * del panel, no del portal.
 */
export function PublicGoleadores({ scorers }: { scorers: TopScorersResult }) {
  if (scorers.rows.length === 0) return null

  return (
    <section aria-labelledby="goleadores-heading" className="space-y-4">
      <h2
        id="goleadores-heading"
        className="font-display text-xl font-bold tracking-tight text-foreground"
      >
        Goleadores
      </h2>

      <div className="rounded-lg border border-border bg-card">
        <ul className="divide-y divide-border">
          {scorers.rows.map((row, i) => (
            <li key={row.teamPlayerId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.playerName}
                  {row.shirtNumber !== null ? (
                    <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                      #{row.shirtNumber}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{row.teamName}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {row.goals}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
