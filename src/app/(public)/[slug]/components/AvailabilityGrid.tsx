'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Calendar, ChevronLeft, ChevronRight, Phone } from 'lucide-react'
import type {
  AvailabilityResponse,
  PublicTenant,
  Slot,
} from '@/modules/tenants/public.service'
import { Skeleton } from '@/components/ui/skeleton'
import { capitalizeFirst } from '@/lib/format'

type Props = {
  tenant: PublicTenant
}

function formatDateES(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z')
  return capitalizeFirst(
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(dt),
  )
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

function getArtToday(): string {
  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return artNow.toISOString().slice(0, 10)
}

type TimeRow = {
  time: string
  cells: { courtId: string; slot: Slot | null }[]
}

function buildTimeRows(courts: AvailabilityResponse['courts']): TimeRow[] {
  const timeSet = new Set<string>()
  for (const court of courts) {
    for (const slot of court.slots) timeSet.add(slot.time)
  }
  const times = Array.from(timeSet).sort()
  return times.map((time) => ({
    time,
    cells: courts.map((court) => ({
      courtId: court.id,
      slot: court.slots.find((s) => s.time === time) ?? null,
    })),
  }))
}

function SlotCell({
  slot,
  slug,
  courtId,
  date,
  allowOnlineBooking,
  phone,
}: {
  slot: Slot
  slug: string
  courtId: string
  date: string
  allowOnlineBooking: boolean
  phone: string
}) {
  if (slot.status === 'past') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
        —
      </span>
    )
  }

  const priceFormatted = slot.price
    ? new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }).format(slot.price / 100)
    : null

  // Precio visible en todo slot futuro: el jugador ve la estructura de
  // precios del día aunque el turno esté tomado.
  const priceLine = priceFormatted && (
    <span className="tabular-nums text-[10px]">{priceFormatted}</span>
  )

  // Colores semánticos con contraste AA: texto 700 sobre fondo 50/100 (≥4.5:1),
  // ring 500/600 sólido como indicador no-textual (≥3:1 vs blanco).
  if (slot.status === 'occupied') {
    return (
      <span className="inline-flex w-full flex-col items-center rounded px-2 py-1 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-inset ring-border">
        <span>Ocupado</span>
        {priceLine}
      </span>
    )
  }

  if (slot.status === 'fixed') {
    return (
      <span className="inline-flex w-full flex-col items-center rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20">
        <span>Turno fijo</span>
        {priceLine}
      </span>
    )
  }

  if (slot.status === 'blocked') {
    return (
      <span className="inline-flex w-full flex-col items-center rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20">
        <span>Bloqueado</span>
        {priceLine}
      </span>
    )
  }

  if (!allowOnlineBooking) {
    return (
      <a
        href={`tel:${phone}`}
        aria-label="Contactar al complejo para reservar"
        className="inline-flex w-full flex-col items-center rounded-md px-2 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/60 transition-all duration-150 hover:bg-emerald-600 hover:text-white hover:ring-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
      >
        <span className="flex items-center gap-1">
          <Phone className="h-3 w-3" aria-hidden />
          Contactar
        </span>
        {priceLine}
      </a>
    )
  }

  return (
    <Link
      href={`/${slug}/reservar?court=${courtId}&date=${date}&time=${slot.time}&dur=${slot.duration}`}
      className="inline-flex w-full flex-col items-center rounded-md px-2 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/60 transition-all duration-150 hover:bg-emerald-600 hover:text-white hover:ring-emerald-600 active:scale-[0.98] motion-reduce:active:scale-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
    >
      <span>Reservar</span>
      {priceLine}
    </Link>
  )
}

