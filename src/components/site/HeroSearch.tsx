'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { useNearestCity } from '@/hooks/use-nearest-city'
import type { CityCount } from '@/modules/tenants/search.service'

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
    'h-[62px] w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  const labelClass = 'mb-[9px] block font-logo text-[13px] font-bold uppercase tracking-[.05em] text-slate-500'

  if (layout === 'vertical') {
    return (
      <form
        onSubmit={onSubmit}
        aria-label="Buscar canchas de fútbol"
        style={{
          position: 'relative',
          padding: '28px',
          borderRadius: '22px',
          background: 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(241,245,249,.95))',
          border: '1px solid rgba(255,255,255,.85)',
          boxShadow:
            '0 0 70px rgba(16,185,129,.30), 0 40px 80px -34px rgba(0,0,0,.9), inset 0 1px 0 #ffffff',
        }}
      >
        <div className="mb-4 flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.045em] text-emerald-700">
          <span className="relative flex h-[9px] w-[9px] shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
          </span>
          Encontrá tu turno ideal
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
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600"
                  aria-hidden
                />
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="hero-date-v" className={labelClass}>
                Fecha
              </label>
              <div className="relative">
                <CalendarDays
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600"
                  aria-hidden
                />
                <input
                  id="hero-date-v"
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="hero-time-v" className={labelClass}>
                Hora
              </label>
              <div className="relative">
                <Clock
                  className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600"
                  aria-hidden
                />
                <select
                  id="hero-time-v"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={`${fieldClass} appearance-none pr-8`}
                >
                  <option value="">Cualquier horario</option>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 active:scale-[0.99] motion-reduce:hover:translate-y-0"
          >
            <Search className="h-[19px] w-[19px]" aria-hidden />
            Buscar canchas
          </button>
        </div>

        <p id="hero-city-v-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-slate-500">
          {geoMessage}
        </p>
      </form>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      style={{
        position: 'relative',
        padding: '34px',
        borderRadius: '24px',
        background: 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(241,245,249,.95))',
        border: '1px solid rgba(255,255,255,.85)',
        boxShadow:
          '0 0 70px rgba(16,185,129,.30), 0 44px 90px -34px rgba(0,0,0,.9), inset 0 1px 0 #ffffff',
      }}
    >
      {/* Card header */}
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-[9px] font-logo text-[12.5px] font-bold uppercase tracking-[.045em] text-emerald-700">
          <span className="relative flex h-[9px] w-[9px] shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
          </span>
          Buscá tu próximo partido
        </div>
        <span className="text-[12.5px] font-semibold text-slate-500">+1.200 turnos libres hoy</span>
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
                className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600"
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
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600 z-10"
              aria-hidden
            />
            <input
              id="hero-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Hora */}
        <div>
          <label htmlFor="hero-time" className={labelClass}>
            Hora
          </label>
          <div className="relative">
            <Clock
              className="pointer-events-none absolute left-3.5 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-emerald-600 z-10"
              aria-hidden
            />
            <select
              id="hero-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${fieldClass} appearance-none pr-8`}
            >
              <option value="">Cualquier horario</option>
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
          className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 active:scale-[0.99] motion-reduce:hover:translate-y-0"
        >
          <Search className="h-[19px] w-[19px]" aria-hidden />
          Buscar canchas
        </button>
      </div>

      <p id="hero-city-status" aria-live="polite" className="mt-2 min-h-4 text-xs text-slate-500">
        {geoMessage}
      </p>
    </form>
  )
}
