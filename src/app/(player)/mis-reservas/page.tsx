import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { getCancellationPreview } from '@/modules/bookings/cancellation-preview'
import { MisReservasView, type MisReservasBookingRow } from './MisReservasView'
import { cancelMyBookingAction } from './actions'
import { countUpcomingPlayable } from './upcoming-count'

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function nowMs(): number {
  return Date.now()
}

/**
 * Fila cruda de la query — además de lo que necesita MisReservasBookingRow,
 * trae los insumos para calcular la consecuencia de cancelar AHORA (ENS-2):
 * `starts_at` es el instante físico (TIMESTAMPTZ) que usa `cancelByPlayer`
 * como fuente de verdad, no una reconstrucción a mano de date+time_start.
 */
type RawMisReservasRow = {
  id: string
  date: string
  time_start: string
  time_end: string
  type: string
  status: string
  price_snapshot: number
  court_name: string
  tenant_name: string
  tenant_slug: string
  has_review: boolean
  deposit_status: string
  deposit_amount: number
  starts_at: string
  cancellation_policy_hours: number
}

export default async function MisReservasPage(
  props: {
    searchParams: Promise<{ tab?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const user = await extractAuthUser()
  if (!user || user.type !== 'player')
    redirect(`/ingresar?next=${encodeURIComponent('/mis-reservas')}`)

  const today = artToday()
  const tab = searchParams.tab === 'historial' ? 'historial' : 'proximos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.execute(sql`
      SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
             b.type, b.status, b.price_snapshot,
             b.deposit_status, b.deposit_amount, b.starts_at,
             c.name AS court_name, t.name AS tenant_name, t.slug AS tenant_slug,
             COALESCE((t.settings->'cancellation_policy'->>'hours_before')::int, 24) AS cancellation_policy_hours,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.player_id = ${user.playerId}
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT 200
    `),
  )

  const rawRows = rows as unknown as RawMisReservasRow[]

  // ENS-2: consecuencia concreta de cancelar AHORA, calculada server-side con
  // la misma política que cancelByPlayer (getCancellationPreview reusa
  // decideAdminRefund) — no se le pide al front que reconstruya el umbral.
  // Un solo `now` para todo el batch, aislado en nowMs() (mismo patrón que
  // artToday() más arriba: react-compiler no marca "impuro" un Date.now()
  // envuelto en su propia función).
  const now = nowMs()
  const allBookings: MisReservasBookingRow[] = rawRows.map((r) => {
    const preview = getCancellationPreview({
      depositStatus: r.deposit_status,
      depositAmountCents: r.deposit_amount,
      bookingStartUtcMs: new Date(r.starts_at).getTime(),
      policyHours: r.cancellation_policy_hours,
      nowMs: now,
    })
    return {
      id: r.id,
      date: r.date,
      time_start: r.time_start,
      time_end: r.time_end,
      type: r.type,
      status: r.status,
      price_snapshot: r.price_snapshot,
      court_name: r.court_name,
      tenant_name: r.tenant_name,
      tenant_slug: r.tenant_slug,
      has_review: r.has_review,
      cancellation_outcome: preview.kind,
      deposit_amount: preview.kind === 'no_deposit' ? 0 : preview.amountCents,
    }
  })

  const bookings = allBookings.filter((b) =>
    tab === 'proximos' ? b.date >= today : b.date < today,
  )
  const upcomingCount = countUpcomingPlayable(allBookings, today)

  return (
    <MisReservasView
      bookings={bookings}
      tab={tab}
      upcomingCount={upcomingCount}
      cancelAction={cancelMyBookingAction}
    />
  )
}
