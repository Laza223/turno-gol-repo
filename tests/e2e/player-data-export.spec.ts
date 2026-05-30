/**
 * E2E — Player data export / ARCO acceso (audit T4, fase F8)
 *
 * Covers /configuracion → "Descargar mis datos" button (DataExportButton):
 *   #1  Click triggers a file download; filename matches expected pattern;
 *       parsed JSON bundle contains profile + bookings + payments + consents
 *       with the correct shape and values.
 *
 * Note: DataExportButton uses a programmatic anchor.click() on a Blob URL.
 * Playwright captures this as a download event when acceptDownloads: true
 * (which is the Playwright default).
 *
 * resetPlayer in beforeEach/afterEach ensures order independence.
 */

import { test, expect } from './fixtures'
import { makeServiceClient, resetPlayer, E2E_PLAYER_EMAIL } from './_helpers/player-seed'
import { readFile } from 'node:fs/promises'

test.describe('Player data export (ARCO)', () => {
  test.beforeEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test.afterEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test('downloads JSON bundle with profile + bookings + consents @critical', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({
      storageState: JSON.parse(playerStorageState),
      acceptDownloads: true,
    })
    const page = await ctx.newPage()

    try {
      await page.goto('/configuracion')
      await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Descargar mis datos' }).click(),
      ])

      // Filename format: turnogol-mis-datos-YYYY-MM-DD.json
      expect(download.suggestedFilename()).toMatch(
        /^turnogol-mis-datos-\d{4}-\d{2}-\d{2}\.json$/,
      )

      const path = await download.path()
      expect(path).toBeTruthy()

      const content = await readFile(path!, 'utf-8')
      const bundle = JSON.parse(content) as {
        profile: { email: string; first_name: string }
        bookings: unknown[]
        payments: unknown[]
        consents: { terms_accepted: boolean }
      }

      expect(bundle.profile.email).toBe(E2E_PLAYER_EMAIL)
      expect(bundle.profile.first_name).toBe('E2E')
      expect(Array.isArray(bundle.bookings)).toBe(true)
      expect(Array.isArray(bundle.payments)).toBe(true)
      expect(bundle.consents.terms_accepted).toBe(true)
    } finally {
      await ctx.close()
    }
  })
})
