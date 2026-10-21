'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronDown, Clock, MapPin, Search } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { useClientSnapshot } from '@/hooks/use-client-value'
import { useNearestCity } from '@/hooks/use-nearest-city'
import { addDays } from '@/shared/dates/art'
import { todayART } from '@/shared/time/art-date'
import { capitalizeFirst, formatDayHeader } from '@/lib/format'
import type { CityCount } from '@/modules/tenants/search.service'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = { cities: CityCount[]; layout?: 'horizontal' | 'vertical' }

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)
/** Hoy + 6: la anticipación de reserva por defecto de un complejo (`booking_advance_days`). */
const DAYS_AHEAD = 7

/** value compuesto "{city}||{province}" para desambiguar homónimos al armar la URL. */
function cityOptionsFrom(cities: CityCount[]): ComboboxOption[] {
  return cities.map((c) => ({
    value: c.province ? `${c.city}||${c.province}` : c.city,
    label: c.province ? `${c.city}, ${c.province}` : c.city,
  }))
}

/** El del botón: corto, para que entre en la columna ("Mié 22"). El menú usa `dayLabel`. */
function shortDayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  const [y, m, d] = date.split('-').map(Number)
  // UTC de punta a punta: la fecha es de calendario, así el server y el navegador dan el mismo día.
  const short = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return capitalizeFirst(short.replace(/\./g, '').replace(',', ''))
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return capitalizeFirst(formatDayHeader(date))
}

/**
 * Buscador protagonista del hero (estilo ATC). Recolecta Localidad + Fecha + Hora y
 * redirige a /explorar con los filtros como query params. Solo fútbol, así que no hay
 * selector de deporte; buscar un club por nombre vive en /explorar. La fecha se elige entre
 * hoy y los próximos 6 (lo que un complejo deja reservar por defecto); la hora se reenvía
 * para el filtrado por disponibilidad (en /explorar).
 *
 * La localidad se pre-llena con geolocalización (ciudad del complejo más cercano,
 * datos propios — sin geocoding externo) solo mientras el usuario no toque el campo.
 */
