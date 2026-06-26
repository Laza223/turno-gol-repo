'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { SlidersHorizontal, Umbrella, Zap } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatLabel } from '@/components/public/courtFacets'
import ExplorarFilters from './ExplorarFilters'
import { buildExplorarUrl } from './url'

const QUICK_FORMATS = [5, 7, 11] as const

function csv(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

function toggleCsv(list: string[], value: string): string | undefined {
  const set = new Set(list)
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return set.size ? Array.from(set).join(',') : undefined
}

const chipBase =
  'inline-flex h-11 md:h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2'
const chipOn = 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
const chipOff = 'border-border bg-card text-muted-foreground hover:bg-accent'

export default function QuickFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [drawer, setDrawer] = useState(false)

  const formats = csv(params.get('formats'))
  const surfaces = csv(params.get('surfaces'))
  const amenities = csv(params.get('amenities'))
  const online = params.get('online') === '1'

  const activeCount =
    formats.length +
    surfaces.length +
    amenities.length +
    (online ? 1 : 0) +
    (params.get('minPrice') ? 1 : 0) +
    (params.get('maxPrice') ? 1 : 0)

  function setParam(key: string, value: string | undefined) {
    router.push(buildExplorarUrl(params, { [key]: value }))
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {QUICK_FORMATS.map((f) => {
        const on = formats.includes(String(f))
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => setParam('formats', toggleCsv(formats, String(f)))}
            className={`${chipBase} ${on ? chipOn : chipOff}`}
          >
            {formatLabel(f)}
          </button>
        )
      })}

      <button
        type="button"
        aria-pressed={surfaces.includes('synthetic_grass')}
        onClick={() => setParam('surfaces', toggleCsv(surfaces, 'synthetic_grass'))}
        className={`${chipBase} ${surfaces.includes('synthetic_grass') ? chipOn : chipOff}`}
      >
        Sintético
      </button>

      <button
        type="button"
        aria-pressed={amenities.includes('techado')}
        onClick={() => setParam('amenities', toggleCsv(amenities, 'techado'))}
        className={`${chipBase} ${amenities.includes('techado') ? chipOn : chipOff}`}
      >
        <Umbrella className="h-4 w-4" aria-hidden />
        Techado
      </button>

      <button
        type="button"
        aria-pressed={online}
        onClick={() => setParam('online', online ? undefined : '1')}
        className={`${chipBase} ${online ? chipOn : chipOff}`}
      >
        <Zap className="h-4 w-4" aria-hidden />
        Online
      </button>

      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogTrigger asChild>
          <button type="button" aria-haspopup="dialog" className={`${chipBase} ${chipOff}`}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Todos los filtros
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-semibold text-white tabular-nums">
                {activeCount}
              </span>
            )}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Todos los filtros</DialogTitle>
          </DialogHeader>
          <ExplorarFilters onApplied={() => setDrawer(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
