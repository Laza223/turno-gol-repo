import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { getDb } from '@/shared/db/client'
import { uuid } from '@/shared/validation/primitives'
import { mockPay, mockReject, mockCancel } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

type SearchParams = { booking?: string; pref?: string }

type BookingRow = {
  deposit_amount: number
  date: string
  time_start: string
  time_end: string
  court_name: string
  tenant_name: string
  tenant_id: string
}

async function loadBookingSummary(bookingId: string): Promise<BookingRow | null> {
  // This is a TEST-ONLY page. We use the service-role db client directly
  // (no RLS context needed — test page, no auth, no tenant SET LOCAL).
  const db = getDb()
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
  `)) as unknown as BookingRow[]
  return rows[0] ?? null
}

function formatPesos(centavos: number): string {
  return (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export default async function MockMpCheckoutPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  // 404 in production — this page must never be reachable outside mock mode.
  if (process.env.MP_MOCK_MODE !== '1') notFound()

  const bookingId = searchParams.booking
  // #32: un ?booking= no-UUID llegaba al WHERE b.id = $1 (columna uuid) y Postgres
  // rechazaba el cast -> 500. Validar el formato primero para devolver 404.
  if (!bookingId || !uuid.safeParse(bookingId).success) notFound()

  const booking = await loadBookingSummary(bookingId)
  if (!booking) notFound()

  const timeStart = booking.time_start.slice(0, 5)
  const timeEnd = booking.time_end.slice(0, 5)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-12">
      {/* Mock banner */}
      <div className="mb-6 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="mr-1" aria-hidden>⚠</span>
        <strong>Entorno de prueba (MOCK)</strong> — no se cobra dinero real.
      </div>

      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
          MercadoPago — simulador
        </p>
        <h1 className="text-xl font-bold text-slate-900">Pago de seña</h1>

        {/* Booking details */}
        <dl className="mt-5 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Complejo</dt>
            <dd className="font-medium text-slate-800">{booking.tenant_name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Cancha</dt>
            <dd className="font-medium text-slate-800">{booking.court_name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Fecha</dt>
            <dd className="font-medium text-slate-800">{booking.date}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Horario</dt>
            <dd className="font-medium text-slate-800">
              {timeStart}–{timeEnd}
            </dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-700">Seña</dt>
            <dd className="font-bold text-slate-900">
              ${formatPesos(booking.deposit_amount)}
            </dd>
          </div>
        </dl>

        {/* Action buttons */}
        <form className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="booking" value={bookingId} />

          {/* Pay (approved) */}
          <button
            type="submit"
            formAction={mockPay}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Pagar (aprobado)
          </button>

          {/* Reject */}
          <button
            type="submit"
            formAction={mockReject}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white px-5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            Pago rechazado
          </button>

          {/* Cancel */}
          <button
            type="submit"
            formAction={mockCancel}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          ID de reserva: {bookingId}
        </p>
      </div>
    </div>
  )
}
