/**
 * E2E — Player profile (audit T4, fase F8)
 *
 * Covers /perfil player area:
 *   #1  Edit first name → Guardar cambios → "Perfil actualizado" toast →
 *       reload → value persists → DB assert.
 *   #2  Email field is read-only (rendered as a div, not an input).
 *
 * resetPlayer in beforeEach/afterEach restores known-good state for order independence.
 */

import { test, expect } from './fixtures'
import {
  makeServiceClient,
  resetPlayer,
  E2E_PLAYER_ID,
  E2E_PLAYER_EMAIL,
} from './_helpers/player-seed'

test.describe('Player profile', () => {
  test.beforeEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test.afterEach(async () => {
    const supabase = makeServiceClient()
    await resetPlayer(supabase)
  })

  test('edit firstName persists', async ({ browser, playerStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/perfil')

      // The label is "Nombre" (htmlFor="first_name")
      await expect(page.getByLabel('Nombre')).toBeVisible()
      await page.getByLabel('Nombre').fill('NombreNuevo')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()

      // Wait for the success status message
      await expect(page.getByText('Perfil actualizado')).toBeVisible({ timeout: 5_000 })

      // Reload to verify persistence (server re-renders with DB value)
      await page.reload()
      await expect(page.getByLabel('Nombre')).toHaveValue('NombreNuevo')

      // DB assertion
      const supabase = makeServiceClient()
      const { data: row, error } = await supabase
        .from('players')
        .select('first_name')
        .eq('id', E2E_PLAYER_ID)
        .single()

      expect(error).toBeNull()
      expect(row?.first_name).toBe('NombreNuevo')
    } finally {
      await ctx.close()
    }
  })

  test('email is readonly', async ({ browser, playerStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/perfil')

      // The hint text confirming email cannot be changed
      await expect(page.getByText('El email no puede modificarse.')).toBeVisible()

      // Email is displayed as a div (not an editable input)
      await expect(page.getByText(E2E_PLAYER_EMAIL)).toBeVisible()

      // Assert there is no <input> element with the email value
      const emailInput = page.locator(`input[value="${E2E_PLAYER_EMAIL}"]`)
      await expect(emailInput).not.toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