export default function AvailabilityGrid({ tenant }: Props) {
  const searchParams = useSearchParams()
  // "Hoy" y la fecha activa se resuelven recién en el cliente: la página del
  // perfil es ISR, así que el HTML prerenderado no conoce ni la fecha del
  // visitante (ART) ni sus query params. El server siempre renderiza el
  // skeleton (date=null) y el primer fetch trae la grilla real.
  const [today, setToday] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [courtFilter, setCourtFilter] = useState<string>('all')

  const maxDate = today ? addDays(today, tenant.bookingAdvanceDays) : null

  useEffect(() => {
    const todayStr = getArtToday()
    const max = addDays(todayStr, tenant.bookingAdvanceDays)
    // ?date= compartible, clampeado al rango reservable [hoy, hoy + anticipación].
    const requested = searchParams.get('date')
    const initialDate =
      requested &&
      /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
      requested >= todayStr &&
      requested <= max
        ? requested
        : todayStr

    setToday(todayStr)
    setDate(initialDate)

    let active = true
    setLoading(true)
    setError(false)
    fetch(`/api/public/availability?slug=${encodeURIComponent(tenant.slug)}&date=${initialDate}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('fetch failed')
        return (await res.json()) as AvailabilityResponse
      })
      .then((data) => {
        if (active) setAvailability(data)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [searchParams, tenant.slug, tenant.bookingAdvanceDays])

  async function loadDate(newDate: string) {
    if (!today || !maxDate) return
    if (newDate < today || newDate > maxDate) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/public/availability?slug=${encodeURIComponent(tenant.slug)}&date=${newDate}`,
      )
      if (!res.ok) throw new Error('fetch failed')
      const data = (await res.json()) as AvailabilityResponse
      // Solo avanzamos la fecha cuando el fetch tuvo exito: asi la etiqueta de
      // fecha y los slots visibles siempre corresponden al mismo dia. Si el
      // fetch falla, `date` no cambia y la grilla sigue sincronizada (#39).
      setAvailability(data)
      setDate(newDate)
      // Refleja la fecha en ?date= para que el link sea compartible.
      // replaceState (no push): navegar dias no debe llenar el historial.
      const url = new URL(window.location.href)
      url.searchParams.set('date', newDate)
      window.history.replaceState(null, '', url.toString())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // Si el filtro apunta a una cancha que ya no vino en la respuesta, cae a "todas".
  const effectiveFilter =
    courtFilter === 'all' || (availability?.courts.some((c) => c.id === courtFilter) ?? false)
      ? courtFilter
      : 'all'
  const visibleCourts = !availability
    ? []
    : effectiveFilter === 'all'
      ? availability.courts
      : availability.courts.filter((c) => c.id === effectiveFilter)

  const timeRows = buildTimeRows(visibleCourts)
  const noCourts = availability !== null && availability.courts.length === 0

  return (
    <section
      className="bg-card rounded-2xl border border-border shadow-sm p-4 sm:p-6 space-y-4"
      aria-label="Grilla de disponibilidad"
    >
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Disponibilidad</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => date && loadDate(addDays(date, -1))}
            disabled={!date || !today || date <= today || loading}
            aria-label="Día anterior"
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="relative">
            {/* Input nativo invisible por encima del label: abre el picker del
                browser sin libreria externa. `peer` para dibujar el focus ring
                en el label visible (el input es opacity-0). */}
            <input
              type="date"
              value={date ?? ''}
              min={today ?? undefined}
              max={maxDate ?? undefined}
              disabled={loading || !date}
              aria-label="Elegir fecha"
              onChange={(e) => {
                if (e.target.value) void loadDate(e.target.value)
              }}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.()
                } catch {
                  // showPicker exige gesto de usuario; el input nativo sigue funcionando
                }
              }}
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <span className="flex h-8 min-w-[180px] items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-foreground tabular-nums peer-hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 transition-colors duration-150">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {date ? formatDateES(date) : ' '}
            </span>
          </div>
          <button
            type="button"
            onClick={() => date && loadDate(addDays(date, 1))}
            disabled={!date || !maxDate || date >= maxDate || loading}
            aria-label="Día siguiente"
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Loading skeleton (carga inicial y cambios de día) */}
      {loading && <Skeleton className="h-48 rounded-lg" />}

      {/* Error al cargar: si era un cambio de dia, la grilla sigue mostrando el dia previo */}
      {!loading && error && (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 ring-1 ring-inset ring-red-600/20 rounded-md px-3 py-2"
        >
          No pudimos cargar la disponibilidad de ese día. Revisá tu conexión e
          intentá de nuevo.
        </p>
      )}

      {/* No courts */}
      {!loading && noCourts && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Este complejo no tiene canchas disponibles por el momento.
        </p>
      )}

      {/* Filtro por cancha */}
      {!loading && availability !== null && availability.courts.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por cancha"
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        >
          <button
            type="button"
            onClick={() => setCourtFilter('all')}
            aria-pressed={effectiveFilter === 'all'}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              effectiveFilter === 'all'
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            Todas
          </button>
          {availability.courts.map((court) => (
            <button
              key={court.id}
              type="button"
              onClick={() => setCourtFilter(court.id)}
              aria-pressed={effectiveFilter === court.id}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                effectiveFilter === court.id
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              {court.name}
            </button>
          ))}
        </div>
      )}

      {/* Día sin turnos (cerrado o sin slots para la selección) */}
      {!loading && availability && !noCourts && timeRows.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Sin turnos para esta fecha.
        </p>
      )}

      {/* Grid */}
      {!loading && availability && !noCourts && date && timeRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-left py-2 pr-4 w-16"
                >
                  Hora
                </th>
                {visibleCourts.map((court) => (
                  <th
                    key={court.id}
                    scope="col"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center py-2 px-2 min-w-[110px]"
                  >
                    {court.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {timeRows.map((row) => (
                <tr key={row.time} className="hover:bg-accent">
                  <td className="py-1.5 pr-4 text-xs text-muted-foreground tabular-nums align-middle">
                    {row.time}
                  </td>
                  {row.cells.map(({ courtId, slot }) => (
                    <td key={courtId} className="py-1.5 px-2 text-center align-middle">
                      {slot ? (
                        <SlotCell
                          slot={slot}
                          slug={tenant.slug}
                          courtId={courtId}
                          date={date}
                          allowOnlineBooking={tenant.allowOnlineBooking}
                          phone={tenant.phone}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!loading && availability && !noCourts && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-50 ring-1 ring-inset ring-emerald-600 dark:bg-emerald-500/10 dark:ring-emerald-400/20" />
            Libre
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-muted ring-1 ring-inset ring-border" />
            Ocupado
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-50 ring-1 ring-inset ring-blue-600 dark:bg-blue-500/10 dark:ring-blue-400/20" />
            Turno fijo
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-50 ring-1 ring-inset ring-red-600 dark:bg-red-500/10 dark:ring-red-400/20" />
            Bloqueado
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-muted" />
            Pasado
          </span>
        </div>
      )}
    </section>
  )
}
