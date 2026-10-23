import type { WhatsappConnectError } from '@/modules/whatsapp-bot/whatsapp-bot.connection'

/** Lo que ve el dueño cuando la conexión no se completa (`?error=` y errores de las acciones). */
export const CONNECT_ERROR_MESSAGE: Record<WhatsappConnectError, string> = {
  kapso_no_disponible: 'No pudimos abrir la conexión. Probá de nuevo en un rato.',
  numero_de_otro_complejo: 'Ese número ya está conectado a otro complejo. Escribinos.',
  conexion_incompleta: 'No se terminó de conectar. Volvé a intentarlo.',
  facebook_cancelado:
    'Se cerró Facebook antes de terminar. Volvé a intentarlo y entrá con la cuenta que maneja tu negocio.',
  numero_no_verificado:
    'No se pudo verificar tu número. Tené a mano el celular con WhatsApp Business actualizada y volvé a intentarlo.',
  limite_de_cuentas:
    'Tu cuenta de Facebook ya tiene demasiadas cuentas de WhatsApp. Escribinos y lo resolvemos.',
  meta_fallo: 'Meta no terminó la conexión. Esperá unos minutos y volvé a intentarlo.',
  link_vencido: 'El link venció. Volvé a intentarlo y te armamos uno nuevo.',
  link_usado:
    'Ese link ya se usó. Si terminaste de conectar, tocá «Ya lo conecté». Si no, volvé a intentarlo.',
}
