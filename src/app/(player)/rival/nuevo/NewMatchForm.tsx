'use client'

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { unstable_rethrow } from 'next/navigation'
import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { FORMAT_OPTIONS, formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import type { ScheduleSource } from '@/lib/schedule/open-status'
import { ChipGroup, DayChips } from '@/app/(public)/[slug]/components/ChipGroups'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { addDays } from '@/shared/dates/art'
import { artInstantOf, dayLabel, RIVAL_LEVEL_LABELS } from '@/modules/rival/rival-display'
import type { RepeatPrefill } from '@/modules/rival/rival-form'
import { rivalHourOptions } from '@/modules/rival/rival-hours'
import { RIVAL_LEVELS } from '@/modules/rival/rival.schema'
import type { RivalFormResult } from '../actions'
import { FormError } from '../FormError'
import { RivalCheckbox } from '../RivalCheckbox'
import { StampBadge } from '../MatchBits'
import { useFieldErrors } from '../use-field-errors'

type CreateAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

export type NewMatchTenant = {
  id: string
  name: string
  city: string
  slug: string
  /** Horario del complejo para filtrar las horas; `null` = sin horario cargado (lista completa). */
  schedule: ScheduleSource | null
}
/** Reserva `confirmed` y futura del jugador, con el instante como ISO (cruza server → client). */
export type NewMatchBookingProp = { tenantId: string; startsAt: string }
export type NewMatchPrefill = { tenantId: string; date: string; time: string; format: number }

type Mode = 'full' | 'rival'

const INITIAL: RivalFormResult = { success: true }
/** Los campos del form con su error propio, en el orden en que aparecen. */
const FIELD_ORDER = [
  'tenantId',
  'startsAt',
  'format',
  'capacity',
  'level',
  'courtDeclared',
] as const
type Field = (typeof FIELD_ORDER)[number]
const FIELD_IDS: Record<Field, string> = {
  tenantId: 'rival-complejo',
  startsAt: 'rival-hora',
  format: 'rival-formato',
  capacity: 'rival-cuantos-mas',
  level: 'rival-nivel',
  courtDeclared: 'rival-cancha',
}
/** Campos que la reserva fijada oculta: su error no tiene dónde pintarse y sale arriba del botón. */
const LOCKED_FIELDS = ['tenantId', 'startsAt', 'format'] as const
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const HELP = 'text-[13px] leading-5 text-muted-foreground'
/** Crear NO es idempotente: si la respuesta se perdió, el partido pudo haberse armado igual. */
const UNCONFIRMED =
  'No pudimos confirmar si se armó el partido. Mirá en Mis partidos antes de volver a intentar.'
// Solo el número, bajo el título "Fútbol de": 8 chips en 2 filas de 4, sin esconder ninguno.
const FORMAT_CHIPS = FORMAT_OPTIONS.map((f) => ({ value: String(f), label: String(f) }))
const LEVEL_CHIPS = RIVAL_LEVELS.map((l) => ({ value: l, label: RIVAL_LEVEL_LABELS[l] }))
const LEVEL_HELP: Record<string, string> = {
  tranqui: 'Para pasarla bien, sin drama.',
  parejo: 'Se juega en serio, sin pasarse.',
  picante: 'Se juega a ganar.',
}
const MODE_CHIPS = [
  { value: 'full', label: 'Partido completo' },
  { value: 'rival', label: 'Mi equipo busca rival' },
]
const MODE_HELP: Record<Mode, string> = {
  full: 'Armás el partido y le pasás el link a tu grupo.',
  rival: 'Tu equipo ya está: buscás con quién jugar.',
}
/** Mismo molde que un chip de `ChipGroup` (píldora de 44 px): "Otra hora" es uno más del grupo. */
const CHIP_BUTTON =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium tabular-nums text-foreground transition-colors duration-150 hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const CHIP_BUTTON_ON =
  'border-primary bg-primary font-semibold text-primary-foreground hover:border-primary'
const MIN_CAPACITY = 2
const MAX_CAPACITY = 22

/** Los errores por campo de la respuesta: `fieldErrors`, o el primero (`field`) si no los trae. */
function reportedErrors(error: Extract<RivalFormResult, { success: false }> | null) {
  const out: Partial<Record<Field, string>> = {}
  for (const f of FIELD_ORDER) {
    const message = error?.fieldErrors?.[f] ?? (error?.field === f ? error.error : undefined)
    if (message) out[f] = message
  }
  return out
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-5">
      <h2 id={id} className={PORTAL_SECTION_TITLE}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * "Armar un partido" en una sola pantalla (spec §3 y §5.1). Arriba, "¿Qué armás?" (partido
 * completo o equipo que busca rival: con rival el cupo es el formato); después tres bloques: dónde
 * y cuándo, el partido y la cancha. El tablón no se carga acá: se publica desde la vista del
 * partido. Con una reserva (`prefill`) el complejo, el día, la hora y el formato vienen
 * bloqueados. El sello se ve acá solo como aviso: el servidor vuelve a buscar la reserva por su
 * cuenta (el form no manda `bookingId`). Las horas se ofrecen según el horario del complejo, como
 * ayuda: el servidor no lo valida.
 */
export function NewMatchForm({
  tenants,
  bookings,
  prefill,
  repeat = null,
  today,
  nowTime,
  action,
}: {
  tenants: NewMatchTenant[]
  bookings: NewMatchBookingProp[]
  prefill: NewMatchPrefill | null
  /** "Repetir" (`?desde=`): precarga todo SIN bloquear campos. `date` null = sin fecha ni hora. */
  repeat?: RepeatPrefill | null
  /** Hoy en ART (YYYY-MM-DD) y la hora ART de ahora (HH:MM), de la page. */
  today: string
  nowTime: string
  action: CreateAction
}) {
  // Un corte de red no puede mandar al error boundary y perder lo tipeado. Un redirect (partido
  // armado) viaja como excepción y pasa; lo demás no se sabe si se creó: se dice y se ofrece mirar.
  const guarded = useCallback<CreateAction>(
    async (prev, formData) => {
      try {
        return await action(prev, formData)
      } catch (err) {
        unstable_rethrow(err)
        return { success: false, error: UNCONFIRMED, code: 'unconfirmed' }
      }
    },
    [action],
  )
  const [state, formAction, pending] = useActionState(guarded, INITIAL)
  const initial = prefill ?? repeat
  const scheduleOf = (id: string) => tenants.find((t) => t.id === id)?.schedule ?? null
  const [tenantId, setTenantId] = useState(
    initial?.tenantId || (tenants.length === 1 ? tenants[0]!.id : ''),
  )
  // Si hoy ya no queda ninguna hora, el día arranca en mañana.
  const [date, setDate] = useState(
    () =>
      initial?.date ??
      (rivalHourOptions({ date: today, today, nowTime, schedule: scheduleOf(tenantId) }).reason ===
      'past'
        ? addDays(today, 1)
        : today),
  )
  const [time, setTime] = useState(initial?.time ?? '')
  const [format, setFormat] = useState(initial?.format ?? 5)
  const [capacity, setCapacity] = useState<number | null>(
    repeat && repeat.capacity !== repeat.format * 2 ? repeat.capacity : null,
  )
  const [level, setLevel] = useState<string>(repeat?.level ?? 'parejo')
  const [courtDeclared, setCourtDeclared] = useState(false)
  const [mode, setMode] = useState<Mode>('full')
  const [capacityOpen, setCapacityOpen] = useState(false)

  const locked = prefill !== null
  // Con un equipo que busca rival, el cupo es el formato: tu equipo, sin contar al rival.
  const teamOnly = mode === 'rival'
  const effectiveCapacity = teamOnly ? format : (capacity ?? format * 2)
  const teamHelp = `Tu equipo: ${format}`
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i))
  const tenant = tenants.find((t) => t.id === tenantId)
  const hours = rivalHourOptions({
    date,
    today,
    nowTime,
    schedule: tenant?.schedule ?? null,
    keep: initial?.time,
  })
  // La hora elegida que ya no figura (otro día o complejo) no viaja: lo oculto es lo visible.
  const validTime = locked || hours.all.includes(time) ? time : ''
  const timeStale = !locked && time !== '' && validTime === ''
  const isQuick = hours.quick.includes(validTime)
  const [otherOpen, setOtherOpen] = useState(
    () => Boolean(initial?.time) && !hours.quick.includes(initial?.time ?? ''),
  )

  const instant = validTime ? artInstantOf(date, validTime).getTime() : null
  const hasStamp =
    instant !== null &&
    bookings.some((b) => b.tenantId === tenantId && new Date(b.startsAt).getTime() === instant)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  const reported = reportedErrors(error)
  // Con la reserva fijada esos campos no están en pantalla: su error va arriba del botón.
  const lockedMessage = locked ? LOCKED_FIELDS.map((f) => reported[f]).find(Boolean) : undefined
  const general =
    lockedMessage ?? (error && Object.keys(reported).length === 0 ? error.error : undefined)
  const fe = useFieldErrors<Field>({
    errors: locked
      ? Object.fromEntries(
          Object.entries(reported).filter(([f]) => !LOCKED_FIELDS.some((l) => l === f)),
        )
      : reported,
    order: FIELD_ORDER,
    ids: FIELD_IDS,
    resetKey: state,
  })
  // Un solo role="alert" a la vez: si hay error general arriba del botón, los de campo son comunes.
  const messageProps = (f: Field) => (general ? { id: fe.messageProps(f).id } : fe.messageProps(f))
  const fieldError = (f: Field) =>
    fe.message(f) ? (
      <p {...messageProps(f)} className={FIELD_ERROR}>
        {fe.message(f)}
      </p>
    ) : null
  // Si la reserva se cayó antes de enviar, el server pide declarar la cancha: sin sello, con la casilla.
  const showStamp = hasStamp && reported.courtDeclared === undefined
  const errorRef = useRef<HTMLDivElement>(null)
  // El form mide ~1000 px y el botón es fijo: sin esto el error general queda fuera de pantalla.
  useEffect(() => {
    if (general) errorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo con una respuesta nueva
  }, [state])
  const court = fe.controlProps('courtDeclared')
  const hourControl = fe.controlProps('startsAt')

  // El cupo sale del formato (x 2): se muestra como dato y el stepper solo abre si se toca.
  const capacityControl = teamOnly ? null : (
    <div className="space-y-1.5">
      {capacityOpen || capacity !== null || reported.capacity ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id="rival-cuantos" className="text-base font-medium text-foreground">
              Cuántos juegan
            </p>
            <p className={HELP}>En total, los dos equipos. Vos incluido.</p>
          </div>
          <div
            className="flex shrink-0 items-center gap-3"
            role="group"
            aria-labelledby="rival-cuantos"
            aria-describedby={fe.message('capacity') ? `${FIELD_IDS.capacity}-error` : undefined}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:size-11 focus-visible:ring-offset-background"
              aria-label="Uno menos"
              disabled={effectiveCapacity <= MIN_CAPACITY}
              onClick={() => {
                setCapacity(Math.max(MIN_CAPACITY, effectiveCapacity - 1))
                fe.clear('capacity')
              }}
            >
              <Minus className="size-4" aria-hidden />
            </Button>
            <output
              aria-live="polite"
              className="min-w-12 text-center font-display text-3xl font-black italic tabular-nums text-foreground"
            >
              {effectiveCapacity}
            </output>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:size-11 focus-visible:ring-offset-background"
              id={FIELD_IDS.capacity}
              aria-label="Uno más"
              disabled={effectiveCapacity >= MAX_CAPACITY}
              onClick={() => {
                setCapacity(Math.min(MAX_CAPACITY, effectiveCapacity + 1))
                fe.clear('capacity')
              }}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex min-h-11 items-center gap-2 text-base text-foreground">
          <span>
            Juegan{' '}
            <output aria-live="polite" className="font-semibold tabular-nums">
              {effectiveCapacity}
            </output>
            , vos incluido
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            id={FIELD_IDS.capacity}
            aria-label="Cambiar cuántos juegan"
            onClick={() => setCapacityOpen(true)}
            className="min-h-11 font-medium text-emerald-800 underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary dark:text-emerald-400"
          >
            Cambiar
          </button>
        </p>
      )}
      {fieldError('capacity')}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-7">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={validTime} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="capacity" value={teamOnly ? format : (capacity ?? '')} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="mode" value={mode} />

      {/* Un modo, no una sección: control compacto sin título del peso de los bloques. */}
      <div className="flex flex-col gap-2">
        <ChipGroup
          label="Qué armás"
          options={MODE_CHIPS}
          value={mode}
          onChange={(v) => setMode(v === 'rival' ? 'rival' : 'full')}
          alwaysWrap
        />
        <p className={HELP}>{MODE_HELP[mode]}</p>
      </div>

      <Block id="rival-bloque-donde" title="Dónde y cuándo">
        {locked ? (
          <div className="space-y-1 rounded-2xl bg-muted/50 p-4">
            <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Viene de tu reserva
            </p>
            <p className="text-base font-semibold text-foreground">{tenant?.name ?? ''}</p>
            <p className="text-base tabular-nums text-foreground">
              {dayLabel(date)} · {time} · {formatLabel(format)}
            </p>
            {teamOnly && <p className={HELP}>{teamHelp}</p>}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={FIELD_IDS.tenantId} className="text-base">
                Complejo
              </Label>
              <SelectMenu
                {...fe.controlProps('tenantId')}
                value={tenantId}
                onChange={(v) => {
                  setTenantId(v)
                  fe.clear('tenantId')
                }}
                options={tenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
                placeholder="Elegí el complejo"
                className="rounded-lg bg-card md:text-base"
              />
              {fieldError('tenantId')}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-base font-medium text-foreground">Día</p>
              <DayChips
                days={days}
                today={today}
                value={date}
                isClosed={() => false}
                alwaysWrap
                onChange={(d) => {
                  setDate(d)
                  fe.clear('startsAt')
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-base font-medium text-foreground">Hora</p>
              {hours.all.length === 0 ? (
                <p className={HELP}>Hoy ya no quedan horarios. Elegí otro día.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {hours.quick.length > 0 && (
                      <ChipGroup
                        {...hourControl}
                        label="Hora"
                        options={hours.quick.map((t) => ({ value: t, label: t }))}
                        value={isQuick ? validTime : ''}
                        onChange={(t) => {
                          setTime(t)
                          setOtherOpen(false)
                          fe.clear('startsAt')
                        }}
                        tabular
                        className="contents"
                      />
                    )}
                    <button
                      type="button"
                      id={hours.quick.length === 0 ? hourControl.id : undefined}
                      aria-expanded={otherOpen}
                      onClick={() => setOtherOpen((open) => !open)}
                      className={cn(CHIP_BUTTON, validTime !== '' && !isQuick && CHIP_BUTTON_ON)}
                    >
                      {validTime !== '' && !isQuick ? (
                        <>
                          <Check className="size-4" aria-hidden />
                          Otra: {validTime}
                        </>
                      ) : (
                        'Otra hora'
                      )}
                    </button>
                  </div>
                  {otherOpen && (
                    <SelectMenu
                      id="rival-hora-lista"
                      aria-label="Elegí otra hora"
                      value={validTime}
                      onChange={(t) => {
                        setTime(t)
                        if (hours.quick.includes(t)) setOtherOpen(false)
                        fe.clear('startsAt')
                      }}
                      options={hours.all.map((t) => ({ value: t, label: t }))}
                      placeholder="Elegí otra hora"
                      className="rounded-lg bg-card md:text-base"
                      contentClassName="max-h-[min(60dvh,22rem)]"
                    />
                  )}
                </>
              )}
              {hours.reason === 'closed' && (
                <p className={HELP}>
                  Ese día el complejo figura cerrado en TurnoGol. Si tenés la cancha igual, elegí tu
                  hora.
                </p>
              )}
              {timeStale && <p className={HELP}>Esa hora ya no está disponible. Elegí otra.</p>}
              {fieldError('startsAt')}
            </div>
          </>
        )}
      </Block>

      <Block id="rival-bloque-partido" title="El partido">
        {!locked && (
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-medium text-foreground">Fútbol de</p>
            <ChipGroup
              {...fe.controlProps('format')}
              label="Fútbol de"
              options={FORMAT_CHIPS}
              value={String(format)}
              onChange={(v) => {
                setFormat(Number(v))
                fe.clear('format')
              }}
              className="grid grid-cols-4 overflow-visible"
            />
            {fieldError('format')}
            {teamOnly && <p className={HELP}>{teamHelp}</p>}
            {capacityControl}
          </div>
        )}

        {locked && capacityControl}

        <div className="flex flex-col gap-1.5">
          <p className="text-base font-medium text-foreground">Nivel</p>
          <ChipGroup
            {...fe.controlProps('level')}
            label="Nivel"
            options={LEVEL_CHIPS}
            value={level}
            onChange={(v) => {
              setLevel(v)
              fe.clear('level')
            }}
          />
          <p className={HELP}>
            Lo elegís vos, según cómo juega tu grupo. {LEVEL_HELP[level] ?? ''}
          </p>
          {fieldError('level')}
        </div>
      </Block>

      <Block id="rival-bloque-cancha" title="La cancha">
        {showStamp ? (
          <div className="space-y-1">
            <StampBadge />
            <p className={HELP}>Encontramos tu reserva a esa hora. Si se cae, te avisamos.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <RivalCheckbox
              id={court.id}
              name="courtDeclared"
              checked={courtDeclared}
              onChange={(checked) => {
                setCourtDeclared(checked)
                fe.clear('courtDeclared')
              }}
              invalid={court['aria-invalid'] === true}
              describedBy={[
                fe.message('courtDeclared') ? undefined : 'rival-cancha-ayuda',
                court['aria-describedby'],
              ]
                .filter(Boolean)
                .join(' ')}
            >
              Ya tengo la cancha
            </RivalCheckbox>
            {/* Con error, el error dice lo mismo: la ayuda se oculta para no repetirlo. */}
            {!fe.message('courtDeclared') && (
              <p id="rival-cancha-ayuda" className={HELP}>
                Hace falta para armar el partido: sin cancha no hay partido.
              </p>
            )}
            {tenant && (
              <p className={HELP}>
                ¿Todavía no tenés cancha?{' '}
                <a
                  href={`/${tenant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-400"
                >
                  Reservala en {tenant.name}
                </a>
                : después armás el partido desde tu reserva.
              </p>
            )}
          </div>
        )}
        {fieldError('courtDeclared')}
      </Block>

      {/* En el flujo, no en la barra: el alto de la barra es fijo y un error variable la haría tapar el final. */}
      {general && (
        <div ref={errorRef}>
          <FormError error={general} code={error?.code} />
        </div>
      )}
      <FixedCta>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={cn(PORTAL_BUTTON, 'min-h-[52px]')}
        >
          {pending ? 'Armando…' : 'Armar el partido'}
        </Button>
      </FixedCta>
    </form>
  )
}
