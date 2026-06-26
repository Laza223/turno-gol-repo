import type { TenantStatus } from '@/modules/super-admin/dashboard.service'

/**
 * Badge de estado de tenant (8 estados de `tenant_status`) según los pills
 * del design system (MASTER.md §6 — Badges / Status pills).
 */

const STATUS_STYLES: Record<TenantStatus, string> = {
  trialing: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30',
  active: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30',
  past_due: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30',
  suspended: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  blocked: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  canceled: 'bg-muted text-muted-foreground ring-slate-500/20',
  churned: 'bg-muted text-muted-foreground ring-slate-500/20',
  deleted: 'bg-muted text-muted-foreground ring-slate-500/20',
}

export const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Trial',
  active: 'Activo',
  past_due: 'Moroso',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Churned',
  deleted: 'Eliminado',
}

export function TenantStatusBadge({
  status,
  count,
}: {
  status: TenantStatus
  count?: number
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
      {count !== undefined && (
        <span className="font-semibold tabular-nums">{count}</span>
      )}
    </span>
  )
}
