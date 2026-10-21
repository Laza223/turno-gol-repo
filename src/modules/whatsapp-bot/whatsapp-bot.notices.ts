import { and, eq } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import {
  bookings,
  courts,
  whatsappChats,
  whatsappConnections,
  whatsappMessages,
  type WhatsappNotice,
} from '@/shared/db/schema'
import { artDateOf } from '@/shared/time/art-date'
import { formatDayHeader } from '@/lib/format'
import { logger } from '@/shared/lib/logger'
import { captureException } from '@/lib/sentry'
import { sendWhatsappText } from '@/lib/kapso/client'

/**
 * Avisos por WhatsApp a quien reservó por el bot, cuando la reserva cambia
 * FUERA del chat: se acreditó la seña (webhook de MP, reconcile, expiración con
 * precheck, confirmación manual del staff), venció el link sin pagar, o la seña
 * entró cuando el turno ya se había liberado y quedó anotada la devolución.
 *
 * - Se llama DESPUÉS del commit, como `notifyAdminBookingConfirmed`, y nunca
 *   tira: un aviso que falla no puede voltear la confirmación de un pago.
 * - Idempotente por (reserva, aviso): primero se reserva la fila en
 *   `whatsapp_messages` (índice único parcial) y recién después se manda. Si
 *   el envío falla, la fila se borra para que el próximo camino que confirme
 *   la misma reserva lo pueda reintentar.
 * - Una reserva que no vino del bot (`whatsapp_chat_id` NULL) sale en la
 *   primera query sin hacer nada más.
 * - Sale aunque el bot esté apagado o el chat pausado: es la confirmación de
 *   algo que el jugador ya pagó. Solo exige que el número siga conectado.
 */

type NoticeTarget = {
  courtName: string
  startsAt: Date
  timeStart: string
}

/** Lo que lee el jugador: día FÍSICO del turno (`starts_at`), no el operativo. */
export function renderNotice(notice: WhatsappNotice, target: NoticeTarget): string {
  const day = formatDayHeader(artDateOf(target.startsAt))
  const hour = target.timeStart.slice(0, 5)
  if (notice === 'deposit_confirmed') {
    return `Listo, recibimos la seña ✅ Tu turno quedó confirmado: *${target.courtName}*, ${day} a las ${hour}. ¡Te esperamos!`
  }
  if (notice === 'late_payment_refunded') {
    // Igual que el mail `player_late_payment_refunded`: la devolución la hace
    // el complejo, TurnoGol solo la deja anotada.
    return `Tu seña entró cuando el turno de las ${hour} del ${day} ya se había liberado, así que no quedó reservado. El complejo te devuelve la plata al mismo medio de pago. Si querés otro horario, escribime y te busco uno.`
  }
  return `El link de pago venció y el turno de las ${hour} del ${day} se liberó. Si todavía lo querés, escribime y vemos si sigue libre.`
}

export async function notifyWhatsappGuest(
  tenantId: string,
  bookingId: string,
  notice: WhatsappNotice,
): Promise<void> {
  try {
    const claim = await withTenantContext(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          chatId: whatsappChats.id,
          waPhone: whatsappChats.waPhone,
          phoneNumberId: whatsappConnections.phoneNumberId,
          status: whatsappConnections.status,
          courtName: courts.name,
          startsAt: bookings.startsAt,
          timeStart: bookings.timeStart,
        })
        .from(bookings)
        .innerJoin(whatsappChats, eq(whatsappChats.id, bookings.whatsappChatId))
        .innerJoin(whatsappConnections, eq(whatsappConnections.tenantId, bookings.tenantId))
        .innerJoin(courts, eq(courts.id, bookings.courtId))
        .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenantId)))
        .limit(1)
      if (!row || row.status !== 'connected') return null

      const body = renderNotice(notice, row)
      // Sin target: el único conflicto posible es el índice único parcial
      // (booking_id, notice) — `wa_message_id` va NULL hasta mandar.
      const [inserted] = await tx
        .insert(whatsappMessages)
        .values({
          tenantId,
          chatId: row.chatId,
          direction: 'outbound',
          kind: 'text',
          body,
          bookingId,
          notice,
        })
        .onConflictDoNothing()
        .returning({ id: whatsappMessages.id })
      if (!inserted) return null
      return { messageId: inserted.id, to: row.waPhone, phoneNumberId: row.phoneNumberId, body }
    })
    if (!claim) return

    let sent: { waMessageId: string }
    try {
      sent = await sendWhatsappText({
        phoneNumberId: claim.phoneNumberId,
        to: claim.to,
        body: claim.body,
      })
    } catch (err) {
      // No salió: se libera el reclamo para que otro camino lo pueda mandar.
      await withTenantContext(tenantId, (tx) =>
        tx
          .delete(whatsappMessages)
          .where(
            and(eq(whatsappMessages.id, claim.messageId), eq(whatsappMessages.tenantId, tenantId)),
          ),
      )
      throw err
    }
    // Ya salió: si falla guardar el id, el reclamo queda igual y el aviso no se
    // repite.
    await withTenantContext(tenantId, (tx) =>
      tx
        .update(whatsappMessages)
        .set({ waMessageId: sent.waMessageId })
        .where(
          and(eq(whatsappMessages.id, claim.messageId), eq(whatsappMessages.tenantId, tenantId)),
        ),
    )
  } catch (err) {
    captureException(err)
    logger.error('whatsapp-bot: no se pudo mandar el aviso al jugador', {
      module: 'whatsapp-bot',
      tenantId,
      bookingId,
      notice,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
