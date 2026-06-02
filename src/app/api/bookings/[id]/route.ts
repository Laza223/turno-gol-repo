import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { badRequest, notFound, validationError } from '@/shared/api-error'
import { bookings, courts, players } from '@/shared/db/schema'

export const dynamic = 'force-dynamic'

const updateNotesSchema = z.object({
  notes_internal: z.string().max(2000).optional(),
  notes_player: z.string().max(1000).optional(),
})

export const GET = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req)
  if ('response' in idResult) return idResult.response
  const bookingId = idResult.uuid

  const rows = await tx
    .select({
      booking: bookings,
      courtName: courts.name,
      playerFirstName: players.firstName,
      playerLastName: players.lastName,
      playerPhone: players.phone,
    })
    .from(bookings)
    .leftJoin(courts, eq(bookings.courtId, courts.id))
    .leftJoin(players, eq(bookings.playerId, players.id))
    .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, user.tenantId!)))
    .limit(1)

  const row = rows[0]
  if (!row) return notFound('La reserva no existe.')

  return NextResponse.json({
    data: {
      id: row.booking.id,
      court_id: row.booking.courtId,
      court: row.courtName ? { name: row.courtName } : null,
      player_id: row.booking.playerId,
      player: row.playerFirstName
        ? {
            first_name: row.playerFirstName,
            last_name: row.playerLastName,
            phone: row.playerPhone,
          }
        : null,
      guest_name: row.booking.guestName,
      guest_phone: row.booking.guestPhone,
      date: row.booking.date,
      time_start: row.booking.timeStart,
      time_end: row.booking.timeEnd,
      type: row.booking.type,
      status: row.booking.status,
      price_snapshot: row.booking.priceSnapshot,
      deposit_amount: row.booking.depositAmount,
      deposit_status: row.booking.depositStatus,
      notes_internal: row.booking.notesInternal,
      notes_player: row.booking.notesPlayer,
      created_by_staff: row.booking.createdByStaff,
      created_at: row.booking.createdAt,
      updated_at: row.booking.updatedAt,
    },
  })
})

export const PATCH = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req)
  if ('response' in idResult) return idResult.response
  const bookingId = idResult.uuid

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = updateNotesSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  const updates: {
    notesInternal?: string
    notesPlayer?: string
    updatedAt: Date
  } = { updatedAt: new Date() }
  if (parsed.data.notes_internal !== undefined) updates.notesInternal = parsed.data.notes_internal
  if (parsed.data.notes_player !== undefined) updates.notesPlayer = parsed.data.notes_player

  const rows = await tx
    .update(bookings)
    .set(updates)
    .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, user.tenantId!)))
    .returning()

  if (rows.length === 0) return notFound('La reserva no existe.')
  return NextResponse.json({ data: rows[0] })
})
