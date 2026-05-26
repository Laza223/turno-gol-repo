import { test, expect } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const COURT_ID = '00000000-0000-4000-8000-000000000010'
const PLAYER_ID = '00000000-0000-4000-8000-000000000020'

/**
 * Aha Moment E2E: insert a player-created booking (created_by_staff IS NULL)
 * into the seeded E2E tenant, then verify the admin dashboard's onboarding
 * checklist surfaces "Primera reserva online recibida" as completed.
 *
 * The bookings table uses (date, time_start, time_end) — not starts_at/ends_at.
 * There is no booking_source column; created_by_staff=NULL is the sole signal.
 * Booking creation paths are exhaustively tested in unit + integration (B1).
 * This test isolates the dashboard checklist surface (F2 done-criteria #2
 * tail end).
 */
test.describe('aha moment — first online booking', () => {
  test('dashboard checklist reflects first online booking', async ({ browser, adminStorageState }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } })

    // Use a date tomorrow (YYYY-MM-DD) to satisfy any future-date constraints.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const bookingDate = tomorrow.toISOString().slice(0, 10)
    const bookingId = randomUUID()

    const { error: insertErr } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        tenant_id: TENANT_ID,
        court_id: COURT_ID,
        player_id: PLAYER_ID,
        date: bookingDate,
        time_start: '10:00:00',
        time_end: '11:00:00',
        status: 'confirmed',
        price_snapshot: 10000,
        deposit_amount: 0,
        deposit_status: 'not_required',
        created_by_staff: null,
      })
    if (insertErr) {
      throw new Error(`Insert booking failed: ${insertErr.message}`)
    }

    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/dashboard/)

      // The checklist item "Primera reserva online recibida" should be visible
      // and rendered as completed (CheckCircle2 icon instead of Circle, text
      // gets line-through + text-slate-400 class when done=true).
      const checklistItem = page.getByText(/primera reserva online recibida/i)
      await expect(checklistItem).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.close()
      // Cleanup: delete the test booking so subsequent runs start fresh.
      // If delete fails, surface the error — orphaned bookings pollute the
      // checklist surface for any other test asserting "no bookings yet".
      const { error: deleteErr } = await supabase.from('bookings').delete().eq('id', bookingId)
      if (deleteErr) {
        throw new Error(`Cleanup delete failed: ${deleteErr.message}`)
      }
    }
  })
})
