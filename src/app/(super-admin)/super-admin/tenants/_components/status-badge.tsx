import type { TenantStatus } from '@/modules/billing/billing.types'

const STATUS_STYLES: Record<TenantStatus, { label: string; className: string }> = {
  trialing: {
    label: 'Trial',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  active: {
    label: 'Activo',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
  },
  past_due: {
    label: 'Pago vencido',
    className: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  },
  suspended: {
    label: 'Suspendido',
    className: 'bg-amber-50 text-amber-800 ring-amber-700/20',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  canceled: {
    label: 'Cancelado',
    className: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  },
  churned: {
    label: 'Churned',
    className: 'bg-red-50 text-red-800 ring-red-700/20',
  },
  deleted: {
    label: 'Eliminado',
    className: 'bg-slate-200 text-slate-700 ring-slate-600/20',
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
