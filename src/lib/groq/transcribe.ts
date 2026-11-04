import { z } from 'zod'

/**
 * Transcripción de audios con Whisper vía Groq (plan gratis, sin tarjeta). Es
 * el respaldo de la transcripción de Kapso: Kapso transcribe solo mientras le
 * dura la cuota del plan, y en el plan Free se corta hasta el ciclo siguiente.
 *
 * API compatible con la de OpenAI: si algún día cambia el proveedor, se cambia
 * la URL, el modelo y la clave.
 */

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MODEL = 'whisper-large-v3-turbo'
/** Tope del plan gratis de Groq para subir un archivo. Una nota de voz pesa KB. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const responseSchema = z
  .object({
    text: z.string(),
    segments: z
      .array(
        z
          .object({
            text: z.string(),
            no_speech_prob: z.number().nullish(),
            avg_logprob: z.number().nullish(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose()

/**
 * Whisper inventa texto sobre silencio o ruido ("Gracias por ver el video",
 * "Subtítulos realizados por…"). Un tramo es silencio con el mismo criterio que
 * usa Whisper para descartarlo: probablemente sin voz Y con baja confianza.
 * Un texto inventado haría que el bot conteste algo que nadie dijo; sin texto,
 * contesta pidiendo que lo escriban.
 */
const NO_SPEECH_THRESHOLD = 0.6
const LOGPROB_THRESHOLD = -1

function isSilence(s: { no_speech_prob?: number | null; avg_logprob?: number | null }): boolean {
  return (s.no_speech_prob ?? 0) > NO_SPEECH_THRESHOLD && (s.avg_logprob ?? 0) < LOGPROB_THRESHOLD
}

class GroqTranscriptionError extends Error {
  constructor(
    /** 0 = sin llamada, timeout o respuesta ilegible. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'GroqTranscriptionError'
  }
}

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY
}

/**
 * Texto del audio, o null si no hay voz (silencio, ruido). En español fijo: los
 * jugadores escriben en castellano y fijarlo evita que Whisper adivine mal el
 * idioma de un audio corto.
 */
export async function transcribeAudio(
  audio: Blob,
  opts: { filename: string; signal?: AbortSignal },
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new GroqTranscriptionError(0, 'GROQ_API_KEY no está configurada')

  const form = new FormData()
  form.append('file', audio, opts.filename)
  form.append('model', MODEL)
  form.append('language', 'es')
  // `verbose_json` trae los tramos con su probabilidad de silencio.
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')

  let res: Response
  try {
    res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: opts.signal,
    })
  } catch (err) {
    throw new GroqTranscriptionError(
      0,
      `Groq no respondió: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    // El cuerpo de error de Groq trae el motivo (cuota, archivo inválido); no
    // trae el audio ni su texto.
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new GroqTranscriptionError(res.status, `Groq respondió ${res.status}: ${detail}`)
  }

  const parsed = responseSchema.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new GroqTranscriptionError(res.status, 'Respuesta de Groq inesperada')
  const { text, segments } = parsed.data
  const spoken = segments?.length
    ? segments
        .filter((s) => !isSilence(s))
        .map((s) => s.text.trim())
        .join(' ')
    : text
  return spoken.trim() || null
}
