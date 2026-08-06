import Link from 'next/link'
import { Search, Contact, Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientesTabs } from './ClientesTabs'
import type { PlayerListRow } from './queries'

/**
 * Vista presentacional de /jugadores: header, tabs, buscador (form GET, sin JS) y
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

      <div className="card-entrance" style={{ animationDelay: '80ms' }}>
        <ClientesTabs active="/jugadores" />
      </div>

      <form method="GET" className="card-entrance relative max-w-md" style={{ animationDelay: '120ms' }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          name="q"
          aria-label="Buscar jugadores"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, teléfono o email"
          className="w-full min-h-11 rounded-md border border-border py-2 pl-9 pr-3 text-base md:min-h-0 md:text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </form>

      {players.length === 0 ? (
        q ? (
          <p className="text-sm text-muted-foreground">
            No se encontraron jugadores que coincidan con la búsqueda.
          </p>
        ) : (
          <EmptyState
            icon={Users}
            title="Todavía no tenés jugadores vinculados"
            description="Aparecen acá cuando un jugador reserva online o lo vinculás a un turno fijo. Compartí el link público de tu complejo para que empiecen a llegar."
            action={
              // JugadoresView solo recibe `players`/`q` por prop (no slug ni
              // appUrl): armar el link público acá duplicaría buildPublicLinkUrl
              // fuera de su lugar. Menor acople: mandar al panel, que ya muestra
              // y copia ese link (OnboardingChecklist/dashboard).
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
              >
                Compartí tu link desde el panel
              </Link>
            }
          />
        )
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
