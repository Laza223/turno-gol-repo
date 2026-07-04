'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Clock, MapPin, Search, ChevronDown } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { useNearestCity } from '@/hooks/use-nearest-city'
import type { CityCount } from '@/modules/tenants/search.service'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = { cities: CityCount[]; layout?: 'horizontal' | 'vertical' }

/** YYYY-MM-DD de hoy en horario local (evita el shift de toISOString en UTC). */
function todayLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)

/** value compuesto "{city}||{province}" para desambiguar homónimos al armar la URL. */
function cityOptionsFrom(cities: CityCount[]): ComboboxOption[] {
  return cities.map((c) => ({
    value: c.province ? `${c.city}||${c.province}` : c.city,
    label: c.province ? `${c.city}, ${c.province}` : c.city,
  }))
}

/**
 * Buscador protagonista del hero (estilo ATC). Recolecta Localidad + Fecha +
 * Hora y redirige a /explorar con los filtros como query params. Solo fútbol por
 * ahora, así que no hay selector de deporte. La fecha/hora se reenvían para el
 * filtrado por disponibilidad (en /explorar).
 *
 * La localidad se pre-llena con geolocalización (ciudad del complejo más cercano,
 * datos propios — sin geocoding externo) solo mientras el usuario no toque el campo.
 */
export default function HeroSearch({ cities, layout = 'horizontal' }: Props) {
  const router = useRouter()
  const today = useMemo(todayLocal, [])
  const [city, setCity] = useState('')
  const [cityTouched, setCityTouched] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')

  const nearest = useNearestCity()
  const cityOptions = useMemo(() => cityOptionsFrom(cities), [cities])

  // Aplicar la ciudad detectada solo si el usuario todavía no eligió nada.
  useEffect(() => {
    if (nearest.status !== 'found' || cityTouched || city) return
    // Foco pre-hidratación: si el usuario ya está parado en el campo (el focus
    // ocurrió antes de que React montara, onFocusCapture no se enteró), no pisarlo.
    if (typeof document !== 'undefined' && document.activeElement?.id === 'hero-city') {
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
    if (date && date !== today) params.set('date', date)
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

  const fieldClass =
    'h-[62px] w-full rounded-xl border border-border bg-background pl-11 pr-3 text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  // La fecha nativa necesita más ancho útil en la grilla de 2 col a 375px:
  // menos padding + fuente apenas menor para que "dd/mm/aaaa" no trunque (§13.5).
  const dateFieldClass = fieldClass.replace('pl-11 pr-3 text-base', 'pl-10 pr-2 text-[15px]')

  const labelClass = 'mb-[9px] block font-logo text-[13px] font-bold uppercase tracking-[.05em] text-muted-foreground'

  if (layout === 'vertical') {
    return (
      <form
        onSubmit={onSubmit}
        aria-label="Buscar canchas de fútbol"
        className="search-card relative rounded-[22px] p-5 sm:p-7"
      >
        <div className="mb-4 flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.045em] text-emerald-800 dark:text-emerald-300">
          <span className="relative flex h-[9px] w-[9px] shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
          </span>
          Buscá disponibilidad ahora
        </div>

        <div className="flex flex-col gap-4">
          <div onFocusCapture={() => setCityTouched(true)}>
            <label htmlFor="hero-city-v" className={labelClass}>
              Localidad
            </label>
            <Combobox
              id="hero-city-v"
              options={cityOptions}
              value={city}
              onChange={(v) => {
                setCity(v)
                setCityTouched(true)
              }}
              placeholder="¿Dónde querés jugar?"
              emptyMessage="No encontramos esa localidad"
              listboxLabel="Localidades"
              clearOptionLabel="Todas las ciudades"
              inputClassName={fieldClass}
              aria-describedby="hero-city-v-status"
              leadingIcon={
                <MapPin
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400"
                  aria-hidden
                />
              }
            />
          </div>

          <div className="grid grid-cols-[1.15fr_1fr] gap-3 sm:gap-4">
            <div>
              <label htmlFor="hero-date-v" className={labelClass}>
                Fecha
              </label>
              <DatePicker
                id="hero-date-v"
                value={date}
                min={today}
                onChange={setDate}
                placeholder="dd/mm/aaaa"
                className={dateFieldClass}
              />
            </div>
            <div>
              <label htmlFor="hero-time-v" className={labelClass}>
                Hora
              </label>
              <div className="relative">
                <Clock
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400"
                  aria-hidden
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      id="hero-time-v"
                      className={`${fieldClass} flex items-center justify-between text-left pr-10`}
                    >
                      <span className={!time ? 'text-muted-foreground' : 'text-foreground'}>
                        {time || 'Cualquier horario'}
                      </span>
                      <ChevronDown className="pointer-events-none absolute right-4 h-5 w-5 text-muted-foreground" aria-hidden />
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
          </div>

          <button
            type="submit"
            className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25 dark:hover:shadow-emerald-500/30"
          >
            <Search className="h-[19px] w-[19px]" aria-hidden />
            Buscar canchas
          </button>
        </div>

        <p id="hero-city-v-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-muted-foreground">
          {geoMessage}
        </p>
      </form>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      className="search-card relative rounded-3xl p-6 sm:p-[34px]"
    >
      {/* Card header */}
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.045em] text-emerald-800 dark:text-emerald-300">
          <span className="relative flex h-[9px] w-[9px] shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
          </span>
          Encontrá tu próxima cancha
        </div>
        <span className="text-[12.5px] font-semibold text-muted-foreground">+1.200 turnos libres hoy</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.05fr_1.05fr_auto] lg:items-end">
        {/* Localidad */}
        <div onFocusCapture={() => setCityTouched(true)}>
          <label htmlFor="hero-city" className={labelClass}>
            Localidad
          </label>
          <Combobox
            id="hero-city"
            options={cityOptions}
            value={city}
            onChange={(v) => {
              setCity(v)
              setCityTouched(true)
            }}
            placeholder="¿Dónde querés jugar?"
            emptyMessage="No encontramos esa localidad"
            listboxLabel="Localidades"
            clearOptionLabel="Todas las ciudades"
            inputClassName={fieldClass}
            aria-describedby="hero-city-status"
            leadingIcon={
              <MapPin
                className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400"
                aria-hidden
              />
            }
          />
        </div>

        {/* Fecha */}
        <div>
          <label htmlFor="hero-date" className={labelClass}>
            Fecha
          </label>
          <DatePicker
            id="hero-date"
            value={date}
            min={today}
            onChange={setDate}
            placeholder="dd/mm/aaaa"
            className={dateFieldClass}
          />
        </div>

        {/* Hora */}
        <div>
          <label htmlFor="hero-time" className={labelClass}>
            Hora
          </label>
          <div className="relative">
            <Clock
              className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400 z-10"
              aria-hidden
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  id="hero-time"
                  className={`${fieldClass} flex items-center justify-between text-left pr-10`}
                >
                  <span className={!time ? 'text-muted-foreground' : 'text-foreground'}>
                    {time || 'Cualquier horario'}
                  </span>
                  <ChevronDown className="pointer-events-none absolute right-4 h-5 w-5 text-muted-foreground" aria-hidden />
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

        {/* Buscar */}
        <button
          type="submit"
          className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] motion-reduce:hover:translate-y-0 dark:shadow-emerald-500/25 dark:hover:shadow-emerald-500/30"
        >
          <Search className="h-[19px] w-[19px]" aria-hidden />
          Buscar canchas
        </button>
      </div>

      <p id="hero-city-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-muted-foreground">
        {geoMessage}
      </p>
    </form>
  )
}
