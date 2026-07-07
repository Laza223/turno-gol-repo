import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Search, Contact } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantPlayers } from './queries'

const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function formatARS(centavos: number): string {
  return ARS_FORMATTER.format(centavos / 100)
}

export default async function JugadoresPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  // Constraint: el módulo se protege con requireOperatorStaff (admin + manager).
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/dashboard')
  const { tenant } = auth

  const q = searchParams.q?.trim() || undefined
  const players = await withTenantContext(tenant.id, (tx) =>
    listTenantPlayers(tenant.id, { q }, tx),
  )

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
          className="w-full rounded-md border border-border py-2 pl-9 pr-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </form>

      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q
            ? 'No se encontraron jugadores que coincidan con la búsqueda.'
            : 'Todavía no hay jugadores vinculados a este complejo. Aparecen cuando un jugador reserva online o lo vinculás a un abonado.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* Mobile: cards con la fila entera como link (MASTER §9 Fitts); desktop: tabla. */}
          <ul className="divide-y divide-border sm:hidden">
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
                  {p.balance > 0 && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                      {formatARS(p.balance)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Jugador</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium text-right">Reservas</th>
                <th className="px-4 py-3 font-medium text-right">Deuda</th>
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
                    {p.balance > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                        {formatARS(p.balance)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
