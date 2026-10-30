import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { relativeTimeEs } from '@/lib/format'
import type { PlatformActivity } from '@/modules/super-admin/activity.service'
import { formatDayStr, formatTimeRange } from '../sa-format'
import { EmptyHint, PulsoSection } from './pulso-section'

const link = 'font-medium text-foreground underline-offset-4 hover:underline'

/**
 * "Lo último": las reservas online y los jugadores más recientes. Es lo que
 * faltaba el 2026-10-16: ver quién entró y qué reservó sin abrir cada complejo.
 */
export function PulsoFeed({
  activity,
  now = new Date(),
}: {
  activity: Pick<PlatformActivity, 'recentOnlineBookings' | 'recentPlayers'>
  now?: Date
}) {
  const nowMs = now.getTime()
  return (
    <div className="grid grid-cols-1 gap-3 lg:gap-6 lg:grid-cols-2">
      <PulsoSection title="Reservas online">
        {activity.recentOnlineBookings.length === 0 ? (
          <EmptyHint text="Todavía no hubo reservas online." />
        ) : (
          <ul className="divide-y divide-border">
            {activity.recentOnlineBookings.map((b) => (
              <li key={b.id} className="space-y-1 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <Link href={`/super-admin/jugadores/${b.playerId}`} className={link}>
                      {b.playerName}
                    </Link>
                    <span className="text-muted-foreground"> en </span>
                    <Link href={`/super-admin/tenants/${b.tenantId}`} className={link}>
                      {b.tenantName}
                    </Link>
                  </p>
                  <StatusBadge
                    className="shrink-0"
                    visual={bookingBadgeVisual({
                      status: b.status,
                      type: 'spontaneous',
                      depositStatus: b.depositStatus,
                    })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.courtName ? `${b.courtName} · ` : ''}
                  {formatDayStr(b.date)} · {formatTimeRange(b.timeStart, b.timeEnd)} · reservada{' '}
                  {relativeTimeEs(b.createdAt.toISOString(), nowMs)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PulsoSection>

      <PulsoSection
        title="Jugadores nuevos"
        action={
          <Link
            href="/super-admin/jugadores"
            className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
          >
            Ver todos
          </Link>
        }
      >
        {activity.recentPlayers.length === 0 ? (
          <EmptyHint text="Todavía no se registró ningún jugador." />
        ) : (
          <ul className="divide-y divide-border">
            {activity.recentPlayers.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-3">
                <p className="min-w-0 truncate text-sm">
                  <Link href={`/super-admin/jugadores/${p.id}`} className={link}>
                    {p.name}
                  </Link>
                  {p.firstTenantName && (
                    <span className="text-muted-foreground"> en {p.firstTenantName}</span>
                  )}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTimeEs(p.createdAt.toISOString(), nowMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PulsoSection>
    </div>
  )
}
