import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Search } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { listTenantPlayers } from './queries'

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centavos / 100)
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Jugadores</h1>
      </div>

      <form method="GET" className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, teléfono o email"
          className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </form>

      {players.length === 0 ? (
        <p className="text-sm text-slate-500">
          {q
            ? 'No se encontraron jugadores que coincidan con la búsqueda.'
            : 'Todavía no hay jugadores vinculados a este complejo. Aparecen cuando un jugador reserva online o lo vinculás a un abonado.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Jugador</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium text-right">Reservas</th>
                <th className="px-4 py-3 font-medium text-right">Deuda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((p) => (
                <tr key={p.playerId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/jugadores/${p.playerId}`}
                      className="font-medium text-slate-900 hover:text-emerald-700"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.phone ?? p.email}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{p.bookingsCount}</td>
                  <td className="px-4 py-3 text-right">
                    {p.balance > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        {formatARS(p.balance)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
