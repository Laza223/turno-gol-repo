import { z } from 'zod'

/**
 * Audio de un mensaje entrante, para transcribirlo cuando Kapso no lo hizo.
 *
 * El webhook no se guarda entero, así que se vuelve a pedir el mensaje por su
 * id de WhatsApp: de ahí sale el id del archivo, o la transcripción de Kapso si
 * llegó tarde. El archivo se baja con el `download_url` del proxy de Meta de
 * Kapso, que trae la autenticación adentro y dura 4 minutos.
 */

const KAPSO_PLATFORM_URL = 'https://api.kapso.ai/platform/v1'
const KAPSO_META_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0'

const messageSchema = z
  .object({
    data: z
      .object({
        type: z.string(),
        audio: z
          .object({ id: z.string().min(1), mime_type: z.string().nullish() })
          .loose()
          .nullish(),
        kapso: z
          .object({ transcript: z.object({ text: z.string() }).loose().nullish() })
          .loose()
          .nullish(),
      })
      .loose(),
  })
  .loose()

const mediaSchema = z
  .object({
    download_url: z.url(),
    mime_type: z.string().nullish(),
    file_size: z.union([z.string(), z.number()]).nullish(),
  })
  .loose()

class KapsoMediaError extends Error {
  constructor(
    /** 0 = sin llamada, timeout o respuesta ilegible. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'KapsoMediaError'
  }
}

type InboundAudio =
  /** Kapso lo terminó transcribiendo: no hace falta bajar nada. */
  | { kind: 'transcript'; text: string }
  | { kind: 'file'; audio: Blob; filename: string }
  /** El mensaje no es un audio o el archivo pasa el tope. */
  | { kind: 'none' }

async function kapsoGet(url: string, apiKey: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal })
  } catch (err) {
    throw new KapsoMediaError(
      0,
      `Kapso no respondió: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new KapsoMediaError(res.status, `Kapso respondió ${res.status}: ${detail}`)
  }
  return res.json().catch(() => null)
}

function extensionOf(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  return 'ogg'
}

export async function fetchInboundAudio(params: {
  waMessageId: string
  phoneNumberId: string
  maxBytes: number
  signal?: AbortSignal
}): Promise<InboundAudio> {
  const apiKey = process.env.KAPSO_API_KEY
  if (!apiKey) throw new KapsoMediaError(0, 'KAPSO_API_KEY no está configurada')

  const message = messageSchema.safeParse(
    await kapsoGet(
      `${KAPSO_PLATFORM_URL}/whatsapp/messages/${encodeURIComponent(params.waMessageId)}`,
      apiKey,
      params.signal,
    ),
  )
  if (!message.success) throw new KapsoMediaError(200, 'Mensaje de Kapso con forma inesperada')
  const { audio, kapso } = message.data.data
  const late = kapso?.transcript?.text.trim()
  if (late) return { kind: 'transcript', text: late }
  if (!audio) return { kind: 'none' }

  const media = mediaSchema.safeParse(
    await kapsoGet(
      `${KAPSO_META_URL}/${encodeURIComponent(audio.id)}?phone_number_id=${encodeURIComponent(params.phoneNumberId)}`,
      apiKey,
      params.signal,
    ),
  )
  if (!media.success) throw new KapsoMediaError(200, 'Archivo de Kapso con forma inesperada')
  // Antes de bajarlo a memoria: el tamaño que declara Kapso y, si no vino, el
  // `Content-Length` de la descarga. `Number(undefined)` es NaN y `NaN > max`
  // da false: sin el segundo chequeo, un `file_size` ausente saltaba el tope.
  const tooBig = (size: string | number | null | undefined) =>
    size != null && size !== '' && !(Number(size) <= params.maxBytes)
  if (tooBig(media.data.file_size)) return { kind: 'none' }

  let file: Response
  try {
    // La URL ya trae la autenticación: no se le manda la clave.
    file = await fetch(media.data.download_url, { signal: params.signal })
  } catch (err) {
    throw new KapsoMediaError(
      0,
      `No se pudo bajar el audio: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!file.ok) throw new KapsoMediaError(file.status, `Descarga del audio: ${file.status}`)
  if (tooBig(file.headers.get('content-length'))) {
    await file.body?.cancel().catch(() => {})
    return { kind: 'none' }
  }
  const blob = await file.blob()
  if (blob.size === 0 || blob.size > params.maxBytes) return { kind: 'none' }

  const mimeType = media.data.mime_type ?? audio.mime_type ?? 'audio/ogg'
  return {
    kind: 'file',
    audio: new Blob([blob], { type: mimeType.split(';')[0] }),
    filename: `audio.${extensionOf(mimeType)}`,
  }
}
