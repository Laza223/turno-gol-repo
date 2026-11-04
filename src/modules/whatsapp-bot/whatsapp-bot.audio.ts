import { and, eq, isNull } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { whatsappMessages } from '@/shared/db/schema'
import { logger } from '@/shared/lib/logger'
import { fetchInboundAudio } from '@/lib/kapso/media'
import { MAX_AUDIO_BYTES, isGroqConfigured, transcribeAudio } from '@/lib/groq/transcribe'

/**
 * Audios que llegaron sin transcripción de Kapso: se transcriben acá, en el
 * turno (worker), antes de que los vea el modelo. El webhook no puede hacerlo:
 * tiene que contestar en menos de 10 s.
 *
 * Todo es "mejor esfuerzo": lo que no se pudo transcribir sigue sin texto y el
 * turno contesta como antes (pide que lo escriban). Nunca tira.
 *
 * Lo que se loguea es forma, nunca contenido: ni el texto ni teléfonos.
 */

/** Tope de tiempo para TODOS los audios del turno: el jugador está esperando. */
const TRANSCRIBE_BUDGET_MS = 25_000

/**
 * Audios por turno. El plan gratis de Groq tiene cuota por minuto y por día,
 * compartida entre todos los complejos: una ráfaga de audios de un chat no puede
 * dejar sin respaldo a los demás. Los más viejos quedan sin texto y el modelo
 * los ve como "audio que no se pudo transcribir".
 */
const MAX_AUDIOS_PER_TURN = 3

type UnheardAudio = { id: string; waMessageId: string | null }

/**
 * Texto por id de fila, solo de los que se pudieron transcribir. `messages` en
 * orden cronológico: se toman los más recientes.
 */
export async function transcribeUnheardAudios(params: {
  tenantId: string
  phoneNumberId: string
  messages: UnheardAudio[]
}): Promise<Map<string, string>> {
  const heard = new Map<string, string>()
  const { tenantId, phoneNumberId } = params
  const messages = params.messages
    .filter((m): m is { id: string; waMessageId: string } => !!m.waMessageId)
    .slice(-MAX_AUDIOS_PER_TURN)
  if (messages.length === 0) return heard
  if (!isGroqConfigured()) {
    logger.warn('whatsapp-bot: audio sin transcripción y sin GROQ_API_KEY', {
      module: 'whatsapp-bot',
      tenantId,
    })
    return heard
  }

  const signal = AbortSignal.timeout(TRANSCRIBE_BUDGET_MS)
  await Promise.all(
    messages.map(async (m) => {
      try {
        const audio = await fetchInboundAudio({
          waMessageId: m.waMessageId,
          phoneNumberId,
          maxBytes: MAX_AUDIO_BYTES,
          signal,
        })
        const text =
          audio.kind === 'transcript'
            ? audio.text
            : audio.kind === 'file'
              ? await transcribeAudio(audio.audio, { filename: audio.filename, signal })
              : null
        if (text) heard.set(m.id, text)
      } catch (err) {
        logger.warn('whatsapp-bot: no se pudo transcribir un audio', {
          module: 'whatsapp-bot',
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
  if (heard.size === 0) return heard

  // Se guarda para los turnos siguientes, que arman el historial de la base.
  // Si falla, este turno sigue con el texto en memoria.
  try {
    await withTenantContext(tenantId, async (tx) => {
      for (const [id, body] of heard) {
        await tx
          .update(whatsappMessages)
          .set({ body })
          .where(
            and(
              eq(whatsappMessages.id, id),
              eq(whatsappMessages.tenantId, tenantId),
              isNull(whatsappMessages.body),
            ),
          )
      }
    })
  } catch (err) {
    logger.error('whatsapp-bot: no se pudo guardar la transcripción', {
      module: 'whatsapp-bot',
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return heard
}
