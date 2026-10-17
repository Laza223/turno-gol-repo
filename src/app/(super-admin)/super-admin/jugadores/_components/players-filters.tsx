import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PlayerFilter } from '@/modules/super-admin/players.service'

const BASE = '/super-admin/jugadores'

const CHIPS: ReadonlyArray<{ value: PlayerFilter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'nuevos', label: 'Nuevos esta semana' },
  { value: 'con-reservas', label: 'Con reservas' },
  { value: 'bloqueados', label: 'Bloqueados' },
]

function chipHref(filter: PlayerFilter, q: string | undefined): string {
  const sp = new URLSearchParams()
  if (q) sp.set('q', q)
  if (filter !== 'todos') sp.set('filtro', filter)
  const qs = sp.toString()
  return qs ? `${BASE}?${qs}` : BASE
}

/** Búsqueda + chips de filtro de la lista de jugadores. GET puro, sin estado. */
export function PlayersFilters({ q, filter }: { q?: string; filter: PlayerFilter }) {
  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {filter !== 'todos' && <input type="hidden" name="filtro" value={filter} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
          <label htmlFor="q" className="text-sm font-medium text-foreground">
            Buscar
          </label>
          <Input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ''}
            placeholder="Nombre, email o teléfono"
          />
        </div>
        <Button type="submit">Buscar</Button>
        {(q || filter !== 'todos') && (
          <Link
            href={BASE}
            className="flex h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10"
          >
            Limpiar
          </Link>
        )}
      </form>
      <nav aria-label="Filtrar jugadores" className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = c.value === filter
          return (
            <Link
              key={c.value}
              href={chipHref(c.value, q)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-9',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              {c.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
