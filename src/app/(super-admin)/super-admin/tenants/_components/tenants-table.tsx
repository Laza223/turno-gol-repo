import Link from 'next/link'
import { formatArs } from '@/lib/format'
import type { TenantList } from '@/modules/super-admin/tenants.service'
import { TenantStatusBadge } from './status-badge'
import { formatDateArt } from './format'

/**
 * Tabla de tenants + paginación (Link, sin client state). `prevHref`/`nextHref`
 * llegan ya armados desde la page (que conoce los searchParams completos) —
 * `null` cuando no hay página anterior/siguiente.
 */
export function TenantsTable({
  rows,
  page,
  totalPages,
  prevHref,
  nextHref,
}: {
  rows: TenantList['rows']
  page: number
  totalPages: number
  prevHref: string | null
  nextHref: string | null
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3">Fin de trial</th>
              <th className="px-4 py-3">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-foreground">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No hay tenants que coincidan con los filtros.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-accent">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/super-admin/tenants/${t.id}`}
                    className="text-foreground hover:text-emerald-700 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs font-normal text-muted-foreground">{t.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.slug}</td>
                <td className="px-4 py-3">
                  <TenantStatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.planName ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {t.mrrCents > 0 ? formatArs(t.mrrCents) : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatDateArt(t.trialEndsAt)}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatDateArt(t.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {prevHref ? (
              <Link href={prevHref} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent">
                Anterior
              </Link>
            ) : (
              <span aria-disabled="true" className="rounded-md border border-border px-3 py-1.5 text-muted-foreground/40">
                Anterior
              </span>
            )}
            {nextHref ? (
              <Link href={nextHref} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent">
                Siguiente
              </Link>
            ) : (
              <span aria-disabled="true" className="rounded-md border border-border px-3 py-1.5 text-muted-foreground/40">
                Siguiente
              </span>
            )}
          </div>
        </nav>
      )}
    </>
  )
}
