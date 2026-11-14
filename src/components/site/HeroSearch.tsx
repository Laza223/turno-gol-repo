'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GlassSheetContent } from '@/components/ui/glass-sheet'
import { Sheet } from '@/components/ui/sheet'
import { useHydrated } from '@/hooks/use-client-value'
import { useIpZona } from '@/hooks/use-ip-zona'
import { useNearestCity, type NearestCityState } from '@/hooks/use-nearest-city'
import { useSavedZona } from '@/hooks/use-saved-zona'
import { markZonaApplied, type SavedZona } from '@/lib/zona-storage'
import { cn } from '@/lib/utils'
import type { CityCount } from '@/modules/tenants/search.service'
import { formatsLabel } from '@/lib/formats-label'

export type SearchZona = { city: string; province: string }

type Props = {
  cities: CityCount[]
  /** La localidad que muestra el campo (la ventana de complejos de la home la usa). */
  onZonaChange?: (zona: SearchZona | null) => void
  /** El reflejo que cruza la tarjeta una vez por sesión (dirección §4.5, home). */
  reflejo?: boolean
  className?: string
}

/** Los tamaños de cancha que existen (`court_format`): Fútbol 4 a 11. */
const FORMATS = [4, 5, 6, 7, 8, 9, 10, 11] as const

/** Una vez por sesión: el reflejo no se repite al volver a la home. */
const REFLEJO_KEY = 'turnogol:home-reflejo'

/** value compuesto "{city}||{province}" para desambiguar homónimos al armar la URL. */
function cityValue(c: { city: string; province?: string }): string {
  return c.province ? `${c.city}||${c.province}` : c.city
}

function cityLabel(c: CityCount): string {
  return c.province ? `${c.city}, ${c.province}` : c.city
}

function countLabel(n: number): string {
  return n === 1 ? '1 complejo' : `${n} complejos`
}

/** Aviso de la hoja de Localidad según cómo salió la ubicación (vacío = nada que decir). */
function geoStatusMessage(status: NearestCityState['status'], usingZona: boolean): string {
  if (status === 'denied') {
    return 'No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.'
  }
  if (usingZona) return 'Tu zona guardada. Cambiala cuando quieras.'
  if (status === 'error') return 'No pudimos ubicarte. Elegí tu localidad manualmente.'
  if (status === 'no_results') return 'No hay canchas cerca tuyo todavía. Elegí tu localidad.'
  return ''
}

/** La ciudad de la lista que corresponde a la zona (primero ciudad+provincia, luego solo ciudad). */
function findCity(
  cities: CityCount[],
  zona: Pick<SavedZona, 'city' | 'province'> | null,
): CityCount | undefined {
  if (!zona?.city) return undefined
  return (
    cities.find((c) => c.city === zona.city && c.province === (zona.province ?? '')) ??
    cities.find((c) => c.city === zona.city)
  )
}

// Las filas de la hoja de Localidad: 56 px de alto y el verde de lo elegido.
const optionRow =
  'flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-portal-inner-line px-2 text-base text-portal-ink has-checked:font-semibold has-checked:text-portal-slot-ink has-focus-visible:rounded-xl has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-portal-green'
// Lo elegido en la hoja de Cancha: borde y relleno verdes (`.fmt[aria-checked]` del mockup).
const checkedCard =
  'has-checked:border-portal-green has-checked:bg-portal-slot-bg has-checked:shadow-[inset_0_0_0_1px_var(--portal-green)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-portal-green'

/**
 * Buscador del hero de la home, en vidrio (portal de vidrio, F2: `home.html` y las hojas de
 * `buscador.html`). Pide Localidad y Cancha y lleva a /explorar con los filtros en la URL
 * (`city`, `province`, `formats`). Solo fútbol; buscar un club por nombre vive en /explorar.
 *
 * Cada campo abre su hoja (`GlassSheetContent`): abajo en el celu, panel centrado en la compu.
 * Son las piezas que F3 reusa en /explorar, donde suman cuántos complejos tiene cada tamaño (un
 * dato que hoy no llega).
 *
 * La localidad sale, en este orden, de lo elegido en esta visita, la zona guardada en el
 * dispositivo (`useSavedZona`), la zona de la conexión (`useIpZona`, que nunca se guarda) y, si no
 * hay nada, queda vacía. La zona se guarda al elegir una localidad a mano o con "Usar mi ubicación
 * exacta" (la ciudad del complejo más cercano, datos propios, sin geocoding externo); de ahí en
 * más no se vuelve a pedir nada.
 */
