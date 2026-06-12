'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutList, Rows3, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>

      <div role="group" aria-label="Densidad de la lista" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
        <button
          type="button"
          onClick={() => setVista(false)}
          aria-pressed={!compact}
          aria-label="Vista detallada"
          title="Vista detallada"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            !compact ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          <LayoutList aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setVista(true)}
          aria-pressed={compact}
          aria-label="Vista compacta"
          title="Vista compacta"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            compact ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          <Rows3 aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
