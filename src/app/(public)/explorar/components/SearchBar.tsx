'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { Clock, MapPin, Search, ChevronDown } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import DatePicker from '@/components/ui/date-picker'
import { useClientSnapshot } from '@/hooks/use-client-value'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CityCount } from '@/modules/tenants/search.service'
import { buildExplorarUrl } from './url'

type Props = { cities: CityCount[] }

function todayLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)

/** value compuesto "{city}||{province}" (mismo formato que el hero) para homónimos. */
function cityOptionsFrom(cities: CityCount[]): ComboboxOption[] {
  return cities.map((c) => ({
    value: c.province ? `${c.city}||${c.province}` : c.city,
    label: c.province ? `${c.city}, ${c.province}` : c.city,
    hint: String(c.count),
  }))
}

/** Reconstruye el value compuesto desde los query params actuales. */
function cityValueFrom(params: { get(name: string): string | null }): string {
  const city = params.get('city') ?? ''
  const province = params.get('province') ?? ''
  if (!city) return ''
  return province ? `${city}||${province}` : city
}

/**
 * Barra de búsqueda estructurada de /explorar: texto + Localidad + Fecha + Hora.
 * Navega actualizando la URL y preserva el resto de los filtros activos.
 */
export default function SearchBar({ cities }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const today = useClientSnapshot(todayLocal, todayLocal)

  const [q, setQ] = useState(params.get('q') ?? '')
  const [city, setCity] = useState(() => cityValueFrom(params))
  const [date, setDate] = useState(params.get('date') ?? '')
  const [time, setTime] = useState(params.get('time') ?? '')

  // Si la URL trae una ciudad que ya no está en la lista (link viejo, tenant
  // suspendido), se agrega como opción derivada: el input muestra "Ciudad,
  // Provincia" y nunca el separador interno "city||province".
  const cityOptions = useMemo(() => {
    const opts = cityOptionsFrom(cities)
    const current = cityValueFrom(params)
    if (current && !opts.some((o) => o.value === current)) {
      const [cityPart = '', provincePart = ''] = current.split('||')
      opts.push({
        value: current,
        label: provincePart ? `${cityPart}, ${provincePart}` : cityPart,
      })
    }
    return opts
  }, [cities, params])

  // Mantener los inputs en sync si la URL cambia por fuera (back/forward, chips).
  // Ajuste DURANTE el render contra la URL anterior, no en un efecto: es el
  // patrón que documenta React para adaptar estado a un cambio de prop. Con el
  // efecto, un back/forward pintaba primero los valores viejos y se corregía en
  // un segundo render.
  const paramsKey = params.toString()
  const [lastParamsKey, setLastParamsKey] = useState(paramsKey)
  if (paramsKey !== lastParamsKey) {
    setLastParamsKey(paramsKey)
    setQ(params.get('q') ?? '')
    setCity(cityValueFrom(params))
    setDate(params.get('date') ?? '')
    setTime(params.get('time') ?? '')
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // city/province viajan juntos: al cambiar de ciudad no debe quedar colgada
    // la province anterior en la URL (daría 0 resultados).
    const [cityPart, provincePart] = city.split('||')
    router.push(
      buildExplorarUrl(params, {
        q: q.trim() || undefined,
        city: cityPart || undefined,
        province: provincePart || undefined,
        date: date || undefined,
        time: time || undefined,
      }),
    )
  }

  // text-base en mobile: < 16px hace que iOS zoomee al enfocar. Este es el campo
  // "Nombre del complejo…" que el dueño reportó, y la const alimenta los 4 campos.
  const fieldClass =
    'h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-base md:text-sm text-foreground shadow-xs transition-colors focus-visible:outline-hidden focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500'

  const labelClass = 'mb-1.5 block font-logo text-[11px] font-bold uppercase tracking-wider text-muted-foreground'

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas"
      className="search-card rounded-2xl p-3 sm:p-4"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
        {/* Texto libre */}
        <div className="lg:col-span-4">
          <label htmlFor="exp-q" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden />
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
          <label htmlFor="exp-city" className={labelClass}>
            Localidad
          </label>
          <Combobox
            id="exp-city"
            options={cityOptions}
            value={city}
            onChange={setCity}
            placeholder="Todas las ciudades"
            emptyMessage="No encontramos esa localidad"
            listboxLabel="Localidades"
            clearOptionLabel="Todas las ciudades"
            inputClassName={fieldClass}
            leadingIcon={
              <MapPin
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
            }
          />
        </div>

        {/* Fecha */}
        <div className="lg:col-span-2">
          <label htmlFor="exp-date" className={labelClass}>
            Fecha
          </label>
          <DatePicker
            id="exp-date"
            value={date}
            min={today}
            onChange={setDate}
            placeholder="dd/mm/aaaa"
            className={fieldClass}
          />
        </div>

        {/* Hora */}
        <div className="lg:col-span-2">
          <label htmlFor="exp-time" className={labelClass}>
            Hora
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600 z-10" aria-hidden />
            {/* modal={false}: con el default (modal=true) Radix aria-hide-ea los
                demás campos del form (Buscar/Localidad/Fecha/Buscar) mientras el
                menú está abierto, pero esos siguen siendo tabbable → axe
                aria-hidden-focus. Este dropdown es solo un filtro más, no un
                flujo modal: no hace falta trap de foco ni ocultar el resto. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  id="exp-time"
                  className={`${fieldClass} flex items-center justify-between text-left pr-10`}
                >
                  {/* Sin /70: baja text-muted-foreground de 5.77:1 a 3.06:1 contra bg-background (color-contrast) — igual que date-picker.tsx. */}
                  <span className={!time ? 'text-muted-foreground' : 'text-foreground'}>
                    {time || 'Cualquiera'}
                  </span>
                  <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground/70" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              {/* tabIndex={0}: la lista de 17 horas desborda max-h-60 (scroll). Al
                  abrir, Radix mueve el foco real al contenedor (tabindex=-1,
                  foco programático — las horas individuales solo son roving-
                  focusable después de navegar con flechas) y axe no lo detecta
                  como "focusable" estáticamente → scrollable-region-focusable. */}
              <DropdownMenuContent align="start" tabIndex={0} className="max-h-60 w-[200px] overflow-y-auto">
                <DropdownMenuItem onSelect={() => setTime('')} className="cursor-pointer">
                  Cualquiera
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

        <div className="lg:col-span-1">
          <button
            type="submit"
            aria-label="Buscar"
            className="group relative overflow-hidden inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-4 text-sm font-bold text-slate-950 border border-emerald-400/20 shadow-[0_4px_20px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.98] after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:transition-transform after:duration-1000 hover:after:translate-x-full whitespace-nowrap"
          >
            <Search className="h-4 w-4 group-hover:scale-110 transition-transform duration-300" aria-hidden />
            <span className="lg:hidden">Buscar canchas</span>
          </button>
        </div>
      </div>
    </form>
  )
}
