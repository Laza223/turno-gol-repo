'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import type { CityCount } from '@/modules/tenants/search.service'

export default function SearchBar({ cities }: { cities: CityCount[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const city = params.get('city') ?? ''
  const online = params.get('online') === '1'
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function push(next: URLSearchParams) {
    next.delete('offset')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (q.trim()) next.set('q', q.trim())
      else next.delete('q')
      if (next.toString() !== params.toString()) push(next)
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    push(next)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por nombre de complejo…"
          aria-label="Buscar complejo"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
        />
      </div>
      <select
        value={city}
        onChange={(e) => setParam('city', e.target.value || null)}
        aria-label="Filtrar por ciudad"
        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:w-56"
      >
        <option value="">Todas las ciudades</option>
        {cities.map((c) => (
          <option key={`${c.city}-${c.province}`} value={c.city}>{c.city} ({c.count})</option>
        ))}
      </select>
      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
        <input type="checkbox" checked={online} onChange={(e) => setParam('online', e.target.checked ? '1' : null)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus-visible:ring-emerald-500" />
        Reserva online
      </label>
    </div>
  )
}
