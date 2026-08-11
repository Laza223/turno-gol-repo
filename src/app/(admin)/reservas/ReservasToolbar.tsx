'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutList, Rows3, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Búsqueda inline URL-based (?q=): el server filtra y los contadores de las
 * píldoras reflejan la búsqueda. Debounce de 300ms para no disparar un
 * roundtrip RSC por tecla. El toggle compacta/detallada también va por URL
 * (?vista=compacta) para que el modo sobreviva a navegación y compartido.
 */
export function ReservasToolbar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') ?? ''
  const compact = searchParams.get('vista') === 'compacta'
  const [value, setValue] = useState(urlQ)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function setVista(nextCompact: boolean) {
    replaceWith((params) => {
      if (nextCompact) params.set('vista', 'compacta')
      else params.delete('vista')
    })
  }

  function onChange(next: string) {
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushQ(next.trim()), 300)
  }

  function clear() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setValue('')
    pushQ('')
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="relative w-full sm:w-72">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <label htmlFor="reservas-search" className="sr-only">
          Buscar por nombre o número de reserva
        </label>
        <input
          id="reservas-search"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar nombre o nº de reserva"
          autoComplete="off"
          className="h-11 md:h-10 w-full rounded-lg border border-input bg-background pl-9 pr-12 md:pr-9 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={clear}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 flex h-11 w-11 md:h-6 md:w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Limpiar búsqueda</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div
        role="group"
        aria-label="Densidad de la lista"
        className="flex shrink-0 rounded-lg bg-muted p-0.5"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setVista(false)}
              aria-pressed={!compact}
              aria-label="Vista detallada"
              className={cn(
                'flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
                !compact
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutList aria-hidden className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Vista detallada</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setVista(true)}
              aria-pressed={compact}
              aria-label="Vista compacta"
              className={cn(
                'flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
                compact
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Rows3 aria-hidden className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Vista compacta</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