export default function HeroSearch({ cities, layout = 'horizontal' }: Props) {
  const router = useRouter()
  // ART explícito, NO el huso del runtime. `todayLocal()` (getTimezoneOffset)
  // devolvía el día del SERVIDOR en el HTML (UTC en Vercel) y el día del
  // NAVEGADOR al hidratar: entre las 21:00 y las 00:00 ART son días distintos,
  // así que el campo llegaba con una fecha en el HTML y otra al hidratar
  // → "Hydration failed … text didn't match" y React regenerando el hero entero
  // en el cliente, todas las noches, para todos los usuarios. Con el offset fijo
  // de Argentina (sin DST) las dos puntas calculan lo mismo.
  const today = useClientSnapshot(todayART, todayART)
  const [city, setCity] = useState('')
  const [cityTouched, setCityTouched] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState('')

  const nearest = useNearestCity()
  const cityOptions = useMemo(() => cityOptionsFrom(cities), [cities])
  const effectiveDate = date ?? today
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)),
    [today],
  )

  // Aplicar la ciudad detectada solo si el usuario todavía no eligió nada.
  useEffect(() => {
    if (nearest.status !== 'found' || cityTouched || city) return
    // Foco pre-hidratación: si el usuario ya está parado en el campo (el focus
    // ocurrió antes de que React montara, onFocusCapture no se enteró), no pisarlo.
    if (typeof document !== 'undefined' && document.activeElement?.id.startsWith('hero-city')) {
      // Este efecto NO adapta estado a un cambio de prop (ahí iría el ajuste
      // durante el render): reacciona a un EVENTO asincrónico —la geolocalización
      // resolvió— y decide consultando el DOM real (`document.activeElement`),
      // que en render no existe. Dispara una vez y no encadena renders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCityTouched(true)
      return
    }
    const match =
      cityOptions.find((o) => o.value === `${nearest.city}||${nearest.province}`) ??
      cityOptions.find((o) => o.value === nearest.city || o.value.startsWith(`${nearest.city}||`))
    if (match) {
      setCity(match.value)
      setPrefilled(true)
    }
  }, [nearest, cityTouched, city, cityOptions])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city) {
      // value is "{city}||{province}" to disambiguate homonyms; split for the URL.
      const [cityPart, provincePart] = city.split('||')
      if (cityPart) params.set('city', cityPart)
      if (provincePart) params.set('province', provincePart)
    }
    if (effectiveDate !== today) params.set('date', effectiveDate)
    if (time) params.set('time', time)
    const qs = params.toString()
    router.push(qs ? `/explorar?${qs}` : '/explorar')
  }

  const geoMessage =
    nearest.status === 'denied'
      ? 'No pudimos acceder a tu ubicación. Elegí tu localidad manualmente.'
      : prefilled && !cityTouched
        ? 'Localidad sugerida según tu ubicación.'
        : ''

  // `md:text-base` pisa el `md:text-sm` del combobox: a 14 px desde `md` iOS zoomea al enfocar.
  const fieldClass =
    'h-[62px] w-full rounded-xl border border-input bg-background pl-11 pr-3 text-base md:text-base text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary'

  const labelClass =
    'mb-[9px] block font-logo text-[13px] font-bold uppercase tracking-wider text-muted-foreground'

  const vertical = layout === 'vertical'
  // Los ids terminan en `-v` en el layout vertical: los dos pueden convivir en el DOM.
  const sfx = vertical ? '-v' : ''
  const iconClass =
    'pointer-events-none absolute left-3.5 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400'
  const chevronClass =
    'pointer-events-none absolute right-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground'
  const menuTriggerClass = `${fieldClass} flex items-center justify-between gap-1 text-left pr-9`

  const cityField = (
    <div
      className={vertical ? 'sm:col-span-2' : undefined}
      onFocusCapture={() => setCityTouched(true)}
    >
      <label htmlFor={`hero-city${sfx}`} className={labelClass}>
        Localidad
      </label>
      <Combobox
        id={`hero-city${sfx}`}
        options={cityOptions}
        value={city}
        onChange={(v) => {
          setCity(v)
          setCityTouched(true)
        }}
        placeholder="¿Dónde?"
        emptyMessage="No encontramos esa localidad"
        listboxLabel="Localidades"
        clearOptionLabel="Todas las ciudades"
        inputClassName={fieldClass}
        aria-describedby={`hero-city${sfx}-status`}
        leadingIcon={<MapPin className={iconClass} aria-hidden />}
      />
    </div>
  )

  // modal={false} en los dos menús: selectores livianos dentro de un form de búsqueda, no un
  // diálogo — con el default (modal=true) Radix llama hideOthers() y aria-hidea el resto del
  // form (incluido "Buscar canchas") mientras el menú está abierto o cerrándose.
  const dateField = (
    <div>
      <label htmlFor={`hero-date${sfx}`} className={labelClass}>
        Fecha
      </label>
      <div className="relative">
        <CalendarDays className={iconClass} aria-hidden />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" id={`hero-date${sfx}`} className={menuTriggerClass}>
              <span className="truncate">{shortDayLabel(effectiveDate, today)}</span>
              <ChevronDown className={chevronClass} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {days.map((d) => (
              <DropdownMenuItem key={d} onSelect={() => setDate(d)} className="cursor-pointer">
                {dayLabel(d, today)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  const timeField = (
    <div>
      <label htmlFor={`hero-time${sfx}`} className={labelClass}>
        Hora
      </label>
      <div className="relative">
        <Clock className={iconClass} aria-hidden />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" id={`hero-time${sfx}`} className={menuTriggerClass}>
              <span className={`truncate ${!time ? 'text-muted-foreground' : 'text-foreground'}`}>
                {time || 'Cualquiera'}
              </span>
              <ChevronDown className={chevronClass} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-60 w-[200px] overflow-y-auto">
            <DropdownMenuItem onSelect={() => setTime('')} className="cursor-pointer">
              Cualquier horario
            </DropdownMenuItem>
            {HOURS.map((h) => (
              <DropdownMenuItem key={h} onSelect={() => setTime(h)} className="cursor-pointer">
                {h}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  const submitButton = (
    <button
      type="submit"
      className="group relative overflow-hidden inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-7 text-base font-bold text-slate-950 border border-emerald-400/20 shadow-[0_4px_20px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.98] after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:transition-transform after:duration-1000 hover:after:translate-x-full whitespace-nowrap"
    >
      <Search
        className="h-[19px] w-[19px] group-hover:scale-110 transition-transform duration-300"
        aria-hidden
      />
      Buscar canchas
    </button>
  )

  const status = (
    <p
      id={`hero-city${sfx}-status`}
      aria-live="polite"
      className="mt-2 min-h-4 text-xs text-muted-foreground"
    >
      {geoMessage}
    </p>
  )

  const pulse = (
    <span className="relative flex h-[9px] w-[9px] shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
    </span>
  )

  const eyebrowClass =
    'font-logo text-[12.5px] font-bold uppercase tracking-[.045em] text-emerald-800 dark:text-emerald-300'

  if (vertical) {
    return (
      <form
        onSubmit={onSubmit}
        aria-label="Buscar canchas de fútbol"
        className="search-card relative rounded-[22px] p-5 sm:p-7"
      >
        <div className={`mb-4 flex items-center gap-[9px] ${eyebrowClass}`}>
          {pulse}
          Buscá disponibilidad ahora
        </div>

        {/* Localidad en fila propia + Fecha/Hora a la par: a 640-1023px, 3 columnas iguales le
            dejaban a Fecha/Hora ~160px y el texto truncaba. A 2 columnas quedan en ~246px. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cityField}
          {dateField}
          {timeField}
          <div className="sm:col-span-2">{submitButton}</div>
        </div>

        {status}
      </form>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      className="search-card relative rounded-3xl p-6 sm:p-[34px]"
    >
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-[9px] ${eyebrowClass}`}>
          {pulse}
          Encontrá tu próxima cancha
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.1fr_auto] lg:items-end lg:gap-5">
        <div className="sm:col-span-2 lg:col-span-1">{cityField}</div>
        {dateField}
        {timeField}
        <div className="sm:col-span-2 lg:col-span-1">{submitButton}</div>
      </div>

      {status}
    </form>
  )
}
