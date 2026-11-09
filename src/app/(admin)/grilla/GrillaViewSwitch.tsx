'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminHeaderSlot } from '@/components/layout/admin-header-slot'
import { addDays } from '@/lib/booking/grid-cells'
import { weekDays } from '@/lib/booking/week-grid'

type Props = {
  view: 'day' | 'week'
  /** Día mostrado (vista por día) o cualquier día de la semana mostrada (vista por semana). */
  date: string
  /** La cancha de la vista por semana; en la vista por día, la que se abre al pasar a semana. */
  courtId: string
  courts: Array<{ id: string; name: string }>
}

function href(view: 'day' | 'week', date: string, courtId: string): string {
  return view === 'week'
    ? `/grilla?view=week&date=${date}&court=${courtId}`
    : `/grilla?date=${date}`
}

/** "9 – 15 nov": la semana de lunes a domingo, con el mes del último día. */
function weekLabel(date: string): string {
  const days = weekDays(date)
  const first = new Date(`${days[0]}T12:00:00Z`).getUTCDate()
  const last = new Date(`${days[6]}T12:00:00Z`)
  const month = last
    .toLocaleDateString('es-AR', { month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
    .replace('.', '')
  return `${first} – ${last.getUTCDate()} ${month}`
}

const ICON_BTN =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9'

/**
 * "Día | Semana" de la Grilla y, en la semana, qué cancha mirar y a qué semana ir.
 * Todo es URL (`?view=week&court=…&date=…`): sin estado propio, el servidor
 * trae los turnos que corresponden y recargar o compartir el link da lo mismo.
 *
 * En escritorio va en la barra superior, junto a "Grilla | Agenda"; en el
 * teléfono, donde esa barra la ocupa la marca, va en una fila arriba de la matriz.
 */
/** El segmento "Día | Semana" solo: la vista por día lo lleva en su propia barra. */
export function DayWeekToggle({ view, date, courtId }: Omit<Props, 'courts'>) {
  return (
    <nav
      aria-label="Ver la grilla por"
      className="flex shrink-0 gap-0.5 rounded-[9px] bg-muted p-[3px]"
    >
      {(
        [
          ['day', 'Día'],
          ['week', 'Semana'],
        ] as const
      ).map(([v, label]) => (
        <Link
          key={v}
          href={href(v, date, courtId)}
          aria-current={view === v ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center rounded-[7px] px-3 text-[13px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring lg:h-8',
            view === v
              ? 'bg-card font-semibold text-foreground shadow-xs'
              : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function GrillaViewSwitch({ view, date, courtId, courts }: Props) {
  const router = useRouter()
  const segmented = <DayWeekToggle view={view} date={date} courtId={courtId} />

  const courtSelect =
    view === 'week' ? (
      <select
        aria-label="Cancha"
        value={courtId}
        onChange={(e) => router.push(href('week', date, e.target.value))}
        className="h-9 min-w-28 max-w-44 shrink-0 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {courts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    ) : null

  const weekNav =
    view === 'week' ? (
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={href('week', addDays(date, -7), courtId)}
          aria-label="Semana anterior"
          className={ICON_BTN}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </Link>
        <span className="min-w-24 whitespace-nowrap text-center text-sm font-semibold tabular-nums text-foreground">
          {weekLabel(date)}
        </span>
        <Link
          href={href('week', addDays(date, 7), courtId)}
          aria-label="Semana siguiente"
          className={ICON_BTN}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
        <Link
          href={`/grilla?view=week&court=${courtId}`}
          className="flex h-9 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hoy
        </Link>
      </div>
    ) : null

  return (
    <>
      {/* En la vista por día, la barra de escritorio la arma GridHeaderBar
          (`DayWeekToggle` a la derecha): acá competiría con la fecha centrada. */}
      {view === 'week' && (
        <AdminHeaderSlot>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            {segmented}
            {courtSelect}
            {weekNav}
          </div>
        </AdminHeaderSlot>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:hidden">
        {segmented}
        {courtSelect}
        {weekNav}
      </div>
    </>
  )
}
