/**
 * E2E — Reservas CRUD (audit T5, fase F04)
 *
 * Happy path + 3 edge cases for the admin reservas UI:
 *   #1  Happy — complete: INSERT a past confirmed booking → detail → "Marcar completada" → status = completed
 *   #2  Edge — cancel with paid deposit: INSERT confirmed booking with deposit_status='paid' (cash) →
 *              detail → "Cancelar" → refund radios shown + reason required → cancel → status = canceled
 *   #3  Edge — cancel blocked without reason: open cancel dialog → leave reason empty → confirm → error shown
 *   #4  Edge — no-show: INSERT confirmed past booking → detail → "Marcar ausente" → status = no_show
 *
 * NOTE: Live E2E execution requires a running Next.js dev/prod server + Supabase DB
 *       + `pnpm e2e:seed`. Delegated to CI; these specs typecheck locally.
 */

import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// ── Seeded E2E constants (matches scripts/seed-e2e.ts) ──────────────────────
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'
const STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

// Use a well-known past date for bookings that need to be "in the past" (complete/no-show).
// This avoids collisions with "today" data and the grilla-realtime test which uses TARGET_DATE (tomorrow).
const PAST_DATE = '2020-06-15'

// Use a far-future date for a booking that should remain active (cancel test).
// Well separated from grilla-realtime's TARGET_DATE (tomorrow).
const FUTURE_DATE = '2099-12-20'

// ── Service-role client factory ──────────────────────────────────────────────
function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required for E2E reservas tests',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

type InsertBookingOpts = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status?: string
  depositStatus?: string
  depositAmount?: number
  paymentMethod?: string | null
}

// Service-role booking INSERT — bypasses RLS.
// NOT NULL columns: id, tenant_id, court_id, date, time_start, time_end, type, status,
//   price_snapshot, deposit_amount, deposit_status, created_by_staff.
async function insertBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: InsertBookingOpts,
): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    id: opts.id,
    tenant_id: TENANT_ID,
    court_id: COURT_ID,
    date: opts.date,
    time_start: `${opts.timeStart}:00`,
    time_end: `${opts.timeEnd}:00`,
    type: 'spontaneous',
    status: opts.status ?? 'confirmed',
    price_snapshot: 10000,
    deposit_amount: opts.depositAmount ?? 0,
    deposit_status: opts.depositStatus ?? 'not_required',
    payment_method: opts.paymentMethod ?? null,
    guest_name: 'E2E Reservas Guest',
    guest_phone: '+5491100000000',
    created_by_staff: STAFF_USER_ID,
  })
  if (error) throw new Error(`Service-role booking INSERT failed: ${error.message}`)
}

