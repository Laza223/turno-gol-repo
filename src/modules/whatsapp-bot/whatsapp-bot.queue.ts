import { getBoss } from '@/shared/jobs/boss'
import {
  QUEUE_WHATSAPP_TURN,
  whatsappTurnSendOptions,
  type WhatsappTurnJobData,
} from '@/shared/jobs/definitions'

/**
 * Encola un turno del bot por chat. `send` devuelve null cuando ya hay uno
 * esperando para ese chat (cola singleton): no es un error, ese job va a
 * leer también los mensajes nuevos.
 */
export async function enqueueWhatsappTurns(chats: WhatsappTurnJobData[]): Promise<void> {
  if (chats.length === 0) return
  const boss = await getBoss()
  await Promise.all(
    chats.map((chat) => boss.send(QUEUE_WHATSAPP_TURN, chat, whatsappTurnSendOptions(chat.chatId))),
  )
}
