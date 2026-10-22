'use client'

import { startTransition, useActionState, useState, type FormEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { FORMAT_OPTIONS, formatLabel } from '@/components/public/courtFacets'
import { ChipGroup, DayChips } from '@/app/(public)/[slug]/components/ChipGroups'
import { addDays } from '@/shared/dates/art'
import { artInstantOf, dayLabel, RIVAL_LEVEL_LABELS } from '@/modules/rival/rival-display'
import { RIVAL_LEVELS } from '@/modules/rival/rival.schema'
import type { RivalFormResult } from '../actions'
import { StampBadge } from '../MatchBits'

type CreateAction = (prev: RivalFormResult, formData: FormData) => Promise<RivalFormResult>

export type NewMatchTenant = { id: string; name: string; city: string }
/** Reserva `confirmed` y futura del jugador, con el instante como ISO (cruza server → client). */
export type NewMatchBookingProp = { tenantId: string; startsAt: string }
export type NewMatchPrefill = { tenantId: string; date: string; time: string; format: number }

const INITIAL: RivalFormResult = { success: true }
/** Campos que la reserva fijada oculta: su error no tiene dónde pintarse y sale arriba del botón. */
const LOCKED_FIELDS = new Set(['tenantId', 'startsAt', 'format'])
const FIELD_ERROR = 'text-[13px] leading-5 text-red-700 dark:text-red-300'
const FORMAT_CHIPS = FORMAT_OPTIONS.map((f) => ({ value: String(f), label: formatLabel(f) }))
const LEVEL_CHIPS = RIVAL_LEVELS.map((l) => ({ value: l, label: RIVAL_LEVEL_LABELS[l] }))
/** Del día entero, en punto o y media (el schema valida lo mismo). */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
  return { value: t, label: t }
})
const MIN_CAPACITY = 2
const MAX_CAPACITY = 22

function FieldLabel({ id, children }: { id?: string; children: string }) {
  return (
    <Label htmlFor={id} className="text-base">
      {children}
    </Label>
  )
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className={FIELD_ERROR}>
      {message}
    </p>
  ) : null
}

function LockedSummary({
  tenantName,
  date,
  time,
  format,
}: {
  tenantName: string
  date: string
  time: string
  format: number
}) {
  return (
    <section aria-label="Tu reserva" className="space-y-1 rounded-2xl bg-muted/50 p-4">
      <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
        Viene de tu reserva
      </p>
      <p className="text-base font-semibold text-foreground">{tenantName}</p>
      <p className="text-base text-foreground">
        {dayLabel(date)} · {time} · {formatLabel(format)}
      </p>
    </section>
  )
}

