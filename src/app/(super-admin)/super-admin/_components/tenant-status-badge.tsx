import type { TenantStatus } from '@/modules/super-admin/dashboard.service'

/**
 * Badge de estado de tenant (8 estados de `tenant_status`) según los pills
 * del design system (MASTER.md §6 — Badges / Status pills).
 */

const STATUS_STYLES: Record<TenantStatus, string> = {
  trialing: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  past_due: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  suspended: 'bg-red-50 text-red-700 ring-red-600/20',
  blocked: 'bg-red-50 text-red-700 ring-red-600/20',
  canceled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  churned: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  deleted: 'bg-slate-100 text-slate-600 ring-slate-500/20',
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
