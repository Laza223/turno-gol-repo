'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioChip, RadioChipGroup } from '@/components/ui/radio-chip'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { GrillaTabs } from '@/app/(admin)/grilla/GrillaTabs'
import { SCOPES, FILTERS, buildHref, countFor } from './reservas-filters'
import type { ReservaScope } from './queries'

type Props = {
  scope: ReservaScope
  status: string
  q: string
  cancha: string
  courts: Array<{ id: string; name: string }>
  counts: Record<string, number>
  /** Total ya resuelto por la page (según status activo) — evita recalcularlo acá. */
  total: number
}

/**
 * Cabecera de /reservas: `GrillaTabs` (reusado, se porta a sí mismo) + un
 * único `AdminHeaderSlot` propio con el segmento de rango, la búsqueda, el
 * botón "Filtros" y el contador. En `< lg` ese contenido se repite en el
 * cuerpo de la página (misma búsqueda, mismo estado — un solo `useState`
 * compartido) porque la barra superior en mobile ya está ocupada por la
 * marca; el corte es SIEMPRE por CSS (`hidden lg:flex` / `lg:hidden`), nunca
 * por un hook de viewport (`useIsDesktop` responde recién después del primer
 * pintado — el SSR asume escritorio, ver comentario del hook).
 *
 * Los dos renders comparten estado de React (mismo componente, un solo
 * árbol) pero NO pueden compartir `id`/`htmlFor`: los dos existen a la vez en
 * el DOM (uno oculto por CSS), así que cada input de búsqueda lleva su propio
 * sufijo.
 */
export function ReservasHeaderBar({ scope, status, q, cancha, courts, counts, total }: Props) {
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

  /** Estado/cancha van por `router.replace` (no `<Link>`): son filtros, no navegación de página. `pagina` se resetea siempre. */
  function setFilterParam(key: 'status' | 'cancha', next: string) {
    replaceWith((params) => {
      if (next) params.set(key, next)
      else params.delete(key)
      params.delete('pagina')
    })
  }

  function clearFilters() {
    replaceWith((params) => {
      params.delete('status')
      params.delete('cancha')
      params.delete('pagina')
    })
  }

  const activeFilters = (status ? 1 : 0) + (cancha ? 1 : 0)

  function scopeNav() {
    return (
      <nav aria-label="Rango de fechas" className="inline-flex shrink-0 rounded-lg bg-muted p-1">
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

  function filtersPopover(idSuffix: string) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 lg:h-8 lg:text-[13px]"
          >
            <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
            Filtros
            {activeFilters > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums">
                {activeFilters}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estado
            </legend>
            <RadioChipGroup
              value={status}
              onValueChange={(v) => setFilterParam('status', v)}
              aria-label="Estado"
            >
              {FILTERS.map((f) => (
                <RadioChip key={`${idSuffix}-${f.label}`} value={f.value}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{f.label}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {countFor(counts, f.value)}
                    </span>
                  </span>
                </RadioChip>
              ))}
            </RadioChipGroup>
          </fieldset>

          {/* H110 — sin sentido elegir cancha cuando hay una sola. */}
          {courts.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cancha
              </legend>
              <RadioChipGroup
                value={cancha}
                onValueChange={(v) => setFilterParam('cancha', v)}
                aria-label="Cancha"
              >
                <RadioChip value="">Todas las canchas</RadioChip>
                {courts.map((c) => (
                  <RadioChip key={c.id} value={c.id}>
                    {c.name}
                  </RadioChip>
                ))}
              </RadioChipGroup>
            </fieldset>
          )}

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Limpiar filtros
            </button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  const reservaWord = total === 1 ? '1 reserva' : `${total} reservas`

  return (
    <>
      <GrillaTabs active="/reservas" />
      <AdminHeaderSlot>
        <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
          {scopeNav()}
          {searchField('slot')}
          {filtersPopover('slot')}
          <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">
            {reservaWord}
          </span>
        </div>
      </AdminHeaderSlot>

      {/* < lg: la barra superior ya la ocupa la marca — este control vive arriba del tablero. */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        {scopeNav()}
        {searchField('body')}
        {filtersPopover('body')}
      </div>
    </>
  )
}