/** Complejo, día, hora y formato: lo que una reserva fijada reemplaza por `LockedSummary`. */
function WhenFields({
  tenants,
  tenantId,
  onTenantChange,
  today,
  nowTime,
  date,
  onDateChange,
  time,
  onTimeChange,
  format,
  onFormatChange,
  fieldError,
}: {
  tenants: NewMatchTenant[]
  tenantId: string
  onTenantChange: (v: string) => void
  today: string
  nowTime: string
  date: string
  onDateChange: (v: string) => void
  time: string
  onTimeChange: (v: string) => void
  format: number
  onFormatChange: (v: number) => void
  fieldError: (f: string) => string | undefined
}) {
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i))
  // Hoy solo quedan las horas que no pasaron.
  const hours = date === today ? TIME_OPTIONS.filter((o) => o.value > nowTime) : TIME_OPTIONS
  return (
    <>
      <div className="space-y-1.5">
        <FieldLabel id="rival-complejo">Complejo</FieldLabel>
        <SelectMenu
          id="rival-complejo"
          value={tenantId}
          onChange={onTenantChange}
          options={tenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.city}` }))}
          placeholder="Elegí el complejo"
        />
        <FieldError message={fieldError('tenantId')} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Día</p>
        <DayChips
          days={days}
          today={today}
          value={date}
          isClosed={() => false}
          onChange={(d) => {
            onDateChange(d)
            // Si la hora elegida ya pasó en el día nuevo (hoy), se pide de nuevo.
            if (d === today && time <= nowTime) onTimeChange('')
          }}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel id="rival-hora">Hora de inicio</FieldLabel>
        <SelectMenu
          id="rival-hora"
          value={time}
          onChange={onTimeChange}
          options={hours}
          placeholder="Elegí la hora"
        />
        <p className="text-[13px] leading-5 text-muted-foreground">
          Hora argentina, en punto o y media.
        </p>
        <FieldError message={fieldError('startsAt')} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Formato</p>
        <ChipGroup
          label="Formato"
          options={FORMAT_CHIPS}
          value={String(format)}
          onChange={(v) => onFormatChange(Number(v))}
        />
        <FieldError message={fieldError('format')} />
      </div>
    </>
  )
}

function CapacityStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-labelledby="rival-cuantos">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Uno menos"
        disabled={value <= MIN_CAPACITY}
        onClick={() => onChange(Math.max(MIN_CAPACITY, value - 1))}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <output
        aria-live="polite"
        className="min-w-12 text-center font-display text-3xl font-black italic tabular-nums text-foreground"
      >
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Uno más"
        disabled={value >= MAX_CAPACITY}
        onClick={() => onChange(Math.min(MAX_CAPACITY, value + 1))}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

/** Con sello (hay reserva a esa hora) solo se avisa; sin sello, la casilla de "Ya tengo la cancha". */
function CourtField({
  showStamp,
  checked,
  onCheckedChange,
  invalid,
}: {
  showStamp: boolean
  checked: boolean
  onCheckedChange: (v: boolean) => void
  invalid: boolean
}) {
  return showStamp ? (
    <div className="space-y-1">
      <StampBadge />
      <p className="text-[13px] leading-5 text-muted-foreground">
        Encontramos tu reserva a esa hora. Si se cae, te avisamos.
      </p>
    </div>
  ) : (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name="courtDeclared"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        aria-invalid={invalid ? true : undefined}
        className="mt-0.5 size-6 shrink-0 cursor-pointer"
      />
      <span className="text-base text-foreground">Ya tengo la cancha</span>
    </label>
  )
}

/**
 * "Armar un partido" en una sola pantalla (spec §3 y §5.1). El tablón queda en "Apagado": publicar
 * es del PR4. Con una reserva (`prefill`) el complejo, el día, la hora y el formato vienen
 * bloqueados. El sello se ve acá solo como aviso: el servidor vuelve a buscar la reserva por su
 * cuenta (el form no manda `bookingId`).
 */
export function NewMatchForm({
  tenants,
  bookings,
  prefill,
  today,
  nowTime,
  action,
}: {
  tenants: NewMatchTenant[]
  bookings: NewMatchBookingProp[]
  prefill: NewMatchPrefill | null
  /** Hoy en ART (YYYY-MM-DD) y la hora ART de ahora (HH:MM), de la page. */
  today: string
  nowTime: string
  action: CreateAction
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const [tenantId, setTenantId] = useState(
    prefill?.tenantId ?? (tenants.length === 1 ? tenants[0]!.id : ''),
  )
  const [date, setDate] = useState(prefill?.date ?? today)
  const [time, setTime] = useState(prefill?.time ?? '')
  const [format, setFormat] = useState(prefill?.format ?? 5)
  const [capacity, setCapacity] = useState<number | null>(null)
  const [level, setLevel] = useState<string>('parejo')
  const [courtDeclared, setCourtDeclared] = useState(false)

  const locked = prefill !== null
  const effectiveCapacity = capacity ?? format * 2
  const tenantName = tenants.find((t) => t.id === tenantId)?.name ?? ''

  const instant = time ? artInstantOf(date, time).getTime() : null
  const hasStamp =
    instant !== null &&
    bookings.some((b) => b.tenantId === tenantId && new Date(b.startsAt).getTime() === instant)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const error = !state.success ? state : null
  // Si la reserva se cayó antes de enviar, el server pide declarar la cancha: sin sello, con la casilla.
  const showStamp = hasStamp && error?.field !== 'courtDeclared'
  const fieldError = (f: string) => (error?.field === f ? error.error : undefined)
  // Error sin campo, o de un campo que la reserva fijada oculta: sale arriba del botón.
  const generalError =
    error && (!error.field || (locked && LOCKED_FIELDS.has(error.field))) ? error.error : undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="capacity" value={capacity ?? ''} />
      <input type="hidden" name="level" value={level} />

      {locked ? (
        <LockedSummary tenantName={tenantName} date={date} time={time} format={format} />
      ) : (
        <WhenFields
          tenants={tenants}
          tenantId={tenantId}
          onTenantChange={setTenantId}
          today={today}
          nowTime={nowTime}
          date={date}
          onDateChange={setDate}
          time={time}
          onTimeChange={setTime}
          format={format}
          onFormatChange={setFormat}
          fieldError={fieldError}
        />
      )}

      <div className="space-y-1.5">
        <p id="rival-cuantos" className="text-base font-medium text-foreground">
          Cuántos juegan
        </p>
        <CapacityStepper value={effectiveCapacity} onChange={setCapacity} />
        <p className="text-[13px] leading-5 text-muted-foreground">Contándote a vos.</p>
        <FieldError message={fieldError('capacity')} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Nivel</p>
        <ChipGroup label="Nivel" options={LEVEL_CHIPS} value={level} onChange={setLevel} />
        <FieldError message={fieldError('level')} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Cancha</p>
        <CourtField
          showStamp={showStamp}
          checked={courtDeclared}
          onCheckedChange={setCourtDeclared}
          invalid={fieldError('courtDeclared') !== undefined}
        />
        <FieldError message={fieldError('courtDeclared')} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">Tablón</p>
        <p className="text-base text-foreground">Apagado (solo el grupo)</p>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Armás el partido y le pasás el link a tu grupo.
        </p>
      </div>

      <div className="space-y-3">
        <Button type="submit" disabled={pending} aria-busy={pending} className={PORTAL_BUTTON}>
          {pending ? 'Armando…' : 'Armar el partido'}
        </Button>
        <FieldError message={generalError} />
      </div>
    </form>
  )
}
