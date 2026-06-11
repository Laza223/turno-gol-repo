'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { useNearestCity } from '@/hooks/use-nearest-city'
import type { CityCount } from '@/modules/tenants/search.service'

type Props = { cities: CityCount[] }

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
export default function HeroSearch({ cities }: Props) {
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
    'h-14 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      className="rounded-2xl border border-white/10 bg-white/95 p-5 shadow-2xl shadow-emerald-950/30 backdrop-blur-md sm:p-6"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        {/* Localidad. onFocusCapture: si el usuario ya está en el campo, la
            detección tardía no debe pisarle nada. */}
        <div className="lg:col-span-4" onFocusCapture={() => setCityTouched(true)}>
          <label htmlFor="hero-city" className="mb-1.5 block text-xs font-semibold text-slate-700">
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
            placeholder="Todas las ciudades"
            emptyMessage="No encontramos esa localidad"
            listboxLabel="Localidades"
            clearOptionLabel="Todas las ciudades"
            inputClassName={fieldClass}
            aria-describedby="hero-city-status"
            leadingIcon={
              <MapPin
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
            }
          />
        </div>

        {/* Fecha */}
        <div className="lg:col-span-3">
          <label htmlFor="hero-date" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Fecha
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="hero-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={`${fieldClass} pr-3`}
            />
          </div>
        </div>

        {/* Hora */}
        <div className="lg:col-span-2">
          <label htmlFor="hero-time" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Hora
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="hero-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${fieldClass} appearance-none pr-8`}
            >
              <option value="">Cualquiera</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Buscar */}
        <button
          type="submit"
          className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.99] motion-reduce:hover:translate-y-0 lg:col-span-3"
        >
          <Search className="h-5 w-5" aria-hidden />
          Buscar canchas
        </button>
      </div>

      {/* Estado de geolocalización: sutil, nunca bloqueante. Altura reservada para no mover el hero. */}
      <p id="hero-city-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-slate-500">
        {geoMessage}
      </p>
    </form>
  )
}
