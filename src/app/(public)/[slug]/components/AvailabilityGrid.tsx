'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react'
import type {
  AvailabilityResponse,
  PublicTenant,
  Slot,
} from '@/modules/tenants/public.service'
import { Skeleton } from '@/components/ui/skeleton'
import { capitalizeFirst } from '@/lib/format'

type Props = {
  tenant: PublicTenant
  initialDate: string
  initialAvailability: AvailabilityResponse
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
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-400">
        —
      </span>
    )
  }

  // Colores semánticos con contraste AA: texto 700 sobre fondo 50/100 (≥4.5:1),
  // ring 500/600 sólido como indicador no-textual (≥3:1 vs blanco).
  if (slot.status === 'occupied') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500">
        Ocupado
      </span>
    )
  }

  if (slot.status === 'fixed') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600">
        Turno fijo
      </span>
    )
  }

  if (slot.status === 'blocked') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600">
        Bloqueado
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

  if (!allowOnlineBooking) {
    return (
      <a
        href={`tel:${phone}`}
        aria-label="Contactar al complejo para reservar"
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600 hover:bg-green-100 transition-colors duration-150"
      >
        <Phone className="h-3 w-3" aria-hidden />
        Contactar
      </a>
    )
  }

  return (
    <Link
      href={`/${slug}/reservar?court=${courtId}&date=${date}&time=${slot.time}&dur=${slot.duration}`}
      className="inline-flex w-full flex-col items-center rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600 hover:bg-green-100 active:scale-[0.98] transition-colors duration-150"
    >
      <span>Reservar</span>
      {priceFormatted && (
        <span className="tabular-nums text-[10px] text-green-700">{priceFormatted}</span>
      )}
    </Link>
  )
}

export default function AvailabilityGrid({ tenant, initialDate, initialAvailability }: Props) {
  const [date, setDate] = useState(initialDate)
  const [availability, setAvailability] = useState(initialAvailability)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const today = getArtToday()
  const maxDate = addDays(today, tenant.bookingAdvanceDays)

  async function loadDate(newDate: string) {
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
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const timeRows = buildTimeRows(availability.courts)
  const noCourts = availability.courts.length === 0

  return (
    <section
      className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4"
      aria-label="Grilla de disponibilidad"
    >
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Disponibilidad</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadDate(addDays(date, -1))}
            disabled={date <= today || loading}
            aria-label="Día anterior"
            className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[180px] text-center tabular-nums">
            {formatDateES(date)}
          </span>
          <button
            type="button"
            onClick={() => loadDate(addDays(date, 1))}
            disabled={date >= maxDate || loading}
            aria-label="Día siguiente"
            className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && <Skeleton className="h-48 rounded-lg" />}

      {/* Error al cambiar de dia: la grilla sigue mostrando el dia previo */}
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

      {/* Grid */}
      {!loading && !noCourts && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-xs font-medium text-slate-500 uppercase tracking-wide text-left py-2 pr-4 w-16"
                >
                  Hora
                </th>
                {availability.courts.map((court) => (
                  <th
                    key={court.id}
                    scope="col"
                    className="text-xs font-medium text-slate-500 uppercase tracking-wide text-center py-2 px-2 min-w-[110px]"
                  >
                    {court.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeRows.map((row) => (
                <tr key={row.time} className="hover:bg-slate-50">
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
                        <span className="text-slate-200 text-xs">—</span>
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
      {!loading && !noCourts && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-50 ring-1 ring-inset ring-green-600" />
            Libre
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-slate-100 ring-1 ring-inset ring-slate-500" />
            Ocupado
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-50 ring-1 ring-inset ring-blue-600" />
            Turno fijo
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-50 ring-1 ring-inset ring-red-600" />
            Bloqueado
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-slate-100" />
            Pasado
          </span>
        </div>
      )}
    </section>
  )
}
