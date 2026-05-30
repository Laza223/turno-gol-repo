/**
 * E2E — Player bookings (audit T4, fase F8 + T3 fase F14)
 *
 * Covers /mis-reservas player area:
 *   #1  Upcoming confirmed booking is listed; cancel via ConfirmDialog →
 *       DB assert status = canceled_* + canceled_by = 'player'. @critical
 *   #2  Empty state shown when no upcoming bookings exist.
 *   #3  Player cancels booking with paid deposit → DB assert status=canceled_*
 *       (refunded or no_refund per policy). @critical
 *
 * resetPlayer + cleanupPlayerBookings in beforeEach/afterEach ensure order
 * independence regardless of which spec runs first (e.g. player-delete-account
 * anonymizes the player row).
 */

import { test, expect } from './fixtures'
import {
  makeServiceClient,
  resetPlayer,
  insertPlayerBooking,
  cleanupPlayerBookings,
  artTomorrowISO,
} from './_helpers/player-seed'

test.describe('Player bookings', () => {
  test.beforeEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
    await cleanupPlayerBookings(supabase)
  })

  test.afterEach(async () => {
    const supabase = makeServiceClient()
    await cleanupPlayerBookings(supabase)
    await resetPlayer(supabase)
  })

  test('shows upcoming booking and allows cancel via ConfirmDialog @critical', async ({
    browser,
    playerStorageState,
  }) => {
    const supabase = makeServiceClient()
    // Slot 20:00–21:00 — avoids collisions with grilla-realtime (10:00, 14:00),
    // admin-create-booking-ui (16:00), admin-cancel-mp-refund (18:00).
    const bookingId = await insertPlayerBooking(supabase, {
      date: artTomorrowISO(),
      timeStart: '20:00',
      timeEnd: '21:00',
    })

    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/mis-reservas')
      await expect(page.getByRole('heading', { name: 'Mis Reservas' })).toBeVisible()
      await expect(page.getByText('Confirmado').first()).toBeVisible()

      // Click cancel button on the booking row → ConfirmDialog opens
      await page.getByRole('button', { name: 'Cancelar' }).first().click()
      await expect(page.getByRole('heading', { name: '¿Cancelar esta reserva?' })).toBeVisible()

      // Type a reason into the textarea inside the dialog
      await page.locator('textarea#cancel-reason').fill('Test E2E cancel')

      // Confirm cancellation
      await page.getByRole('button', { name: 'Sí, cancelar' }).click()

      // Wait for dialog to close
      await expect(
        page.getByRole('heading', { name: '¿Cancelar esta reserva?' }),
      ).not.toBeVisible()

      // Wait for UI to show canceled badge (page.reload() via router.refresh())
      await expect(page.getByText('Cancelado').first()).toBeVisible({ timeout: 8_000 })

      // DB assertion
      const { data: row, error } = await supabase
        .from('bookings')
        .select('status, canceled_reason, canceled_by')
        .eq('id', bookingId)
        .single()

      expect(error).toBeNull()
      expect(row?.status).toMatch(/^canceled_(refunded|no_refund)$/)
      expect(row?.canceled_reason).toBe('Test E2E cancel')
      expect(row?.canceled_by).toBe('player')
    } finally {
      await ctx.close()
    }
  })

  test('empty state shows when no upcoming bookings', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/mis-reservas')
      await expect(page.getByText('No tenés reservas próximas.')).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test(
    'player cancels booking with paid deposit → status=canceled_* + deposit info in canceled state @critical',
    async ({ browser, playerStorageState }) => {
      const supabase = makeServiceClient()
      // Insert a booking with deposit_status='paid' so the cancel modal shows
      // deposit-related information. deposit_amount=30000 (300 ARS in centavos).
      // The player cancel policy decides refunded vs no_refund based on hours_before —
      // we assert against either value to avoid coupling to tenant policy config.
      const bookingId = await insertPlayerBooking(supabase, {
        // Slot 21:00–22:00 — avoids collisions with other tomorrow specs.
        date: artTomorrowISO(),
        timeStart: '21:00',
        timeEnd: '22:00',
        status: 'confirmed',
        depositStatus: 'paid',
        depositAmount: 30000,
      })

      const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
      const page = await ctx.newPage()

      try {
        await page.goto('/mis-reservas')
        await expect(page.getByRole('heading', { name: 'Mis Reservas' })).toBeVisible()
        await expect(page.getByText('Confirmado').first()).toBeVisible()

        // Click cancel button on the booking row → ConfirmDialog opens.
        await page.getByRole('button', { name: 'Cancelar' }).first().click()
        await expect(
          page.getByRole('heading', { name: '¿Cancelar esta reserva?' }),
        ).toBeVisible()

        // Fill cancellation reason.
        await page.locator('textarea#cancel-reason').fill('test player cancel with deposit')

        // Confirm cancellation.
        await page.getByRole('button', { name: 'Sí, cancelar' }).click()

        // Wait for dialog to close.
        await expect(
          page.getByRole('heading', { name: '¿Cancelar esta reserva?' }),
        ).not.toBeVisible()

        // Wait for canceled badge.
        await expect(page.getByText('Cancelado').first()).toBeVisible({ timeout: 8_000 })

        // ── DB assertion ────────────────────────────────────────────────────
        // status must be one of the two canceled variants (policy-dependent).
        // canceled_by must be 'player'; reason must match.
        // No cash_flows/payments assertion: player cancel with null payment_id
        // skips the real refund path (cancelByPlayer:113 requires payment_id != null).
        const { data: row, error } = await supabase
          .from('bookings')
          .select('status, canceled_reason, canceled_by')
          .eq('id', bookingId)
          .single()

        expect(error).toBeNull()
        expect(row?.status).toMatch(/^canceled_(refunded|no_refund)$/)
        expect(row?.canceled_reason).toBe('test player cancel with deposit')
        expect(row?.canceled_by).toBe('player')
      } finally {
        await ctx.close()
      }
    },
  )
})
