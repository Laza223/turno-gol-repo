import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { getDb, withTenantContext, type DbTx } from '@/shared/db/client'
import { tenants, whatsappChats } from '@/shared/db/schema'
import { addDays } from '@/shared/dates/art'
import { hhmmToMins } from '@/shared/time/operating-day'
import { formatArs } from '@/lib/format'
import { logger } from '@/shared/lib/logger'
import { buildWhatsappUrl, toWhatsappDigits } from '@/lib/whatsapp'
import { sendWhatsappTemplate } from '@/lib/kapso/client'
import { getPublicAvailability, type PublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import {
  createWhatsappBooking,
  rescheduleWhatsappBooking,
} from '@/modules/bookings/booking.whatsapp'
import {
  cancelByGuest,
  findChatBookingForCancel,
  type GuestCancellationOutcome,
} from '@/modules/bookings/booking.cancellation'
import { getCancellationPreview } from '@/modules/bookings/cancellation-preview'
import { guestLateCancelStatus, PHONE_HINT_DIGITS } from '@/modules/bookings/guest-late-cancel'
import { lateCancelPenalty, type LateCancelPenalty } from '@/modules/bookings/late-cancel'
import {
  BookingAlreadyEndedError,
  BookingDateOutOfRangeError,
  BookingNotCancelableError,
  BookingNotInConfirmedError,
  BookingNotOfferedError,
  BookingValidationError,
  CourtOfflineError,
  GuestLateCancelBlockedError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
  TenantInactiveError,
  TooManyWhatsappBookingsError,
  WhatsappRescheduleBlockedError,
} from '@/modules/bookings/booking.errors'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  notifyAdminBookingCanceled,
  notifyAdminBookingConfirmed,
  notifyAdminPush,
} from '@/modules/notifications/push.service'
import { ToolInputError, type BotTool } from './whatsapp-bot.agent'
import { complexPageUrl, operatingToday, type PhoneBooking } from './whatsapp-bot.prompt'

export type ToolContext = {
  tenant: PublicTenant
  chatId: string
  waPhone: string
  contactDisplayName: string | null
  /** Phone number ID de la conexión del complejo (fallback si no hay WABA global de alertas). */
  phoneNumberId: string
  /** Número personal del dueño para alertas Utility de derivación (null si no está configurado). */
  ownerAlertPhone: string | null
  now: Date
  phoneBookings: PhoneBooking[]
}

const WHATSAPP_SETTINGS_PATH = '/settings/whatsapp'

/** Pausa unificada de 6 horas tras `pasar_a_humano` (alineada con la pausa de respuesta manual). */
export const HANDOFF_PAUSE_MS = 6 * 60 * 60 * 1000

const DEFAULT_HANDOFF_TEMPLATE_NAME = 'turnogol_alerta_derivacion'
const DEFAULT_HANDOFF_TEMPLATE_LANG = 'es_AR'

const dateSchema = z.string().refine(isValidCalendarDate)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ToolInputError('Datos inválidos: revisá el formato y volvé a intentar.')
  }
  return parsed.data
}

const json = (value: unknown) => JSON.stringify(value)

/** El bloqueo ordena la mutación y la pausa que escribe el webhook en la misma fila. */
async function chatAcceptsMutation(tx: DbTx, ctx: ToolContext): Promise<boolean> {
  const [chat] = await tx
    .select({ pausedUntil: whatsappChats.pausedUntil })
    .from(whatsappChats)
    .where(and(eq(whatsappChats.id, ctx.chatId), eq(whatsappChats.tenantId, ctx.tenant.id)))
    .for('update')
  return !!chat && (!chat.pausedUntil || chat.pausedUntil <= new Date())
}

function dateOutOfRange(tenant: PublicTenant, date: string, now: Date): boolean {
  const today = operatingToday(tenant, now)
  return date < today || date > addDays(today, tenant.bookingAdvanceDays)
}

function onlineBookingClosed(tenant: PublicTenant, now: Date): boolean {
  return (
    !tenant.allowOnlineBooking || !isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd, now)
  )
}

// ─── 1. ver_disponibilidad ───────────────────────────────────────────────────

const availabilityInput = z.object({ fecha: dateSchema }).strict()

