'use client'

import './reserve-step.css'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatLabel } from '@/components/public/courtFacets'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_BUTTON_OUTLINE, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
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
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { addDays } from '@/shared/dates/art'
import { endLabelFromMins } from '@/shared/time/operating-day'
import { FormatChips, dayLong } from './ChipGroups'
import CourtRows from './CourtRows'
import DayEmptyState, { type DayEmptyKind, type NextDay } from './DayEmptyState'
import DayList from './DayList'
import HourGrid, { HOUR_COLUMNS } from './HourGrid'
import { useDayAvailability, useWeekFrom } from './reserve-data'
import { runStepTransition, type StepDirection } from './reserve-transition'
import StepBar, { RESERVE_STEPS } from './StepBar'

type Step = 1 | 2 | 3

/**
 * Lo elegido y en qué paso se está. `date` y `hora` se recuerdan al volver (el paso anterior se ve
 * con lo que se había elegido); en la URL solo viaja lo que el paso ya confirmó: sin `date` es el
 * paso 1, con `date` el 2 y con `date` y `hora` el 3.
 */
type Picked = { step: Step; date: string | null; hora: string | null; formato: number | null }

const TITLE: Record<Step, string> = {
  1: '¿Qué día querés jugar?',
  2: '¿A qué hora?',
  3: '¿En qué cancha?',
}

type UrlContext = { today: string; advanceDays: number; formats: readonly number[] }

/**
 * El estado que dice la URL. `parseReserveState` cae a hoy si falta `date` o no sirve (vencida,
 * fuera de la ventana): acá solo vale si la URL la trae tal cual, y si no es el paso 1. `keep` es
 * lo recordado hasta ahora: al volver por el historial a un paso anterior la URL ya no trae
 * lo que se había elegido, pero se sigue viendo elegido.
 */
function readPicked(
  params: { get(name: string): string | null },
  ctx: UrlContext,
  keep: Picked | null,
): Picked {
  const url = parseReserveState(params, ctx)
  const hasDate = params.get('date') === url.date
  const keptHora = keep && keep.date === url.date ? keep.hora : null
  return {
    step: !hasDate ? 1 : url.hora ? 3 : 2,
    date: hasDate ? url.date : (keep?.date ?? null),
    hora: hasDate ? (url.hora ?? keptHora) : (keep?.hora ?? null),
    formato: url.formato,
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Debajo de lg la sección ocupa la pantalla (menos la barra de TurnoGol) para que alinear la barra
 * del paso debajo del header siempre sea posible. En lg la reserva es la columna lateral: nada de esto.
 */
const FRAME = 'scroll-mt-20 min-h-[calc(100dvh-5rem)] lg:scroll-mt-0 lg:min-h-0'

/**
 * Esqueleto de la reserva: lo que ven el HTML estático (la página es ISR y no conoce ni el día
 * ni la hora del visitante) y la carga, con la silueta del paso 1 (barra, título y cuatro días)
 * para que nada salte al hidratar.
 */
export function ReserveSkeleton() {
  return (
    <section
      aria-label="Reservá tu turno"
      aria-busy="true"
      data-state="loading"
      className={cn('flex flex-col gap-4', FRAME)}
    >
      <div aria-hidden>
        <div className="flex min-h-11 items-center justify-end">
          <Skeleton aria-hidden className="h-4 w-24" />
        </div>
        <div className="mt-1 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} aria-hidden className="h-1.5 flex-1 rounded-full" />
          ))}
        </div>
      </div>
      <Skeleton aria-hidden className="h-7 w-3/4" />
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} aria-hidden className="h-16 rounded-xl" />
        ))}
      </div>
    </section>
  )
}

function HoursSkeleton() {
  return (
    <div className="@container" aria-hidden>
      <div className={cn('grid gap-2', HOUR_COLUMNS)}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} aria-hidden className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function CourtsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1].map((i) => (
        <Skeleton key={i} aria-hidden className="h-[72px] rounded-xl" />
      ))}
    </div>
  )
}

/** "21:00" → "22:00", con la misma regla que confirmar (23:00 termina "24:00"). */
function endOf(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return endLabelFromMins(h! * 60 + (m ?? 0) + SLOT_DURATION_MINUTES)
}

