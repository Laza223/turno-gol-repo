import Link from 'next/link'
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
 * Filtros GET de la lista de tenants (búsqueda + estado), sin client state —
 * el form submitea vía navegación normal. Presentacional puro.
 *
 * El filtro por plan se eliminó con el precio por cancha (decisión
 * 2026-09-17): `plans` quedó con una sola fila activa, así que el selector
 * filtraba todo o nada.
 */
export function TenantsFilters({ q, status }: { q?: string; status?: TenantStatus }) {
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
          className="h-11 md:h-10 w-64 rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
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
          className="h-11 md:h-10 rounded-md border border-border bg-card px-3 text-sm focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todos</option>
          {TENANT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="h-11 md:h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-emerald-700"
      >
        Filtrar
      </button>
      {(q || status) && (
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
