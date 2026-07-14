import Link from 'next/link'
import { Search, Contact } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { ResponsiveList } from '@/components/ui/responsive-list'
import type { PlayerListRow } from './queries'

/**
 * Vista presentacional de /jugadores: header, buscador (form GET, sin JS) y
 * el listado responsive (cards/tabla). Extraída de page.tsx, que solo aporta
 * auth (requireOperatorStaff) + el fetch (listTenantPlayers).
 */
export function JugadoresView({ players, q }: { players: PlayerListRow[]; q?: string }) {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Jugadores"
        icon={<Contact className="h-6 w-6" aria-hidden="true" />}
      />

      <form method="GET" className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="q"
          aria-label="Buscar jugadores"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, teléfono o email"
          className="w-full rounded-md border border-border py-2 pl-9 pr-3 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </form>

      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q
            ? 'No se encontraron jugadores que coincidan con la búsqueda.'
            : 'Todavía no hay jugadores vinculados a este complejo. Aparecen cuando un jugador reserva online o lo vinculás a un abonado.'}
        </p>
      ) : (
        <ResponsiveList
          className="overflow-hidden rounded-xl shadow-xs"
          cards={
            <ul className="divide-y divide-border">
              {players.map((p) => (
                <li key={p.playerId}>
                  <Link
                    href={`/jugadores/${p.playerId}`}
                    className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.phone ?? p.email} · {p.bookingsCount} reserva{p.bookingsCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {p.noshowCount > 0 && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {p.noshowCount} ausencia{p.noshowCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          }
          table={
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Jugador</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium text-right">Reservas</th>
                  <th className="px-4 py-3 font-medium text-right">Ausencias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((p) => (
                  <tr key={p.playerId} className="hover:bg-accent">
                    <td className="px-4 py-3">
                      <Link
                        href={`/jugadores/${p.playerId}`}
                        className="font-medium text-foreground hover:text-emerald-700"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.phone ?? p.email}</td>
                    <td className="px-4 py-3 text-right text-foreground">{p.bookingsCount}</td>
                    <td className="px-4 py-3 text-right">
                      {p.noshowCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {p.noshowCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      )}
    </div>
  )
}
