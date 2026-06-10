import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, businessRule, conflict, forbidden, notFound, validationError } from '@/shared/api-error'
import { tenants } from '@/shared/db/schema'
import {
  createOnlineBooking,
  getAvailableSlots,
} from '@/modules/bookings/booking.service'
import {
  BookingDateOutOfRangeError,
  CourtOfflineError,
  PlayerBannedError,
  PlayerHasOutstandingBalanceError,
  PriceUnavailableError,
  SlotTakenError,
} from '@/modules/bookings/booking.errors'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

export const dynamic = 'force-dynamic'

export const GET = withPlayer(async (req: NextRequest, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  const tab = req.nextUrl.searchParams.get('tab') ?? 'upcoming'
  const dateFilter =
    tab === 'history'
      ? sql`AND b.date < NOW()::date`
      : sql`AND b.date >= NOW()::date`

  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
           b.type, b.status, b.price_snapshot, b.deposit_status,
           c.name AS court_name,
           t.name AS tenant_name, t.slug AS tenant_slug
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.player_id = ${user.playerId} ${dateFilter}
    ORDER BY b.date DESC, b.time_start DESC
    LIMIT 100
  `)

  return NextResponse.json({ data: { bookings: rows } })
})

const BLOCKED_STATUSES = ['deleted', 'blocked', 'canceled', 'churned'] as const

const playerBookingSchema = z.object({
  tenant_slug: z.string().min(1),
  court_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_start: z.string().regex(/^\d{2}:\d{2}$/),
  time_end: z.string().regex(/^\d{2}:\d{2}$/),
  duration_mins: z.union([z.literal(60), z.literal(120)]),
  notes_player: z.string().max(1000).optional(),
})

export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = playerBookingSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  const tenantRows = await tx
    .select({ id: tenants.id, settings: tenants.settings, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.slug, parsed.data.tenant_slug))
    .limit(1)

  const tenant = tenantRows[0]
  if (!tenant || BLOCKED_STATUSES.includes(tenant.status as typeof BLOCKED_STATUSES[number])) {
    return notFound('El complejo no existe.')
  }

  // Set tenant context in the same player tx so PTR ON CONFLICT DO UPDATE
  // passes tenant_isolation_update RLS policy.
  await tx.execute(
    sql`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`,
  )

  const settings = tenant.settings as TenantSettings

  try {
    const booking = await createOnlineBooking(
      tenant.id,
      {
        playerId: user.playerId,
        courtId: parsed.data.court_id,
        date: parsed.data.date,
        timeStart: parsed.data.time_start,
        timeEnd: parsed.data.time_end,
        durationMins: parsed.data.duration_mins,
        requiresDeposit: settings.requires_deposit,
        depositPercentage: settings.deposit_percentage,
        notesPlayer: parsed.data.notes_player,
        maxAdvanceDays: settings.booking_advance_days ?? 6,
      },
      tx,
    )

    return NextResponse.json({ data: { booking } }, { status: 201 })
  } catch (err) {
    if (err instanceof BookingDateOutOfRangeError) {
      return businessRule('La fecha seleccionada no es válida para reservar.', {
        code: 'DATE_OUT_OF_RANGE',
        details: { reason: err.reason },
      })
    }
    if (err instanceof PlayerBannedError) {
      return forbidden('No podés reservar en este complejo actualmente.', {
        code: 'PLAYER_BANNED',
        details: { reason: err.reason ?? 'PLAYER_BANNED', global: err.bannedGlobal },
      })
    }
    if (err instanceof PlayerHasOutstandingBalanceError) {
      return businessRule(
        'Tenés un saldo pendiente con este complejo. Regularizá tu deuda para volver a reservar online.',
        { code: 'PLAYER_HAS_DEBT' },
      )
    }
    if (err instanceof SlotTakenError) {
      const alternatives = await getAlternatives(
        tenant.id,
        parsed.data.court_id,
        parsed.data.date,
        parsed.data.duration_mins,
        tx,
      )
      return conflict('Este turno acaba de ser tomado por otro jugador.', {
        code: 'SLOT_UNAVAILABLE',
        details: { suggested_alternatives: alternatives },
      })
    }
    if (err instanceof CourtOfflineError) {
      return businessRule('La cancha no está disponible.')
    }
    if (err instanceof PriceUnavailableError) {
      return businessRule('No hay precio configurado para este horario.')
    }
    throw err
  }
})

async function getAlternatives(
  tenantId: string,
  courtId: string,
  date: string,
  durationMins: 60 | 120,
  tx: Parameters<typeof createOnlineBooking>[2],
) {
  const slots = await getAvailableSlots(tenantId, courtId, date, durationMins, tx)
  return slots
    .filter((s) => s.available)
    .slice(0, 3)
    .map((s) => ({ time_start: s.timeStart, time_end: s.timeEnd, price: s.price }))
}