function availabilityTool(ctx: ToolContext): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'ver_disponibilidad',
      description:
        'Consulta los turnos libres reales de todas las canchas para un día (AAAA-MM-DD). ' +
        'Usala siempre en la misma respuesta en que ofrecés o confirmás horarios libres; podés llamarla en paralelo para 2 o 3 días si piden "el finde" o un rango. ' +
        'Un horario con madrugada_del_dia_siguiente se juega pasada la medianoche del día operativo.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          fecha: {
            type: 'string',
            description: 'Día operativo en formato AAAA-MM-DD tomado de la tabla de días.',
          },
        },
        required: ['fecha'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const { fecha } = parseInput(availabilityInput, input)
      const { tenant, now } = ctx
      if (onlineBookingClosed(tenant, now)) {
        return { kind: 'continue', output: json({ error: 'reservas_online_cerradas' }) }
      }
      if (dateOutOfRange(tenant, fecha, now)) {
        return { kind: 'continue', output: json({ error: 'fecha_fuera_de_rango' }) }
      }
      const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[
        new Date(`${fecha}T00:00:00Z`).getUTCDay()
      ]!
      if (tenant.closedDates.includes(fecha) || tenant.openingHours[dayKey].closed) {
        return { kind: 'continue', output: json({ fecha, cerrado: true, canchas: [] }) }
      }

      const availability = await getPublicAvailability(tenant, fecha)
      const openMins = hhmmToMins(tenant.openingHours[dayKey].open)

      return {
        kind: 'continue',
        output: json({
          fecha,
          canchas: availability.courts.map((court) => ({
            nombre: court.name,
            formato: `fútbol ${court.format}`,
            turnos_libres: court.slots
              .filter((s) => s.status === 'free')
              .map((s) => ({
                hora: s.time,
                ...(s.price !== null && !tenant.hidePrices ? { precio: formatArs(s.price) } : {}),
                ...(tenant.closesNextDay && hhmmToMins(s.time) < openMins
                  ? { madrugada_del_dia_siguiente: true }
                  : {}),
              })),
          })),
        }),
      }
    },
  }
}

// ─── 2. reservar ─────────────────────────────────────────────────────────────

const bookInput = z
  .object({
    cancha: z.string().trim().min(1).max(80),
    fecha: dateSchema,
    hora: timeSchema,
    nombre: z.string().trim().min(2).max(80),
    confirmado_por_jugador: z.boolean(),
  })
  .strict()

async function tenantMpToken(tenantId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ mpAccessToken: tenants.mpAccessToken })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return row?.mpAccessToken ?? null
}

function bookingErrorReason(err: unknown): string | null {
  if (err instanceof SlotTakenError) return 'turno_ocupado'
  if (err instanceof TooManyWhatsappBookingsError) {
    return err.reason === 'holds' ? 'demasiadas_senas_pendientes' : 'demasiadas_reservas_sin_sena'
  }
  if (err instanceof BookingDateOutOfRangeError) {
    return err.reason === 'lead_time' ? 'falta_poco_para_el_turno' : 'fecha_fuera_de_rango'
  }
  if (err instanceof PlayerBannedError) return 'no_se_puede_reservar_por_aca'
  if (err instanceof BookingNotOfferedError) {
    if (err.reason === 'closed_day') return 'el_complejo_cierra_ese_dia'
    if (err.reason === 'outside_hours') return 'fuera_de_horario'
    return 'reservas_online_cerradas'
  }
  if (
    err instanceof BookingValidationError ||
    err instanceof CourtOfflineError ||
    err instanceof PriceUnavailableError
  ) {
    return 'turno_no_disponible'
  }
  return null
}

