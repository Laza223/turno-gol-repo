import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { getDb, withTenantContext } from '@/shared/db/client'
import { tenants, whatsappChats } from '@/shared/db/schema'
import { addDays } from '@/shared/dates/art'
import { hhmmToMins } from '@/shared/time/operating-day'
import { formatArs } from '@/lib/format'
import { logger } from '@/shared/lib/logger'
import { getPublicAvailability, type PublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { createWhatsappBooking } from '@/modules/bookings/booking.whatsapp'
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
} from '@/modules/bookings/booking.errors'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  notifyAdminBookingCanceled,
  notifyAdminBookingConfirmed,
  notifyAdminPush,
} from '@/modules/notifications/push.service'
import { ToolInputError, type BotTool } from './whatsapp-bot.agent'
import { complexPageUrl, operatingToday } from './whatsapp-bot.prompt'

/**
 * Herramientas del bot. El complejo y el chat van por CLAUSURA: el modelo no
 * puede elegir sobre qué complejo ni a nombre de qué teléfono actúa, aunque
 * un jugador se lo pida. Todo lo que el modelo sí manda pasa por Zod.
 *
 * Cada tool devuelve texto (JSON compacto) para el modelo. Los errores de
 * dominio esperables se traducen acá a un motivo corto; lo inesperado tira y
 * el turno pasa a una persona.
 */

export type ToolContext = {
  tenant: PublicTenant
  chatId: string
  waPhone: string
  /** Cuándo se pausa el chat al pasar a humano. */
  now: Date
}

/** Motivos de pase a humano. ENUM cerrado: nunca texto del modelo (Ley 25.326). */
const HANDOFF_REASONS = {
  lluvia: { pauseReason: 'handoff_weather', label: 'Consulta por lluvia o suspensión' },
  reclamo: { pauseReason: 'handoff_complaint', label: 'Un reclamo' },
  evento: { pauseReason: 'handoff_event', label: 'Consulta por un evento o cumpleaños' },
  otro: { pauseReason: 'handoff_other', label: 'Una consulta que el bot no pudo resolver' },
} as const

/** Pantalla del panel donde el dueño ve los chats del bot. */
const WHATSAPP_SETTINGS_PATH = '/settings/whatsapp'

/** Cuánto se calla el bot después de pasarle la charla a una persona. */
export const HANDOFF_PAUSE_MS = 12 * 60 * 60 * 1000

const dateSchema = z.string().refine(isValidCalendarDate)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new ToolInputError('Datos inválidos: revisá el formato y volvé a intentar.')
  return parsed.data
}

const json = (value: unknown) => JSON.stringify(value)

/** Rango que también usa `/api/public/availability`: de hoy a hoy + anticipación. */
function dateOutOfRange(tenant: PublicTenant, date: string, now: Date): boolean {
  const today = operatingToday(tenant, now)
  return date < today || date > addDays(today, tenant.bookingAdvanceDays)
}

function onlineBookingClosed(tenant: PublicTenant, now: Date): boolean {
  return (
    !tenant.allowOnlineBooking || !isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd, now)
  )
}

// ─── ver_disponibilidad ──────────────────────────────────────────────────────

const availabilityInput = z.object({ fecha: dateSchema }).strict()

