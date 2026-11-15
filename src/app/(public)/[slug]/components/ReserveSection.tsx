'use client'

import './ficha.css'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatLabel } from '@/components/public/courtFacets'
import { Skeleton } from '@/components/ui/skeleton'
import { useArtNow } from '@/hooks/use-art-now'
import { summarizeHours } from '@/lib/booking/hour-summary'
import {
  hasReserveStepMark,
  parseReserveState,
  pushReserveUrl,
  replaceReserveUrl,
} from '@/lib/booking/reserve-url'
import { capitalizeFirst } from '@/lib/format'
import { isDayClosed, nextOpenDay } from '@/lib/schedule/open-status'
import { resolveTenantContact } from '@/lib/tenant-contact'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { addDays } from '@/shared/dates/art'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { FormatChips, dayLong } from './ChipGroups'
import DayEmptyState, { type DayEmptyKind, type NextDay } from './DayEmptyState'
import DayList from './DayList'
import HourGrid from './HourGrid'
import ReserveBar from './ReserveBar'
import { useDayAvailability, useWeekFrom } from './reserve-data'

/**
 * Lo elegido. Sale de la URL (`?date=&hora=&formato=`) y se dibuja desde un estado local: Next
 * sincroniza `useSearchParams` de forma asíncrona. Sin `date` es hoy.
 */
type Picked = { date: string; hora: string | null; formato: number | null }

type UrlContext = { today: string; advanceDays: number; formats: readonly number[] }

/** `parseReserveState` cae a hoy si falta `date` o no sirve (vencida, fuera de la ventana). */
function readPicked(params: { get(name: string): string | null }, ctx: UrlContext): Picked {
  const { date, hora, formato } = parseReserveState(params, ctx)
  return { date, hora, formato }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const TITLE_ID = 'reserva-titulo'
const TITLE = 'text-[26px] leading-[1.1] font-bold tracking-[-0.03em] text-portal-ink'

/**
 * Esqueleto de la reserva: lo que ven el HTML estático (la página es ISR y no conoce ni el día
 * ni la hora del visitante) y la carga, con la silueta de la pantalla (título, fila de días y
 * horas) para que nada salte al hidratar.
 */
export function ReserveSkeleton() {
  return (
    <section
      aria-label="Reservá tu turno"
      aria-busy="true"
      data-state="loading"
      className="reserve glass"
    >
      <div aria-hidden>
        <Skeleton variant="glass" aria-hidden className="h-7 w-3/5 rounded-full" />
        <Skeleton variant="glass" aria-hidden className="mt-2.5 h-4 w-4/5 rounded-full" />
      </div>
      <div className="daystrip" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} variant="glass" aria-hidden className="h-[84px] rounded-[22px]" />
        ))}
      </div>
      <HoursSkeleton />
    </section>
  )
}

/** Las horas mientras carga el día. Aparece recién a los 150 ms (`ficha.css`). */
function HoursSkeleton() {
  return (
    <div className="ficha-hours-skeleton hgrid" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton
          key={i}
          variant="glass"
          aria-hidden
          className="aspect-[1/0.88] min-h-16 rounded-[20px]"
        />
      ))}
    </div>
  )
}

/** "21:00" → "22:00", con la misma regla que confirmar (23:00 termina "24:00"). */
function endOf(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return endLabelFromMins(h! * 60 + (m ?? 0) + SLOT_DURATION_MINUTES)
}

/** Vibración corta al elegir una hora: solo en pantallas táctiles que la soportan. */
function tap() {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return
  try {
    navigator.vibrate?.(8)
  } catch {
    // Algunos navegadores la bloquean sin gesto: no es un error.
  }
}

