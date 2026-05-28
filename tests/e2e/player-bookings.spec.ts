/**
 * E2E — Player bookings (audit T4, fase F8)
 *
 * Covers /mis-reservas player area:
 *   #1  Upcoming confirmed booking is listed; cancel via ConfirmDialog →
 *       DB assert status = canceled_* + canceled_by = 'player'.
 *   #2  Empty state shown when no upcoming bookings exist.
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

  test('shows upcoming booking and allows cancel via ConfirmDialog', async ({
    browser,
    playerStorageState,
  }) => {
    const supabase = makeServiceClient()
    const bookingId = await insertPlayerBooking(supabase, { date: artTomorrowISO() })

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
})
