import { z } from 'zod'

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

async function postKapsoMessage(
  phoneNumberId: string,
  payload: Record<string, unknown>,
): Promise<{ waMessageId: string }> {
  const apiKey = process.env.KAPSO_API_KEY
  if (!apiKey) throw new KapsoNotConfiguredError()

  const res = await fetch(`${KAPSO_BASE_URL}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new KapsoSendError(res.status, `Kapso respondió ${res.status}: ${detail}`)
  }

  const parsed = sendResponseSchema.safeParse(await res.json())
  if (!parsed.success) throw new KapsoSendError(res.status, 'Respuesta de envío sin id de mensaje')
  return { waMessageId: parsed.data.messages[0]!.id }
}

/** Manda un texto libre (dentro de la ventana de 24 h). */
export async function sendWhatsappText(params: {
  phoneNumberId: string
  to: string
  body: string
}): Promise<{ waMessageId: string }> {
  return postKapsoMessage(params.phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: params.to,
    type: 'text',
    text: { body: params.body, preview_url: true },
  })
}

/**
 * Sanitiza parámetros de plantilla Meta: rechaza saltos de línea, tabs y más de
 * 4 espacios seguidos (error 132018 de Cloud API).
 */
function sanitizeTemplateParam(value: string, maxLength = 200): string {
  const clean = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return (clean || '-').slice(0, maxLength)
}

/**
 * Envía una Plantilla Utility aprobada por Meta (válida fuera de la ventana de 24 h).
 * Usa parámetros posicionales ({{1}}, {{2}}, {{3}}...) en el componente `body`.
 */
export async function sendWhatsappTemplate(params: {
  phoneNumberId: string
  to: string
  templateName: string
  languageCode?: string
  bodyParameters: string[]
}): Promise<{ waMessageId: string }> {
  return postKapsoMessage(params.phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode ?? 'es_AR' },
      components: [
        {
          type: 'body',
          parameters: params.bodyParameters.map((text) => ({
            type: 'text',
            text: sanitizeTemplateParam(text),
          })),
        },
      ],
    },
  })
}