function availabilityTool(ctx: ToolContext): BotTool {
  return {
    definition: {
      name: 'ver_disponibilidad',
      description:
        'Devuelve los turnos libres de todas las canchas para un día, leídos del sistema en este momento: por cancha, su nombre, su formato y cada horario libre con su precio. ' +
        'Usala en la misma respuesta en la que ofrecés o confirmás horarios libres, también para otro día que propongas: la disponibilidad cambia minuto a minuto y lo que viste en un mensaje anterior puede estar viejo. ' +
        'Un horario con madrugada_del_dia_siguiente se juega pasada la medianoche: decilo así ("el viernes a la noche, pasada la medianoche, ya sábado"). ' +
        'Si el complejo cierra ese día devuelve cerrado: true. Errores: fecha_fuera_de_rango (el día no está en la tabla de días reservables) y reservas_online_cerradas (el complejo no toma reservas por acá: pasale el teléfono del complejo).',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          fecha: {
            type: 'string',
            description: 'Día en formato AAAA-MM-DD, sacado de la tabla de días.',
          },
        },
        required: ['fecha'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const { fecha } = parseInput(availabilityInput, input)
      const { tenant, now } = ctx
      if (onlineBookingClosed(tenant, now)) return json({ error: 'reservas_online_cerradas' })
      if (dateOutOfRange(tenant, fecha, now)) return json({ error: 'fecha_fuera_de_rango' })
      const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[
        new Date(`${fecha}T00:00:00Z`).getUTCDay()
      ]!
      if (tenant.closedDates.includes(fecha) || tenant.openingHours[dayKey].closed) {
        return json({ fecha, cerrado: true, canchas: [] })
      }

      const availability = await getPublicAvailability(tenant, fecha)
      const openMins = hhmmToMins(tenant.openingHours[dayKey].open)

      return json({
        fecha,
        canchas: availability.courts.map((court) => ({
          nombre: court.name,
          formato: `fútbol ${court.format}`,
          turnos_libres: court.slots
            .filter((s) => s.status === 'free')
            .map((s) => ({
              hora: s.time,
              ...(s.price !== null && !tenant.hidePrices ? { precio: formatArs(s.price) } : {}),
              // Un complejo que cierra pasada la medianoche lista sus turnos
              // de madrugada en el día en que abrió.
              ...(tenant.closesNextDay && hhmmToMins(s.time) < openMins
                ? { madrugada_del_dia_siguiente: true }
                : {}),
            })),
        })),
      })
    },
  }
}

// ─── reservar ────────────────────────────────────────────────────────────────

