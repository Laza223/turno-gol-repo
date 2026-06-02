'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import type { CityCount } from '@/modules/tenants/search.service'

type Props = { cities: CityCount[] }

/** YYYY-MM-DD de hoy en horario local (evita el shift de toISOString en UTC). */
function todayLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)

/**
 * Buscador protagonista del hero (estilo ATC). Recolecta Localidad + Fecha +
 * Hora y redirige a /explorar con los filtros como query params. Solo fútbol por
 * ahora, así que no hay selector de deporte. La fecha/hora se reenvían para el
 * filtrado por disponibilidad (en /explorar).
 */
export default function HeroSearch({ cities }: Props) {
  const router = useRouter()
  const today = useMemo(todayLocal, [])
  const [city, setCity] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (city) params.set('city', city)
    if (date && date !== today) params.set('date', date)
    if (time) params.set('time', time)
    const qs = params.toString()
    router.push(qs ? `/explorar?${qs}` : '/explorar')
  }

  const fieldClass =
    'h-14 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      className="rounded-2xl border border-white/10 bg-white/95 p-5 shadow-2xl shadow-emerald-950/30 backdrop-blur-md sm:p-6"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        {/* Localidad */}
        <div className="lg:col-span-4">
          <label htmlFor="hero-city" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Localidad
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="hero-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={`${fieldClass} appearance-none pr-8`}
            >
              <option value="">Todas las ciudades</option>
              {cities.map((c) => (
                <option key={`${c.city}-${c.province}`} value={c.city}>
                  {c.city}
                  {c.province ? `, ${c.province}` : ''}
                </option>
              ))}
            </select>
          </div>
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
    </form>
  )
}
