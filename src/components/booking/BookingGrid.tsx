'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Ban,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  HandCoins,
  LayoutGrid,
  MoonStar,
  Plus,
  Repeat,
  Rows3,
  Sparkles,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useArtNow } from '@/hooks/use-art-now'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'
import { BookingCard } from './BookingCard'
import { WeekStrip } from './WeekStrip'
import { EmptyState } from '@/components/ui/empty-state'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  buildBookingsIndex,
  computeCells,
  countCollapsibleLeading,
  DAY_KEYS,
  generateTimeSlots,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { CourtRow } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// Re-export GridBooking so BookingCard (and others) can import it from here.
export type { GridBooking } from '@/lib/booking/grid-cells'

const BookingFormModal = dynamic(
  () => import('./BookingFormModal').then((m) => m.BookingFormModal),
  { ssr: false },
)

// Leyenda = mini-tutorial del mapeo ícono↔estado (pages/grilla.md §11).
// Mismos tokens que slotVisual en BookingCard — si cambia uno, cambiar el otro.
const GRID_LEGEND: ReadonlyArray<{
  label: string
  icon: LucideIcon
  swatch: string
  iconClass: string
}> = [
  {
    label: 'Libre',
    icon: Plus,
    swatch: 'border border-border/60 bg-card',
    iconClass: 'text-muted-foreground',
  },
  {
    label: 'Esperando seña',
    icon: Clock,
    swatch: 'bg-warning/15 border-l-2 border-l-warning',
    iconClass: 'text-amber-800 dark:text-amber-300',
  },
  {
    label: 'Confirmada',
    icon: HandCoins,
    swatch: 'bg-info/15 border-l-2 border-l-info',
    iconClass: 'text-blue-800 dark:text-blue-300',
  },
  {
    label: 'Señada',
    icon: CheckCircle2,
    swatch: 'bg-success/15 border-l-2 border-l-success',
    iconClass: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    label: 'Jugada',
    icon: CheckCheck,
    swatch: 'bg-success/25 border-l-2 border-l-success',
    iconClass: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    label: 'Ausente',
    icon: UserX,
    swatch: 'bg-destructive/15 border-l-2 border-l-destructive',
    iconClass: 'text-red-700 dark:text-red-300',
  },
  {
    label: 'Abonado',
    icon: Repeat,
    swatch: 'bg-info/15 border-l-2 border-l-info',
    iconClass: 'text-blue-800 dark:text-blue-300',
  },
  {
    label: 'Bloqueado',
    icon: Ban,
    swatch: 'slot-blocked-stripes',
    iconClass: 'text-muted-foreground',
  },
]

const DENSITY_STORAGE_KEY = 'tg-grilla-density'
const HINT_STORAGE_KEY = 'tg-hint-grilla-primera-reserva'

type SelectedSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
}

type Props = {
  courts: CourtRow[]
  initialBookings: GridBooking[]
  date: string
  tenantId: string
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
}