const bookInput = z
  .object({
    cancha: z.string().trim().min(1).max(80),
    fecha: dateSchema,
    hora: timeSchema,
    nombre: z.string().trim().min(2).max(80),
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
  if (err instanceof TooManyWhatsappBookingsError)
    return err.reason === 'holds' ? 'demasiadas_senas_pendientes' : 'demasiadas_reservas_sin_sena'
  if (err instanceof BookingDateOutOfRangeError)
    return err.reason === 'lead_time' ? 'falta_poco_para_el_turno' : 'fecha_fuera_de_rango'
  // El ban no se le explica al jugador por el bot: se lo deriva.
  if (err instanceof PlayerBannedError) return 'no_se_puede_reservar_por_aca'
  // Antes que BookingValidationError, que es su clase base.
  if (err instanceof BookingNotOfferedError) {
    if (err.reason === 'closed_day') return 'el_complejo_cierra_ese_dia'
    if (err.reason === 'outside_hours') return 'fuera_de_horario'
    return 'reservas_online_cerradas'
  }
  if (
    err instanceof BookingValidationError ||
    err instanceof CourtOfflineError ||
    err instanceof PriceUnavailableError
  )
    return 'turno_no_disponible'
  return null
}

/** Fecha y hora (dd/mm HH:MM) en hora de Argentina (UTC-3 fijo). */
function ddmmHhmmArt(d: Date): string {
  const iso = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString()
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`
}

/** Cancha del complejo, para resolver el nombre que manda el modelo. */
export type BotCourt = { id: string; name: string }

const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * El modelo nombra la cancha como la ve ("Cancha 2"), no por su UUID: copiar un
 * id de 36 caracteres de un turno a otro es donde Haiku se equivocaba (pasaba
 * "2"). El nombre se resuelve acá, en memoria, contra las canchas del complejo
 * de la clausura: lo que mande el modelo nunca llega a una query.
 */
function findCourt(courts: BotCourt[], name: string): BotCourt | null {
  const matches = courts.filter((c) => normalizeName(c.name) === normalizeName(name))
  return matches.length === 1 ? matches[0]! : null
}

function bookTool(ctx: ToolContext, courts: BotCourt[]): BotTool {
  return {
    definition: {
      name: 'reservar',
      description:
        'Reserva un turno de 60 minutos a nombre del jugador. Usala cuando el jugador aceptó la cancha, el día y la hora que le confirmaste, o cuando él mismo eligió una de las opciones que le ofreciste y te dio el nombre. ' +
        'Vuelve a chequear que el turno siga libre: con estado confirmada, el turno quedó reservado. ' +
        'Con estado falta_pagar_la_sena, mandale link_pago en su propia línea y avisale que tiene minutos_para_pagar minutos para pagar la seña: si no la paga a tiempo, el turno se libera solo. ' +
        'Errores (explicalos simple, ofrecé otra opción y no repitas la misma reserva): bloqueado (canceló tarde varias veces y no puede reservar por acá hasta la fecha hasta, dd/mm HH:MM: decísela y ofrecé pasarle la consulta a una persona); turno_ocupado (lo tomó otro: mostrale otros horarios); demasiadas_reservas_sin_sena (el chat ya tiene las 2 reservas sin seña que se permiten por acá: mandale link_para_reservar para reservar desde la página del complejo); demasiadas_senas_pendientes (tiene señas sin pagar); falta_poco_para_el_turno; fecha_fuera_de_rango; fuera_de_horario; el_complejo_cierra_ese_dia; cancha_inexistente (trae la lista de canchas); turno_no_disponible; reservas_online_cerradas y no_se_puede_reservar_por_aca (en estos dos, ofrecé pasarle la consulta a una persona del complejo).',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          cancha: {
            type: 'string',
            description:
              'Nombre de la cancha tal como lo devolvió ver_disponibilidad (por ejemplo "Cancha 2").',
          },
          fecha: {
            type: 'string',
            description: 'AAAA-MM-DD, la misma que usaste en ver_disponibilidad.',
          },
          hora: {
            type: 'string',
            description: 'HH:MM de inicio, tal como la devolvió ver_disponibilidad.',
          },
          nombre: {
            type: 'string',
            description: 'Nombre de quien reserva, como lo dio el jugador.',
          },
        },
        required: ['cancha', 'fecha', 'hora', 'nombre'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const args = parseInput(bookInput, input)
      const { tenant, now } = ctx
      if (onlineBookingClosed(tenant, now)) return json({ error: 'reservas_online_cerradas' })
      if (dateOutOfRange(tenant, args.fecha, now)) return json({ error: 'fecha_fuera_de_rango' })
      const court = findCourt(courts, args.cancha)
      if (!court) return json({ error: 'cancha_inexistente', canchas: courts.map((c) => c.name) })

      let result: Awaited<ReturnType<typeof createWhatsappBooking>>
      try {
        result = await withTenantContext(tenant.id, (tx) =>
          createWhatsappBooking(
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
          ),
        )
      } catch (err) {
        if (err instanceof GuestLateCancelBlockedError) {
          return json({ error: 'bloqueado', hasta: ddmmHhmmArt(err.until) })
        }
        const reason = bookingErrorReason(err)
        // Decisión del dueño (2026-10-20): por el bot, hasta 2 reservas sin seña
        // por chat; para la tercera se lo manda a reservar en la página del
        // complejo, donde rigen las reglas de siempre.
        if (reason === 'demasiadas_reservas_sin_sena') {
          return json({ error: reason, link_para_reservar: complexPageUrl(tenant) ?? undefined })
        }
        if (reason) return json({ error: reason })
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
        // Quedó confirmada sin seña: nunca pasa por el webhook de MP, así que el aviso al
        // admin sale acá, ya commiteada la tx. No lanza; si el job se reintenta
        // (`alreadyExisted`) la dedupeKey por reserva evita el doble push. Las reservas
        // con seña avisan al confirmarse el pago.
        await notifyAdminBookingConfirmed(tenant.id, booking.id)
        return json({ estado: 'confirmada', ...resumen })
      }

      // La preferencia de MercadoPago se crea FUERA de la transacción que
      // reservó (efecto externo: nunca dentro de una tx SQL).
      const token = await tenantMpToken(tenant.id)
      if (!token) {
        // createWhatsappBooking ya confirma sin seña si no hay MP; llegar acá
        // es un complejo que se desconectó en el medio.
        logger.warn('whatsapp-bot: reserva con seña sin MercadoPago', {
          module: 'whatsapp-bot',
          tenantId: tenant.id,
        })
        return json({ error: 'turno_no_disponible' })
      }
      // Corre en el worker de Railway, que no valida `env.ts` al arrancar. Sin la
      // URL, la preferencia saldría con una notification_url rota y MP nunca
      // avisaría el pago: mejor fallar fuerte (el turno pasa a una persona).
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
      return json({
        estado: 'falta_pagar_la_sena',
        ...resumen,
        sena: formatArs(booking.depositAmount),
        link_pago: pref.initPoint,
        // Del vencimiento REAL de la preferencia (P6): al pedir el link de nuevo
        // quedan menos que al reservar, y el checkout cierra solo.
        minutos_para_pagar: Math.max(
          1,
          Math.floor((pref.expiresAt.getTime() - Date.now()) / 60_000),
        ),
      })
    },
  }
}

// ─── cancelar ────────────────────────────────────────────────────────────────

const cancelInput = z
  .object({
    cancha: z.string().trim().min(1).max(80),
    fecha: dateSchema,
    hora: timeSchema,
    confirmar: z.boolean(),
  })
  .strict()

/** Lo que le cuesta cancelar tarde, en el vocabulario de la tool. */
function latePenaltyReason(p: LateCancelPenalty) {
  return p.kind === 'ban' ? { consecuencia: 'bloqueo', dias: p.days } : { consecuencia: 'aviso' }
}

function cancelTool(ctx: ToolContext, courts: BotCourt[]): BotTool {
  return {
    definition: {
      name: 'cancelar',
      description:
        'Cancela una reserva confirmada de ESTE chat. Funciona en dos pasos: primero llamala con confirmar false, que NO cancela y devuelve la consecuencia; contásela al jugador en una línea y llamala con confirmar true solo si te confirma que quiere cancelar. ' +
        'Consecuencias: se_devuelve_la_sena (la seña queda a devolver por el complejo); pierde_la_sena; sin_consecuencia; aviso (cancela tarde, esta vez es solo un aviso); bloqueo con dias (cancela tarde y no va a poder reservar por el bot ese tiempo). ' +
        'Con confirmar true devuelve estado cancelada (si el pedido se repite y ya estaba cancelada, también) y, si hay bloqueo, hasta (dd/mm HH:MM). Errores: no_encontrada (no hay una reserva confirmada de este chat en esa cancha, día y hora); pendiente_de_pago (falta pagar la seña: no hace falta cancelar, el turno se libera solo); ya_empezo; cancha_inexistente; no_se_puede_cancelar_por_aca (ofrecé pasarle la consulta a una persona).',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          cancha: { type: 'string', description: 'Nombre de la cancha de la reserva.' },
          fecha: { type: 'string', description: 'AAAA-MM-DD de la reserva (día operativo).' },
          hora: { type: 'string', description: 'HH:MM de inicio de la reserva.' },
          confirmar: {
            type: 'boolean',
            description: 'false: solo informa la consecuencia. true: cancela de verdad.',
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
      if (!court) return json({ error: 'cancha_inexistente', canchas: courts.map((c) => c.name) })

      // El aviso push al admin sale DESPUÉS del commit: el callback solo anota qué se
      // canceló de verdad (un replay no escribe nada y no se anota). Es un arreglo y no
      // un `let` porque TS reduce un `let x = null` asignado desde un closure a `never`.
      const freshCancels: Array<{ bookingId: string; late: boolean }> = []
      try {
        const reply = await withTenantContext(tenant.id, async (tx) => {
          // Solo reservas de ESTE chat: lo que mande el modelo nunca elige de quién es el turno.
          const found = await findChatBookingForCancel(
            tenant.id,
            ctx.chatId,
            { courtId: court.id, date: args.fecha, timeStart: args.hora },
            tx,
          )
          if (!found) return json({ error: 'no_encontrada' })
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
          // Ya cancelada por este chat (el pedido se repitió): se cuenta lo que pasó, con
          // o sin confirmar, y `cancelByGuest` no escribe nada en ese caso.
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
        return reply
      } catch (err) {
        if (err instanceof BookingAlreadyEndedError) return json({ error: 'ya_empezo' })
        // `BookingNotCancelableError` es subclase: carrera con el staff u otro pedido.
        if (err instanceof BookingNotInConfirmedError || err instanceof BookingNotCancelableError)
          return json({ error: 'no_encontrada' })
        if (err instanceof TenantInactiveError)
          return json({ error: 'no_se_puede_cancelar_por_aca' })
        throw err
      }
    },
  }
}

// ─── pasar_a_humano ──────────────────────────────────────────────────────────

const handoffInput = z
  .object({ motivo: z.enum(Object.keys(HANDOFF_REASONS) as [keyof typeof HANDOFF_REASONS]) })
  .strict()

/** Pausa el chat y avisa al admin. Lo usa la tool y el turno cuando falla el modelo. */
export async function pauseChatForHuman(
  ctx: Pick<ToolContext, 'tenant' | 'chatId' | 'now'>,
  pauseReason: (typeof HANDOFF_REASONS)[keyof typeof HANDOFF_REASONS]['pauseReason'] | 'bot_error',
  label: string,
  pauseMs: number = HANDOFF_PAUSE_MS,
): Promise<void> {
  // GREATEST, como el eco del dueño: una pausa más corta (un error del bot,
  // 30 min) nunca acorta un pase a humano ya vigente (12 h).
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
  // El push no puede tirar abajo el turno: si falla, el chat igual quedó pausado.
  await notifyAdminPush(ctx.tenant.id, {
    type: 'whatsapp_handoff',
    title: 'WhatsApp: te necesitan en un chat',
    body: label,
    summaryLabel: label,
    url: WHATSAPP_SETTINGS_PATH,
  }).catch((err: unknown) =>
    logger.warn('whatsapp-bot: no se pudo avisar el pase a humano', {
      module: 'whatsapp-bot',
      tenantId: ctx.tenant.id,
      error: err instanceof Error ? err.message : String(err),
    }),
  )
}

function handoffTool(ctx: ToolContext): BotTool {
  return {
    definition: {
      name: 'pasar_a_humano',
      description:
        'Le pasa la conversación a una persona del complejo: el chat queda en pausa y el asistente deja de contestar acá. ' +
        'Usala cuando el jugador pregunta por lluvia o suspensiones, hace un reclamo, consulta por un evento o un cumpleaños, quiere cambiar una reserva (cancelar lo resolvés vos con la herramienta cancelar), pide hablar con una persona, o necesita algo que no está en los datos y aceptó que se lo averigüen. ' +
        'En esa misma respuesta avisale que en un rato le contesta alguien del complejo por este chat.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            enum: Object.keys(HANDOFF_REASONS),
            description:
              'lluvia: lluvia o suspensiones. reclamo: un reclamo. evento: eventos o cumpleaños. otro: todo lo demás (cambiar una reserva, pedir una persona, una consulta sin datos).',
          },
        },
        required: ['motivo'],
        additionalProperties: false,
      },
    },
    run: async (input) => {
      const { motivo } = parseInput(handoffInput, input)
      const reason = HANDOFF_REASONS[motivo]
      await pauseChatForHuman(ctx, reason.pauseReason, reason.label)
      return json({ ok: true })
    },
  }
}

export function buildBotTools(ctx: ToolContext, courts: BotCourt[]): BotTool[] {
  return [availabilityTool(ctx), bookTool(ctx, courts), cancelTool(ctx, courts), handoffTool(ctx)]
}