/**
 * La reserva de la ficha en tres pasos, una pregunta por pantalla: día → hora → cancha. Tocar una
 * opción avanza; tocar una cancha lleva a confirmar. El paso sale de la URL (`?date=&hora=&formato=`):
 * sin `date` es el 1, con `date` el 2 y con `date` y `hora` el 3. Avanzar hace `pushState` (el atrás
 * del celular retrocede un paso); el formato es un filtro y hace `replaceState`.
 *
 * La página es ISR: nada de esto se sabe en el servidor. Hasta hidratar (`useArtNow` sin fecha)
 * se ve el esqueleto; después lo elegido sale de la URL y las horas de `/api/public/availability`.
 * Se dibuja desde un estado local y la URL queda como persistencia: Next sincroniza
 * `useSearchParams` de forma asíncrona y la View Transition necesita el DOM nuevo en su callback.
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
  const base = local ?? (today ? readPicked(searchParams, ctx, null) : null)
  // Con la página abierta pasada la medianoche, un día elegido que ya pasó vuelve al paso 1: ni la
  // hora ni el formato que venían con él (y quedaron en la URL) se heredan al día nuevo.
  const stale = !!base?.date && base.date < today
  const picked: Picked | null = stale ? { step: 1, date: null, hora: null, formato: null } : base
  useEffect(() => {
    if (stale) replaceReserveUrl({ date: null, hora: null, formato: null })
  }, [stale])

  const date = picked && picked.step >= 2 ? picked.date : null
  const closed = date ? isDayClosed(date, tenant) : false
  // La semana desde hoy alimenta el paso 1 (estado de cada día) y, si ya trajo el día elegido, el
  // paso 2 arranca con esas horas sin esqueleto mientras `useDayAvailability` las refresca.
  const { week: thisWeek } = useWeekFrom(tenant.slug, today || null)
  const seed =
    date && thisWeek && thisWeek !== 'error'
      ? thisWeek.days.find((d) => d.date === date)
      : undefined
  const day = useDayAvailability(tenant.slug, date && !closed ? date : null, seed)
  const rows = day.data && picked ? summarizeHours(day.data.courts, picked.formato) : []
  // Una hora de la URL que no existe (o ya sin lugar) no elige nada.
  const selected = rows.find((r) => r.time === picked?.hora && r.freeCount > 0)
  // Una hora que ya estaba elegida y, tras un refresco, se ocupó: se avisa en lugar de la lista.
  // Se recuerda con día y formato: si la hora desaparece porque cambió el filtro, no "se ocupó".
  const hourKey = picked && `${picked.date}|${picked.hora}|${picked.formato}`
  const [seenHour, setSeenHour] = useState<string | null>(null)
  if (selected && hourKey !== seenHour) setSeenHour(hourKey)
  const taken = !!picked?.hora && !selected && day.data !== undefined && seenHour === hourKey

  // Un link al paso 3 con una hora que no sirve (no existe, o el día no carga) muestra el paso 2.
  const settled = closed || day.data !== undefined || day.failure !== null
  const step: Step = picked?.step === 3 && !selected && !taken && settled ? 2 : (picked?.step ?? 1)
  const cur = picked && { ...picked, step }

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

  // Un cambio de paso por vez: con View Transition el paso nuevo se aplica recién en el callback
  // (antes el navegador saca la foto de la pantalla vieja), y un doble toque en ese hueco empujaría
  // una segunda entrada al historial. Se libera apenas el paso nuevo está en el DOM o, tras
  // "Volver" por el historial, cuando llega el popstate.
  const [moving, setMoving] = useState(false)

  // Cambia el paso (sección y título se buscan en el DOM: los refs no se pueden tocar desde
  // funciones que el render pasa a otros componentes): primero se alinea la página (solo en el celular, al instante), después entra el
  // paso nuevo de costado y al terminar el foco va a su título. Sin cambio de paso, solo se aplica.
  function show(next: Picked, direction: StepDirection | null) {
    if (direction === null) {
      setMoving(false)
      setLocal(next)
      return
    }
    setMoving(true)
    if (window.matchMedia?.('(max-width: 1023.98px)').matches) {
      const align = () =>
        document
          .querySelector('[data-reserve-section]')
          ?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
      align()
      // Tras un popstate el navegador restaura el scroll guardado de esa entrada (la del paso 1 suele
      // estar arriba de todo) y pisa la alineación: se repite en el próximo cuadro, que llega antes
      // de que la View Transition saque la foto de la pantalla vieja.
      requestAnimationFrame(align)
    }
    void runStepTransition(direction, () => {
      setLocal(next)
      setMoving(false)
    }).then(() => {
      // Por si el navegador no llegó a correr el callback: la reserva nunca queda trabada.
      setMoving(false)
      document.querySelector<HTMLElement>('[data-reserve-title]')?.focus({ preventScroll: true })
    })
  }
  const directionTo = (from: Step, to: Step): StepDirection | null =>
    to === from ? null : to > from ? 'forward' : 'back'

  function go(to: Picked, how: 'push' | 'replace') {
    if (!cur || moving) return
    const patch = { date: to.step > 1 ? to.date : null, hora: to.step > 2 ? to.hora : null }
    if (how === 'push') pushReserveUrl(patch)
    else replaceReserveUrl(patch)
    show(to, directionTo(cur.step, to.step))
  }
  const pickDay = (to: string) =>
    cur && go({ ...cur, step: 2, date: to, hora: cur.date === to ? cur.hora : null }, 'push')
  const pickHour = (hora: string) => {
    if (!cur || moving) return
    go({ ...cur, step: 3, hora }, 'push')
    // Con el día vencido (120 s) se vuelve a pedir: la hora puede haberse ocupado.
    day.revalidate()
  }
  // Si el paso anterior lo empujó esta página, el historial lo anima (popstate); si se entró por un
  // link al paso 2 o 3, se reemplaza la URL para no sacar al jugador del sitio. Lo mismo si el paso
  // a la vista no es el de la URL (un paso 3 recargado cuya hora ya no existe se ve como el 2): el
  // historial volvería al paso 2, el mismo que ya se ve, y "Volver" parecería no hacer nada.
  function goBack() {
    if (!cur || cur.step === 1 || moving) return
    if (hasReserveStepMark() && picked?.step === cur.step) {
      setMoving(true)
      window.history.back()
    } else go({ ...cur, step: (cur.step - 1) as Step }, 'replace')
  }

  // El atrás y el adelante del navegador mueven el paso. El oyente es uno solo y llama al render vigente.
  function onPopState() {
    setMoving(false)
    if (!cur || !today) return
    const next = readPicked(new URLSearchParams(window.location.search), ctx, cur)
    show(next, directionTo(cur.step, next.step))
  }
  const popState = useRef(onPopState)
  useEffect(() => {
    popState.current = onPopState
  })
  useEffect(() => {
    const listener = () => popState.current()
    // Una página que vuelve del bfcache pudo irse a mitad de un "Volver" (al paso de otro documento,
    // tras recargar): sin popstate que la libere, quedaría trabada.
    const restored = () => setMoving(false)
    window.addEventListener('popstate', listener)
    window.addEventListener('pageshow', restored)
    return () => {
      window.removeEventListener('popstate', listener)
      window.removeEventListener('pageshow', restored)
    }
  }, [])

  // Salida del día sin lugar: el próximo día abierto (sin pedir nada) o, con el día lleno, el
  // próximo con lugar (una consulta diferida a la semana que sigue).
  const wantsRoom = empty === 'none' || empty === 'full'
  const weekStart =
    picked?.date && wantsRoom && addDays(picked.date, 1) <= maxDate ? addDays(picked.date, 1) : null
  const { week, retry: retryWeek } = useWeekFrom(tenant.slug, weekStart)
  const goTo = (to: string): NextDay => ({
    status: 'found',
    label: `Ver el ${dayLong(to)}`,
    onSelect: () => pickDay(to),
  })
  let nextDay: NextDay | null = null
  if (picked?.date && empty === 'error' && day.failure === 'range') {
    // El día quedó fuera de la ventana (el complejo bajó la anticipación): se vuelve a hoy.
    nextDay = { status: 'found', label: 'Ver hoy', onSelect: () => pickDay(today) }
  } else if (picked?.date && empty === 'closed') {
    const next = nextOpenDay(picked.date, maxDate, tenant)
    nextDay = next ? goTo(next) : { status: 'none', reviewed: 0 }
  } else if (picked?.date && wantsRoom) {
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

  // `profile.viewed`: una vez por pestaña y complejo, cuando la primera disponibilidad queda
  // resuelta: la semana en el paso 1, o las horas (o el día cerrado: un complejo cerrado hoy
  // también se vio) si se entra al 2 o al 3. Un error no cuenta: nadie vio disponibilidad.
  const resolved =
    cur?.step === 1
      ? thisWeek !== undefined && thisWeek !== 'error'
      : closed || day.data !== undefined
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

  if (!cur) return <ReserveSkeleton />

  const dayName = cur.date ? capitalizeFirst(dayLong(cur.date)) : ''
  const hora = selected?.time ?? cur.hora ?? ''
  const withRoom = rows.filter((r) => r.freeCount > 0).length
  const takenMessage = `Las ${cur.hora} se ocuparon.`
  const help =
    step === 1
      ? advanceDays === 0
        ? 'Reservás solo para hoy'
        : `Reservás hasta ${plural(advanceDays, 'día', 'días')} antes`
      : step === 2
        ? `${dayName} · Debajo de cada hora, cuántas canchas quedan libres.`
        : `${dayName} · ${hora} a ${endOf(hora)} · ${
            tenant.allowOnlineBooking
              ? 'Tocá la cancha y seguís a confirmar.'
              : contact.whatsappUrl
                ? 'Tocá la cancha y le escribís al complejo.'
                : 'Tocá la cancha y llamás al complejo.'
          }`
  const detail =
    step === 1 || !day.data
      ? ''
      : step === 2
        ? ` ${dayName}${cur.formato ? `, ${formatLabel(cur.formato)}` : ''}: ${plural(withRoom, 'horario con lugar', 'horarios con lugar')}.`
        : taken
          ? ` ${takenMessage} Elegí otra hora.`
          : selected
            ? ` ${selected.time}: ${plural(selected.freeCount, 'cancha libre', 'canchas libres')}.`
            : ''
  const announcement = `Paso ${step} de ${RESERVE_STEPS}. ${TITLE[step]}${detail}`

  // Para quien espera (y para los tests visuales): `loading` hasta que el primer dato del paso llegó.
  const phase =
    step === 1
      ? thisWeek === undefined
        ? 'loading'
        : 'ready'
      : closed
        ? 'closed'
        : day.failure
          ? 'error'
          : day.data && nextDay?.status !== 'searching'
            ? 'ready'
            : 'loading'

  return (
    <section
      data-reserve-section
      aria-label="Reservá tu turno"
      aria-busy={phase === 'loading'}
      data-state={phase}
      className={cn('flex flex-col gap-4', FRAME)}
    >
      <StepBar step={step} onBack={step > 1 ? goBack : undefined} />

      <div data-reserve-panel className="flex flex-col gap-4">
        <div>
          <h2
            data-reserve-title
            tabIndex={-1}
            className={cn(PORTAL_SECTION_TITLE, 'focus-visible:outline-hidden')}
          >
            {TITLE[step]}
          </h2>
          <p className="mt-1 text-sm leading-5 text-pretty text-muted-foreground">{help}</p>
        </div>

        {step === 1 && (
          <DayList
            today={today}
            advanceDays={advanceDays}
            value={cur.date}
            week={thisWeek}
            isClosed={(d) => isDayClosed(d, tenant)}
            onPick={pickDay}
          />
        )}

        {step === 2 && (
          <>
            {formats.length > 1 && (
              <FormatChips
                formats={formats}
                value={cur.formato}
                onChange={(formato) => {
                  setLocal({ ...cur, formato })
                  replaceReserveUrl({ formato })
                }}
              />
            )}

            {empty && (
              <DayEmptyState
                kind={empty}
                failure={day.failure ?? undefined}
                dayLabel={cur.date ? dayLong(cur.date) : ''}
                nextDay={nextDay}
                onRetry={day.retry}
                contact={empty === 'noCourts' || nextDay?.status === 'none' ? contactLink : null}
              />
            )}

            {!day.data && !closed && !day.failure && <HoursSkeleton />}
            {/* Con el día lleno y otro día al que ir, nueve "Completo" no dicen nada más que el título. */}
            {rows.length > 0 && !(empty === 'full' && nextDay?.status === 'found') && (
              <HourGrid rows={rows} value={selected?.time ?? null} onChange={pickHour} />
            )}
          </>
        )}

        {step === 3 && (
          <>
            {!day.data && <CourtsSkeleton />}
            {taken && (
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-base font-semibold text-foreground">{takenMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  className={cn(PORTAL_BUTTON_OUTLINE, 'mt-3 sm:w-auto')}
                >
                  Elegir otra hora
                </Button>
              </div>
            )}
            {selected && cur.date && (
              <CourtRows tenant={tenant} row={selected} date={cur.date} formato={cur.formato} />
            )}
          </>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}