async function deleteBooking(
  supabase: ReturnType<typeof makeServiceClient>,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('bookings').delete().eq('id', id)
  if (error) throw new Error(`Cleanup DELETE failed: ${error.message}`)
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — Happy: mark booking as completed
// ════════════════════════════════════════════════════════════════════════════
test.describe('reservas — happy: mark completed', () => {
  test(
    'INSERT past confirmed booking → detail → Marcar completada → shows Completada status',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const bookingId = randomUUID()

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        // Insert a confirmed booking in the past (time_end is past → completeBooking allowed).
        await insertBooking(supabase, {
          id: bookingId,
          date: PAST_DATE,
          timeStart: '10:00',
          timeEnd: '11:00',
        })

        // Navigate to the booking detail page.
        await page.goto(`/reservas/${bookingId}`)
        await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
          timeout: 15_000,
        })

        // The booking must be confirmed for the action buttons to appear.
        await expect(page.getByText('Confirmada')).toBeVisible()

        // Click "Marcar completada".
        await page.getByRole('button', { name: 'Marcar completada' }).click()

        // After router.refresh() the status badge should update to "Completada".
        await expect(page.getByText('Completada')).toBeVisible({ timeout: 10_000 })

        // The action buttons must disappear (BookingActions returns null when status != 'confirmed').
        await expect(page.getByRole('button', { name: 'Marcar completada' })).not.toBeVisible()
      } finally {
        await context.close()
        await deleteBooking(supabase, bookingId)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — Edge: cancel with paid cash deposit shows refund radios
// ════════════════════════════════════════════════════════════════════════════
test.describe('reservas — edge: cancel with paid deposit', () => {
  test(
    'INSERT confirmed booking with cash deposit → "Cancelar" → refund radios visible → cancel with reason → canceled status @critical',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const bookingId = randomUUID()

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        // cash payment_method → no real MercadoPago call on refund.
        await insertBooking(supabase, {
          id: bookingId,
          date: FUTURE_DATE,
          timeStart: '14:00',
          timeEnd: '15:00',
          depositStatus: 'paid',
          depositAmount: 50000, // 500 ARS in centavos
          paymentMethod: 'cash',
        })

        await page.goto(`/reservas/${bookingId}`)
        await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
          timeout: 15_000,
        })

        // Open the cancel dialog.
        await page.getByRole('button', { name: 'Cancelar' }).click()

        // ConfirmDialog should open with title "Cancelar reserva".
        // Use heading role: the dialog also contains a confirm button labelled
        // "Cancelar reserva", so getByText would resolve 2 elements (strict mode).
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Cancelar reserva' })).toBeVisible()

        // Refund radios must be shown (hasPaidDeposit = true).
        await expect(page.getByText('¿Reembolsar la seña?')).toBeVisible()
        await expect(page.getByRole('radio', { name: /Sin reembolso/i })).toBeVisible()
        await expect(page.getByRole('radio', { name: /Con reembolso/i })).toBeVisible()

        // Refund warning text must mention the deposit amount.
        // Amount is 500 ARS — formatted as "$ 500" or similar by Intl.NumberFormat es-AR.
        await expect(page.locator('.rounded-md.bg-amber-50')).toBeVisible()

        // The reason textarea must be present.
        await expect(page.locator('#cancel-reason')).toBeVisible()

        // Choose "Con reembolso" radio, type a reason, then confirm.
        await page.getByRole('radio', { name: /Con reembolso/i }).click()
        await page.locator('#cancel-reason').fill('Cancelación de prueba E2E con reembolso')
        await page.getByRole('button', { name: 'Cancelar reserva' }).click()

        // After success the dialog closes and status updates to Cancelada.
        // Use dd filter — getByText(/Cancelada/i) also matches the toast
        // ("Reserva cancelada") + aria-live announcement (strict mode).
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(page.locator('dd').filter({ hasText: /Cancelada/i })).toBeVisible({ timeout: 10_000 })

        // Action buttons must disappear.
        await expect(page.getByRole('button', { name: 'Cancelar' })).not.toBeVisible()
      } finally {
        await context.close()
        await deleteBooking(supabase, bookingId)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — Edge: cancel blocked without reason
// ════════════════════════════════════════════════════════════════════════════
test.describe('reservas — edge: cancel blocked without reason', () => {
  test(
    'INSERT confirmed booking → cancel dialog → empty reason → confirm → error shown, dialog stays open',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      // Use a distinct time slot to avoid exclusion constraint conflicts.
      const bookingId = randomUUID()

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        await insertBooking(supabase, {
          id: bookingId,
          date: FUTURE_DATE,
          timeStart: '16:00',
          timeEnd: '17:00',
        })

        await page.goto(`/reservas/${bookingId}`)
        await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
          timeout: 15_000,
        })

        // Open the cancel dialog.
        await page.getByRole('button', { name: 'Cancelar' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()

        // Leave #cancel-reason empty and click confirm.
        // (We don't fill the textarea — it's blank by default)
        await page.getByRole('button', { name: 'Cancelar reserva' }).click()

        // Error message should appear (onConfirmCancel returns { success: false, error: 'Ingresá un motivo...' }).
        await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 })
        await expect(page.getByRole('alert')).toContainText(/Ingresá un motivo/i)

        // Dialog must stay open — booking still confirmed.
        // Use heading role (dialog also has confirm button with same label).
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Cancelar reserva' })).toBeVisible()
      } finally {
        await context.close()
        await deleteBooking(supabase, bookingId)
      }
    },
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TEST 4 — Edge: no-show
// ════════════════════════════════════════════════════════════════════════════
test.describe('reservas — edge: no-show', () => {
  test(
    'INSERT past confirmed booking → "Marcar ausente" → confirm → status = Ausente',
    async ({ browser, adminStorageState }) => {
      const supabase = makeServiceClient()
      const bookingId = randomUUID()

      const context = await browser.newContext()
      try {
        await context.addCookies(JSON.parse(adminStorageState).cookies)
        const page = await context.newPage()

        // Insert a past booking (time in the past → no-show allowed by the service).
        await insertBooking(supabase, {
          id: bookingId,
          date: PAST_DATE,
          timeStart: '12:00',
          timeEnd: '13:00',
        })

        await page.goto(`/reservas/${bookingId}`)
        await expect(page.getByRole('heading', { name: 'Detalle de la reserva' })).toBeVisible({
          timeout: 15_000,
        })

        await expect(page.getByText('Confirmada')).toBeVisible()

        // Click "Marcar ausente" to open the no-show ConfirmDialog.
        await page.getByRole('button', { name: 'Marcar ausente' }).click()

        // Dialog title: "Marcar como ausente"
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByText('Marcar como ausente')).toBeVisible()

        // Confirm by clicking the dialog's confirm button "Marcar ausente".
        await page.getByRole('button', { name: 'Marcar ausente' }).last().click()

        // After router.refresh() the status badge should update to "Ausente".
        // Use the dd badge selector specifically: getByText('Ausente') also matches
        // the success toast ("Marcada como ausente", case-insensitive substring).
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
        await expect(page.locator('dd').filter({ hasText: 'Ausente' })).toBeVisible({ timeout: 10_000 })

        // Action buttons must disappear (status != 'confirmed').
        await expect(page.getByRole('button', { name: 'Marcar ausente' })).not.toBeVisible()
      } finally {
        await context.close()
        await deleteBooking(supabase, bookingId)
      }
    },
  )
})
