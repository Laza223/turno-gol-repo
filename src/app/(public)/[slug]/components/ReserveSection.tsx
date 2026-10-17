'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatLabel } from '@/components/public/courtFacets'
import { usePortalSession } from '@/components/site/PortalSessionProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { useArtNow } from '@/hooks/use-art-now'
import { summarizeHours } from '@/lib/booking/hour-summary'
import { parseReserveState, replaceReserveUrl, type ReserveState } from '@/lib/booking/reserve-url'
import { capitalizeFirst } from '@/lib/format'
import { isDayClosed, nextOpenDay } from '@/lib/schedule/open-status'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { addDays } from '@/shared/dates/art'
import { DayChips, FormatChips, dayLong } from './ChipGroups'
import CourtRows from './CourtRows'
import DayEmptyState, { type DayEmptyKind, type NextDay } from './DayEmptyState'
import HourGrid, { HOUR_COLUMNS } from './HourGrid'
import { useDayAvailability, useWeekFrom } from './reserve-data'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Esqueleto de la reserva: lo que ven el HTML estático (la página es ISR y no conoce ni el día
 * ni la hora del visitante) y la carga, con la silueta final para que nada salte al hidratar.
 */
export function ReserveSkeleton() {
  return (
    <section
      aria-label="Reservá tu turno"
      aria-busy="true"
      data-state="loading"
      className="space-y-4"
    >
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} aria-hidden className="h-11 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <HoursSkeleton />
    </section>
  )
}

