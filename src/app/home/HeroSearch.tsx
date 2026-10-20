'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Clock, MapPin } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
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

/** El del botón: corta, para que entre en media columna ("Mié 22"). El menú usa `dayLabel`. */
function shortDayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  const [y, m, d] = date.split('-').map(Number)
  const short = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
  })
  return capitalizeFirst(short.replace(/\./g, '').replace(',', ''))
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, 1)) return 'Mañana'
  return capitalizeFirst(formatDayHeader(date))
}

const fieldClass =
  'h-12 w-full rounded-xl border border-input bg-card pl-10 pr-9 text-left text-base md:text-base text-foreground transition-colors hover:border-input/80 focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Un renglón del buscador: rótulo arriba y, abajo, el campo con su ícono. El `<label>` es
 * real (htmlFor).
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
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-base font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        {icon}
        {children}
      </div>
    </div>
  )
}

const iconClass =
  'pointer-events-none absolute left-3 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground'
const chevronClass =
  'pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground'

/**
 * Buscador rápido de la home: zona, día y hora → /explorar con los filtros como
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
      className="lg:rounded-xl lg:border lg:border-border lg:bg-card lg:p-6"
    >
      <div className="flex flex-col gap-4">
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

        {/* Día y Hora en dos columnas desde 375 px: el primer horario de "Libre hoy" tiene que
            quedar arriba del pliegue de un celular. */}
        <div className="grid grid-cols-1 gap-4 min-[375px]:grid-cols-2">
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
                  <span className="block truncate">{shortDayLabel(effectiveDate, today)}</span>
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

          <Field
            htmlFor="hero-time"
            label="Hora"
            icon={<Clock className={iconClass} aria-hidden />}
          >
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
        </div>

        <Button type="submit" className={`${PORTAL_BUTTON} rounded-xl font-semibold`}>
          Buscar canchas
        </Button>
      </div>
    </form>
  )
}
