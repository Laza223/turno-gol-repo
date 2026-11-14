'use client'

import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, LocateFixed, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GlassSheetContent } from '@/components/ui/glass-sheet'
import { Sheet } from '@/components/ui/sheet'
import { FORMAT_OPTIONS } from '@/components/public/courtFacets'
import type { SavedZona } from '@/lib/zona-storage'
import { cn } from '@/lib/utils'
import type { CityCount } from '@/modules/tenants/search.service'
import type { NearestCityState } from '@/hooks/use-nearest-city'

/**
 * Las piezas del buscador de vidrio que comparten la home y /explorar (portal de vidrio, F2 y F3:
 * `buscador.html` y sus dos hojas). Cada campo abre su hoja (`GlassSheetContent`): abajo en el
 * celu, panel centrado en la compu. Qué hace cada elección lo decide quien las usa.
 */

/** value compuesto "{city}||{province}" para desambiguar homónimos al armar la URL. */
export function cityValue(c: { city: string; province?: string }): string {
  return c.province ? `${c.city}||${c.province}` : c.city
}

function cityLabel(c: CityCount): string {
  return c.province ? `${c.city}, ${c.province}` : c.city
}

function countLabel(n: number): string {
  return n === 1 ? '1 complejo' : `${n} complejos`
}

/** Aviso de la hoja de Localidad según cómo salió la ubicación (vacío = nada que decir). */
export function geoStatusMessage(status: NearestCityState['status'], usingZona: boolean): string {
  if (status === 'denied') {
    return 'No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.'
  }
  if (usingZona) return 'Tu zona guardada. Cambiala cuando quieras.'
  if (status === 'error') return 'No pudimos ubicarte. Elegí tu localidad manualmente.'
  if (status === 'no_results') return 'No hay canchas cerca tuyo todavía. Elegí tu localidad.'
  return ''
}

/** La ciudad de la lista que corresponde a la zona (primero ciudad+provincia, luego solo ciudad). */
export function findCity(
  cities: CityCount[],
  zona: Pick<SavedZona, 'city' | 'province'> | null,
): CityCount | undefined {
  if (!zona?.city) return undefined
  return (
    cities.find((c) => c.city === zona.city && c.province === (zona.province ?? '')) ??
    cities.find((c) => c.city === zona.city)
  )
}

/** Cuántos complejos tienen al menos uno de los tamaños elegidos (sin tamaño: todos). */
function matchingCount(formatSets: number[][], formats: readonly number[]): number {
  if (formats.length === 0) return formatSets.length
  return formatSets.filter((set) => set.some((f) => formats.includes(f))).length
}

// Las filas de la hoja de Localidad: 56 px de alto y el verde de lo elegido.
const optionRow =
  'flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-portal-inner-line px-2 text-base text-portal-ink has-checked:font-semibold has-checked:text-portal-slot-ink has-focus-visible:rounded-xl has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-portal-green'
// Lo elegido en la hoja de Cancha: borde y relleno verdes (`.fmt[aria-checked]` del mockup).
const checkedCard =
  'has-checked:border-portal-green has-checked:bg-portal-slot-bg has-checked:shadow-[inset_0_0_0_1px_var(--portal-green)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-portal-green'

