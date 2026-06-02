'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, Search } from 'lucide-react'
import type { CityCount } from '@/modules/tenants/search.service'
import { buildExplorarUrl } from './url'

type Props = { cities: CityCount[] }

function todayLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)

/**
 * Barra de búsqueda estructurada de /explorar: texto + Localidad + Fecha + Hora.
 * Navega actualizando la URL y preserva el resto de los filtros activos.
 */
export default function SearchBar({ cities }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const today = useMemo(todayLocal, [])

  const [q, setQ] = useState(params.get('q') ?? '')
  const [city, setCity] = useState(params.get('city') ?? '')
  const [date, setDate] = useState(params.get('date') ?? '')
  const [time, setTime] = useState(params.get('time') ?? '')

  // Mantener los inputs en sync si la URL cambia por fuera (back/forward, chips).
  useEffect(() => {
    setQ(params.get('q') ?? '')
    setCity(params.get('city') ?? '')
    setDate(params.get('date') ?? '')
    setTime(params.get('time') ?? '')
  }, [params])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    router.push(
      buildExplorarUrl(params, {
        q: q.trim() || undefined,
        city: city || undefined,
        date: date || undefined,
        time: time || undefined,
      }),
    )
  }

  const fieldClass =
    'h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas"
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
        {/* Texto libre */}
        <div className="lg:col-span-4">
          <label htmlFor="exp-q" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Buscar
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="exp-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre del complejo…"
              className={fieldClass}
            />
          </div>
        </div>

        {/* Localidad */}
        <div className="lg:col-span-3">
          <label htmlFor="exp-city" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Localidad
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="exp-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={`${fieldClass} appearance-none pr-8`}
            >
              <option value="">Todas las ciudades</option>
              {cities.map((c) => (
                <option key={`${c.city}-${c.province}`} value={c.city}>
                  {c.city}
                  {c.province ? `, ${c.province}` : ''} ({c.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fecha */}
        <div className="lg:col-span-2">
          <label htmlFor="exp-date" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Fecha
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="exp-date"
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
          <label htmlFor="exp-time" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Hora
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select
              id="exp-time"
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

        <div className="lg:col-span-1">
          <button
            type="submit"
            aria-label="Buscar"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:scale-[0.99] motion-reduce:active:scale-100"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="lg:hidden">Buscar canchas</span>
          </button>
        </div>
      </div>
    </form>
  )
}
