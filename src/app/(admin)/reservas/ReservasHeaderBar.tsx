'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SelectMenu } from '@/components/ui/select-menu'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { GrillaTabs } from '@/app/(admin)/grilla/GrillaTabs'
import { SCOPES, STATUS_CHIPS, buildHref, countFor } from './reservas-filters'
import type { ReservaScope } from './queries'

type Props = {
  scope: ReservaScope
  status: string
  q: string
  cancha: string
  courts: Array<{ id: string; name: string }>
  counts: Record<string, number>
}

/**
 * Cabecera de la Agenda (`/reservas`): `GrillaTabs` (reusado, se porta a sí
 * mismo) + un `AdminHeaderSlot` propio con el buscador, el segmento
 * Próximos/Pasados y el select de cancha. En `< lg` ese contenido se repite
 * en el cuerpo de la página (mismo `useState` de búsqueda — un solo estado
 * compartido) porque la barra superior en mobile ya está ocupada por la
 * marca; el corte es SIEMPRE por CSS (`hidden lg:flex` / `lg:hidden`), nunca
 * por un hook de viewport (`useIsDesktop` responde recién después del primer
 * pintado — el SSR asume escritorio, ver comentario del hook).
 *
 * Los chips de estado (Todos/Esperando seña/Ausentes/Cancelados) NO viven acá:
 * van en su propia fila arriba de la lista, en el cuerpo de la página — no son
 * un control de navegación como el segmento, son parte del contenido.
 */
export function ReservasHeaderBar({ scope, status, q, cancha, courts, counts }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchId = useId()

  const [value, setValue] = useState(q)
  // Si `q` cambia desde afuera (atrás del navegador, un link), el input lo
  // sigue. Se ignora el eco de lo que el propio input empujó con el debounce:
  // sin esa guarda, "juan " volvía a "juan" en medio del tipeo.
  const [syncedQ, setSyncedQ] = useState(q)
  if (q !== syncedQ) {
    setSyncedQ(q)
    if (q !== value.trim()) setValue(q)
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function replaceWith(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function pushQ(next: string) {
    replaceWith((params) => {
      if (next) params.set('q', next)
      else params.delete('q')
    })
  }

  function onSearchChange(next: string) {
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushQ(next.trim()), 300)
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setValue('')
    pushQ('')
  }

  /** Cancha va por `router.replace` (no `<Link>`): es un filtro, no navegación de página. `pagina` se resetea siempre. */
  function setCourt(next: string) {
    replaceWith((params) => {
      if (next) params.set('cancha', next)
      else params.delete('cancha')
      params.delete('pagina')
    })
  }

  function scopeNav() {
    return (
      <nav aria-label="Rango" className="inline-flex shrink-0 rounded-lg bg-muted p-1">
        {SCOPES.map((s) => {
          const active = scope === s.value
          return (
            <Link
              key={s.value}
              href={buildHref({ dia: s.value, status, q, cancha })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors lg:min-h-8',
                active
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  function searchField(idSuffix: string) {
    const id = `${searchId}-${idSuffix}`
    return (
      <div className="relative min-w-0 flex-1 lg:max-w-64">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <label htmlFor={id} className="sr-only">
          Buscar por nombre, teléfono o número de reserva
        </label>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar nombre, teléfono o nº de reserva"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-12 text-base text-foreground placeholder:text-muted-foreground focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 lg:h-8 lg:pr-9 lg:text-[13px] [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:h-6 lg:w-6"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Limpiar búsqueda</TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  /** H110 — sin sentido elegir cancha cuando hay una sola. */
  function courtSelect(idSuffix: string) {
    if (courts.length <= 1) return null
    return (
      <SelectMenu
        id={`${searchId}-cancha-${idSuffix}`}
        value={cancha}
        onChange={setCourt}
        options={[
          { value: '', label: 'Todas las canchas' },
          ...courts.map((c) => ({ value: c.id, label: c.name })),
        ]}
        aria-label="Filtrar por cancha"
        className="h-11 w-auto shrink-0 lg:h-8 lg:text-[13px]"
      />
    )
  }

  function statusChips() {
    return (
      <div
        role="group"
        aria-label="Filtrar por estado"
        className="flex shrink-0 items-center gap-1.5"
      >
        {STATUS_CHIPS.map((f) => {
          const active = status === f.value
          const count = countFor(counts, f.value)
          return (
            <button
              key={f.value || 'todos'}
              type="button"
              onClick={() =>
                replaceWith((params) => {
                  if (f.value) params.set('status', f.value)
                  else params.delete('status')
                  params.delete('pagina')
                })
              }
              aria-pressed={active}
              className={cn(
                'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-foreground dark:bg-primary/10'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {f.value ? `${f.label} (${count})` : f.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <GrillaTabs active="/reservas" />
      <AdminHeaderSlot>
        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
          {searchField('slot')}
          {scopeNav()}
          {courtSelect('slot')}
        </div>
      </AdminHeaderSlot>

      {/* < lg: la barra superior ya la ocupa la marca — buscador arriba de todo. */}
      <div className="lg:hidden">{searchField('body')}</div>

      {/* Chips de estado: fila propia arriba de la lista, en todos los anchos.
          En < lg comparte fila con el segmento (la barra superior no tiene
          lugar para él) y scrollea horizontal. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
        <span className="lg:hidden">{scopeNav()}</span>
        {statusChips()}
      </div>
      <div className="lg:hidden">{courtSelect('body')}</div>
    </>
  )
}
