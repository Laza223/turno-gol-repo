import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { getWorkerDb } from '@/shared/db/client'
import { uuid } from '@/shared/validation/primitives'
import { mockPay, mockReject, mockCancel } from './actions'
import { MockCheckoutView, type MockBookingSummary } from './MockCheckoutView'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

type SearchParams = { booking?: string; pref?: string }

async function loadBookingSummary(bookingId: string): Promise<MockBookingSummary | null> {
  // This is a TEST-ONLY page. Reads `bookings`/`courts` (RLS-isolated, FORCE
  // RLS) cross-tenant with no auth / no tenant SET LOCAL — under the
  // restricted `turnogol_app` pool that returns 0 rows, not a bypass. Needs
  // the worker pool (bypass-capable), same reasoning as getStaffTenant.
  const db = getWorkerDb()
  const rows = (await db.execute(sql`
    SELECT
      b.deposit_amount,
      b.date::text,
      b.time_start::text,
      b.time_end::text,
      c.name AS court_name,
      t.name AS tenant_name,
      t.id   AS tenant_id
    FROM bookings b
    JOIN courts  c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `)) as unknown as MockBookingSummary[]
  return rows[0] ?? null
}

export default async function MockMpCheckoutPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams
  // 404 in production — this page must never be reachable outside mock mode.
  if (process.env.MP_MOCK_MODE !== '1') notFound()

  const bookingId = searchParams.booking
  // #32: un ?booking= no-UUID llegaba al WHERE b.id = $1 (columna uuid) y Postgres
  // rechazaba el cast -> 500. Validar el formato primero para devolver 404.
  if (!bookingId || !uuid.safeParse(bookingId).success) notFound()

  const booking = await loadBookingSummary(bookingId)
  if (!booking) notFound()

  return (
    <MockCheckoutView
      booking={booking}
      bookingId={bookingId}
      payAction={mockPay}
      rejectAction={mockReject}
      cancelAction={mockCancel}
    />
  )
}