/**
 * La reserva de la ficha en una pantalla (decisión 2026-11-13, portal de vidrio): los días en una
 * fila, el tamaño de cancha, las horas en cuadrados y, al tocar una hora, la barra de "Reservar"
 * con la cancha, el precio y el botón. El estado vive en la URL (`?date=&hora=&formato=`): un
 * link viejo a cualquiera de los tres pasos de antes abre esta pantalla con ese día y esa hora.
 *
 * Historial: elegir una hora hace `pushState`, así el atrás del celular cierra la barra antes de
 * salir de la ficha. El día y el tamaño son filtros y hacen `replaceState`. Cerrar la barra con la
 * X, el arrastre o Esc vuelve por el historial si la entrada la empujó esta página; si se entró
 * por un link con la hora, reemplaza la URL para no sacar al jugador del sitio.
 *
 * La página es ISR: nada de esto se sabe en el servidor. Hasta hidratar (`useArtNow` sin fecha)
 * se ve el esqueleto; después las horas salen de `/api/public/availability`.
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
  const { date: today } = useArtNow()
  const [local, setLocal] = useState<Picked | null>(null)
  const [withDate] = useState(() => searchParams.has('date'))

  const advanceDays = tenant.bookingAdvanceDays
  const maxDate = today ? addDays(today, advanceDays) : ''
  const ctx: UrlContext = { today, advanceDays, formats }
  const base = local ?? (today ? readPicked(searchParams, ctx) : null)
  // Con la página abierta pasada la medianoche, el día elegido que ya pasó vuelve a hoy: ni la
  // hora ni el tamaño que venían con él (y quedaron en la URL) se heredan al día nuevo.
  const stale = !!base && base.date < today
  const picked: Picked | null = stale ? { date: today, hora: null, formato: null } : base
  useEffect(() => {
    if (stale) replaceReserveUrl({ date: null, hora: null, formato: null })
  }, [stale])

  const date = picked?.date ?? null
  const closed = date ? isDayClosed(date, tenant) : false
  // La semana desde hoy alimenta el estado de cada día de la fila y, si ya trajo el día elegido,
  // las horas salen con ella sin esqueleto mientras `useDayAvailability` las refresca.
  const { week: thisWeek } = useWeekFrom(tenant.slug, today || null)
  const seed =
    date && thisWeek && thisWeek !== 'error'
      ? thisWeek.days.find((d) => d.date === date)
      : undefined
  const day = useDayAvailability(tenant.slug, date && !closed ? date : null, seed)
  const rows = day.data && picked ? summarizeHours(day.data.courts, picked.formato) : []
  // Una hora de la URL que no existe (o ya sin lugar) no elige nada.
  const selected = rows.find((r) => r.time === picked?.hora && r.freeCount > 0)
  // Una hora que ya estaba elegida y, tras un refresco, se ocupó: la barra lo avisa. Se recuerda
  // con día y tamaño: si la hora desaparece porque cambió el filtro, no "se ocupó".
  const hourKey = picked && `${picked.date}|${picked.hora}|${picked.formato}`
  const [seenHour, setSeenHour] = useState<string | null>(null)
  if (selected && hourKey !== seenHour) setSeenHour(hourKey)
  const taken = !!picked?.hora && !selected && day.data !== undefined && seenHour === hourKey

  const empty: DayEmptyKind | null = !picked
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

  // Un "atrás" por vez: tras `history.back()` nada cambia hasta que llega el popstate (si no, un
  // doble toque en la X saldría de la ficha). `pending`: el día o el tamaño que se tocó con la
  // barra abierta y que la cierra; se aplica cuando el historial terminó de cerrarla.
  const [pendingBack, setPendingBack] = useState(false)
  const [pending, setPending] = useState<{ date?: string; formato?: number | null } | null>(null)
  // Al abrir la barra con un toque el foco entra en ella; al cerrarla vuelve a la hora.
  const [openedByTap, setOpenedByTap] = useState(false)
  const refocusHour = useRef<string | null>(null)

  function goBack() {
    setPendingBack(true)
    window.history.back()
  }

  function pickDay(to: string) {
    if (!picked || pendingBack) return
    if (picked.hora && hasReserveStepMark()) {
      setPending({ date: to })
      goBack()
      return
    }
    replaceReserveUrl({ date: to, hora: null })
    setLocal({ ...picked, date: to, hora: null })
  }

  function pickHour(hora: string) {
    if (!picked || pendingBack || (hora === picked.hora && selected)) return
    // Con la barra abierta, otra hora reemplaza: el atrás sigue cerrando la barra de una vez.
    if (selected || taken) replaceReserveUrl({ hora })
    else pushReserveUrl({ date: picked.date, hora })
    setOpenedByTap(true)
    setLocal({ ...picked, hora })
    tap()
    // Con el día vencido (120 s) se vuelve a pedir: la hora puede haberse ocupado.
    day.revalidate()
  }

  function closeBar() {
    if (!picked?.hora || pendingBack) return
    refocusHour.current = picked.hora
    if (hasReserveStepMark()) goBack()
    else {
      replaceReserveUrl({ hora: null })
      setLocal({ ...picked, hora: null })
    }
  }

  function pickFormato(formato: number | null) {
    if (!picked || pendingBack) return
    // La hora elegida sigue solo si en ese tamaño todavía tiene lugar.
    const keep =
      !!picked.hora &&
      !!day.data &&
      summarizeHours(day.data.courts, formato).some(
        (r) => r.time === picked.hora && r.freeCount > 0,
      )
    // Sin lugar en ese tamaño la barra se cierra: si la abrió la ficha, por el historial (si no,
    // su entrada quedaría colgada y haría falta un atrás de más para salir).
    if (picked.hora && !keep && hasReserveStepMark()) {
      setPending({ formato })
      goBack()
      return
    }
    replaceReserveUrl({ formato, hora: keep ? undefined : null })
    setLocal({ ...picked, formato, hora: keep ? picked.hora : null })
  }

  // El atrás y el adelante del navegador abren y cierran la barra. El oyente es uno solo y llama
  // al render vigente.
  function onPopState() {
    setPendingBack(false)
    if (!today) return
    const next = readPicked(new URLSearchParams(window.location.search), ctx)
    const patch = pending
    setPending(null)
    setOpenedByTap(false)
    if (patch) {
      replaceReserveUrl({ ...patch, hora: null })
      setLocal({ ...next, ...patch, hora: null })
      return
    }
    if (picked?.hora && !next.hora) {
      refocusHour.current = picked.hora
      // El tamaño que se eligió con la barra abierta quedó en la entrada que se cierra: se
      // conserva en vez de volver al de antes.
      if (next.date === picked.date && next.formato !== picked.formato) {
        replaceReserveUrl({ formato: picked.formato })
        setLocal({ ...next, formato: picked.formato })
        return
      }
    }
    setLocal(next)
  }
  const popState = useRef(onPopState)
  useEffect(() => {
    popState.current = onPopState
  })
  useEffect(() => {
    const listener = () => popState.current()
    // Una página que vuelve del bfcache pudo irse a mitad de un "atrás": sin popstate que la
    // libere, quedaría trabada.
    const restored = () => {
      setPendingBack(false)
      setPending(null)
    }
    window.addEventListener('popstate', listener)
    window.addEventListener('pageshow', restored)
    return () => {
      window.removeEventListener('popstate', listener)
      window.removeEventListener('pageshow', restored)
    }
  }, [])

  // Con la barra cerrada, el foco vuelve a la hora que la había abierto (si sigue a la vista).
  const barOpen = !!selected || taken
  useEffect(() => {
    if (barOpen || !refocusHour.current) return
    document
      .querySelector<HTMLElement>(`[data-hour="${refocusHour.current}"]`)
      ?.focus({ preventScroll: true })
    refocusHour.current = null
  }, [barOpen])

  // Salida del día sin lugar: el próximo día abierto (sin pedir nada) o, con el día lleno, el
  // próximo con lugar (una consulta diferida a la semana que sigue).
  const wantsRoom = empty === 'none' || empty === 'full'
  const weekStart =
    picked && wantsRoom && addDays(picked.date, 1) <= maxDate ? addDays(picked.date, 1) : null
  const { week, retry: retryWeek } = useWeekFrom(tenant.slug, weekStart)
  const goTo = (to: string): NextDay => ({
    status: 'found',
    label: `Ver el ${dayLong(to)}`,
    onSelect: () => pickDay(to),
  })
  let nextDay: NextDay | null = null
  if (picked && empty === 'error' && day.failure === 'range') {
    // El día quedó fuera de la ventana (el complejo bajó la anticipación): se vuelve a hoy.
    nextDay = { status: 'found', label: 'Ver hoy', onSelect: () => pickDay(today) }
  } else if (picked && empty === 'closed') {
    const next = nextOpenDay(picked.date, maxDate, tenant)
    nextDay = next ? goTo(next) : { status: 'none', reviewed: 0 }
  } else if (picked && wantsRoom) {
    if (weekStart === null) nextDay = { status: 'none', reviewed: 0 }
    else if (week === undefined) nextDay = { status: 'searching' }
    else if (week === 'error') nextDay = { status: 'failed', onRetry: retryWeek }
    else {
      const found = week.days.find((d) =>
        summarizeHours(d.courts, picked.formato).some((r) => r.freeCount > 0),
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

  // `profile.viewed`: una vez por pestaña y complejo, cuando quedan resueltas las horas del día
  // (o el día está cerrado: un complejo cerrado hoy también se vio). Un error no cuenta: nadie
  // vio disponibilidad.
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

  if (!picked) return <ReserveSkeleton />

  const long = dayLong(picked.date)
  const dayName = capitalizeFirst(long)
  const withRoom = rows.filter((r) => r.freeCount > 0).length
  const help =
    advanceDays === 0
      ? 'Tocá una hora. Reservás solo para hoy.'
      : `Elegí el día y tocá una hora. Podés reservar hasta ${plural(advanceDays, 'día', 'días')} adelante.`
  const announcement = taken
    ? `Ya se ocupó el horario ${picked.hora}. Elegí otra hora.`
    : selected
      ? `${selected.time}: ${plural(selected.freeCount, 'cancha libre', 'canchas libres')}.`
      : day.data && rows.length > 0
        ? `${dayName}${picked.formato ? `, ${formatLabel(picked.formato)}` : ''}: ${plural(withRoom, 'horario con lugar', 'horarios con lugar')}.`
        : ''

  // Para quien espera (y para los tests visuales): `loading` hasta que el día llegó.
  const phase = closed
    ? 'closed'
    : day.failure
      ? 'error'
      : day.data && nextDay?.status !== 'searching'
        ? 'ready'
        : 'loading'

  const barHora = selected?.time ?? picked.hora ?? ''
  const when = `${picked.date === today ? `Hoy, ${long}` : dayName} · ${barHora} a ${endOf(barHora)}`

  return (
    <>
      <section
        data-reserve-section
        aria-labelledby={TITLE_ID}
        aria-busy={phase === 'loading'}
        data-state={phase}
        className="reserve glass"
      >
        <div>
          <h2 id={TITLE_ID} className={TITLE}>
            Reservá tu turno
          </h2>
          <p className="mt-1.5 text-[15px] leading-[1.4] text-pretty text-portal-soft">{help}</p>
        </div>

        <DayList
          today={today}
          advanceDays={advanceDays}
          value={picked.date}
          week={thisWeek}
          isClosed={(d) => isDayClosed(d, tenant)}
          onPick={pickDay}
        />

        {formats.length > 1 && (
          <FormatChips formats={formats} value={picked.formato} onChange={pickFormato} />
        )}

        {empty && (
          <DayEmptyState
            kind={empty}
            failure={day.failure ?? undefined}
            dayLabel={long}
            nextDay={nextDay}
            onRetry={day.retry}
            contact={empty === 'noCourts' || nextDay?.status === 'none' ? contactLink : null}
          />
        )}

        {!day.data && !closed && !day.failure && <HoursSkeleton />}
        {/* Con el día lleno y otro día al que ir, nueve "Completo" no dicen nada más que el aviso. */}
        {rows.length > 0 && !(empty === 'full' && nextDay?.status === 'found') && (
          <>
            <HourGrid
              rows={rows}
              value={selected?.time ?? null}
              onChange={pickHour}
              entrada={picked.date}
            />
            <p className="text-sm leading-5 text-portal-soft">
              Debajo de cada hora, cuántas canchas quedan libres.
            </p>
          </>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </section>

      {barOpen && (
        <ReserveBar
          tenant={tenant}
          date={picked.date}
          when={when}
          row={selected ?? null}
          taken={taken ? picked.hora : null}
          formato={picked.formato}
          autoFocus={openedByTap}
          onClose={closeBar}
        />
      )}
    </>
  )
}