export default function HeroSearch({ cities, onZonaChange, reflejo = false, className }: Props) {
  const router = useRouter()
  const ids = useId()
  // `null` = el usuario no eligió nada en esta visita: manda la zona. Un string (aun vacío,
  // "Todas las ciudades") es una elección explícita y gana siempre. Derivado en el render y no
  // sincronizado con un efecto: no hay parpadeo ni setState encadenado.
  const [pickedCity, setPickedCity] = useState<string | null>(null)
  const [formats, setFormats] = useState<number[]>([])
  const [sheet, setSheet] = useState<'localidad' | 'cancha' | null>(null)
  const [query, setQuery] = useState('')
  const [shine, setShine] = useState(false)

  const [zona, saveZona] = useSavedZona()
  const { state: geo, locate, cancel } = useNearestCity()
  const hydrated = useHydrated()
  const zonaCity = findCity(cities, zona)
  // La zona de la conexión se pide solo sin una guardada (un pedido por carga de página).
  const ipZona = useIpZona(hydrated && !zona?.city)
  const ipCity = zonaCity ? undefined : findCity(cities, ipZona)

  const city = pickedCity ?? (zonaCity ? cityValue(zonaCity) : ipCity ? cityValue(ipCity) : '')
  const current = cities.find((c) => cityValue(c) === city)
  const usingZona = zonaCity !== undefined && city === cityValue(zonaCity)
  const usingIp = !usingZona && ipCity !== undefined && city === cityValue(ipCity)

  const zonaCityName = current?.city
  const zonaProvince = current?.province
  useEffect(() => {
    onZonaChange?.(
      zonaCityName !== undefined ? { city: zonaCityName, province: zonaProvince ?? '' } : null,
    )
  }, [zonaCityName, zonaProvince, onZonaChange])

  useEffect(() => {
    if (!reflejo) return
    try {
      if (sessionStorage.getItem(REFLEJO_KEY)) return
      sessionStorage.setItem(REFLEJO_KEY, '1')
    } catch {
      // Storage bloqueado: el reflejo sale igual, una vez por carga.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dato del navegador, una vez al montar
    setShine(true)
  }, [reflejo])

  // Abrir la hoja congela lo que se ve: si la zona (o una ubicación detectada) llega cuando el
  // jugador ya está eligiendo, no le cambia el valor debajo de los dedos.
  function openLocalidad() {
    if (pickedCity === null) setPickedCity(city)
    setQuery('')
    setSheet('localidad')
  }

  // Tocar el botón es pedir la ubicación de nuevo: vuelve a mandar lo que se detecte.
  function onLocate() {
    setPickedCity(null)
    locate()
  }

  function onCityChange(value: string) {
    setPickedCity(value)
    // Elegir a mano gana sobre una ubicación que todavía esté en camino.
    cancel()
    // Elegir una localidad a mano también fija la zona. "Todas las ciudades" NO la borra: solo
    // vale para esta búsqueda.
    if (value) {
      const [cityPart, provincePart] = value.split('||')
      if (cityPart) saveZona({ city: cityPart, province: provincePart })
    }
    setSheet(null)
  }

  function toggleFormat(f: number) {
    setFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f].sort((a, b) => a - b),
    )
  }

  function search() {
    // Buscar sin localidad es pedir "todas": que /explorar no se la reemplace por la zona guardada.
    if (!city) markZonaApplied()
    const params = new URLSearchParams()
    if (city) {
      const [cityPart, provincePart] = city.split('||')
      if (cityPart) params.set('city', cityPart)
      if (provincePart) params.set('province', provincePart)
    }
    if (formats.length) params.set('formats', formats.join(','))
    const qs = params.toString()
    setSheet(null)
    router.push(qs ? `/explorar?${qs}` : '/explorar')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    search()
  }

  const ipMessage = usingIp
    ? `Te mostramos ${current?.city} por la zona desde donde te conectás. La que elijas queda guardada para la próxima.`
    : ''
  const geoMessage = geoStatusMessage(geo.status, usingZona) || ipMessage
  // Con la zona ya guardada, o con la ubicación bloqueada/no soportada, el botón no tiene qué hacer.
  const canLocate = !usingZona && geo.status !== 'denied' && geo.status !== 'unsupported'
  const locating = geo.status === 'locating'

  // El campo cerrado tiene lugar para una palabra en el celu (~80 px): "Todas las ciudades" y
  // "Cualquier tamaño" se cortaban. Las opciones de las hojas conservan el nombre largo.
  const localidadValue = current ? current.city : pickedCity === '' ? 'Todas' : null
  const canchaValue = formatsLabel(formats) ?? 'Todas'

  const q = query.trim().toLocaleLowerCase('es')
  const visibleCities = q
    ? cities.filter((c) => cityLabel(c).toLocaleLowerCase('es').includes(q))
    : cities

  return (
    <>
      <form
        onSubmit={onSubmit}
        aria-label="Buscar canchas de fútbol"
        data-shine={shine ? '' : undefined}
        className={cn(
          'hero-search glass relative grid w-full grid-cols-2 gap-2 rounded-[32px] p-2 text-left font-display md:grid-cols-[1fr_1fr_auto] md:rounded-full',
          className,
        )}
      >
        <span aria-hidden className="hero-search__shine" />
        <Field
          label="Localidad"
          value={localidadValue}
          placeholder="¿Dónde?"
          icon={<MapPin aria-hidden />}
          onClick={openLocalidad}
        />
        <Field
          label="Cancha"
          value={canchaValue}
          icon={<CanchaIcon />}
          onClick={() => setSheet('cancha')}
          divided
        />
        <button
          type="submit"
          className="relative col-span-2 inline-flex h-14 items-center justify-center rounded-full bg-linear-to-b from-(--portal-btn-a) to-(--portal-btn-b) px-14 text-[17px] font-semibold whitespace-nowrap text-portal-on-green shadow-[inset_0_1px_0_rgb(255_255_255/.45),0_14px_30px_-12px_var(--portal-btn-glow)] transition-[scale,filter] duration-480 ease-(--ease-toque) hover:brightness-106 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green active:scale-[.985] active:duration-(--dur-1) motion-reduce:active:scale-100 md:col-span-1 md:h-15 md:pr-[62px] md:pl-7"
        >
          Buscar canchas
          <span
            aria-hidden
            className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-[rgb(2_44_34/.18)] shadow-[inset_0_1px_0_rgb(255_255_255/.28)] md:top-2.5 md:right-2.5"
          >
            <Search className="size-5" strokeWidth={2.4} />
          </span>
        </button>
      </form>

      <Sheet open={sheet === 'localidad'} onOpenChange={(open) => !open && setSheet(null)}>
        <GlassSheetContent title="Elegí la localidad">
          <p
            id={`${ids}-status`}
            aria-live="polite"
            className="mt-1.5 mb-4 min-h-5 text-[15px] leading-[1.45] text-portal-soft"
          >
            {geoMessage}
          </p>
          <label
            htmlFor={`${ids}-q`}
            className="mb-1.5 block text-sm font-semibold text-portal-ink"
          >
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
              placeholder="Por ejemplo, Mercedes"
              autoComplete="off"
              aria-describedby={`${ids}-status`}
              className="h-13 w-full rounded-[18px] border border-portal-inner-line bg-portal-inner pr-4 pl-12 text-base text-portal-ink placeholder:text-portal-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
            />
          </div>
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

      <Sheet open={sheet === 'cancha'} onOpenChange={(open) => !open && setSheet(null)}>
        <GlassSheetContent title="Tamaño de cancha">
          <p className="mt-1.5 mb-4 text-[15px] leading-[1.45] text-portal-soft">
            Podés marcar más de uno.
          </p>
          <fieldset>
            <legend className="sr-only">Tamaños de cancha</legend>
            <label
              className={cn(
                'mb-2 flex min-h-14 w-full cursor-pointer items-center rounded-[20px] border border-portal-inner-line bg-portal-inner px-4 text-base font-semibold text-portal-ink',
                checkedCard,
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={formats.length === 0}
                onChange={() => setFormats([])}
              />
              Cualquier tamaño
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => (
                <label
                  key={f}
                  className={cn(
                    'group relative grid min-h-19 cursor-pointer content-center rounded-[20px] border border-portal-inner-line bg-portal-inner px-4 py-3 text-portal-ink transition-[background-color,border-color] duration-(--dur-2)',
                    checkedCard,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={formats.includes(f)}
                    onChange={() => toggleFormat(f)}
                  />
                  <span className="text-lg leading-[22px] font-semibold tracking-[-0.01em]">
                    Fútbol {f}
                  </span>
                  <span
                    aria-hidden
                    className="absolute top-3 right-3 grid size-5.5 place-items-center rounded-full border-[1.5px] border-portal-soft text-portal-on-green group-has-checked:border-transparent group-has-checked:bg-linear-to-b group-has-checked:from-(--portal-btn-a) group-has-checked:to-(--portal-btn-b)"
                  >
                    <Check
                      className="size-3.5 opacity-0 group-has-checked:opacity-100"
                      strokeWidth={3}
                    />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
            <Button type="button" variant="pill-glass" size="pill" onClick={() => setFormats([])}>
              Borrar
            </Button>
            <Button type="button" variant="pill" size="pill" onClick={search}>
              Buscar canchas
            </Button>
          </div>
        </GlassSheetContent>
      </Sheet>
    </>
  )
}

function Field({
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
function CanchaIcon() {
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
