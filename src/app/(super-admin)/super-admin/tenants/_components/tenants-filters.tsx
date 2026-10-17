import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TENANT_STATUSES } from '@/modules/billing/billing.types'
import type { TenantStatus } from '@/modules/billing/billing.types'

// Los nombres del filtro. `tenant-status-visual.tsx` (compartido) todavía dice
// "Trial" y "Churned" en el badge: cuando se actualice, estos dos deberían salir de ahí.
const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Prueba',
  active: 'Activo',
  past_due: 'Pago vencido',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Perdido',
  deleted: 'Eliminado',
}

/**
 * Filtros GET de la lista de complejos (búsqueda + estado), sin client state —
 * el form submitea vía navegación normal. Presentacional puro.
 *
 * El filtro por plan se eliminó con el precio por cancha (decisión
 * 2026-09-17): `plans` quedó con una sola fila activa, así que el selector
 * filtraba todo o nada.
 */
export function TenantsFilters({ q, status }: { q?: string; status?: TenantStatus }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1 md:max-w-sm">
        <label htmlFor="q" className="text-sm font-medium text-foreground">
          Buscar
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ''}
            placeholder="Nombre o email"
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium text-foreground">
          Estado
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ''}
          className="h-11 rounded-lg border border-input bg-card px-3 text-base text-foreground transition-colors hover:border-input/80 focus-visible:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm"
        >
          <option value="">Todos</option>
          {TENANT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">Filtrar</Button>
      {(q || status) && (
        <Link
          href="/super-admin/tenants"
          className={cn(buttonVariants({ variant: 'ghost' }), 'text-muted-foreground')}
        >
          Limpiar
        </Link>
      )}
    </form>
  )
}
