import Link from 'next/link'
import { Ban } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { TONE_BADGE } from '@/lib/status-tone'
import { PLAYER_TAG_LABELS } from '@/modules/relationships/player-tags'
import type { PlayerTenantLink } from '@/modules/super-admin/players.service'
import { formatShortDate, formatShortDateTime } from '../../../_components/sa-format'

const BLOCKED_VISUAL = {
  icon: Ban,
  label: 'Bloqueado por el complejo',
  tone: 'destructive',
} as const

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Una fila por complejo donde el jugador tiene relación. */
export function PlayerTenantsCard({ tenants }: { tenants: PlayerTenantLink[] }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 shadow-xs">
      <h2 className="mb-4 text-base font-semibold text-foreground">Sus complejos</h2>
      {tenants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no reservó en ningún complejo.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tenants.map((t) => {
            const blocked = t.isBanned || t.relationshipStatus === 'blocked'
            return (
              <li key={t.tenantId} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/super-admin/tenants/${t.tenantId}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.tenantName}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    Desde {formatShortDate(t.firstSeenAt)}
                  </span>
                  {blocked && (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <StatusBadge visual={BLOCKED_VISUAL} />
                      {t.isBanned && (
                        <span className="text-xs text-muted-foreground">
                          {t.bannedUntil
                            ? `hasta ${formatShortDateTime(t.bannedUntil)}`
                            : 'sin fecha de fin'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {plural(t.bookingsCount, 'reserva', 'reservas')} ·{' '}
                  {plural(t.noshowCount, 'ausencia', 'ausencias')} · Última reserva:{' '}
                  {t.lastBookingAt ? formatShortDate(t.lastBookingAt) : 'ninguna'}
                </p>
                {t.tags.length > 0 && (
                  <ul aria-label="Etiquetas del complejo" className="flex flex-wrap gap-1.5">
                    {t.tags.map((tag) => (
                      <li
                        key={tag}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE.neutral}`}
                      >
                        {PLAYER_TAG_LABELS[tag]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
