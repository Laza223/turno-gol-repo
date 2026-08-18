import { NextResponse } from 'next/server'
import { and, count, eq, lt, or, sql } from 'drizzle-orm'
import { withTenant } from '@/server/middleware/with-tenant'
import { bookings, courts, players } from '@/shared/db/schema'
import { sumBookingChargesByBooking } from '@/app/(admin)/reservas/queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { artTodayStr } from '@/shared/dates/art'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() })).toString('base64')
}

function decodeCursor(cursor: string): { id: string; createdAt: Date } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
      id: string
      createdAt: string
    }
    return { id: parsed.id, createdAt: new Date(parsed.createdAt) }
  } catch {
    return null
  }
}

export const GET = withTenant(
  async (req: NextRequest, user, tx) => {
    const { searchParams } = new URL(req.url)
    const dateParam = searchParams.get('date') ?? artTodayStr()
    const courtId = searchParams.get('court_id')
    const status = searchParams.get('status')
    const cursorParam = searchParams.get('cursor')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

    const tenantId = user.tenantId!
    const cursor = cursorParam ? decodeCursor(cursorParam) : null

    const filters = [
      eq(bookings.tenantId, tenantId),
      sql`${bookings.date} = ${dateParam}::date`,
      ...(courtId ? [eq(bookings.courtId, courtId)] : []),
      ...(status ? [sql`${bookings.status} = ${status}::booking_status`] : []),
    ]

    const cursorFilter = cursor
      ? or(
          lt(bookings.createdAt, cursor.createdAt),
          and(eq(bookings.createdAt, cursor.createdAt), lt(bookings.id, cursor.id)),
        )
      : undefined

    const whereClause = cursorFilter ? and(...filters, cursorFilter) : and(...filters)

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
      .where(whereClause)
      .orderBy(sql`${bookings.createdAt} DESC, ${bookings.id} DESC`)
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    const [totalRow] = await tx
      .select({ total: count() })
      .from(bookings)
      .where(and(...filters))

    const lastRow = pageRows[pageRows.length - 1]
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow.booking.id, lastRow.booking.createdAt) : null

    // Saldo por turno: la grilla lo usa para su alarma de "terminado sin cobrar",
    // y este endpoint es el que la reconcilia después de un evento de Realtime
    // (el payload de Realtime no trae cobros de mostrador). Una sola query
    // agregada para toda la página, con el MISMO predicado que el detalle del
    // turno — si divergen, la grilla y /reservas muestran saldos distintos.
    const chargesByBooking = await sumBookingChargesByBooking(
      tenantId,
      pageRows.map((r) => r.booking.id),
      tx,
    )

    const data = pageRows.map((r) => {
      const { totalPaid, pending } = summarizeBookingCharges({
        priceSnapshot: r.booking.priceSnapshot,
        depositAmount: r.booking.depositAmount,
        depositStatus: r.booking.depositStatus,
        chargesTotal: chargesByBooking.get(r.booking.id) ?? 0,
      })
      return {
        total_paid: totalPaid,
        pending,
        id: r.booking.id,
        court_id: r.booking.courtId,
        court: r.courtName ? { name: r.courtName } : null,
        player_id: r.booking.playerId,
        player: r.playerFirstName
          ? {
              first_name: r.playerFirstName,
              last_name: r.playerLastName,
              phone: r.playerPhone,
            }
          : null,
        guest_name: r.booking.guestName,
        guest_phone: r.booking.guestPhone,
        date: r.booking.date,
        time_start: r.booking.timeStart,
        time_end: r.booking.timeEnd,
        type: r.booking.type,
        status: r.booking.status,
        price_snapshot: r.booking.priceSnapshot,
        deposit_amount: r.booking.depositAmount,
        deposit_status: r.booking.depositStatus,
        payment_method: r.booking.paymentMethod,
        notes_internal: r.booking.notesInternal,
        created_by_staff: r.booking.createdByStaff,
        created_at: r.booking.createdAt,
      }
    })

    return NextResponse.json({
      data,
      pagination: {
        cursor: nextCursor,
        has_more: hasMore,
        total_count: totalRow?.total ?? 0,
      },
    })
  },
  // Rate-limit antes de abrir la transacción. Acá pesa más que en otros
  // endpoints: la grilla lo llama cada 30 segundos por pestaña abierta, así que
  // era un viaje a Upstash con una conexión del pool tomada, en loop y por cada
  // tablet del mostrador.
  { rateLimit: 'adminCrud' },
)
