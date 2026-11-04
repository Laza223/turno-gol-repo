'use client'

import { useEffect, useRef } from 'react'
import type { ScheduleSource } from '@/lib/schedule/open-status'
import type { NewMatchIntent, RepeatPrefill } from '@/modules/rival/rival-form'
import {
  BoardBlock,
  CourtBlock,
  IntentBlock,
  MatchBlock,
  SubmitBar,
  WhereWhenBlock,
} from './NewMatchSections'
import type { CreateAction } from './new-match-form'
import { useNewMatchForm } from './use-new-match-form'

export type NewMatchTenant = {
  id: string
  name: string
  city: string
  slug: string
  /** Horario del complejo para filtrar las horas; `null` = sin horario cargado (lista completa). */
  schedule: ScheduleSource | null
}
/** Reserva `confirmed` y futura del jugador, con el instante como ISO (cruza server → client). */
type NewMatchBookingProp = { tenantId: string; startsAt: string }
type NewMatchPrefill = { tenantId: string; date: string; time: string; format: number }

export type NewMatchFormProps = {
  tenants: NewMatchTenant[]
  bookings: NewMatchBookingProp[]
  prefill: NewMatchPrefill | null
  /** "Repetir" (`?desde=`): precarga todo SIN bloquear campos. `date` null = sin fecha ni hora. */
  repeat?: RepeatPrefill | null
  /** Hoy en ART (YYYY-MM-DD) y la hora ART de ahora (HH:MM), de la page. */
  today: string
  nowTime: string
  action: CreateAction
  /** `?necesito=jugadores|rival` ya resuelto: preselecciona el paso 1. */
  initialIntent?: NewMatchIntent | null
  /** `players.phone` normalizado para precargar el WhatsApp. */
  whatsappPrefill?: string | null
}

/**
 * "Armar un partido" en dos pasos, en una sola pantalla. Paso 1, "¿Qué necesitás?": Me faltan
 * jugadores, Busco rival o Solo para mi grupo. Paso 2 (aparece al elegir): dónde y cuándo, el
 * partido y la cancha; si la intención sale al tablón, también el WhatsApp, que se publica en
 * la misma transacción. Con una reserva (`prefill`) el complejo, el día, la hora y el formato
 * vienen bloqueados. El sello se ve acá solo como aviso: el servidor vuelve a buscar la reserva
 * por su cuenta (el form no manda `bookingId`). Las horas se ofrecen según el horario del
 * complejo, como ayuda: el servidor no lo valida.
 */
export function NewMatchForm(props: NewMatchFormProps) {
  const form = useNewMatchForm(props)
  const errorRef = useRef<HTMLDivElement>(null)
  // El form mide ~1000 px y el botón es fijo: sin esto el error general queda fuera de pantalla.
  // Va después del hook para correr después del foco al campo con error y ganarle el scroll.
  useEffect(() => {
    errorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [form.response])
  const { tenantId, date, validTime, format, capacity, level, intent, missing } = form
  return (
    <form onSubmit={form.handleSubmit} noValidate className="space-y-7">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={validTime} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="capacity" value={intent === 'group' ? (capacity ?? '') : ''} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="intent" value={intent ?? ''} />
      <input type="hidden" name="missing" value={intent === 'players' ? missing : ''} />

      <IntentBlock form={form} />
      {intent !== null && (
        <>
          <WhereWhenBlock form={form} />
          <MatchBlock form={form} />
          <CourtBlock form={form} />
          {form.publishes && <BoardBlock form={form} />}
          <SubmitBar form={form} errorRef={errorRef} />
        </>
      )}
    </form>
  )
}
