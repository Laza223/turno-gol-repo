'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PublicTenant, WeeklyAvailabilityResponse } from '@/modules/tenants/public.service'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { capitalizeFirst, formatArs } from '@/lib/format'

const DOW_FORMATTER = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function formatDayTab(dateStr: string): { dow: string; dm: string } {
  const dt = new Date(dateStr + 'T12:00:00Z')
  const dow = DOW_FORMATTER.format(dt)
  const dm = DAY_MONTH_FORMATTER.format(dt)
  return { dow: capitalizeFirst(dow), dm }
}

function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

type WeeklyAvailabilityModalProps = {
  isOpen: boolean
  onClose: () => void
  tenant: PublicTenant
  selectedDate: string | null
  onSelectDate: (dateStr: string) => void
  today: string | null
  maxDate: string | null
}

export default function WeeklyAvailabilityModal({
  isOpen,
  onClose,
  tenant,
  selectedDate,
  onSelectDate,
  today,
  maxDate,
}: WeeklyAvailabilityModalProps) {
  const [weekStart, setWeekStart] = useState<string | null>(selectedDate ?? today)
  const [weekData, setWeekData] = useState<WeeklyAvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [activeDateIndex, setActiveDateIndex] = useState(0)

  // Al abrir (o al cambiar el día elegido con el modal abierto) la semana
  // visible vuelve a anclarse. Ajuste durante el render contra la combinación
  // anterior, no en un efecto: con el efecto, abrir el modal mostraba por un
  // frame la semana de la vez pasada.
  const anchorKey = `${isOpen}|${selectedDate ?? ''}|${today}`
  const [lastAnchorKey, setLastAnchorKey] = useState(anchorKey)
  if (anchorKey !== lastAnchorKey) {
    setLastAnchorKey(anchorKey)
    if (isOpen) setWeekStart(selectedDate ?? today)
  }

  useEffect(() => {
    if (!isOpen || !weekStart) return

    let active = true
    // Arranque de una operación asincrónica, no adaptación de estado a una
    // prop: marca "pedido en vuelo" antes del fetch. No encadena renders — el
    // efecto no depende de `loading`, así que no se re-dispara a sí mismo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(false)

    fetch(`/api/public/availability/week?slug=${encodeURIComponent(tenant.slug)}&start=${weekStart}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Fetch failed')
        return (await res.json()) as WeeklyAvailabilityResponse
      })
      .then((data) => {
        if (!active) return
        setWeekData(data)
        const idx = data.days.findIndex((d) => d.date === selectedDate)
        setActiveDateIndex(idx >= 0 ? idx : 0)
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
  }, [isOpen, weekStart, tenant.slug, selectedDate])

  const activeDay = weekData?.days[activeDateIndex]

  const canPrevWeek = Boolean(today && weekStart && addDaysStr(weekStart, -7) >= today)
  const canNextWeek = Boolean(maxDate && weekStart && addDaysStr(weekStart, 7) <= maxDate)

  const handlePrevWeek = () => {
    if (!canPrevWeek || !weekStart) return
    const prev = addDaysStr(weekStart, -7)
    setWeekStart(prev)
  }

  const handleNextWeek = () => {
    if (!canNextWeek || !weekStart) return
    const next = addDaysStr(weekStart, 7)
    setWeekStart(next)
  }

  const handleSelectDayTab = (index: number, dateStr: string) => {
    setActiveDateIndex(index)
    onSelectDate(dateStr)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto sm:rounded-2xl p-4 sm:p-6">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Calendar className="h-5 w-5 text-emerald-600" aria-hidden />
            Disponibilidad semanal
          </DialogTitle>
        </DialogHeader>

        {/* Controls for Week Navigation */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrevWeek}
            disabled={!canPrevWeek || loading}
            aria-label="Semana anterior"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Semana anterior</span>
          </button>

          <span className="text-xs font-semibold text-muted-foreground">
            {weekData?.startDate ? `Semana del ${formatDayTab(weekData.startDate).dm}` : ''}
          </span>

          <button
            type="button"
            onClick={handleNextWeek}
            disabled={!canNextWeek || loading}
            aria-label="Semana siguiente"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden sm:inline">Semana siguiente</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day Tabs */}
        {loading && !weekData ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">
            Ocurrió un error al cargar la disponibilidad de la semana.
          </div>
        ) : weekData ? (
          <div className="space-y-4 pt-2">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {weekData.days.map((d, i) => {
                const { dow, dm } = formatDayTab(d.date)
                const isActive = i === activeDateIndex
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => handleSelectDayTab(i, d.date)}
                    aria-pressed={isActive}
                    className={`flex min-w-[68px] flex-1 snap-start flex-col items-center rounded-xl border px-3 py-2 text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <span className="font-semibold">{dow}</span>
                    <span className="tabular-nums">{dm}</span>
                  </button>
                )
              })}
            </div>

            {/* Active Day Availability */}
            {activeDay && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Canchas para el {formatDayTab(activeDay.date).dow} {formatDayTab(activeDay.date).dm}
                  </h3>
                </div>

                {activeDay.courts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sin canchas disponibles este día.
                  </p>
                ) : (
                  <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
                    {activeDay.courts.map((court) => {
                      const free = court.slots.filter((s) => s.status === 'free')
                      return (
                        <div key={court.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
                          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-foreground">
                            {court.name}
                          </h4>
                          {free.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin turnos libres.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {free.map((s) => (
                                <Link
                                  key={s.time}
                                  href={`/${tenant.slug}/reservar?court=${court.id}&date=${activeDay.date}&time=${s.time}&dur=${s.duration}`}
                                  onClick={onClose}
                                  className="flex min-h-10 flex-col items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/30 hover:bg-primary hover:text-primary-foreground transition-all active:scale-[0.98]"
                                >
                                  <span className="tabular-nums">{s.time}</span>
                                  {s.price && (
                                    <span className="text-[10px] tabular-nums opacity-90">
                                      {formatArs(s.price)}
                                    </span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
