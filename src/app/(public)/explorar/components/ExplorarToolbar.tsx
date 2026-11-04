'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { List, Map as MapIcon } from 'lucide-react'
import { useSavedZona } from '@/hooks/use-saved-zona'
import { useToast } from '@/hooks/use-toast'
import { roundCoord } from '@/lib/zona-storage'
import type { SortOption } from '@/modules/tenants/search.service'
import { buildExplorarUrl } from './url'

type Props = {
  total: number
  /** El orden que el servidor aplicó de verdad (`effectiveSort`), no el del param de la URL. */
  sort: SortOption
}

const SORTS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'price', label: 'Precio más bajo' },
  { value: 'rating', label: 'Mejor valorado' },
  { value: 'distance', label: 'Más cercano' },
]

/** Barra de herramientas: contador, orden y toggle lista/mapa. */
export default function ExplorarToolbar({ total, sort }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const [zona, saveZona] = useSavedZona()

  const view = params.get('view') === 'map' ? 'map' : 'list'

  function setView(next: 'list' | 'map') {
    router.push(
      buildExplorarUrl(
        params,
        { view: next === 'list' ? undefined : 'map' },
        { resetOffset: false },
      ),
    )
  }

  function setSort(value: string) {
    if (value === 'distance') {
      // Cercanía requiere coordenadas del usuario. Si ya las tenemos guardadas (de "Usar mi
      // ubicación" o de una vez anterior), se usan directo: nada de volver a pedir el permiso.
      // Van con ~1 km de precisión (2 decimales): la URL se comparte y no debe delatar la casa.
      if (zona?.lat !== undefined && zona.lng !== undefined) {
        router.push(
          buildExplorarUrl(params, {
            sort: 'distance',
            lat: zona.lat.toFixed(2),
            lng: zona.lng.toFixed(2),
          }),
        )
        return
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        toast({ title: 'Tu navegador no soporta geolocalización.', variant: 'destructive' })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = roundCoord(pos.coords.latitude)
          const lng = roundCoord(pos.coords.longitude)
          saveZona({ lat, lng })
          router.push(
            buildExplorarUrl(params, {
              sort: 'distance',
              lat: lat.toFixed(2),
              lng: lng.toFixed(2),
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
    router.push(
      buildExplorarUrl(params, {
        sort: value === 'name' ? undefined : value,
        lat: undefined,
        lng: undefined,
      }),
    )
  }

  // min-w-11: en mobile el label se oculta (`hidden sm:inline`) y quedaba solo
  // el ícono, así que el botón medía 40px de ancho — alto OK, ancho corto.
  const toggleBase =
    'inline-flex h-11 min-w-11 justify-center md:h-9 md:min-w-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-foreground tabular-nums">{total}</span>{' '}
        {total === 1 ? 'complejo' : 'complejos'}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="exp-sort" className="sr-only">
          Ordenar por
        </label>
        <select
          id="exp-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-11 md:h-9 rounded-lg border border-border bg-card pl-3 pr-8 text-sm text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {SORTS.map((s) => (
            <option
              key={s.value}
              value={s.value}
              className="bg-card text-foreground dark:bg-slate-900 dark:text-slate-100"
            >
              {s.label}
            </option>
          ))}
        </select>

        {/* Toggle vista lista / mapa */}
        <div
          className="inline-flex overflow-hidden rounded-lg border border-border bg-card shadow-xs"
          role="group"
          aria-label="Vista"
        >
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={`${toggleBase} ${view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <List className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={`${toggleBase} border-l border-border ${view === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Mapa</span>
          </button>
        </div>
      </div>
    </div>
  )
}
