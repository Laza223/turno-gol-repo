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
  const [priceError, setPriceError] = useState<string | null>(null)

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
    const minCents = pesosToCents(minPrice)
    const maxCents = pesosToCents(maxPrice)
    if (minCents && maxCents && Number(minCents) > Number(maxCents)) {
      setPriceError('El precio mínimo no puede superar el máximo.')
      return
    }
    setPriceError(null)
    const amenities = Array.from(services)
    if (techado) amenities.push('techado')
    router.push(
      buildExplorarUrl(params, {
        surfaces: surfaces.size ? Array.from(surfaces).join(',') : undefined,
        formats: formats.size ? Array.from(formats).join(',') : undefined,
        amenities: amenities.length ? amenities.join(',') : undefined,
        online: online ? '1' : undefined,
        minPrice: minCents,
        maxPrice: maxCents,
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
    'h-4 w-4 rounded border-border text-emerald-600 focus-visible:ring-emerald-500'

  return (
    <div className="flex flex-col gap-6">
      {/* Cerramiento */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Cerramiento</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
          <input type="checkbox" checked={techado} onChange={() => setTechado((v) => !v)} className={`${checkbox} mt-0.5`} />
          <Umbrella className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden />
          <span className="break-words whitespace-normal leading-tight flex-1">Techado</span>
        </label>
      </fieldset>

      {/* Superficie */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Superficie</legend>
        <div className="flex flex-col gap-2">
          {SURFACE_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={surfaces.has(key)}
                onChange={() => setSurfaces((s) => toggle(s, key))}
                className={`${checkbox} mt-0.5`}
              />
              <span className="break-words whitespace-normal leading-tight flex-1">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Formato */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Formato</legend>
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
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent'
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
        <legend className="mb-2 text-sm font-semibold text-foreground">Servicios</legend>
        <div className="flex flex-col gap-2">
          {SERVICE_KEYS.map((key) => {
            const { label, Icon } = AMENITIES[key]
            return (
              <label key={key} className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={services.has(key)}
                  onChange={() => setServices((s) => toggle(s, key))}
                  className={`${checkbox} mt-0.5`}
                />
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden />
                <span className="break-words whitespace-normal leading-tight flex-1">{label}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Precio */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Precio por turno (ARS)</legend>
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
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
          <span className="text-muted-foreground">–</span>
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
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
        {priceError && (
          <p role="alert" className="mt-1.5 text-xs text-red-600">{priceError}</p>
        )}
      </fieldset>

      {/* Reserva online */}
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={online} onChange={() => setOnline((v) => !v)} className={`${checkbox} mt-0.5`} />
        <Zap className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" aria-hidden />
        <span className="break-words whitespace-normal leading-tight flex-1">Solo con reserva online</span>
      </label>

      <div className="flex gap-2 border-t border-border pt-4">
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
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}
