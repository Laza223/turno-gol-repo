import Link from 'next/link'
import type { PlanSummary } from '@/modules/super-admin/tenants.service'
import { TENANT_STATUSES } from '@/modules/billing/billing.types'
import type { TenantStatus } from '@/modules/billing/billing.types'

const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Trial',
  active: 'Activo',
  past_due: 'Pago vencido',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Churned',
  deleted: 'Eliminado',
}

/**
 * Filtros GET de la lista de tenants (búsqueda + status + plan), sin client
 * state — el form submitea vía navegación normal. Presentacional puro.
 */
export function TenantsFilters({
  q,
  status,
  planSlug,
  plans,
}: {
  q?: string
  status?: TenantStatus
  planSlug?: string
  plans: PlanSummary[]
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-sm font-medium text-foreground">
          Buscar
        </label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={q ?? ''}
          placeholder="Nombre, slug o email"
          className="h-11 md:h-10 w-64 rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium text-foreground">
          Estado
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ''}
          className="h-11 md:h-10 rounded-md border border-border bg-card px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todos</option>
          {TENANT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="plan" className="text-sm font-medium text-foreground">
          Plan
        </label>
        <select
          id="plan"
          name="plan"
          defaultValue={planSlug ?? ''}
          className="h-11 md:h-10 rounded-md border border-border bg-card px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todos</option>
          {plans.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="h-11 md:h-10 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-emerald-700"
      >
        Filtrar
      </button>
      {(q || status || planSlug) && (
        <Link
          href="/super-admin/tenants"
          className="flex h-11 md:h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Limpiar
        </Link>
      )}
    </form>
  )
}
