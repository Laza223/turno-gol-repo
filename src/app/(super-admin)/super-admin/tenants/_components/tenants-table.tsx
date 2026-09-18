import Link from 'next/link'
import { formatArs } from '@/lib/format'
import type { TenantList } from '@/modules/super-admin/tenants.service'
import { Pager } from '@/components/ui/pager'
import { TenantStatusBadge } from '../../_components/tenant-status-visual'
import { formatDateArt } from './format'

/**
 * Tabla de tenants + paginación (Pager compartido, Link, sin client state).
 * `hrefFor` llega armada desde la page (que conoce los searchParams
 * completos): recibe la página 0-based del Pager y arma la URL con el
 * `?page=` 1-based que ya usaba esta pantalla.
 */
export function TenantsTable({
  rows,
  page,
  total,
  pageSize,
  hrefFor,
}: {
  rows: TenantList['rows']
  /** Página actual, 0-based (el Pager trabaja siempre así). */
  page: number
  total: number
  pageSize: number
  hrefFor: (page: number) => string
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
              <th className="px-4 py-3 text-right">Canchas</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3">Fin de trial</th>
              <th className="px-4 py-3">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-foreground">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {/* `?page=99` de un link viejo: hay complejos, lo que no existe
                      es esa página. Decir "no hay" sería mentir. */}
                  {total > 0 ? (
                    <>
                      Esa página no existe.{' '}
                      <Link href={hrefFor(0)} className="font-medium underline underline-offset-4">
                        Volver al principio
                      </Link>
                    </>
                  ) : (
                    'No hay tenants que coincidan con los filtros.'
                  )}
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
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {t.billedCourts ?? '—'}
                </td>
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

      <Pager
        label="Paginación de complejos"
        page={page}
        total={total}
        pageSize={pageSize}
        shown={rows.length}
        hrefFor={hrefFor}
      />
    </>
  )
}
