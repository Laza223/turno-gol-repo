'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { List, Map as MapIcon, SlidersHorizontal } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import ExplorarFilters from './ExplorarFilters'
import { buildExplorarUrl } from './url'

type Props = { total: number }

const SORTS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'price', label: 'Precio más bajo' },
  { value: 'rating', label: 'Mejor valorado' },
  { value: 'distance', label: 'Más cercano' },
]

function countCsv(v: string | null): number {
  return v ? v.split(',').filter(Boolean).length : 0
}

/** Barra de herramientas: contador, filtros (drawer mobile), orden y vista lista/mapa. */
export default function ExplorarToolbar({ total }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  const view = params.get('view') === 'map' ? 'map' : 'list'
  const sort = params.get('sort') ?? 'name'
  const activeCount =
    countCsv(params.get('surfaces')) +
    countCsv(params.get('formats')) +
    countCsv(params.get('amenities')) +
    (params.get('online') === '1' ? 1 : 0) +
    (params.get('minPrice') ? 1 : 0) +
    (params.get('maxPrice') ? 1 : 0)

  function setView(next: 'list' | 'map') {
    router.push(buildExplorarUrl(params, { view: next === 'list' ? undefined : 'map' }, { resetOffset: false }))
  }

  function setSort(value: string) {
    if (value === 'distance') {
      // Cercanía requiere coordenadas del usuario.
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        toast({ title: 'Tu navegador no soporta geolocalización.', variant: 'destructive' })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          router.push(
            buildExplorarUrl(params, {
              sort: 'distance',
              lat: pos.coords.latitude.toFixed(6),
              lng: pos.coords.longitude.toFixed(6),
            }),
          )
        },
        () => {
          toast({
            title: 'Activá la ubicación para ordenar por cercanía.',
            variant: 'destructive',
          })
        },
        { enableHighAccuracy: false, timeout: 8000 },
      )
      return
    }
    router.push(buildExplorarUrl(params, { sort: value === 'name' ? undefined : value, lat: undefined, lng: undefined }))
  }

  const toggleBase =
    'inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500" aria-live="polite">
          <span className="font-semibold text-slate-900 tabular-nums">{total}</span>{' '}
          {total === 1 ? 'complejo' : 'complejos'}
        </p>

        {/* Filtros — drawer en mobile (en desktop el sidebar está siempre visible) */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtros
              {activeCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-semibold text-white tabular-nums">
                  {activeCount}
                </span>
              )}
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Filtros</DialogTitle>
            </DialogHeader>
            <ExplorarFilters onApplied={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="exp-sort" className="sr-only">
          Ordenar por
        </label>
        <select
          id="exp-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Toggle vista lista / mapa */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" role="group" aria-label="Vista">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={`${toggleBase} ${view === 'list' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <List className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={`${toggleBase} border-l border-slate-200 ${view === 'map' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Mapa</span>
          </button>
        </div>
      </div>
    </div>
  )
}
