import Link from 'next/link'
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Pager } from '@/components/ui/pager'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { relativeTimeEs } from '@/lib/format'
import type { PlayerListRow } from '@/modules/super-admin/players.service'
import { formatShortDate } from '../../_components/sa-format'
import { PlayerStatusBadge } from '../../_components/player-status-visual'

/** Link estirado sobre toda la fila/tarjeta: la fila entera abre el detalle. */
const ROW_LINK =
  'after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring'

function lastLogin(date: Date | null, now: number): string {
  return date ? relativeTimeEs(date.toISOString(), now) : 'Nunca'
}

/**
 * Lista de jugadores + paginación. `hrefFor` recibe la página 0-based del
 * Pager y arma la URL (con `?pagina=` 1-based). `now` llega de afuera para que
 * "hace 3 h" no dependa del reloj al renderizar la vista.
 */
export function PlayersTable({
  rows,
  page,
  total,
  pageSize,
  hrefFor,
  filtered,
  now,
}: {
  rows: PlayerListRow[]
  /** Página actual, 0-based. */
  page: number
  total: number
  pageSize: number
  hrefFor: (page: number) => string
  /** Hay búsqueda o filtro activo: cambia el texto del vacío. */
  filtered: boolean
  now: number
}) {
  if (rows.length === 0) {
    // `?pagina=99` de un link viejo: hay jugadores, lo que no existe es esa página.
    if (total > 0) {
      return (
        <p className="rounded-xl border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Esa página no existe.{' '}
          <Link
            href={hrefFor(0)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Volver al principio
          </Link>
        </p>
      )
    }
    return (
      <EmptyState
        icon={Users}
        title={filtered ? 'Ningún jugador coincide' : 'Todavía no hay jugadores'}
        description={
          filtered
            ? 'Probá con otra búsqueda o sacá los filtros.'
            : 'Cuando alguien se registre desde el link de reservas, aparece acá.'
        }
      />
    )
  }

  return (
    <>
      <ResponsiveList
        table={
          <table className="w-full text-left">
            <caption className="sr-only">Jugadores de la plataforma</caption>
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="p-3">
                  Jugador
                </th>
                <th scope="col" className="p-3">
                  Teléfono
                </th>
                <th scope="col" className="p-3">
                  Alta
                </th>
                <th scope="col" className="p-3">
                  Último ingreso
                </th>
                <th scope="col" className="p-3 text-right">
                  Complejos
                </th>
                <th scope="col" className="p-3 text-right">
                  Reservas
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-foreground">
              {rows.map((p) => (
                <tr key={p.id} className="relative hover:bg-accent/50">
                  <td className="p-3">
                    <Link
                      href={`/super-admin/jugadores/${p.id}`}
                      className={`font-medium ${ROW_LINK}`}
                    >
                      {p.name}
                    </Link>
                    {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </td>
                  <td className="p-3 tabular-nums text-muted-foreground">{p.phone ?? '—'}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {formatShortDate(p.createdAt)}
                  </td>
                  <td className="p-3 text-muted-foreground">{lastLogin(p.lastLoginAt, now)}</td>
                  <td className="p-3 text-right tabular-nums">{p.tenantsCount}</td>
                  <td className="p-3 text-right tabular-nums">{p.bookingsCount}</td>
                  <td className="p-3">
                    <PlayerStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        cards={
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="relative space-y-1.5 p-4 hover:bg-accent/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/jugadores/${p.id}`}
                      className={`block truncate font-medium text-foreground ${ROW_LINK}`}
                    >
                      {p.name}
                    </Link>
                    {p.email && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                  </div>
                  <PlayerStatusBadge status={p.status} className="shrink-0" />
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Alta {formatShortDate(p.createdAt)} · Último ingreso:{' '}
                  {lastLogin(p.lastLoginAt, now)}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {p.tenantsCount} {p.tenantsCount === 1 ? 'complejo' : 'complejos'} ·{' '}
                  {p.bookingsCount} {p.bookingsCount === 1 ? 'reserva' : 'reservas'}
                </p>
              </li>
            ))}
          </ul>
        }
      />
      <Pager
        label="Paginación de jugadores"
        page={page}
        total={total}
        pageSize={pageSize}
        shown={rows.length}
        hrefFor={hrefFor}
      />
    </>
  )
}