export function LocalidadSheet({
  open,
  onClose,
  cities,
  city,
  onCityChange,
  message,
  canLocate,
  locating,
  onLocate,
  onNameSearch,
}: {
  open: boolean
  onClose: () => void
  cities: CityCount[]
  /** La localidad marcada, como `cityValue` ('' = todas). */
  city: string
  onCityChange: (value: string) => void
  message: string
  canLocate: boolean
  locating: boolean
  onLocate: () => void
  /** /explorar: con texto escrito, una fila busca un complejo por ese nombre. */
  onNameSearch?: (name: string) => void
}) {
  const ids = useId()
  const [query, setQuery] = useState('')
  // Cada vez que se abre, la búsqueda arranca vacía (ajuste en el render, no en un efecto).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery('')
  }

  const name = query.trim()
  const q = name.toLocaleLowerCase('es')
  const visibleCities = q
    ? cities.filter((c) => cityLabel(c).toLocaleLowerCase('es').includes(q))
    : cities

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <GlassSheetContent title="Elegí la localidad">
        <p
          id={`${ids}-status`}
          aria-live="polite"
          className="mt-1.5 mb-4 min-h-5 text-[15px] leading-[1.45] text-portal-soft"
        >
          {message}
        </p>
        <label htmlFor={`${ids}-q`} className="mb-1.5 block text-sm font-semibold text-portal-ink">
          Localidad
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-portal-soft"
          />
          <input
            id={`${ids}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onNameSearch && name && visibleCities.length === 0) {
                e.preventDefault()
                onNameSearch(name)
              }
            }}
            placeholder="Escribí tu localidad"
            autoComplete="off"
            aria-describedby={`${ids}-status`}
            className="h-13 w-full rounded-[18px] border border-portal-inner-line bg-portal-inner pr-4 pl-12 text-base text-portal-ink placeholder:text-portal-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
          />
        </div>
        {onNameSearch && name && (
          <button
            type="button"
            onClick={() => onNameSearch(name)}
            className="mt-2 flex min-h-14 w-full items-center gap-3 border-b border-portal-inner-line px-2 text-left text-base text-portal-ink focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-portal-green"
          >
            <Search className="size-5 shrink-0 text-portal-soft" aria-hidden />
            <span className="min-w-0 truncate">
              Buscar complejos que se llamen <b className="font-semibold">“{name}”</b>
            </span>
          </button>
        )}
        {canLocate && (
          <button
            type="button"
            onClick={onLocate}
            disabled={locating}
            className="mt-2 flex min-h-14 w-full items-center gap-3 border-b border-portal-inner-line px-2 text-left text-base font-semibold text-portal-slot-ink focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-portal-green disabled:opacity-60"
          >
            <LocateFixed className="size-5" aria-hidden />
            {locating ? 'Buscando…' : 'Usar mi ubicación exacta'}
          </button>
        )}
        <fieldset className="mt-1">
          <legend className="sr-only">Localidades con complejos</legend>
          <label className={optionRow}>
            <input
              type="radio"
              name={`${ids}-city`}
              className="sr-only"
              checked={city === ''}
              onChange={() => onCityChange('')}
              onClick={() => city === '' && onCityChange('')}
            />
            Todas las ciudades
            {city === '' && <Check className="ml-auto size-5" aria-hidden />}
          </label>
          {visibleCities.map((c) => {
            const value = cityValue(c)
            const checked = city === value
            return (
              <label key={value} className={optionRow}>
                <input
                  type="radio"
                  name={`${ids}-city`}
                  className="sr-only"
                  checked={checked}
                  onChange={() => onCityChange(value)}
                  // Un radio ya marcado no dispara `change`: tocarlo igual confirma la localidad
                  // (la que puso la conexión queda guardada) y cierra la hoja.
                  onClick={() => checked && onCityChange(value)}
                />
                {cityLabel(c)}
                <span className="ml-auto text-sm font-normal text-portal-soft">
                  {countLabel(c.count)}
                </span>
                {checked && <Check className="size-5 shrink-0" aria-hidden />}
              </label>
            )
          })}
          {visibleCities.length === 0 && (
            <p className="py-4 text-base text-portal-soft">No encontramos esa localidad</p>
          )}
        </fieldset>
      </GlassSheetContent>
    </Sheet>
  )
}

export function CanchaSheet({
  open,
  onClose,
  formats,
  onFormatsChange,
  onSubmit,
  formatSets,
  place,
}: {
  open: boolean
  onClose: () => void
  formats: number[]
  onFormatsChange: (formats: number[]) => void
  onSubmit: () => void
  /** /explorar: los tamaños de cada complejo de la localidad, para mostrar cuántos hay. */
  formatSets?: number[][]
  /** La localidad de esos complejos ("Ninguno en Luján"). */
  place?: string
}) {
  function toggle(f: number) {
    onFormatsChange(
      formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f].sort((a, b) => a - b),
    )
  }

  const total = formatSets ? matchingCount(formatSets, formats) : null
  const submitLabel = total ? `Ver ${countLabel(total)}` : 'Buscar canchas'

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <GlassSheetContent title="Tamaño de cancha">
        <p className="mt-1.5 mb-4 text-[15px] leading-[1.45] text-portal-soft">
          {formatSets
            ? `Podés marcar más de uno. Debajo de cada tamaño ves cuántos complejos${place ? ` de ${place}` : ''} lo tienen.`
            : 'Podés marcar más de uno.'}
        </p>
        <fieldset>
          <legend className="sr-only">Tamaños de cancha</legend>
          <label
            className={cn(
              'mb-2 flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-[20px] border border-portal-inner-line bg-portal-inner px-4 text-base font-semibold text-portal-ink',
              checkedCard,
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={formats.length === 0}
              onChange={() => onFormatsChange([])}
            />
            Cualquier tamaño
            {formatSets && (
              <span className="text-sm font-normal text-portal-soft">
                {countLabel(formatSets.length)}
              </span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FORMAT_OPTIONS.map((f) => {
              const count = formatSets ? matchingCount(formatSets, [f]) : null
              const checked = formats.includes(f)
              // Un tamaño sin complejos se apaga, salvo que ya venga marcado (link viejo): así se
              // puede desmarcar.
              const off = count === 0 && !checked
              return (
                <label
                  key={f}
                  className={cn(
                    'search-fmt group relative grid min-h-19 content-center gap-0.5 rounded-[20px] border border-portal-inner-line bg-portal-inner px-4 py-3 text-portal-ink transition-[background-color,border-color] duration-(--dur-2)',
                    off ? 'cursor-default border-dashed bg-transparent' : 'cursor-pointer',
                    checkedCard,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={off}
                    onChange={() => toggle(f)}
                  />
                  <span
                    className={cn(
                      'text-lg leading-[22px] font-semibold tracking-[-0.01em]',
                      off && 'text-portal-soft',
                    )}
                  >
                    Fútbol {f}
                  </span>
                  {count !== null && (
                    <span className="text-[13px] leading-[18px] text-portal-soft">
                      {count > 0 ? countLabel(count) : place ? `Ninguno en ${place}` : 'Ninguno'}
                    </span>
                  )}
                  {!off && (
                    <span
                      aria-hidden
                      className="search-fmt__ck absolute top-3 right-3 grid size-5.5 place-items-center rounded-full border-[1.5px] border-portal-soft text-portal-on-green group-has-checked:border-transparent group-has-checked:bg-linear-to-b group-has-checked:from-(--portal-btn-a) group-has-checked:to-(--portal-btn-b)"
                    >
                      <Check
                        className="size-3.5 opacity-0 group-has-checked:opacity-100"
                        strokeWidth={3}
                      />
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
          <Button
            type="button"
            variant="pill-glass"
            size="pill"
            onClick={() => onFormatsChange([])}
          >
            Borrar
          </Button>
          <Button type="button" variant="pill" size="pill" onClick={onSubmit}>
            {/* El número cambia por reemplazo (pieza Reemplazo): la `key` lo vuelve a montar. */}
            <span key={submitLabel} className="search-replace inline-block">
              {submitLabel}
            </span>
          </Button>
        </div>
      </GlassSheetContent>
    </Sheet>
  )
}

export function SearchField({
  label,
  value,
  placeholder,
  icon,
  onClick,
  divided = false,
}: {
  label: string
  value: string | null
  placeholder?: string
  icon: ReactNode
  onClick: () => void
  divided?: boolean
}) {
  const shown = value ?? placeholder ?? ''
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      aria-label={`${label}: ${shown}. Cambiar`}
      className={cn(
        'relative grid min-h-15 cursor-pointer grid-cols-[22px_minmax(0,1fr)_16px] items-center gap-x-2.5 rounded-3xl px-3 text-left text-portal-ink transition-colors duration-(--dur-2) hover:bg-portal-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green md:rounded-full md:pr-4.5 md:pl-5 [&>svg:first-child]:size-5.5 [&>svg:first-child]:text-portal-green',
        divided &&
          'before:absolute before:top-3 before:bottom-3 before:-left-1 before:w-px before:bg-portal-inner-line',
      )}
    >
      {icon}
      <span className="grid min-w-0">
        <span className="text-[13px] leading-4 text-portal-soft">{label}</span>{' '}
        {/* El espacio separa las dos líneas para el lector y para axe ("Localidad Luján", no
            "LocalidadLuján"); en la grilla no ocupa lugar. */}
        <span
          className={cn(
            'truncate text-[17px] leading-[22px] font-semibold',
            !value && 'text-portal-soft',
          )}
        >
          {shown}
        </span>
      </span>
      <ChevronDown className="size-4 text-portal-soft" aria-hidden />
    </button>
  )
}

/** La cancha vista de arriba: el ícono del campo Cancha del mockup. */
export function CanchaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}
