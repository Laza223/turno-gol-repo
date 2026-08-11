/**
 * E2E — Player delete account / Ley 25.326 (audit T4, fase F8)
 *
 * Covers /eliminar-cuenta player area:
 *   #1  Open page → click "Eliminar mi cuenta" trigger → ConfirmDialog opens →
 *       confirm button disabled before typing email → type email → button
 *       enabled → confirm → redirect to /ingresar?deleted=1 → DB assert
 *       status='anonymized' + email contains '@anon.local' → PTR rows deleted.
 *
 * CRITICAL: this test anonymizes the player row.
 * resetPlayer in afterEach restores status='active' and PTR rows so that
 * subsequent specs in alphabetical order do not fail due to a missing player.
 */

import { test, expect } from './fixtures'
import {
  makeServiceClient,
  resetPlayer,
  E2E_PLAYER_ID,
  E2E_PLAYER_EMAIL,
} from './_helpers/player-seed'

test.describe('Player delete account (Ley 25.326)', () => {
  test.beforeEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test.afterEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test('type-to-confirm email → anonymize → redirect to ingresar @critical', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/eliminar-cuenta')

      await expect(page.getByRole('heading', { name: 'Eliminar mi cuenta' })).toBeVisible()
      await expect(page.getByText('Esta acción es irreversible')).toBeVisible()

      // Open ConfirmDialog via the page-level trigger button
      await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click()

      // Dialog is now open
      await expect(
        page.getByRole('heading', { name: '¿Eliminar tu cuenta TurnoGol?' }),
      ).toBeVisible()

      // The confirm button inside the dialog uses the same label "Eliminar mi cuenta".
      // Scope to the last one (dialog confirm) to avoid matching the trigger.
      const confirmButton = page.getByRole('button', { name: 'Eliminar mi cuenta' }).last()

      // Must be disabled before typing the confirmation phrase
      await expect(confirmButton).toBeDisabled()

      // Type the email into the type-to-confirm input (label: "Escribí <email> para confirmar")
      await page.locator('#confirm-phrase').fill(E2E_PLAYER_EMAIL)

      // Now enabled
      await expect(confirmButton).toBeEnabled()

      await confirmButton.click()

      // Should redirect to /ingresar (with ?deleted=1)
      await page.waitForURL(/\/ingresar(\?.*)?$/, { timeout: 10_000 })

      // DB assertion: player anonymized
      const supabase = makeServiceClient()
      const { data: player, error } = await supabase
        .from('players')
        .select('status, email')
        .eq('id', E2E_PLAYER_ID)
        .single()

      expect(error).toBeNull()
      expect(player?.status).toBe('anonymized')
      expect(player?.email).toMatch(/@anon\.local$/)

      // PTR rows should be deleted by anonymize
      const { data: ptrRows, error: ptrErr } = await supabase
        .from('player_tenant_relationships')
        .select('player_id')
        .eq('player_id', E2E_PLAYER_ID)

      expect(ptrErr).toBeNull()
      expect((ptrRows ?? []).length).toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
