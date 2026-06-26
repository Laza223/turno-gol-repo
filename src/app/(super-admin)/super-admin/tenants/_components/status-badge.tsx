import type { TenantStatus } from '@/modules/billing/billing.types'

const STATUS_STYLES: Record<TenantStatus, { label: string; className: string }> = {
  trialing: {
    label: 'Trial',
    className: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30',
  },
  active: {
    label: 'Activo',
    className: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30',
  },
  past_due: {
    label: 'Pago vencido',
    className: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-600/20 dark:ring-orange-500/30',
  },
  suspended: {
    label: 'Suspendido',
    className: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-amber-700/20 dark:ring-amber-500/30',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  },
  canceled: {
    label: 'Cancelado',
    className: 'bg-muted text-muted-foreground ring-slate-500/20',
  },
  churned: {
    label: 'Churned',
    className: 'bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200 ring-red-700/20 dark:ring-red-500/30',
  },
  deleted: {
    label: 'Eliminado',
    className: 'bg-muted text-foreground ring-slate-600/20',
  },
}

/** Badge de estado del tenant (8 estados del lifecycle, doc4 §2). */
export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  )
}
