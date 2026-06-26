import {
  Banknote,
  Building2,
  Hourglass,
  Inbox,
  ListChecks,
  UserPlus,
  Webhook,
} from 'lucide-react'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { formatArs } from '@/lib/format'
import {
  getDashboardData,
  type TenantStatus,
} from '@/modules/super-admin/dashboard.service'
import { SaMetricCard } from './_components/sa-metric-card'
import { TenantStatusBadge } from './_components/tenant-status-badge'

// Métricas en vivo — nunca servir un snapshot cacheado del build.
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/** Conversión a ART solo acá, en la capa de presentación (regla CLAUDE.md). */
const ART = 'America/Argentina/Buenos_Aires'

function formatDateArt(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: ART,
  })
}

function formatDateTimeArt(date: Date): string {
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ART,
  })
}

function daysRemaining(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS))
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-border px-6 py-4 text-base font-semibold text-foreground">
        <span className="text-violet-600 dark:text-violet-400">{icon}</span>
        {title}
      </h2>
      <div className="px-6 py-4">{children}</div>
    </section>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>
}

export default async function SuperAdminDashboardPage() {
  const data = await getDashboardData()
  const now = new Date()

  const totalTenants = Object.values(data.tenantsByStatus).reduce(
    (acc, n) => acc + n,
    0,
  )
  const statuses = Object.keys(data.tenantsByStatus) as TenantStatus[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard global"
        subtitle="Métricas cross-tenant de la plataforma"
        icon={<LayoutDashboard className="h-6 w-6 text-violet-600 dark:text-violet-400" aria-hidden="true" />}
      />

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SaMetricCard
          label="MRR"
          value={formatArs(data.mrrCents)}
          icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
          sub="Suscripciones activas, precio mensual"
        />
        <SaMetricCard
          label="Tenants"
          value={String(totalTenants)}
          icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
          sub={`${data.tenantsByStatus.active} activos · ${data.tenantsByStatus.trialing} en trial`}
        />
        <SaMetricCard
          label="Trials por vencer"
          value={String(data.expiringTrials.length)}
          icon={<Hourglass className="h-5 w-5" aria-hidden="true" />}
          sub="Vencen en los próximos 7 días"
        />
        <SaMetricCard
          label="Signups (7 días)"
          value={String(data.signupsLast7Days)}
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          sub="Complejos creados esta semana"
        />
      </div>

      {/* Tenants por estado */}
      <SectionCard title="Tenants por estado" icon={<Building2 className="h-4 w-4" aria-hidden="true" />}>
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => (
            <TenantStatusBadge
              key={status}
              status={status}
              count={data.tenantsByStatus[status]}
            />
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Trials por vencer */}
        <SectionCard title="Trials por vencer (≤7 días)" icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}>
          {data.expiringTrials.length === 0 ? (
            <EmptyHint text="Ningún trial vence en los próximos 7 días." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Complejo</th>
                  <th className="py-2 pr-4 font-medium">Slug</th>
                  <th className="py-2 text-right font-medium">Días restantes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.expiringTrials.map((trial) => (
                  <tr key={trial.id} className="text-foreground hover:bg-accent">
                    <td className="py-2 pr-4 font-medium">{trial.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{trial.slug}</td>
                    <td className="py-2 text-right tabular-nums">
                      {daysRemaining(trial.trialEndsAt, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        {/* Signups recientes */}
        <SectionCard title="Signups recientes (7 días)" icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
          {data.recentSignups.length === 0 ? (
            <EmptyHint text="Sin signups en los últimos 7 días." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentSignups.map((signup) => (
                <li key={signup.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {signup.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{signup.slug}</p>
                  </div>
                  <TenantStatusBadge status={signup.status} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDateArt(signup.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Colas pg-boss */}
        <SectionCard title="Colas de jobs (pg-boss)" icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Cola</th>
                <th className="py-2 text-right font-medium">Pendientes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.queues.map((entry) => (
                <tr key={entry.queue} className="text-foreground hover:bg-accent">
                  <td className="py-1.5 pr-4">{entry.queue}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {entry.depth === null ? (
                      <span className="text-xs text-red-600 dark:text-red-400">no disponible</span>
                    ) : (
                      entry.depth
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        {/* Webhooks MP recientes */}
        <SectionCard title="Webhooks MP recientes" icon={<Webhook className="h-4 w-4" aria-hidden="true" />}>
          {data.recentWebhooks.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Sin webhooks registrados todavía.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentWebhooks.map((wh) => (
                <li key={wh.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{wh.eventType}</p>
                    <p className="truncate text-xs text-muted-foreground">{wh.mpEventId}</p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDateTimeArt(wh.processedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Los webhooks que fallan hacen rollback y se reintentan — no
            persisten en <code className="text-[11px]">processed_webhooks</code>; acá se listan los
            últimos procesados.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}
