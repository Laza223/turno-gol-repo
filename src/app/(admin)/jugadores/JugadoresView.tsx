import Link from 'next/link'
import { Search, Contact, Users } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientesTabs } from './ClientesTabs'
import { PlayerTagChips } from './PlayerTagChips'
import { LinkContactDialog, type LinkContactDialogProps } from './LinkContactDialog'
import type { ClientListRow } from './queries'

/**
 * Vista presentacional de /jugadores: header, tabs, buscador (form GET, sin JS) y
 * el listado responsive (cards/tabla). Extraída de page.tsx, que solo aporta
 * auth (requireOperatorStaff) + el fetch (listTenantClients).
 *
 * B13 — la lista es UNA sola de personas: las que tienen cuenta y las que el
 * complejo conoce solo como nombre y teléfono porque son titulares de un turno
 * fijo. Antes estas últimas no aparecían en ninguna parte.
 */
export type JugadoresViewProps = {
  clients: ClientListRow[]
  q?: string
  searchAction: LinkContactDialogProps['searchAction']
  linkAction: LinkContactDialogProps['linkAction']
}

/** "3 reservas · 1 fijo". Las unidades en singular cuando corresponde. */
function metaLine(c: ClientListRow): string {
  const parts = [`${c.bookingsCount} reserva${c.bookingsCount === 1 ? '' : 's'}`]
  if (c.fixedCount > 0) parts.push(`${c.fixedCount} fijo${c.fixedCount === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function SinCuentaBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      Sin cuenta
    </span>
  )
}

export function JugadoresView({ clients, q, searchAction, linkAction }: JugadoresViewProps) {
  const renderLinkButton = (c: ClientListRow) =>
    c.kind === 'contact' ? (
      <LinkContactDialog
        contactKey={c.key}
        contactName={c.name}
        contactPhone={c.phone}
        fixedCount={c.fixedCount}
        suggestedPlayerId={c.suggestedPlayerId}
        suggestedPlayerName={c.suggestedPlayerName}
        searchAction={searchAction}
        linkAction={linkAction}
      />
    ) : null

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Personas"
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
          aria-label="Buscar personas"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, teléfono o email"
          className="w-full min-h-11 rounded-md border border-border py-2 pl-9 pr-3 text-base md:min-h-0 md:text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </form>

      {clients.length === 0 ? (
        q ? (
          <p className="text-sm text-muted-foreground">
            No se encontraron personas que coincidan con la búsqueda.
          </p>
        ) : (
          <EmptyState
            icon={Users}
            title="Todavía no tenés clientes"
            description="Aparecen acá cuando alguien reserva online o cuando cargás un turno fijo a su nombre. Compartí el link público de tu complejo para que empiecen a llegar."
            action={
              // JugadoresView solo recibe `clients`/`q` por prop (no slug ni
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
              {clients.map((c) => (
                <li key={c.key} className="flex items-center gap-2 pr-3">
                  {/* El botón "Vincular" queda FUERA del Link: un <button> dentro
                      de un <a> es HTML inválido y rompe la hidratación. */}
                  {c.kind === 'player' ? (
                    <Link
                      href={`/jugadores/${c.playerId}`}
                      className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.phone ?? c.email} · {metaLine(c)}
                        </p>
                        <PlayerTagChips tags={c.tags} className="mt-1.5" />
                      </div>
                      {c.noshowCount > 0 && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {c.noshowCount} ausencia{c.noshowCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1 px-4 py-3">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{c.name}</span>
                        <SinCuentaBadge />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.phone} · {metaLine(c)}
                      </p>
                      {c.suggestedPlayerName && (
                        <p className="mt-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                          Mismo teléfono que {c.suggestedPlayerName}
                        </p>
                      )}
                    </div>
                  )}
                  {renderLinkButton(c)}
                </li>
              ))}
            </ul>
          }
          table={
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Persona</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium text-right">Reservas</th>
                  <th className="px-4 py-3 font-medium text-right">Fijos</th>
                  <th className="px-4 py-3 font-medium text-right">Ausencias</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((c) => (
                  <tr key={c.key} className="hover:bg-accent">
                    <td className="px-4 py-3">
                      {c.kind === 'player' ? (
                        <>
                          <Link
                            href={`/jugadores/${c.playerId}`}
                            className="font-medium text-foreground hover:text-emerald-700"
                          >
                            {c.name}
                          </Link>
                          <PlayerTagChips tags={c.tags} className="mt-1" />
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-2 font-medium text-foreground">
                            {c.name}
                            <SinCuentaBadge />
                          </span>
                          {c.suggestedPlayerName && (
                            <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-400">
                              Mismo teléfono que {c.suggestedPlayerName}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? c.email}</td>
                    <td className="px-4 py-3 text-right text-foreground">{c.bookingsCount}</td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {c.fixedCount > 0 ? c.fixedCount : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.noshowCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {c.noshowCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{renderLinkButton(c)}</td>
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
