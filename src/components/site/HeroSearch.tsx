'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Clock, MapPin, Search, ChevronDown } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { useClientSnapshot } from '@/hooks/use-client-value'
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
  const today = useClientSnapshot(todayLocal, todayLocal)
  const [q, setQ] = useState('')
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
    if (q.trim()) params.set('q', q.trim())
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
    'h-[62px] w-full rounded-xl border border-border bg-background pl-11 pr-3 text-base text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  // La fecha nativa necesita más ancho útil para que "dd/mm/aaaa" no trunque.
  // Se gana con padding, NO con fuente: la versión anterior bajaba a text-[15px]
  // y eso hacía que iOS zoomeara al enfocar (< 16px). La premisa original del
  // comentario ("grilla de 2 col a 375px") además ya no aplica: el grid de abajo
  // es `grid-cols-1 sm:grid-cols-3`, así que en mobile el campo va a ancho completo.
  // Declarado entero y no derivado con .replace(): reordenar `fieldClass` hacía
  // que el replace fallara en silencio y devolviera la clase original.
  const dateFieldClass =
    'h-[62px] w-full rounded-xl border border-border bg-background pl-10 pr-2 text-base text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  const labelClass = 'mb-[9px] block font-logo text-[13px] font-bold uppercase tracking-wider text-muted-foreground'

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
          <div>
            <label htmlFor="hero-q-v" className={labelClass}>
              Complejo
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400 z-10"
                aria-hidden
              />
              <input
                id="hero-q-v"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="¿Qué club buscás?"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                placeholder="¿Dónde?"
                emptyMessage="No encontramos esa localidad"
                listboxLabel="Localidades"
                clearOptionLabel="Todas las ciudades"
                inputClassName={dateFieldClass}
                aria-describedby="hero-city-v-status"
                leadingIcon={
                  <MapPin
                    className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400 z-10"
                    aria-hidden
                  />
                }
              />
            </div>

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
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-[17px] w-[17px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400"
                  aria-hidden
                />
                {/* modal={false}: selector liviano dentro de un form de búsqueda, no
                    un diálogo — con el default (modal=true) Radix llama
                    hideOthers() y aria-hidea el resto del form (incluido "Buscar
                    canchas") mientras el menú está abierto/cerrándose. */}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      id="hero-time-v"
                      className={`${dateFieldClass} flex items-center justify-between text-left pr-8`}
                    >
                      <span className={!time ? 'text-muted-foreground' : 'text-foreground'}>
                        {time || 'Cualquiera'}
                      </span>
                      <ChevronDown className="pointer-events-none absolute right-2.5 h-4.5 w-4.5 text-muted-foreground" aria-hidden />
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
            className="group relative overflow-hidden inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-7 text-base font-bold text-slate-950 border border-emerald-400/20 shadow-[0_4px_20px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.98] after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:transition-transform after:duration-1000 hover:after:translate-x-full whitespace-nowrap"
          >
            <Search className="h-[19px] w-[19px] group-hover:scale-110 transition-transform duration-300" aria-hidden />
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.2fr_1.05fr_1.05fr_auto] lg:items-end">
        {/* Complejo */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="hero-q" className={labelClass}>
            Complejo
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400 z-10"
              aria-hidden
            />
            <input
              id="hero-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="¿Qué club buscás?"
              className={fieldClass}
            />
          </div>
        </div>

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
            placeholder="¿Dónde?"
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
            {/* modal={false}: ver comentario del layout vertical más arriba. */}
            <DropdownMenu modal={false}>
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
          className="group relative overflow-hidden inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-7 text-base font-bold text-slate-950 border border-emerald-400/20 shadow-[0_4px_20px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.98] after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:transition-transform after:duration-1000 hover:after:translate-x-full whitespace-nowrap"
        >
          <Search className="h-[19px] w-[19px] group-hover:scale-110 transition-transform duration-300" aria-hidden />
          Buscar canchas
        </button>
      </div>

      <p id="hero-city-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-muted-foreground">
        {geoMessage}
      </p>
    </form>
  )
}