export function BookingGrid({
  courts,
  initialBookings,
  date,
  tenantId,
  openingHours,
  closedDates,
  closesNextDay,
}: Props) {
  const router = useRouter()
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  // Reserva con popover de detalle abierto (hover/focus). Una sola a la vez.
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  // #29: artNow se auto-refresca cada minuto para que isSlotPast no quede
  // congelado en una grilla abierta sin recargar.
  const artNow = useArtNow()
  // Navegación entre días sin reload: la transición mantiene la grilla vieja
  // visible (atenuada) hasta que llega el server component del día nuevo.
  const [isNavPending, startNavTransition] = useTransition()

  // Densidad persistida (pages/grilla.md §4). Se lee post-mount para no
  // desincronizar la hidratación.
  const [isCompact, setIsCompact] = useState(false)
  useEffect(() => {
    try {
      setIsCompact(localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact')
    } catch {
      /* storage bloqueado: densidad por defecto */
    }
  }, [])
  const toggleDensity = useCallback(() => {
    setIsCompact((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DENSITY_STORAGE_KEY, next ? 'compact' : 'comfortable')
      } catch {
        /* no persiste, pero el toggle funciona en la sesión */
      }
      return next
    })
  }, [])

  // Hint de primera vez (§7): arranca descartado para evitar flash y se
  // habilita post-mount solo si nunca se descartó.
  const [hintDismissed, setHintDismissed] = useState(true)
  useEffect(() => {
    try {
      setHintDismissed(localStorage.getItem(HINT_STORAGE_KEY) === '1')
    } catch {
      /* sin storage el hint no aparece: mejor mudo que repetitivo */
    }
  }, [])
  const dismissHint = useCallback(() => {
    try {
      localStorage.setItem(HINT_STORAGE_KEY, '1')
    } catch {
      /* solo esta visita */
    }
    setHintDismissed(true)
  }, [])

  // Banda de madrugada colapsada expandida manualmente (por visita al día).
  const [showMorning, setShowMorning] = useState(false)

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

  const { bookings, status, refetch } = useBookingRealtime({ tenantId, date, initialBookings })

  const dayIdx = new Date(`${date}T12:00:00Z`).getUTCDay()
  const dayKey = DAY_KEYS[dayIdx]!
  const dayHours = openingHours[dayKey as keyof OpeningHours]
  const closedToday = dayHours?.closed === true || closedDates.includes(date)

  const openHhmm = dayHours?.open ?? '08:00'
  const closeHhmm = dayHours?.close ?? '23:00'

  const slots = useMemo(
    () => (closedToday ? [] : generateTimeSlots(openHhmm, closeHhmm, closesNextDay)),
    [openHhmm, closeHhmm, closedToday, closesNextDay],
  )

  const bookingsByKey = useMemo(() => buildBookingsIndex(bookings), [bookings])

  const cells = useMemo(
    () => computeCells(slots, courts, bookingsByKey),
    [slots, courts, bookingsByKey],
  )

  const isSlotPast = useCallback(
    (slotTime: string): boolean => {
      if (!artNow.date) return false
      if (date < artNow.date) return true
      if (date > artNow.date) return false
      // Día operativo: un slot de madrugada (slotTime < apertura, con
      // closesNextDay) ocurre FÍSICAMENTE mañana, así que en el día operativo de
      // hoy todavía es futuro aunque su hora de pared sea menor que "ahora".
      if (closesNextDay && slotTime < openHhmm) return false
      return slotTime < artNow.time
    },
    [artNow, date, closesNextDay, openHhmm],
  )

  // Madrugada muerta colapsada (pages/grilla.md §5): las horas ya pasadas sin
  // ninguna reserva se pliegan a una banda de 2rem en vez de forzar scroll.
  const collapsedCount = useMemo(
    () => (showMorning ? 0 : countCollapsibleLeading(slots, courts, cells, isSlotPast)),
    [showMorning, slots, courts, cells, isSlotPast],
  )
  const visibleSlots = useMemo(
    () => (collapsedCount > 0 ? slots.slice(collapsedCount) : slots),
    [slots, collapsedCount],
  )
  const hasBand = collapsedCount > 0
  const rowOffset = hasBand ? 3 : 2
  const rowHeightRem = isCompact ? 2.75 : 3.25

  // Pulso de atención Realtime (MASTER §5.3): toda reserva que aparece después
  // del primer render pulsa una vez. El set inicial se siembra sin pulsar.
  const seenIdsRef = useRef<Set<string> | null>(null)
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(() => new Set())
  const [lastArrival, setLastArrival] = useState<string | null>(null)
  useEffect(() => {
    const ids = new Set(bookings.map((b) => b.id))
    if (seenIdsRef.current === null) {
      seenIdsRef.current = ids
      return
    }
    const fresh = bookings.filter((b) => !seenIdsRef.current!.has(b.id))
    seenIdsRef.current = ids
    if (fresh.length === 0) return

    setPulseIds((prev) => {
      const next = new Set(prev)
      for (const b of fresh) next.add(b.id)
      return next
    })
    const first = fresh[0]!
    const courtName = courts.find((c) => c.id === first.courtId)?.name
    setLastArrival(`Nueva reserva: ${first.timeStart}${courtName ? ` en ${courtName}` : ''}`)
    // Fire-and-forget: la animación corre una sola vez; la clase se retira
    // apenas termina para que un re-render no la repita.
    const pulseTimer = setTimeout(() => {
      setPulseIds((prev) => {
        const next = new Set(prev)
        for (const b of fresh) next.delete(b.id)
        return next
      })
    }, 700)
    return () => clearTimeout(pulseTimer)
  }, [bookings, courts])

  // Línea de "ahora": filas de 60 min (fix del bug ÷30 que la dibujaba al
  // doble de distancia) + offset de header y banda de colapso.
  const nowTopRem = useMemo(() => {
    if (!artNow.date || artNow.date !== date) return null
    const first = visibleSlots[0]
    if (!first) return null
    const [nH, nM] = artNow.time.split(':').map(Number)
    const [fH, fM] = first.split(':').map(Number)
    if (nH === undefined || nM === undefined || fH === undefined || fM === undefined) return null

    const nowMins = nH * 60 + nM
    const firstMins = fH * 60 + fM
    // Antes de la apertura visible (o madrugada operativa) no se dibuja.
    if (nowMins < firstMins) return null

    const headerRem = 2.75 + (hasBand ? 2 : 0)
    const top = headerRem + ((nowMins - firstMins) / 60) * rowHeightRem
    const maxTop = headerRem + visibleSlots.length * rowHeightRem
    return top <= maxTop ? top : null
  }, [artNow.time, artNow.date, date, visibleSlots, hasBand, rowHeightRem])

  // Scroll-to-now al cargar (pages/grilla.md §6): una vez por fecha (el
  // componente se remonta con key={date}), instantáneo, línea al ~30% del alto.
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const didAutoScrollRef = useRef(false)
  useEffect(() => {
    if (didAutoScrollRef.current || nowTopRem === null) return
    const el = gridScrollRef.current
    if (!el) return
    didAutoScrollRef.current = true
    const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    el.scrollTop = Math.max(0, nowTopRem * remPx - el.clientHeight * 0.3)
  }, [nowTopRem])

  const handleSlotClick = useCallback(
    (courtId: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court) return
      setSelectedSlot({
        courtId,
        courtName: court.name,
        date,
        timeStart: slotTime,
        durationMins: 60,
      })
    },
    [courts, date],
  )

  // Navegación con flechas entre slots: cada botón lleva data-col/data-row;
  // el while salta filas cubiertas por reservas de 120 min y slots no
  // interactivos (pasados, cancha pausada) hasta encontrar el siguiente foco.
  // Los índices son sobre las filas VISIBLES (colapso incluido).
  const handleGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const dCol = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const dRow = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      if (dCol === 0 && dRow === 0) return

      const target = e.target as HTMLElement
      const col = Number(target.dataset['col'])
      const row = Number(target.dataset['row'])
      if (Number.isNaN(col) || Number.isNaN(row)) return

      e.preventDefault()
      let c = col + dCol
      let r = row + dRow
      while (c >= 0 && c < courts.length && r >= 0 && r < visibleSlots.length) {
        const next = e.currentTarget.querySelector<HTMLElement>(
          `[data-col="${c}"][data-row="${r}"]`,
        )
        if (next) {
          next.focus()
          next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          return
        }
        c += dCol
        r += dRow
      }
    },
    [courts.length, visibleSlots.length],
  )

  const handleBookingSuccess = useCallback((_booking: BookingRow) => {
    setSelectedSlot(null)
    // Refresh both: router.refresh re-runs the server component (updates the
    // initialBookings prop), and refetch hits /api/bookings to update the
    // hook's local state — the hook's useState only reads initialBookings on
    // mount, so without an explicit refetch the new booking would only appear
    // when Realtime eventually pushes it. In E2E that lag misses the
    // assertion window; in a browser tab that lost the websocket, it never
    // arrives at all.
    router.refresh()
    void refetch()
  }, [router, refetch])

  const LABEL_DAYS: Record<string, string> = {
    mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue',
    fri: 'Vie', sat: 'Sáb', sun: 'Dom',
  }

  const dateLabel = useMemo(
    () =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    [date],
  )

  const showFirstHint =
    !hintDismissed && !closedToday && courts.length > 0 && slots.length > 0 && bookings.length === 0

  return (
    <div className="space-y-4">
      {/* Anuncio accesible de reservas nuevas por Realtime (MASTER §10). */}
      <p aria-live="polite" role="status" className="sr-only">
        {lastArrival}
      </p>

      {/* Offline banner — kept as an amber warning div, not ErrorState, because this is a
          RECOVERABLE degraded state (realtime dropped → polling fallback). ErrorState's red
          palette implies a fatal error; that would misrepresent the severity here. */}
      {status === 'OFFLINE' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          Sin conexión. Los datos pueden no estar actualizados.
        </div>
      )}

      {/* Header sticky: título + tira semanal siempre a mano mientras la
          grilla scrollea. Fondo sólido para tapar el contenido que pasa
          por debajo (el admin header fijo mide 4rem). */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 space-y-3 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Grilla</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {LABEL_DAYS[dayKey]} {dateLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleDensity}
                  aria-pressed={isCompact}
                  aria-label="Cambiar densidad de la grilla"
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 md:min-h-9',
                    isCompact
                      ? 'border-emerald-600/40 bg-primary/10 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                      : 'border-border bg-card text-foreground hover:bg-accent',
                  )}
                >
                  <Rows3 aria-hidden className="h-4 w-4" />
                  <span className="hidden sm:inline">{isCompact ? 'Compacto' : 'Cómodo'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Alto de las filas: cómodo o compacto</TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => {
                const today = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
                navigateToDate(today)
              }}
              className="min-h-11 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent md:min-h-9"
            >
              Hoy
            </button>
          </div>
        </div>
        <WeekStrip date={date} todayArt={artNow.date} onNavigate={navigateToDate} />
      </div>

      {courts.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title="Sin canchas configuradas"
          description="Todavía no agregaste ninguna cancha. Configurá al menos una para empezar a tomar turnos."
        />
      )}

      {closedToday && courts.length > 0 && (
        <EmptyState
          icon={MoonStar}
          title="Complejo cerrado este día"
          description="Este día está marcado como cerrado en la configuración de horarios."
        />
      )}

      {courts.length > 0 && !closedToday && (
        <>
          {/* Hint de primera vez (MASTER §7.2): el vacío enseña la primera acción. */}
          {showFirstHint && (
            <div
              role="note"
              className="flex items-center gap-2.5 rounded-lg border border-emerald-600/25 bg-primary/5 px-3 py-2 text-sm text-foreground dark:border-emerald-400/25 dark:bg-emerald-500/10"
            >
              <Sparkles
                aria-hidden
                className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              />
              <p className="flex-1">Tocá cualquier horario libre para cargar tu primera reserva.</p>
              <button
                type="button"
                onClick={dismissHint}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-emerald-800 transition-colors duration-150 hover:bg-primary/10 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
              >
                Entendido
              </button>
            </div>
          )}

          <div
            ref={gridScrollRef}
            data-testid="booking-grid"
            aria-busy={isNavPending}
            // tabIndex 0: un día sin slots interactivos (todos pasados) dejaría
            // la región scrolleable inalcanzable por teclado (axe
            // scrollable-region-focusable). Enfocada, scrollea con flechas.
            tabIndex={0}
            role="region"
            aria-label={`Grilla de turnos del ${LABEL_DAYS[dayKey]} ${dateLabel}`}
            className={cn(
              'overflow-auto overscroll-x-contain snap-x snap-proximity max-h-[70dvh] rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(2,6,23,0.04),0_8px_24px_-12px_rgba(2,6,23,0.10)] dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,0.9)]',
              'transition-opacity duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isNavPending && 'opacity-60',
            )}
          >
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `3.5rem repeat(${courts.length}, minmax(8.5rem, 1fr))`,
                gridTemplateRows: `2.75rem ${hasBand ? '2rem ' : ''}repeat(${visibleSlots.length}, ${rowHeightRem}rem)`,
                minWidth: `${56 + courts.length * 136}px`,
              }}
              onKeyDown={handleGridKeyDown}
            >
              {nowTopRem !== null && (
                <div
                  className="absolute left-[3.5rem] right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: `calc(${nowTopRem}rem - 0.5px)` }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <div className="flex-1 h-[2px] bg-red-500/70 dark:bg-red-500/50" />
                </div>
              )}
              {/* Esquina: tapa el cruce de los dos ejes sticky. */}
              <div
                aria-hidden
                style={{ gridColumn: 1, gridRow: 1 }}
                className="sticky left-0 top-0 z-30 border-b border-border bg-card"
              />

              {/* Header sticky de canchas. */}
              {courts.map((court, ci) => (
                <div
                  key={court.id}
                  style={{ gridColumn: ci + 2, gridRow: 1 }}
                  className="sticky top-0 z-20 snap-start scroll-ml-14 flex items-center justify-center gap-1 truncate border-b border-border bg-card/95 px-2 text-xs font-semibold text-foreground backdrop-blur"
                >
                  <span className="truncate">{court.name}</span>
                  {court.status === 'offline' && (
                    <span className="shrink-0 font-normal text-muted-foreground">(pausada)</span>
                  )}
                </div>
              ))}

              {/* Banda de madrugada colapsada (pages/grilla.md §5). */}
              {hasBand && (
                <button
                  type="button"
                  onClick={() => setShowMorning(true)}
                  aria-expanded={false}
                  aria-label={`Mostrar horarios sin actividad de ${slots[0]} a ${slots[collapsedCount]}`}
                  style={{ gridColumn: '1 / -1', gridRow: 2 }}
                  className={cn(
                    'group flex items-center overflow-hidden border-b border-border bg-muted/30 text-xs text-muted-foreground',
                    'transition-colors duration-150 hover:bg-accent/60',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  )}
                >
                  <span className="sticky left-0 flex items-center gap-1.5 px-3">
                    <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    <span className="tabular-nums">
                      {slots[0]}–{slots[collapsedCount]}
                    </span>
                    <span>· Sin actividad ·</span>
                    <span className="font-medium text-foreground group-hover:underline">
                      Mostrar
                    </span>
                  </span>
                </button>
              )}

              {/* Columna de horas sticky: única fuente de la hora (las celdas
                  no la repiten — pages/grilla.md §3). */}
              {visibleSlots.map((slotTime, ri) => (
                <div
                  key={slotTime}
                  style={{ gridColumn: 1, gridRow: ri + rowOffset }}
                  className="sticky left-0 z-10 flex items-start justify-end bg-card pr-2 pt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                >
                  {slotTime}
                </div>
              ))}

              {/* Celdas: posición explícita (col, fila, span) para que las
                  reservas de 120 min ocupen dos filas sin agujeros. */}
              {courts.map((court, ci) =>
                visibleSlots.map((slotTime, ri) => {
                  const cell = cells.get(`${court.id}:${slotTime}`)
                  if (!cell || cell.kind === 'skip') return null

                  if (cell.kind === 'booking') {
                    return (
                      <BookingCard
                        key={`${court.id}:${slotTime}`}
                        booking={cell.booking}
                        timeStart={slotTime}
                        isPast={isSlotPast(slotTime)}
                        col={ci}
                        row={ri}
                        span={cell.rowSpan}
                        rowOffset={rowOffset}
                        compact={isCompact}
                        isNew={pulseIds.has(cell.booking.id)}
                        courtName={court.name}
                        detailOpen={detailBookingId === cell.booking.id}
                        onDetailChange={setDetailBookingId}
                        popoverSide={
                          ri + cell.rowSpan >= visibleSlots.length - 1 ? 'top' : 'bottom'
                        }
                        popoverAlign={
                          courts.length > 1 && ci === courts.length - 1 ? 'right' : 'left'
                        }
                      />
                    )
                  }

                  const clickable = court.status === 'online' && !isSlotPast(slotTime)
                  return (
                    <BookingCard
                      key={`${court.id}:${slotTime}`}
                      booking={null}
                      timeStart={slotTime}
                      isPast={isSlotPast(slotTime)}
                      col={ci}
                      row={ri}
                      rowOffset={rowOffset}
                      compact={isCompact}
                      courtId={clickable ? court.id : undefined}
                      courtName={court.name}
                      onSlotClick={clickable ? handleSlotClick : undefined}
                    />
                  )
                }),
              )}
            </div>
          </div>

          {/* Leyenda de estados: enseña el mapeo ícono↔estado. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {GRID_LEGEND.map((item) => {
              const LegendIcon = item.icon
              return (
                <li key={item.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-sm',
                      item.swatch,
                    )}
                  >
                    <LegendIcon className={cn('h-2.5 w-2.5', item.iconClass)} />
                  </span>
                  {item.label}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {selectedSlot && (
        <BookingFormModal
          slot={selectedSlot}
          open={true}
          onClose={() => setSelectedSlot(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  )
}
