'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Umbrella, Zap } from 'lucide-react'
import { AMENITIES, AMENITY_ORDER } from '@/components/public/amenities'
import { FORMAT_OPTIONS, SURFACE_OPTIONS, formatLabel } from '@/components/public/courtFacets'
import { buildExplorarUrl } from './url'

// 'techado' se maneja en su propia sección de "Cerramiento", no en Servicios.
const SERVICE_KEYS = AMENITY_ORDER.filter((k) => k !== 'techado')

function centsToPesos(v: string | null): string {
  if (!v) return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n / 100)) : ''
}
function pesosToCents(v: string): string | undefined {
  const n = Number(v)
  return v.trim() && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : undefined
}

type Props = {
  /** Callback al aplicar (lo usa el drawer mobile para cerrarse). */
  onApplied?: () => void
}

/**
 * Panel de filtros avanzados de /explorar. Estado borrador local + botón
 * "Aplicar" que escribe a la URL (evita un re-fetch por cada checkbox).
 * Reutilizable en el sidebar (desktop) y en el drawer (mobile).
 */
export default function ExplorarFilters({ onApplied }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const [surfaces, setSurfaces] = useState<Set<string>>(new Set())
  const [formats, setFormats] = useState<Set<number>>(new Set())
  const [services, setServices] = useState<Set<string>>(new Set())
  const [techado, setTechado] = useState(false)
  const [online, setOnline] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  // (Re)inicializar el borrador desde la URL cada vez que cambia.
  useEffect(() => {
    const amenities = new Set((params.get('amenities') ?? '').split(',').filter(Boolean))
    setSurfaces(new Set((params.get('surfaces') ?? '').split(',').filter(Boolean)))
    setFormats(
      new Set(
        (params.get('formats') ?? '')
          .split(',')
          .filter(Boolean)
          .map(Number)
          .filter((n) => Number.isFinite(n)),
      ),
    )
    setTechado(amenities.has('techado'))
    setServices(new Set(Array.from(amenities).filter((a) => a !== 'techado')))
    setOnline(params.get('online') === '1')
    setMinPrice(centsToPesos(params.get('minPrice')))
    setMaxPrice(centsToPesos(params.get('maxPrice')))
  }, [params])

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  function apply() {
    const amenities = Array.from(services)
    if (techado) amenities.push('techado')
    router.push(
      buildExplorarUrl(params, {
        surfaces: surfaces.size ? Array.from(surfaces).join(',') : undefined,
        formats: formats.size ? Array.from(formats).join(',') : undefined,
        amenities: amenities.length ? amenities.join(',') : undefined,
        online: online ? '1' : undefined,
        minPrice: pesosToCents(minPrice),
        maxPrice: pesosToCents(maxPrice),
      }),
    )
    onApplied?.()
  }

  function clearAll() {
    // Preserva la búsqueda (q/city/date/time/sort/view), limpia los filtros avanzados.
    router.push(
      buildExplorarUrl(params, {
        surfaces: undefined,
        formats: undefined,
        amenities: undefined,
        online: undefined,
        minPrice: undefined,
        maxPrice: undefined,
      }),
    )
    onApplied?.()
  }

  const checkbox =
    'h-4 w-4 rounded border-slate-300 text-emerald-600 focus-visible:ring-emerald-500'

  return (
    <div className="flex flex-col gap-6">
      {/* Cerramiento */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Cerramiento</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={techado} onChange={() => setTechado((v) => !v)} className={checkbox} />
          <Umbrella className="h-4 w-4 text-slate-400" aria-hidden />
          Techado
        </label>
      </fieldset>

      {/* Superficie */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Superficie</legend>
        <div className="flex flex-col gap-2">
          {SURFACE_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={surfaces.has(key)}
                onChange={() => setSurfaces((s) => toggle(s, key))}
                className={checkbox}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Formato */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Formato</legend>
        <div className="flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((f) => {
            const active = formats.has(f)
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFormats((s) => toggle(s, f))}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {formatLabel(f)}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Servicios */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Servicios</legend>
        <div className="grid grid-cols-2 gap-2">
          {SERVICE_KEYS.map((key) => {
            const { label, Icon } = AMENITIES[key]
            return (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={services.has(key)}
                  onChange={() => setServices((s) => toggle(s, key))}
                  className={checkbox}
                />
                <Icon className="h-4 w-4 text-slate-400" aria-hidden />
                {label}
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Precio */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Precio por turno (ARS)</legend>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label htmlFor="min-price" className="sr-only">
              Precio mínimo
            </label>
            <input
              id="min-price"
              type="number"
              inputMode="numeric"
              min={0}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Desde"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
          <span className="text-slate-400">–</span>
          <div className="flex-1">
            <label htmlFor="max-price" className="sr-only">
              Precio máximo
            </label>
            <input
              id="max-price"
              type="number"
              inputMode="numeric"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Hasta"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </fieldset>

      {/* Reserva online */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={online} onChange={() => setOnline((v) => !v)} className={checkbox} />
        <Zap className="h-4 w-4 text-emerald-500" aria-hidden />
        Solo con reserva online
      </label>

      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={apply}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-[0.99] motion-reduce:active:scale-100"
        >
          Aplicar filtros
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}
