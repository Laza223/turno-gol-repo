import { CANCEL_REASON_LABELS, type CancelReason } from '@/shared/cancel-reasons'

export type CancelReasonsSummary = {
  total: number
  byReason: Array<{ reason: CancelReason; count: number }>
}

/**
 * Por qué se cayeron los turnos en el mes. Sale de las cancelaciones con motivo
 * cerrado (jugador o encargado); es un dato del complejo, no sobre personas.
 */
export function CancelReasonsCard({ summary }: { summary: CancelReasonsSummary }) {
  const max = Math.max(...summary.byReason.map((r) => r.count))
  return (
    <section aria-labelledby="mes-cancelaciones" className="card-premium p-4 sm:p-5">
      <h2 id="mes-cancelaciones" className="text-sm font-semibold text-foreground">
        Por qué se cayeron turnos
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {summary.total === 1
          ? 'Se canceló 1 turno en el mes.'
          : `Se cancelaron ${summary.total} turnos en el mes.`}
      </p>
      <ul className="mt-3 space-y-2.5">
        {summary.byReason.map(({ reason, count }) => (
          <li key={reason} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground">{CANCEL_REASON_LABELS[reason]}</span>
              <span className="font-semibold tabular-nums text-foreground">{count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
