import { type NextRequest, NextResponse } from 'next/server'
import { verifyKapsoSignature } from '@/lib/kapso/signature'
import { normalizeKapsoPayload } from '@/lib/kapso/events.schema'
import { captureException, captureMessage } from '@/lib/sentry'
import { ingestWhatsappEvents } from '@/modules/whatsapp-bot/whatsapp-bot.ingest'
import { enqueueWhatsappTurns } from '@/modules/whatsapp-bot/whatsapp-bot.queue'
import { logger } from '@/shared/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook de WhatsApp (Kapso). Guarda el mensaje y encola el turno del bot:
 * el modelo corre en el worker, no acá. Kapso exige respuesta en menos de 10 s
 * y reintenta 3 veces; los reintentos no duplican nada porque el mensaje se
 * guarda con su id de WhatsApp como clave única.
 *
 * Lo que se loguea es forma, nunca contenido: ni texto ni teléfonos.
 */
function rechazar(motivo: string, status: number): NextResponse {
  logger.warn('whatsapp-webhook: evento rechazado', { module: 'whatsapp-webhook', motivo, status })
  return NextResponse.json({ error: motivo }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // La firma es sobre el body CRUDO: hay que leerlo como texto antes de parsear.
  const raw = await req.text()
  if (!verifyKapsoSignature(raw, req.headers.get('x-webhook-signature'))) {
    return rechazar('invalid signature', 401)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return rechazar('invalid json', 400)
  }

  const events = normalizeKapsoPayload(body)
  const unknownShape = events.filter((e) => e.kind === 'ignored' && e.reason === 'shape').length
  if (unknownShape > 0) {
    // Se descartan con 200: si Kapso cambia el payload, el bot queda mudo y
    // esta es la única señal.
    captureMessage('whatsapp-webhook: eventos con una forma que el parser no conoce', 'warning')
    logger.warn('whatsapp-webhook: eventos con forma desconocida', {
      module: 'whatsapp-webhook',
      count: unknownShape,
    })
  }

  let result: Awaited<ReturnType<typeof ingestWhatsappEvents>>
  try {
    result = await ingestWhatsappEvents(events)
  } catch (err) {
    // La base no respondió: 500 para que Kapso reintente. Nada quedó a medias
    // que un reintento pueda duplicar.
    captureException(err)
    logger.error('whatsapp-webhook: no se pudo guardar el evento', {
      module: 'whatsapp-webhook',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'ingest failed' }, { status: 500 })
  }

  if (result.unknownNumbers > 0) {
    // Un número que mandó eventos y no está conectado a ningún complejo: una
    // baja a medias o un setup link que no terminó de registrarse.
    logger.warn('whatsapp-webhook: eventos de un número sin complejo', {
      module: 'whatsapp-webhook',
      count: result.unknownNumbers,
    })
  }

  try {
    await enqueueWhatsappTurns(result.chatsToProcess)
  } catch (err) {
    // El mensaje ya está guardado: el cron de rescate lo levanta en ~1 min.
    // Se contesta 200 igual, porque un reintento de Kapso no lo volvería a
    // encolar (el insert sería un no-op).
    captureException(err)
    logger.error('whatsapp-webhook: no se pudo encolar el turno, queda para el rescate', {
      module: 'whatsapp-webhook',
      chats: result.chatsToProcess.length,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return NextResponse.json({ ok: true })
}
