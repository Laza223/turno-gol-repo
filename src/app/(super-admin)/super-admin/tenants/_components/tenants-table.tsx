import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Pager } from '@/components/ui/pager'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { formatArs, relativeTimeEs } from '@/lib/format'
import type { TenantList } from '@/modules/super-admin/tenants.service'
import { formatDateWithYear } from '../../_components/sa-format'
import { TenantStatusBadge } from '../../_components/tenant-status-visual'

type Row = TenantList['rows'][number]

const TH = 'p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground'

/** "hace 3 h" / "Nunca". */
function lastBookingLabel(row: Row, nowMs: number): string {
  return row.lastBookingAt ? relativeTimeEs(row.lastBookingAt.toISOString(), nowMs) : 'Nunca'
}

/**
 * La fila entera abre el detalle: el link del nombre se estira sobre la fila
 * (`after:absolute after:inset-0` contra el `relative` del `tr` / `li`).
 */
const ROW_LINK =
  "font-medium text-foreground outline-hidden after:absolute after:inset-0 after:content-['']"

const ROW_FOCUS =
  'relative transition-colors focus-within:bg-accent/50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring'

/**
 * Lista de complejos + paginación (Pager compartido, Link, sin client state).
 * `hrefFor` llega armada desde la page (que conoce los searchParams
 * completos): recibe la página 0-based del Pager y arma la URL con el
 * `?page=` 1-based que ya usaba esta pantalla. `nowMs` lo pone la page para que
 * "hace 3 h" sea determinista en las stories.
 */
export function TenantsTable({
  rows,
  page,
  total,
  pageSize,
  hrefFor,
  nowMs,
}: {
  rows: TenantList['rows']
  /** Página actual, 0-based (el Pager trabaja siempre así). */
  page: number
  total: number
  pageSize: number
  hrefFor: (page: number) => string
  nowMs: number
}) {
  if (rows.length === 0) {
    // `?page=99` de un link viejo: hay complejos, lo que no existe es esa
    // página. Decir "no hay" sería mentir.
    return total > 0 ? (
      <EmptyState
        icon={Building2}
        title="Esa página no existe"
        action={
          <Link href={hrefFor(0)} className="text-sm font-medium underline underline-offset-4">
            Volver al principio
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={Building2}
        title="No hay complejos que coincidan"
        description="Probá con otro nombre o sacá el filtro de estado."
      />
    )
  }

  return (
    <>
      <ResponsiveList
        table={
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>Complejo</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Última reserva</th>
                <th className={`${TH} text-right`}>Reservas 7 días</th>
                <th className={`${TH} text-right`}>Jugadores</th>
                <th className={`${TH} text-right`}>Canchas facturadas</th>
                <th className={`${TH} text-right`}>Ingreso mensual</th>
                <th className={TH}>Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-foreground">
              {rows.map((t) => (
                <tr key={t.id} className={`${ROW_FOCUS} hover:bg-accent/50`}>
                  <td className="p-3">
                    <Link href={`/super-admin/tenants/${t.id}`} className={ROW_LINK}>
                      {t.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{t.email}</div>
                  </td>
                  <td className="p-3">
                    <TenantStatusBadge status={t.status} />
                  </td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">
                    {lastBookingLabel(t, nowMs)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {t.bookings7d}
                    {t.onlineBookings7d > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {t.onlineBookings7d} online
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">{t.playersCount}</td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {t.billedCourts ?? '—'}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right tabular-nums">
                    {t.mrrCents > 0 ? formatArs(t.mrrCents) : '—'}
                  </td>
                  <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
                    {formatDateWithYear(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        cards={
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li key={t.id} className={`${ROW_FOCUS} space-y-2 p-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/super-admin/tenants/${t.id}`} className={ROW_LINK}>
                      {t.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">{t.email}</div>
                  </div>
                  <TenantStatusBadge status={t.status} className="shrink-0" />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Última reserva</dt>
                    <dd>{lastBookingLabel(t, nowMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Reservas 7 días</dt>
                    <dd className="tabular-nums">
                      {t.bookings7d}
                      {t.onlineBookings7d > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {t.onlineBookings7d} online
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Jugadores</dt>
                    <dd className="tabular-nums">{t.playersCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ingreso mensual</dt>
                    <dd className="tabular-nums">{t.mrrCents > 0 ? formatArs(t.mrrCents) : '—'}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        }
      />

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
