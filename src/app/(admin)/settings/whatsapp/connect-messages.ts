import type { WhatsappConnectError } from '@/modules/whatsapp-bot/whatsapp-bot.connection'

/** Lo que ve el dueño cuando la conexión no se completa (`?error=` y errores de las acciones). */
export const CONNECT_ERROR_MESSAGE: Record<WhatsappConnectError, string> = {
  kapso_no_disponible: 'No pudimos abrir la conexión. Probá de nuevo en un rato.',
  numero_de_otro_complejo: 'Ese número ya está conectado a otro complejo. Escribinos.',
  conexion_incompleta: 'No se terminó de conectar. Volvé a intentarlo.',
}
