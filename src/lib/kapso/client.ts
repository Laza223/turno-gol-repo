import { z } from 'zod'

/**
 * Envío de mensajes de WhatsApp vía Kapso. La API es un proxy con la forma de
 * la Graph API de Meta (`/{phone_number_id}/messages`), así que pasar a Tech
 * Provider propio es cambiar la URL base y el header de auth.
 *
 * Solo texto libre: el bot contesta siempre dentro de la ventana de 24 h que
 * abrió el jugador, donde no hacen falta templates.
 */

const KAPSO_BASE_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0'
const SEND_TIMEOUT_MS = 10_000

const sendResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) }).loose()).min(1),
})

class KapsoNotConfiguredError extends Error {
  constructor() {
    super('KAPSO_API_KEY no está configurada')
    this.name = 'KapsoNotConfiguredError'
  }
}

class KapsoSendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'KapsoSendError'
  }
}

/** Manda un texto. Devuelve el id de WhatsApp del mensaje enviado. */
export async function sendWhatsappText(params: {
  phoneNumberId: string
  to: string
  body: string
}): Promise<{ waMessageId: string }> {
  const apiKey = process.env.KAPSO_API_KEY
  if (!apiKey) throw new KapsoNotConfiguredError()

  const res = await fetch(
    `${KAPSO_BASE_URL}/${encodeURIComponent(params.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: { body: params.body, preview_url: true },
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  )

  if (!res.ok) {
    // El cuerpo de error de Meta trae el motivo (ventana vencida, número
    // inválido…). Va al log recortado: no lleva datos personales.
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new KapsoSendError(res.status, `Kapso respondió ${res.status}: ${detail}`)
  }

  const parsed = sendResponseSchema.safeParse(await res.json())
  if (!parsed.success) throw new KapsoSendError(res.status, 'Respuesta de envío sin id de mensaje')
  return { waMessageId: parsed.data.messages[0]!.id }
}
