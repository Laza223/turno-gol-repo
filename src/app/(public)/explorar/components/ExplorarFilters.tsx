'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Umbrella, Zap } from 'lucide-react'
import { AMENITIES, AMENITY_ORDER } from '@/components/public/amenities'
import { FORMAT_OPTIONS, SURFACE_OPTIONS, formatLabel } from '@/components/public/courtFacets'
import { MoneyInput } from '@/components/ui/money-input'
import { buildExplorarUrl } from './url'

// 'techado' se maneja en su propia sección de "Cerramiento", no en Servicios.
const SERVICE_KEYS = AMENITY_ORDER.filter((k) => k !== 'techado')

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
  const [minPriceCents, setMinPriceCents] = useState<number | null>(null)
  const [maxPriceCents, setMaxPriceCents] = useState<number | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)

  // (Re)inicializar el borrador desde la URL cada vez que cambia. Ajuste
  // durante el render contra la URL anterior (patrón de React para adaptar
  // estado a un cambio de prop), no en un efecto: con el efecto, cada cambio de
  // filtro pintaba un frame con el borrador viejo.
  //
  // Arranca en `null` a propósito, no en `paramsKey`: los `useState` de arriba
  // inicializan el borrador VACÍO, así que la primera pasada también tiene que
  // sembrarlo desde la URL (el efecto viejo corría al montar). Con la clave
  // inicializada al valor actual, entrar a /explorar con filtros en la URL los
  // mostraba todos apagados — lo atrapó la story `ConFiltrosActivos`.
  const paramsKey = params.toString()
  const [lastParamsKey, setLastParamsKey] = useState<string | null>(null)
  if (paramsKey !== lastParamsKey) {
    setLastParamsKey(paramsKey)
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
    const rawMin = params.get('minPrice')
    const rawMax = params.get('maxPrice')
    setMinPriceCents(rawMin ? Number(rawMin) : null)
    setMaxPriceCents(rawMax ? Number(rawMax) : null)
  }

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  function apply() {
    if (minPriceCents != null && maxPriceCents != null && minPriceCents > maxPriceCents) {
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
        minPrice: minPriceCents != null ? String(minPriceCents) : undefined,
        maxPrice: maxPriceCents != null ? String(maxPriceCents) : undefined,
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
          <Umbrella className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
          <span className="wrap-break-word whitespace-normal leading-tight flex-1">Techado</span>
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
              <span className="wrap-break-word whitespace-normal leading-tight flex-1">{label}</span>
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
                className={`inline-flex h-11 md:h-9 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
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
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                <span className="wrap-break-word whitespace-normal leading-tight flex-1">{label}</span>
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
            <MoneyInput
              id="min-price"
              valueCents={minPriceCents}
              onValueChange={setMinPriceCents}
              minCents={0}
              placeholder="Desde"
            />
          </div>
          <span className="text-muted-foreground">–</span>
          <div className="flex-1">
            <label htmlFor="max-price" className="sr-only">
              Precio máximo
            </label>
            <MoneyInput
              id="max-price"
              valueCents={maxPriceCents}
              onValueChange={setMaxPriceCents}
              minCents={0}
              placeholder="Hasta"
            />
          </div>
        </div>
        {priceError && (
          <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-300">{priceError}</p>
        )}
      </fieldset>

      {/* Reserva online */}
      <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={online} onChange={() => setOnline((v) => !v)} className={`${checkbox} mt-0.5`} />
        <Zap className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" aria-hidden />
        <span className="wrap-break-word whitespace-normal leading-tight flex-1">Solo con reserva online</span>
      </label>

      <div className="flex gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={apply}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-emerald-600/60 dark:border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-500/5 px-4 text-sm font-bold text-emerald-700 dark:text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.06)] dark:shadow-[0_0_16px_rgba(16,185,129,0.15)] transition-all duration-200 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/15 hover:border-emerald-700 dark:hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(16,185,129,0.15)] dark:hover:shadow-[0_0_24px_rgba(16,185,129,0.3)] active:scale-[0.97] whitespace-nowrap"
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
