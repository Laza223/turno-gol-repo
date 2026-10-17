import { ChevronDown } from 'lucide-react'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { DashboardData } from '@/modules/super-admin/dashboard.service'
import { formatShortDateTime } from '../sa-format'

/**
 * Salud técnica: plegada por defecto, para mirar solo cuando algo huele mal.
 * `<details>` nativo: no necesita JavaScript de cliente.
 */
export function PulsoTech({
  queues,
  recentWebhooks,
}: Pick<DashboardData, 'queues' | 'recentWebhooks'>) {
  return (
    <details className="group rounded-lg border border-border bg-card shadow-xs">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold text-foreground sm:px-6 [&::-webkit-details-marker]:hidden">
        Salud técnica
        <ChevronDown
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="grid grid-cols-1 gap-8 border-t border-border px-4 py-4 sm:px-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tareas pendientes</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Trabajos que el sistema hace en segundo plano (avisos, cobros, limpiezas).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Cola</th>
                <th className="py-2 text-right font-medium">Pendientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queues.map((q) => (
                <tr key={q.queue}>
                  <td className="py-1.5 pr-4 text-foreground">{q.queue}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {q.depth === null ? (
                      <span className={cn('text-xs', TONE_TEXT.destructive)}>no disponible</span>
                    ) : (
                      q.depth
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Últimos avisos de MercadoPago</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Los avisos que se procesaron bien. Los que fallan se reintentan solos y no quedan acá.
          </p>
          {recentWebhooks.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Todavía no llegó ninguno.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentWebhooks.map((wh) => (
                <li key={wh.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-foreground">{wh.eventType}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatShortDateTime(wh.processedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  )
}