function HoursSkeleton() {
  return (
    <div className="@container" aria-hidden>
      <div className={cn('grid gap-2', HOUR_COLUMNS)}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} aria-hidden className="h-[50px] rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * La reserva de la ficha: día → (formato) → hora → cancha. Elegir una hora despliega debajo las
 * canchas libres a esa hora y tocar una lleva a confirmar. Lo elegido vive en la URL
 * (`?date=&formato=&hora=`) con `replaceState`, así el link compartido y "Volver" lo conservan.
 *
 * La página es ISR: nada de esto se sabe en el servidor. Hasta hidratar (`useArtNow` sin fecha)
 * se ve el esqueleto; después el día sale de la URL y las horas de `/api/public/availability`.
 */
export default function ReserveSection({
  tenant,
  formats,
  trackViewed,
}: {
  tenant: PublicTenant
  formats: number[]
  /** `profile.viewed`: la Server Action entra por prop (no se importa en un módulo cliente). */
  trackViewed: (slug: string, withDate: boolean) => Promise<void>
}) {
  const searchParams = useSearchParams()
  const { session } = usePortalSession()
  const { date: today } = useArtNow()
  const [picked, setPicked] = useState<Partial<ReserveState>>({})
  const [withDate] = useState(() => searchParams.has('date'))
  const listRef = useRef<HTMLElement>(null)
  const scrollToList = useRef(false)

  const advanceDays = tenant.bookingAdvanceDays
  const maxDate = today ? addDays(today, advanceDays) : ''
  const fromUrl = today ? parseReserveState(searchParams, { today, advanceDays, formats }) : null
  // Lo elegido con un chip vale mientras ese día no haya pasado. Con la página abierta pasada la
  // medianoche manda la URL, que `parseReserveState` ya acota a hoy; la hora y el formato que
  // venían con ese chip (y quedaron en la URL) tampoco se heredan al día nuevo.
  const isStale = (p: Partial<ReserveState>) => p.date !== undefined && p.date < today
  const stale = isStale(picked)
  const live = stale ? { hora: null, formato: null } : picked
  const state = fromUrl && { ...fromUrl, ...live }
  useEffect(() => {
    if (stale) replaceReserveUrl({ date: today, hora: null, formato: null })
  }, [stale, today])

  const closed = state ? isDayClosed(state.date, tenant) : false
  const day = useDayAvailability(tenant.slug, state && !closed ? state.date : null)
  const rows = day.data && state ? summarizeHours(day.data.courts, state.formato) : []
  // Una hora de la URL que no existe (o ya sin lugar) no elige nada.
  const selected = rows.find((r) => r.time === state?.hora && r.freeCount > 0)
  // Una hora que ya estaba elegida y, tras un refresco, se ocupó: se avisa en el lugar de la lista.
  // Se recuerda con día y formato: si la hora desaparece porque cambió el filtro, no "se ocupó".
  const hourKey = state && `${state.date}|${state.hora}|${state.formato}`
  const [seenHour, setSeenHour] = useState<string | null>(null)
  if (selected && hourKey !== seenHour) setSeenHour(hourKey)
  const taken = !!state?.hora && !selected && day.data !== undefined && seenHour === hourKey

  const empty: DayEmptyKind | null = !state
    ? null
    : closed
      ? 'closed'
      : day.failure
        ? 'error'
        : !day.data
          ? null
          : day.data.courts.length === 0
            ? 'noCourts'
            : rows.length === 0
              ? 'none'
              : rows.every((r) => r.state === 'full')
                ? 'full'
                : null

  function pickDay(date: string) {
    setPicked((p) => ({ ...p, date, hora: null }))
    replaceReserveUrl({ date, hora: null })
  }

  // Salida del día sin lugar: el próximo día abierto (sin pedir nada) o, con el día lleno, el
  // próximo con lugar (una consulta diferida a la semana que sigue).
  const wantsRoom = empty === 'none' || empty === 'full'
  const weekStart =
    state && wantsRoom && addDays(state.date, 1) <= maxDate ? addDays(state.date, 1) : null
  const { week, retry: retryWeek } = useWeekFrom(tenant.slug, weekStart)
  const goTo = (date: string): NextDay => ({
    status: 'found',
    label: `Ver el ${dayLong(date)}`,
    onSelect: () => pickDay(date),
  })
  let nextDay: NextDay | null = null
  if (state && empty === 'error' && day.failure === 'range') {
    // El día quedó fuera de la ventana (el complejo bajó la anticipación): se vuelve a hoy.
    nextDay = { status: 'found', label: 'Ver hoy', onSelect: () => pickDay(today) }
  } else if (state && empty === 'closed') {
    const next = nextOpenDay(state.date, maxDate, tenant)
    nextDay = next ? goTo(next) : { status: 'none', reviewed: 0 }
  } else if (state && wantsRoom) {
    if (weekStart === null) nextDay = { status: 'none', reviewed: 0 }
    else if (week === undefined) nextDay = { status: 'searching' }
    else if (week === 'error') nextDay = { status: 'failed', onRetry: retryWeek }
    else {
      const found = week.days.find((d) =>
        summarizeHours(d.courts, state.formato).some((r) => r.freeCount > 0),
      )
      nextDay = found
        ? goTo(found.date)
        : {
            status: 'none',
            reviewed: week.days.length,
            label: week.days[0] && dayLong(week.days[0].date),
          }
    }
  }

  const contact = resolveTenantContact(
    tenant,
    `Hola, quiero consultar disponibilidad en ${tenant.name}.`,
  )
  const contactLink = contact.whatsappUrl
    ? { href: contact.whatsappUrl, label: 'Consultar por WhatsApp' }
    : contact.telHref
      ? { href: contact.telHref, label: 'Llamar al complejo' }
      : null

  // `profile.viewed`: una vez por pestaña y complejo, cuando el primer estado queda resuelto: horas
  // cargadas o día cerrado (un complejo cerrado hoy también se vio). Un error no cuenta: nadie vio horas.
  const resolved = closed || day.data !== undefined
  const viewedSent = useRef(false)
  useEffect(() => {
    if (!resolved || viewedSent.current) return
    viewedSent.current = true
    try {
      const key = `tg:profile-viewed:${tenant.slug}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // Sin storage (modo privado estricto): se emite igual, una vez por montaje.
    }
    trackViewed(tenant.slug, withDate).catch(() => {})
  }, [resolved, tenant.slug, withDate, trackViewed])

  // Al elegir una hora la lista de canchas aparece debajo: se la acerca lo justo, sin mover el foco.
  useEffect(() => {
    if (!scrollToList.current || !listRef.current) return
    scrollToList.current = false
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    listRef.current.scrollIntoView?.({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
  }, [selected?.time])

  if (!state) return <ReserveSkeleton />

  const withRoom = rows.filter((r) => r.freeCount > 0).length
  const takenMessage = `Las ${state.hora} se ocuparon. Elegí otra hora.`
  const announcement = !day.data
    ? ''
    : taken
      ? takenMessage
      : selected
        ? `${selected.time}: ${plural(selected.freeCount, 'cancha libre', 'canchas libres')}`
        : `${capitalizeFirst(dayLong(state.date))}${state.formato ? `, ${formatLabel(state.formato)}` : ''}: ${plural(withRoom, 'horario con lugar', 'horarios con lugar')}`

  // Para quien espera (y para los tests visuales): `loading` hasta que el primer estado se resolvió.
  const phase = closed
    ? 'closed'
    : day.failure
      ? 'error'
      : day.data && nextDay?.status !== 'searching'
        ? 'ready'
        : 'loading'

  return (
    <section
      aria-label="Reservá tu turno"
      aria-busy={phase === 'loading'}
      data-state={phase}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <DayChips
          days={Array.from({ length: advanceDays + 1 }, (_, i) => addDays(today, i))}
          today={today}
          value={state.date}
          isClosed={(date) => isDayClosed(date, tenant)}
          onChange={pickDay}
        />
        <p className="text-[13px] leading-5 text-muted-foreground">
          {advanceDays === 0
            ? 'Reservás solo para hoy'
            : `Reservás hasta ${plural(advanceDays, 'día', 'días')} antes`}
        </p>
      </div>

      {formats.length > 1 && (
        <FormatChips
          formats={formats}
          value={state.formato}
          onChange={(formato) => {
            setPicked((p) => ({ ...(isStale(p) ? {} : p), formato }))
            replaceReserveUrl({ formato })
          }}
        />
      )}

      {empty && (
        <DayEmptyState
          kind={empty}
          failure={day.failure ?? undefined}
          dayLabel={dayLong(state.date)}
          nextDay={nextDay}
          onRetry={day.retry}
          contact={empty === 'noCourts' || nextDay?.status === 'none' ? contactLink : null}
        />
      )}

      {!day.data && !closed && !day.failure && <HoursSkeleton />}
      {/* Con el día lleno y otro día al que ir, nueve "Completo" no dicen nada más que el título. */}
      {rows.length > 0 && !(empty === 'full' && nextDay?.status === 'found') && (
        <HourGrid
          rows={rows}
          value={selected?.time ?? null}
          onChange={(hora) => {
            scrollToList.current = true
            setPicked((p) => ({ ...(isStale(p) ? {} : p), hora }))
            replaceReserveUrl({ hora })
            // Con el día vencido (120 s) se vuelve a pedir: la hora puede haberse ocupado.
            day.revalidate()
          }}
        />
      )}

      {taken && (
        <div className="rounded-xl border border-border bg-muted p-4">
          <p className="text-base font-semibold text-foreground">{takenMessage}</p>
        </div>
      )}

      {selected && (
        <CourtRows
          ref={listRef}
          tenant={tenant}
          row={selected}
          date={state.date}
          formato={state.formato}
          className={
            session
              ? 'scroll-mb-[calc(4.5rem+env(safe-area-inset-bottom))] md:scroll-mb-4'
              : 'scroll-mb-4'
          }
        />
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}
