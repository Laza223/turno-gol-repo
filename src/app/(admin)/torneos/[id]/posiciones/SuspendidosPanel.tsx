import { EmptyState } from '@/components/ui/empty-state'
import type { SuspensionRow } from '@/modules/tournaments/standings/suspensions'
import { StatusBadge } from '@/components/ui/status-badge'
import { SUSPENSION_VISUAL } from '@/lib/tournaments/status-visual'
import { SUSPENSION_REASON_LABELS } from '../../torneos-lib'

export type SuspendidoView = SuspensionRow & {
  playerName: string
  teamName: string
}

/**
 * Quién no puede jugar la próxima fecha.
 *
 * Se deriva del acta: borrar la amarilla que estaba mal cargada des-suspende al
 * jugador sin ningún recálculo.
 */
export function SuspendidosPanel({ rows }: { rows: SuspendidoView[] }) {
  const pending = rows.filter((r) => r.pendingMatches > 0)

  if (pending.length === 0) {
    return <EmptyState title="No hay jugadores suspendidos." className="py-6" />
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-medium text-foreground">Suspendidos</h3>
      </div>
      <ul className="divide-y divide-border">
        {pending.map((row) => (
          <li key={row.teamPlayerId} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{row.playerName}</span>
              <span className="block text-xs text-muted-foreground">
                {row.teamName}
                {row.reason ? ` · ${SUSPENSION_REASON_LABELS[row.reason]}` : ''}
                {row.reason === 'yellow_accumulation' ? ` (${row.yellowCards} amarillas)` : ''}
              </span>
            </span>
            <StatusBadge
              visual={{
                ...SUSPENSION_VISUAL,
                label:
                  row.pendingMatches === 1 ? 'Debe 1 fecha' : `Debe ${row.pendingMatches} fechas`,
              }}
              className="rounded"
            />
            {row.suspendedMatchIds.length === 0 ? (
              <span className="w-full text-xs text-muted-foreground">
                Sin partidos programados por delante: la cumple cuando se agende la próxima fecha.
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
