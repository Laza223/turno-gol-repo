import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import { withTenantContext } from '@/shared/db/client'
import { secretMatches } from '@/shared/security/secret-compare'
import { notFound, badRequest, validationError, conflict, internal } from '@/shared/api-error'
import { captureException } from '@/lib/sentry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Header con el secreto compartido. Server-only: NO empieza con NEXT_PUBLIC_. */
export const E2E_SECRET_HEADER = 'x-e2e-secret'

/** Largo mínimo del secreto — un valor corto no es un secreto, es un adorno. */
const MIN_SECRET_LENGTH = 16

/**
 * Este endpoint crea reservas reales saltando TODO: sesión, bans, softbans,
 * seña. El `playerId` sale de un header sin verificar, así que quien lo alcanza
 * reserva en nombre de cualquier jugador. Existe únicamente para
 * `pnpm stress:bookings`, que necesita 50 POST concurrentes de verdad contra el
 * exclusion constraint.
 *
 * B10 — antes el portón era `NEXT_PUBLIC_E2E === '1'`, y eso tiene dos
 * problemas. El chico: `NEXT_PUBLIC_*` se INLINEA en build, así que el valor que
 * decide es el del momento de compilar y no el del runtime. El grande: la única
 * barrera efectiva terminaba siendo `NODE_ENV !== 'production'` — cierta hoy
 * (todo `next build` fija `production`, previews incluidos, y ahí la función
 * colapsa a `false`), pero es una propiedad implícita de Next que nadie
 * re-verifica, sosteniendo sola un endpoint que escribe en la base sin auth.
 *
 * Ahora el portón es un secreto server-only que además hay que presentar: sin
 * `E2E_ENDPOINT_SECRET` configurado la ruta no existe, y conocer la URL no
 * alcanza. `NODE_ENV` se mantiene como segunda barrera, no como la única.
 */
function e2eSecret(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  const secret = process.env.E2E_ENDPOINT_SECRET
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

const bodySchema = z.object({
  tenantId: z.guid(),
  courtId: z.guid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = e2eSecret()
  if (!secret) return notFound('No encontrado.')
  // 404 y no 401 a propósito: un secreto que no matchea no debe confirmar que
  // la ruta existe. La respuesta es idéntica a la de un endpoint inexistente.
  const provided = req.headers.get(E2E_SECRET_HEADER)
  if (provided === null || !secretMatches(provided, secret)) return notFound('No encontrado.')

  const playerId = req.headers.get('x-e2e-player-id')
  if (!playerId) {
    return badRequest('Falta el header del jugador.', { code: 'MISSING_PLAYER_HEADER' })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  try {
    const booking = await withTenantContext(parsed.data.tenantId, (tx) =>
      createOnlineBooking(
        parsed.data.tenantId,
        {
          playerId,
          courtId: parsed.data.courtId,
          date: parsed.data.date,
          timeStart: parsed.data.timeStart,
          timeEnd: parsed.data.timeEnd,
          // E2E tenant has requires_deposit=false → booking confirms without MP.
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    )
    return NextResponse.json({ bookingId: booking.id }, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown'
    if (e instanceof SlotTakenError || /SlotTaken|exclusion|23P01/i.test(msg)) {
      return conflict('El turno ya fue tomado.', { code: 'SLOT_TAKEN' })
    }
    captureException(e)
    return internal('No se pudo crear la reserva de prueba.', { code: 'E2E_BOOKING_FAILED' })
  }
}
