'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Clock, MapPin } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClientSnapshot } from '@/hooks/use-client-value'
import { useNearby } from './nearby-context'
import { addDays } from '@/shared/dates/art'
import { todayART } from '@/shared/time/art-date'
import { capitalizeFirst, formatDayHeader } from '@/lib/format'
import type { CityCount } from '@/modules/tenants/search.service'

type Props = { cities: CityCount[] }

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

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return capitalizeFirst(formatDayHeader(date))
}

const fieldClass =
  'h-[70px] w-full rounded-xl border border-border bg-background/60 pl-12 pr-10 pt-[22px] text-left text-base text-foreground transition-colors hover:border-emerald-600/40 focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[.03] dark:hover:border-emerald-400/40 lg:text-lg'

/**
 * Un renglón del buscador: ícono, rótulo chico arriba y el valor abajo, todo
 * dentro del mismo campo. El `<label>` es real (htmlFor) y no intercepta el
 * clic: el campo entero es el blanco.
 */
function Field({
  htmlFor,
  label,
  icon,
  children,
}: {
  htmlFor: string
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative">
      {icon}
      <label
        htmlFor={htmlFor}
        className="pointer-events-none absolute left-12 top-[11px] z-10 text-[13px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

const iconClass =
  'pointer-events-none absolute left-4 top-1/2 z-10 h-[22px] w-[22px] -translate-y-1/2 text-emerald-700 dark:text-emerald-400'
const chevronClass =
  'pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground'

/**
 * Buscador rápido del hero: zona, día y hora → /explorar con los filtros como
 * query params. Solo fútbol, así que no hay selector de deporte; buscar un club
 * por nombre vive en /explorar.
 *
 * La zona se sugiere con la geolocalización del hero (`NearbyProvider`: la
 * localidad del complejo más cercano, datos propios) mientras el usuario no
 * toque el campo. Es un valor DERIVADO, no un efecto que pisa el estado.
 */
export default function HeroSearch({ cities }: Props) {
  const router = useRouter()
  // ART explícito, NO el huso del runtime: entre las 21:00 y las 00:00 ART el
  // servidor (UTC) y el navegador calculaban días distintos y la hidratación
  // fallaba todas las noches.
  const today = useClientSnapshot(todayART, todayART)
  const { nearestCity } = useNearby()
  const [city, setCity] = useState('')
  const [cityTouched, setCityTouched] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState('')

  const cityOptions = useMemo(() => cityOptionsFrom(cities), [cities])
  const suggestedCity = useMemo(() => {
    if (!nearestCity) return ''
    const match =
      cityOptions.find((o) => o.value === `${nearestCity.city}||${nearestCity.province}`) ??
      cityOptions.find(
        (o) => o.value === nearestCity.city || o.value.startsWith(`${nearestCity.city}||`),
      )
    return match?.value ?? ''
  }, [nearestCity, cityOptions])
  const effectiveCity = cityTouched ? city : city || suggestedCity
  const effectiveDate = date ?? today
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)),
    [today],
  )

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (effectiveCity) {
      const [cityPart, provincePart] = effectiveCity.split('||')
      if (cityPart) params.set('city', cityPart)
      if (provincePart) params.set('province', provincePart)
    }
    if (effectiveDate !== today) params.set('date', effectiveDate)
    if (time) params.set('time', time)
    const qs = params.toString()
    router.push(qs ? `/explorar?${qs}` : '/explorar')
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Buscar canchas de fútbol"
      className="search-card relative rounded-2xl p-4 sm:p-[26px]"
    >
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Tipear también cuenta como tocar: si el foco llegó antes de hidratar,
            React no vio ese focus, pero sí ve cada tecla. */}
        <div
          onFocusCapture={() => setCityTouched(true)}
          onInputCapture={() => setCityTouched(true)}
        >
          <Field
            htmlFor="hero-city"
            label="Zona"
            icon={<MapPin className={iconClass} aria-hidden />}
          >
            <Combobox
              id="hero-city"
              options={cityOptions}
              value={effectiveCity}
              onChange={(v) => {
                setCity(v)
                setCityTouched(true)
              }}
              placeholder="¿Dónde jugás?"
              emptyMessage="Todavía no hay canchas en esa localidad"
              listboxLabel="Localidades"
              clearOptionLabel="Todas las zonas"
              inputClassName={fieldClass}
            />
            <ChevronDown className={chevronClass} aria-hidden />
          </Field>
        </div>

        {/* modal={false}: selector liviano dentro de un form, no un diálogo. Con
            el default, Radix aria-hidea el resto del form (incluido "Buscar
            canchas") mientras el menú está abierto o cerrándose. */}
        <Field
          htmlFor="hero-day"
          label="Día"
          icon={<CalendarDays className={iconClass} aria-hidden />}
        >
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" id="hero-day" className={fieldClass}>
                <span className="block truncate">{dayLabel(effectiveDate, today)}</span>
                <ChevronDown className={chevronClass} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              {days.map((d) => (
                <DropdownMenuItem key={d} onSelect={() => setDate(d)} className="cursor-pointer">
                  {dayLabel(d, today)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field htmlFor="hero-time" label="Hora" icon={<Clock className={iconClass} aria-hidden />}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" id="hero-time" className={fieldClass}>
                <span className="block truncate tabular-nums">{time || 'Cualquiera'}</span>
                <ChevronDown className={chevronClass} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-60 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
            >
              <DropdownMenuItem onSelect={() => setTime('')} className="cursor-pointer">
                Cualquier horario
              </DropdownMenuItem>
              {HOURS.map((h) => (
                <DropdownMenuItem
                  key={h}
                  onSelect={() => setTime(h)}
                  className="cursor-pointer tabular-nums"
                >
                  {h}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Button
          type="submit"
          className="mt-2 h-[54px] w-full rounded-xl text-base font-semibold md:h-[54px]"
        >
          Buscar canchas
        </Button>
      </div>
    </form>
  )
}
