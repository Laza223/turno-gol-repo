'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { WeeklyAvailabilityResponse } from '@/modules/tenants/public.service'
import { formatArs } from '@/lib/format'

const DOW_FORMATTER = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function formatDayTab(dateStr: string): { dow: string; dm: string } {
  const dt = new Date(dateStr + 'T12:00:00Z')
  const dow = DOW_FORMATTER.format(dt)
  const dm = DAY_MONTH_FORMATTER.format(dt)
  return { dow, dm }
}

export default function WeeklyAvailability({ slug, week }: { slug: string; week: WeeklyAvailabilityResponse }) {
  const [active, setActive] = useState(0)
  const day = week.days[active]!

  return (
    <section className="space-y-4" aria-label="Disponibilidad semanal">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {week.days.map((d, i) => {
          const { dow, dm } = formatDayTab(d.date)
          const isActive = i === active
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`flex min-w-[68px] snap-start flex-col items-center rounded-xl border px-3 py-2 text-xs transition-colors ${
                isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              <span className="font-semibold capitalize">{dow}</span>
              <span className="tabular-nums">{dm}</span>
            </button>
          )
        })}
      </div>

      {day.courts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin canchas disponibles este día.</p>
      ) : (
        <div className="space-y-5">
          {day.courts.map((court) => {
            const free = court.slots.filter((s) => s.status === 'free')
            return (
              <div key={court.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
                <h3 className="mb-3 text-sm font-semibold text-foreground">{court.name}</h3>
                {free.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin turnos libres.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {free.map((s) => (
                      <Link
                        key={s.time}
                        href={`/${slug}/reservar?court=${court.id}&date=${day.date}&time=${s.time}&dur=${s.duration}`}
                        className="flex min-h-11 flex-col items-center justify-center rounded-lg bg-green-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-emerald-300 ring-1 ring-inset ring-green-600/20 dark:ring-emerald-400/20 hover:bg-green-100 dark:hover:bg-emerald-500/15 active:scale-[0.98] transition-colors"
                      >
                        <span className="tabular-nums">{s.time}</span>
                        {/* text-green-600 sobre bg-green-50 mide 3.14:1 — bajo AA. text-green-700 (igual que el resto del link) da 4.79:1. */}
                        {s.price && <span className="text-[10px] text-green-700 dark:text-emerald-400 tabular-nums">{formatArs(s.price)}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
