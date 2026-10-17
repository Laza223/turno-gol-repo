import Link from 'next/link'
import { formatArs } from '@/lib/format'
import type { DashboardData, TenantStatus } from '@/modules/super-admin/dashboard.service'
import { formatShortDate } from '../sa-format'
import { TenantStatusBadge } from '../tenant-status-visual'
import { EmptyHint, PulsoSection } from './pulso-section'

/** Ingreso mensual de suscripciones y complejos por estado (los estados en 0 no se muestran). */
export function PulsoMoney({
  mrrCents,
  tenantsByStatus,
}: Pick<DashboardData, 'mrrCents' | 'tenantsByStatus'>) {
  const statuses = (Object.keys(tenantsByStatus) as TenantStatus[]).filter(
    (s) => tenantsByStatus[s] > 0,
  )
  const total = statuses.reduce((acc, s) => acc + tenantsByStatus[s], 0)

  return (
    <PulsoSection title="Plata">
      <p className="text-sm text-muted-foreground">Ingreso mensual de suscripciones</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {mrrCents === null ? '—' : formatArs(mrrCents)}
      </p>
      {mrrCents === null && (
        <p className="mt-1 text-xs text-muted-foreground">No se pudo leer ahora</p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          Complejos: <span className="font-medium tabular-nums text-foreground">{total}</span> en
          total
        </p>
        {statuses.length === 0 ? (
          <EmptyHint text="Todavía no hay complejos." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <TenantStatusBadge key={s} status={s} count={tenantsByStatus[s]} />
            ))}
          </div>
        )}
      </div>
    </PulsoSection>
  )
}

/** Complejos que se dieron de alta esta semana. */
export function PulsoSignups({
  recentSignups,
  signupsLast7Days,
}: Pick<DashboardData, 'recentSignups' | 'signupsLast7Days'>) {
  return (
    <PulsoSection title="Altas de la semana">
      {recentSignups.length === 0 ? (
        <EmptyHint text="No se dio de alta ningún complejo en los últimos 7 días." />
      ) : (
        <>
          <p className="mb-1 text-sm text-muted-foreground">
            {signupsLast7Days === 1 ? '1 complejo nuevo' : `${signupsLast7Days} complejos nuevos`}{' '}
            en los últimos 7 días
          </p>
          <ul className="divide-y divide-border">
            {recentSignups.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Link
                  href={`/super-admin/tenants/${s.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {s.name}
                </Link>
                <TenantStatusBadge status={s.status} />
                <span className="text-xs text-muted-foreground">
                  {formatShortDate(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </PulsoSection>
  )
}
