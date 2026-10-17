import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { DashboardData } from '@/modules/super-admin/dashboard.service'
import { TenantStatusBadge } from '../tenant-status-visual'
import { PulsoSection } from './pulso-section'

const DAY_MS = 24 * 60 * 60 * 1000

function daysRemaining(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS))
}

const rowLink = 'min-w-0 truncate font-medium text-foreground underline-offset-4 hover:underline'
const row = 'flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5'

/**
 * "Pide atención": solo se dibuja si hay algo. Pruebas por vencer, complejos
 * con el cobro trabado y tareas en segundo plano que fallaron. Si no se pudo
 * leer lo de las tareas (`failedJobs24h === null`) no se dice nada de ellas.
 */
export function PulsoAttention({
  data,
  now = new Date(),
}: {
  data: Pick<DashboardData, 'expiringTrials' | 'troubledTenants' | 'failedJobs24h'>
  now?: Date
}) {
  const failed = data.failedJobs24h ?? []
  if (
    data.expiringTrials.length === 0 &&
    data.troubledTenants.length === 0 &&
    failed.length === 0
  ) {
    return null
  }

  return (
    <PulsoSection title="Pide atención">
      <ul className="divide-y divide-border">
        {data.expiringTrials.map((trial) => {
          const days = daysRemaining(trial.trialEndsAt, now)
          return (
            <li key={`trial-${trial.id}`} className={row}>
              <Link href={`/super-admin/tenants/${trial.id}`} className={rowLink}>
                {trial.name}
              </Link>
              <span className="text-sm text-muted-foreground">
                La prueba vence {days === 0 ? 'hoy' : days === 1 ? 'en 1 día' : `en ${days} días`}
              </span>
            </li>
          )
        })}
        {data.troubledTenants.map((t) => (
          <li key={`trouble-${t.id}`} className={row}>
            <Link href={`/super-admin/tenants/${t.id}`} className={rowLink}>
              {t.name}
            </Link>
            <TenantStatusBadge status={t.status} />
          </li>
        ))}
        {failed.map((f) => (
          <li key={`failed-${f.queue}`} className={row}>
            <AlertTriangle
              className={cn('h-4 w-4 shrink-0', TONE_TEXT.destructive)}
              aria-hidden="true"
            />
            <span className={cn('text-sm font-medium', TONE_TEXT.destructive)}>
              {f.failed === 1 ? '1 tarea falló' : `${f.failed} tareas fallaron`} en las últimas 24 h
            </span>
            <span className="text-sm text-muted-foreground">Cola: {f.queue}</span>
          </li>
        ))}
      </ul>
    </PulsoSection>
  )
}
