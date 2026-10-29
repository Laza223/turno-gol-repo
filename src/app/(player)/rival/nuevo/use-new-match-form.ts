import { startTransition, useActionState, useCallback, useState, type FormEvent } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { addDays } from '@/shared/dates/art'
import { artInstantOf } from '@/modules/rival/rival-display'
import { rivalHourOptions } from '@/modules/rival/rival-hours'
import {
  FIELD_IDS,
  FIELD_ORDER,
  INITIAL,
  LOCKED_FIELDS,
  UNCONFIRMED,
  reportedErrors,
  type CreateAction,
  type Field,
  type Mode,
} from './new-match-form'
import { useFieldErrors } from '../use-field-errors'
import type { NewMatchFormProps } from './NewMatchForm'
import type { RivalFormResult } from '../actions'

/** Errores por campo y error general de la última respuesta del server. */
function useMatchFormErrors(state: RivalFormResult, locked: boolean) {
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
  return { reported, general, fe, messageProps, errorCode: error?.code }
}

function useGuardedAction(action: CreateAction) {
  // Un corte de red no puede mandar al error boundary y perder lo tipeado. Un redirect (partido
  // armado) viaja como excepción y pasa; lo demás no se sabe si se creó: se dice y se ofrece mirar.
  return useCallback<CreateAction>(
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
}

/** ¿Tiene el jugador una reserva confirmada de este complejo justo a esa hora? */
function hasBookingAt(
  bookings: NewMatchFormProps['bookings'],
  tenantId: string,
  date: string,
  time: string,
) {
  if (!time) return false
  const instant = artInstantOf(date, time).getTime()
  return bookings.some((b) => b.tenantId === tenantId && new Date(b.startsAt).getTime() === instant)
}

/** Los campos que edita el jugador, con su valor inicial (reserva fijada, "Repetir" o vacío). */
function useMatchFields({
  tenants,
  prefill,
  repeat,
  today,
  nowTime,
}: Pick<NewMatchFormProps, 'tenants' | 'prefill' | 'repeat' | 'today' | 'nowTime'>) {
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
  return {
    initial,
    tenantId,
    setTenantId,
    date,
    setDate,
    time,
    setTime,
    format,
    setFormat,
    capacity,
    setCapacity,
    level,
    setLevel,
    courtDeclared,
    setCourtDeclared,
    mode,
    setMode,
    capacityOpen,
    setCapacityOpen,
  }
}

/** Todo el estado y lo derivado de "Armar un partido"; los bloques del form solo lo pintan. */
export function useNewMatchForm({
  tenants,
  bookings,
  prefill,
  repeat = null,
  today,
  nowTime,
  action,
}: NewMatchFormProps) {
  const [state, formAction, pending] = useActionState(useGuardedAction(action), INITIAL)
  const {
    initial,
    tenantId,
    setTenantId,
    date,
    setDate,
    time,
    setTime,
    format,
    setFormat,
    capacity,
    setCapacity,
    level,
    setLevel,
    courtDeclared,
    setCourtDeclared,
    mode,
    setMode,
    capacityOpen,
    setCapacityOpen,
  } = useMatchFields({ tenants, prefill, repeat, today, nowTime })

  const locked = prefill !== null
  // Con un equipo que busca rival, el cupo es el formato: tu equipo, sin contar al rival.
  const teamOnly = mode === 'rival'
  const effectiveCapacity = teamOnly ? format : (capacity ?? format * 2)
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

  const hasStamp = hasBookingAt(bookings, tenantId, date, validTime)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(() => formAction(new FormData(event.currentTarget)))
  }

  const { reported, general, fe, messageProps, errorCode } = useMatchFormErrors(state, locked)
  // Si la reserva se cayó antes de enviar, el server pide declarar la cancha: sin sello, con la casilla.
  const showStamp = hasStamp && reported.courtDeclared === undefined

  return {
    tenants,
    tenant,
    today,
    days,
    hours,
    locked,
    teamOnly,
    teamHelp: `Tu equipo: ${format}`,
    tenantId,
    setTenantId,
    date,
    setDate,
    time,
    setTime,
    validTime,
    timeStale,
    isQuick,
    otherOpen,
    setOtherOpen,
    format,
    setFormat,
    capacity,
    setCapacity,
    effectiveCapacity,
    capacityOpen,
    setCapacityOpen,
    level,
    setLevel,
    courtDeclared,
    setCourtDeclared,
    mode,
    setMode,
    showStamp,
    reported,
    fe,
    messageProps,
    general,
    errorCode,
    response: state,
    pending,
    handleSubmit,
  }
}

export type NewMatchFormState = ReturnType<typeof useNewMatchForm>