function ddmmHhmmArt(d: Date): string {
  const iso = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString()
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`
}

export type BotCourt = { id: string; name: string }

const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

function findCourt(courts: BotCourt[], name: string): BotCourt | null {
  const matches = courts.filter((c) => normalizeName(c.name) === normalizeName(name))
  return matches.length === 1 ? matches[0]! : null
}

function bookTool(ctx: ToolContext, courts: BotCourt[]): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'reservar',
      description:
        'Reserva un turno de 60 minutos. Antes verificá disponibilidad con ver_disponibilidad y confirmá cancha exacta, día, hora, nombre (y seña si aplica), sin dudas ni condiciones especiales sin resolver. ' +
        'Prohibido usarla junto con cancelar para cambiar un turno existente. Si devuelve no_se_puede_reservar_por_aca, llamá directo a pasar_a_humano.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          cancha: {
            type: 'string',
            description: 'Nombre exacto de la cancha devuelto por ver_disponibilidad.',
          },
          fecha: {
            type: 'string',
            description:
              'Día operativo AAAA-MM-DD de Días reservables (para madrugada_del_dia_siguiente sigue siendo esa misma fecha).',
          },
          hora: { type: 'string', description: 'Hora de inicio HH:MM.' },
          nombre: { type: 'string', description: 'Nombre dado por el jugador para la reserva.' },
          confirmado_por_jugador: {
            type: 'boolean',
            description:
              'true únicamente si el jugador ya confirmó explícitamente reservar esa cancha, día y hora.',
          },
        },
        required: ['cancha', 'fecha', 'hora', 'nombre', 'confirmado_por_jugador'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const args = parseInput(bookInput, input)
      if (!args.confirmado_por_jugador) {
        return {
          kind: 'continue',
          output: json({
            error: 'falta_confirmacion_del_jugador',
            detalle: 'Pedí confirmación explícita de cancha, día, hora y nombre antes de reservar.',
          }),
        }
      }

      const { tenant, now } = ctx
      if (onlineBookingClosed(tenant, now)) {
        return { kind: 'continue', output: json({ error: 'reservas_online_cerradas' }) }
      }
      if (dateOutOfRange(tenant, args.fecha, now)) {
        return { kind: 'continue', output: json({ error: 'fecha_fuera_de_rango' }) }
      }
      const court = findCourt(courts, args.cancha)
      if (!court) {
        return {
          kind: 'continue',
          output: json({ error: 'cancha_inexistente', canchas: courts.map((c) => c.name) }),
        }
      }

      let result: Awaited<ReturnType<typeof createWhatsappBooking>>
      try {
        const created = await withTenantContext(tenant.id, async (tx) => {
          if (!(await chatAcceptsMutation(tx, ctx))) return null
          return createWhatsappBooking(
            tenant.id,
            {
              chatId: ctx.chatId,
              courtId: court.id,
              date: args.fecha,
              timeStart: args.hora,
              guestName: args.nombre,
              guestPhone: ctx.waPhone,
            },
            tx,
          )
        })
        if (!created) return { kind: 'continue', output: json({ error: 'chat_pausado' }) }
        result = created
      } catch (err) {
        if (err instanceof GuestLateCancelBlockedError) {
          return {
            kind: 'continue',
            output: json({ error: 'bloqueado', hasta: ddmmHhmmArt(err.until) }),
          }
        }
        const reason = bookingErrorReason(err)
        if (reason === 'demasiadas_reservas_sin_sena') {
          return {
            kind: 'continue',
            output: json({
              error: reason,
              link_para_reservar: complexPageUrl(tenant) ?? undefined,
            }),
          }
        }
        if (reason) return { kind: 'continue', output: json({ error: reason }) }
        throw err
      }

      const { booking } = result
      const resumen = {
        cancha: court.name,
        fecha: args.fecha,
        hora: args.hora,
        precio: tenant.hidePrices ? undefined : formatArs(booking.priceSnapshot),
      }
      if (!result.requiresPayment) {
        await notifyAdminBookingConfirmed(tenant.id, booking.id)
        return { kind: 'continue', output: json({ estado: 'confirmada', ...resumen }) }
      }

      const token = await tenantMpToken(tenant.id)
      if (!token) {
        logger.warn('whatsapp-bot: reserva con seña sin MercadoPago', {
          module: 'whatsapp-bot',
          tenantId: tenant.id,
        })
        return { kind: 'continue', output: json({ error: 'turno_no_disponible' }) }
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      if (!appUrl) throw new Error('whatsapp-bot: falta NEXT_PUBLIC_APP_URL en el worker')
      const back = `${appUrl}/reserva/${booking.id}/whatsapp`
      const pref = await createDepositPayment(
        booking.id,
        resolveTenantGateway(tenant.id, token),
        tenant.id,
        appUrl,
        { success: back, failure: back, pending: back },
      )
      return {
        kind: 'continue',
        output: json({
          estado: 'falta_pagar_la_sena',
          ...resumen,
          sena: formatArs(booking.depositAmount),
          link_pago: pref.initPoint,
          minutos_para_pagar: Math.max(
            1,
            Math.floor((pref.expiresAt.getTime() - Date.now()) / 60_000),
          ),
        }),
      }
    },
  }
}

// ─── 3. cancelar ─────────────────────────────────────────────────────────────

const cancelInput = z
  .object({
    cancha: z.string().trim().min(1).max(80),
    fecha: dateSchema,
    hora: timeSchema,
    confirmar: z.boolean(),
  })
  .strict()

function latePenaltyReason(p: LateCancelPenalty) {
  return p.kind === 'ban' ? { consecuencia: 'bloqueo', dias: p.days } : { consecuencia: 'aviso' }
}

function cancelTool(ctx: ToolContext, courts: BotCourt[]): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'cancelar',
      description:
        'Cancela una reserva confirmada de "Reservas de este chat" en dos pasos: primero con confirmar: false para informar la consecuencia en 1 línea; luego confirmar: true solo si el jugador confirma. ' +
        'Si devuelve pendiente_de_pago, explicá que se libera sola en unos minutos si no se paga la seña. No sirve para cambios de horario/cancha (usá reprogramar) ni para turnos de "Otros turnos de este teléfono" (usá pasar_a_humano).',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          cancha: { type: 'string', description: 'Nombre de la cancha de la reserva.' },
          fecha: { type: 'string', description: 'Día operativo AAAA-MM-DD.' },
          hora: { type: 'string', description: 'Hora de inicio HH:MM.' },
          confirmar: {
            type: 'boolean',
            description: 'false: consulta consecuencia sin cancelar. true: ejecuta la cancelación.',
          },
        },
        required: ['cancha', 'fecha', 'hora', 'confirmar'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const args = parseInput(cancelInput, input)
      const { tenant, now } = ctx
      const court = findCourt(courts, args.cancha)
      if (!court) {
        return {
          kind: 'continue',
          output: json({ error: 'cancha_inexistente', canchas: courts.map((c) => c.name) }),
        }
      }

      const freshCancels: Array<{ bookingId: string; late: boolean }> = []
      try {
        const reply = await withTenantContext(tenant.id, async (tx) => {
          if (args.confirmar && !(await chatAcceptsMutation(tx, ctx))) {
            return json({ error: 'chat_pausado' })
          }
          const found = await findChatBookingForCancel(
            tenant.id,
            ctx.chatId,
            { courtId: court.id, date: args.fecha, timeStart: args.hora },
            tx,
          )
          if (!found) {
            const elsewhere = ctx.phoneBookings.some(
              (b) =>
                normalizeName(b.courtName) === normalizeName(court.name) &&
                b.date === args.fecha &&
                b.timeStart.slice(0, 5) === args.hora,
            )
            return json({ error: elsewhere ? 'reservada_por_otro_lado' : 'no_encontrada' })
          }

          const cancelledResult = (out: GuestCancellationOutcome) => {
            if (!out.replayed) {
              freshCancels.push({ bookingId: found.id, late: out.lateCancel === true })
            }
            const consequence = out.guestPenalty
              ? latePenaltyReason(lateCancelPenalty(out.guestPenalty.count))
              : out.depositStatus === 'refunded'
                ? { consecuencia: 'se_devuelve_la_sena' }
                : out.depositStatus === 'captured'
                  ? { consecuencia: 'pierde_la_sena' }
                  : { consecuencia: 'sin_consecuencia' }
            return json({
              estado: 'cancelada',
              cancha: court.name,
              fecha: args.fecha,
              hora: args.hora,
              ...consequence,
              ...(out.guestPenalty?.bannedUntil
                ? { hasta: ddmmHhmmArt(out.guestPenalty.bannedUntil) }
                : {}),
            })
          }

          if (found.status === 'canceled_refunded' || found.status === 'canceled_no_refund') {
            return cancelledResult(await cancelByGuest(found.id, ctx.chatId, tx))
          }
          if (found.status === 'pending_payment') return json({ error: 'pendiente_de_pago' })
          if (found.endsAt.getTime() <= now.getTime()) return json({ error: 'ya_empezo' })

          if (!args.confirmar) {
            const late = found.guestPhone
              ? await guestLateCancelStatus(
                  tenant.id,
                  found.guestPhone.slice(-PHONE_HINT_DIGITS),
                  tx,
                )
              : { count: 0 }
            const preview = getCancellationPreview({
              depositStatus: found.depositStatus,
              depositAmountCents: found.depositAmount,
              bookingStartUtcMs: found.startsAt.getTime(),
              policyHours: tenant.cancellationHoursBefore,
              nowMs: now.getTime(),
              lateCancelHours: tenant.lateCancelHours,
              lateCancelCount: late.count,
            })
            if (preview.kind === 'refund') return json({ consecuencia: 'se_devuelve_la_sena' })
            if (preview.kind === 'no_refund') return json({ consecuencia: 'pierde_la_sena' })
            return json(
              preview.lateCancel
                ? latePenaltyReason(preview.lateCancel)
                : { consecuencia: 'sin_consecuencia' },
            )
          }

          return cancelledResult(await cancelByGuest(found.id, ctx.chatId, tx))
        })

        for (const c of freshCancels) {
          await notifyAdminBookingCanceled(tenant.id, c.bookingId, { late: c.late })
        }
        return { kind: 'continue', output: reply }
      } catch (err) {
        if (err instanceof BookingAlreadyEndedError) {
          return { kind: 'continue', output: json({ error: 'ya_empezo' }) }
        }
        if (err instanceof BookingNotInConfirmedError || err instanceof BookingNotCancelableError) {
          return { kind: 'continue', output: json({ error: 'no_encontrada' }) }
        }
        if (err instanceof TenantInactiveError) {
          return { kind: 'continue', output: json({ error: 'no_se_puede_cancelar_por_aca' }) }
        }
        throw err
      }
    },
  }
}

// ─── 4. reprogramar ──────────────────────────────────────────────────────────

const rescheduleInput = z
  .object({
    cancha_actual: z.string().trim().min(1).max(80),
    fecha_actual: dateSchema,
    hora_actual: timeSchema,
    nueva_cancha: z.string().trim().min(1).max(80),
    nueva_fecha: dateSchema,
    nueva_hora: timeSchema,
    confirmado_por_jugador: z.boolean(),
  })
  .strict()

function rescheduleErrorOutput(
  err: unknown,
  ctx: ToolContext,
  fromCourtName: string,
  fromDate: string,
  fromTimeStart: string,
): Record<string, unknown> | null {
  if (err instanceof GuestLateCancelBlockedError) {
    return { error: 'bloqueado', hasta: ddmmHhmmArt(err.until) }
  }
  if (err instanceof WhatsappRescheduleBlockedError) {
    if (err.reason === 'not_found') {
      const elsewhere = ctx.phoneBookings.some(
        (b) =>
          normalizeName(b.courtName) === normalizeName(fromCourtName) &&
          b.date === fromDate &&
          b.timeStart.slice(0, 5) === fromTimeStart,
      )
      return { error: elsewhere ? 'reservada_por_otro_lado' : 'no_encontrada' }
    }
    if (err.reason === 'deposit_pending') return { error: 'pendiente_de_pago' }
    if (err.reason === 'deposit_paid') return { error: 'tiene_sena_mp' }
    if (err.reason === 'too_close') {
      return {
        error: 'muy_encima',
        ...(err.hoursRequired ? { horas_requeridas: err.hoursRequired } : {}),
      }
    }
    if (err.reason === 'reschedule_limit') return { error: 'limite_reprogramaciones' }
    if (err.reason === 'already_started') return { error: 'ya_empezo' }
    if (err.reason === 'same_slot') return { error: 'mismo_horario' }
    return { error: 'requiere_encargado' }
  }
  const reason = bookingErrorReason(err)
  return reason ? { error: reason } : null
}

function rescheduleTool(ctx: ToolContext, courts: BotCourt[]): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'reprogramar',
      description:
        'Reprograma una reserva confirmada de "Reservas de este chat" a otra cancha, día u hora dentro del mismo complejo (sin cancelar ni sacar turno nuevo). ' +
        'Antes consultá ver_disponibilidad del día destino, avisá el nuevo precio si cambia y pedí confirmación explícita del jugador. ' +
        'Si devuelve muy_encima, limite_reprogramaciones, tiene_sena_mp, pendiente_de_pago, reservada_por_otro_lado o requiere_encargado, derivá con pasar_a_humano.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          cancha_actual: {
            type: 'string',
            description: 'Nombre de la cancha de la reserva actual.',
          },
          fecha_actual: { type: 'string', description: 'Día operativo actual AAAA-MM-DD.' },
          hora_actual: { type: 'string', description: 'Hora de inicio actual HH:MM.' },
          nueva_cancha: {
            type: 'string',
            description: 'Nombre exacto de la cancha destino devuelto por ver_disponibilidad.',
          },
          nueva_fecha: { type: 'string', description: 'Día operativo destino AAAA-MM-DD.' },
          nueva_hora: { type: 'string', description: 'Hora de inicio destino HH:MM.' },
          confirmado_por_jugador: {
            type: 'boolean',
            description:
              'true únicamente si el jugador ya confirmó explícitamente cambiar a esa cancha, día y hora.',
          },
        },
        required: [
          'cancha_actual',
          'fecha_actual',
          'hora_actual',
          'nueva_cancha',
          'nueva_fecha',
          'nueva_hora',
          'confirmado_por_jugador',
        ],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const args = parseInput(rescheduleInput, input)
      if (!args.confirmado_por_jugador) {
        return {
          kind: 'continue',
          output: json({
            error: 'falta_confirmacion_del_jugador',
            detalle: 'Pedí confirmación explícita de la nueva cancha, día y hora antes de moverla.',
          }),
        }
      }

      const { tenant, now } = ctx
      if (onlineBookingClosed(tenant, now)) {
        return { kind: 'continue', output: json({ error: 'reservas_online_cerradas' }) }
      }
      if (dateOutOfRange(tenant, args.nueva_fecha, now)) {
        return { kind: 'continue', output: json({ error: 'fecha_fuera_de_rango' }) }
      }

      const fromCourt = findCourt(courts, args.cancha_actual)
      const toCourt = findCourt(courts, args.nueva_cancha)
      if (!fromCourt || !toCourt) {
        return {
          kind: 'continue',
          output: json({ error: 'cancha_inexistente', canchas: courts.map((c) => c.name) }),
        }
      }
      if (
        fromCourt.id === toCourt.id &&
        args.fecha_actual === args.nueva_fecha &&
        args.hora_actual === args.nueva_hora
      ) {
        return { kind: 'continue', output: json({ error: 'mismo_horario' }) }
      }

      try {
        const result = await withTenantContext(tenant.id, async (tx) => {
          if (!(await chatAcceptsMutation(tx, ctx))) return null
          return rescheduleWhatsappBooking(
            tenant.id,
            {
              chatId: ctx.chatId,
              fromCourtId: fromCourt.id,
              fromDate: args.fecha_actual,
              fromTimeStart: args.hora_actual,
              toCourtId: toCourt.id,
              toDate: args.nueva_fecha,
              toTimeStart: args.nueva_hora,
              now,
            },
            tx,
          )
        })
        if (!result) return { kind: 'continue', output: json({ error: 'chat_pausado' }) }

        const ddmmFrom = `${args.fecha_actual.slice(8, 10)}/${args.fecha_actual.slice(5, 7)}`
        const ddmmTo = `${args.nueva_fecha.slice(8, 10)}/${args.nueva_fecha.slice(5, 7)}`
        await notifyAdminPush(tenant.id, {
          type: 'booking.rescheduled',
          bookingId: result.booking.id,
          courtName: toCourt.name,
          title: `Reserva reprogramada — ${toCourt.name}`,
          body: `${fromCourt.name} ${ddmmFrom} ${args.hora_actual} → ${toCourt.name} ${ddmmTo} ${args.nueva_hora}`,
          url: `/grilla?date=${args.nueva_fecha}`,
        }).catch((err: unknown) =>
          logger.warn('whatsapp-bot: no se pudo enviar push de reprogramación', {
            module: 'whatsapp-bot',
            tenantId: tenant.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )

        return {
          kind: 'continue',
          output: json({
            estado: 'reprogramada',
            cancha: toCourt.name,
            fecha: args.nueva_fecha,
            hora: args.nueva_hora,
            ...(tenant.hidePrices ? {} : { precio: formatArs(result.booking.priceSnapshot) }),
            precio_cambio: result.priceChanged,
          }),
        }
      } catch (err) {
        const mapped = rescheduleErrorOutput(
          err,
          ctx,
          fromCourt.name,
          args.fecha_actual,
          args.hora_actual,
        )
        if (mapped) return { kind: 'continue', output: json(mapped) }
        throw err
      }
    },
  }
}

// ─── 5. no_responder ─────────────────────────────────────────────────────────

const noReplyInput = z
  .object({
    motivo: z.string().trim().min(2).max(120),
  })
  .strict()

function noReplyTool(): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'no_responder',
      description:
        'Guarda silencio sin enviar ningún mensaje al jugador. Usala ante cierres ("oki", "dale", "joya", "gracias, nos vemos", "listo") o cuando no hace falta contestar.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo breve del silencio (ej. "cierre_conversacion", "agradecimiento").',
          },
        },
        required: ['motivo'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const { motivo } = parseInput(noReplyInput, input)
      return { kind: 'silent', motivo, output: json({ ok: true }) }
    },
  }
}

// ─── 5. pasar_a_humano + alerta WhatsApp Utility al dueño ────────────────────

const HANDOFF_PAUSE_REASON = {
  clima: 'handoff_weather',
  reclamo: 'handoff_complaint',
  evento: 'handoff_event',
  otro: 'handoff_other',
} as const

const handoffInput = z
  .object({
    tipo: z.enum(['clima', 'reclamo', 'evento', 'otro']).default('otro'),
    motivo_corto: z.string().trim().min(3).max(180),
    nombre_jugador: z.string().trim().min(1).max(80).nullable(),
    mensaje_al_jugador: z.string().trim().min(5).max(240),
  })
  .strict()

/**
 * Envía alerta Utility por WhatsApp al número personal del dueño.
 * Nunca lanza: si falla, loguea warning y deja que el chat quede pausado y responda al jugador.
 */
async function sendOwnerHandoffWhatsappAlert(params: {
  tenantId: string
  senderPhoneNumberId: string
  ownerAlertPhone: string | null
  playerWaPhone: string
  playerName: string | null
  motivoCorto: string
}): Promise<void> {
  const ownerDigits = toWhatsappDigits(params.ownerAlertPhone)
  if (!ownerDigits) {
    logger.warn('whatsapp-bot: dueño sin teléfono personal configurado para alerta de derivación', {
      module: 'whatsapp-bot',
      tenantId: params.tenantId,
    })
    return
  }

  const playerDisplayPhone = `+${params.playerWaPhone}`
  const clienteParam = params.playerName
    ? `${params.playerName} (${playerDisplayPhone})`
    : playerDisplayPhone
  const waDirectLink =
    buildWhatsappUrl(params.playerWaPhone) ?? `https://wa.me/${params.playerWaPhone}`

  const templateName = process.env.WHATSAPP_HANDOFF_TEMPLATE_NAME || DEFAULT_HANDOFF_TEMPLATE_NAME
  const languageCode = process.env.WHATSAPP_HANDOFF_TEMPLATE_LANG || DEFAULT_HANDOFF_TEMPLATE_LANG
  const fromPhoneNumberId = process.env.KAPSO_ALERTS_PHONE_NUMBER_ID || params.senderPhoneNumberId

  try {
    await sendWhatsappTemplate({
      phoneNumberId: fromPhoneNumberId,
      to: ownerDigits,
      templateName,
      languageCode,
      bodyParameters: [clienteParam, params.motivoCorto, waDirectLink],
    })
  } catch (err) {
    logger.warn('whatsapp-bot: falló el envío de alerta Utility de derivación al dueño', {
      module: 'whatsapp-bot',
      tenantId: params.tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function pauseChatForHuman(
  ctx: Pick<ToolContext, 'tenant' | 'chatId' | 'now'>,
  pauseReason:
    'handoff_weather' | 'handoff_complaint' | 'handoff_event' | 'handoff_other' | 'bot_error',
  label: string,
  pauseMs: number = HANDOFF_PAUSE_MS,
): Promise<void> {
  const until = sql`${new Date(ctx.now.getTime() + pauseMs).toISOString()}::timestamptz`
  await withTenantContext(ctx.tenant.id, (tx) =>
    tx
      .update(whatsappChats)
      .set({
        pausedUntil: sql`GREATEST(COALESCE(${whatsappChats.pausedUntil}, ${until}), ${until})`,
        pauseReason: sql`CASE WHEN ${whatsappChats.pausedUntil} > ${until} THEN ${whatsappChats.pauseReason} ELSE ${pauseReason} END`,
      })
      .where(and(eq(whatsappChats.id, ctx.chatId), eq(whatsappChats.tenantId, ctx.tenant.id))),
  )

  await notifyAdminPush(ctx.tenant.id, {
    type: 'whatsapp_handoff',
    title: 'WhatsApp: te necesitan en un chat',
    body: label,
    summaryLabel: label,
    url: WHATSAPP_SETTINGS_PATH,
  }).catch((err: unknown) =>
    logger.warn('whatsapp-bot: no se pudo enviar push de pase a humano', {
      module: 'whatsapp-bot',
      tenantId: ctx.tenant.id,
      error: err instanceof Error ? err.message : String(err),
    }),
  )
}

function handoffTool(ctx: ToolContext): BotTool {
  return {
    definition: {
      type: 'function',
      name: 'pasar_a_humano',
      description:
        'Corta el turno de inmediato (no la combines en paralelo con otras herramientas): pausa el bot 6 horas en este chat, avisa al dueño y envía al jugador únicamente `mensaje_al_jugador`. ' +
        'Usala directo ante cambios de horario/cancha, pedidos de rival/arquero, descuentos, proveedores, usos especiales (ej. hockey), lluvia, reclamos, eventos, turnos que no figuran o que salieron por otro lado, imágenes nuevas o pedido de hablar con alguien.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            enum: ['clima', 'reclamo', 'evento', 'otro'],
            description:
              'Categoría cerrada de la consulta: clima (lluvia/suspensión), reclamo, evento (cumpleaños/torneo) u otro.',
          },
          motivo_corto: {
            type: 'string',
            description:
              'Resumen en 1 línea de lo que pidió el jugador y por qué requiere atención humana.',
          },
          nombre_jugador: {
            type: ['string', 'null'],
            description: 'Nombre del jugador si surge del chat o del perfil; si no, null.',
          },
          mensaje_al_jugador: {
            type: 'string',
            description:
              'Una única línea natural avisando que ya lo chequeás con el encargado y le responden por acá (sin decir bot/asistente virtual ni preguntar si quiere derivar).',
          },
        },
        required: ['tipo', 'motivo_corto', 'nombre_jugador', 'mensaje_al_jugador'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const args = parseInput(handoffInput, input)
      const resolvedName = args.nombre_jugador ?? ctx.contactDisplayName

      // 1. Pausa 6h en DB (ENUM cerrado de Ley 25.326) + push no bloqueante.
      await pauseChatForHuman(
        ctx,
        HANDOFF_PAUSE_REASON[args.tipo],
        'Derivación desde WhatsApp',
        HANDOFF_PAUSE_MS,
      )

      // 2. Alerta Utility al WhatsApp personal del dueño (no bloqueante).
      await sendOwnerHandoffWhatsappAlert({
        tenantId: ctx.tenant.id,
        senderPhoneNumberId: ctx.phoneNumberId,
        ownerAlertPhone: ctx.ownerAlertPhone,
        playerWaPhone: ctx.waPhone,
        playerName: resolvedName,
        motivoCorto: args.motivo_corto,
      })

      return {
        kind: 'handoff',
        mensajeAlJugador: args.mensaje_al_jugador,
        output: json({ ok: true }),
      }
    },
  }
}

export function buildBotTools(ctx: ToolContext, courts: BotCourt[]): BotTool[] {
  return [
    availabilityTool(ctx),
    bookTool(ctx, courts),
    cancelTool(ctx, courts),
    rescheduleTool(ctx, courts),
    noReplyTool(),
    handoffTool(ctx),
  ]
}
