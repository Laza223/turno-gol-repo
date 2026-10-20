/**
 * E2E — Cuenta del jugador: tus datos (audit T4, fase F8; migrado a /configuracion en el 2.4b)
 *
 * Covers /configuracion player area (antes /perfil, que ahora redirige):
 *   #1  Edit first name → Guardar cambios → "Guardado" → reload → value persists → DB assert.
 *   #2  Email is read-only (shown as text, not an input).
 *   #3  /perfil?tab=… redirects to the matching block of /configuracion.
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
      await page.goto('/configuracion')

      // Anchor on the heading first — the Nombre input is rendered in a
      // client component and can be briefly absent during hydration.
      await expect(page.getByRole('heading', { name: 'Mi cuenta', exact: true })).toBeVisible()

      // The label is "Nombre" (htmlFor="first_name")
      await expect(page.getByLabel('Nombre')).toBeVisible()
      await page.getByLabel('Nombre').fill('NombreNuevo')
      await page.getByRole('button', { name: 'Guardar cambios' }).click()

      // Wait for the server re-render triggered by revalidatePath — the
      // "Quién sos" block is server-rendered from the players row, so when the
      // name appears there we know the action committed AND the page
      // re-fetched.
      await expect(page.getByText('NombreNuevo Player')).toBeVisible({ timeout: 10_000 })

      // DB assertion
      const supabase = makeServiceClient()
      const { data: row, error } = await supabase
        .from('players')
        .select('first_name')
        .eq('id', E2E_PLAYER_ID)
        .single()

      expect(error).toBeNull()
      expect(row?.first_name).toBe('NombreNuevo')

      // Reload to verify the page re-renders with the new DB value.
      // Use getByRole('textbox') to avoid ambiguity: the AccountMenu button
      // has aria-label="Cuenta de NombreNuevo" which also contains "Nombre".
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('NombreNuevo')
    } finally {
      await ctx.close()
    }
  })

  test('email is readonly', async ({ browser, playerStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/configuracion')

      // Anchor on the page heading first so the checks below run on a stable DOM.
      await expect(page.getByRole('heading', { name: 'Mi cuenta', exact: true })).toBeVisible()

      // The hint confirming the email cannot be changed
      await expect(page.getByText('El email no se puede cambiar.')).toBeVisible()

      // Email is displayed as plain text (not an editable input).
      await expect(page.getByText(E2E_PLAYER_EMAIL)).toBeVisible()
      const emailInput = page.locator(`input[value="${E2E_PLAYER_EMAIL}"]`)
      await expect(emailInput).not.toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('/perfil redirects to the matching block of /configuracion', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(playerStorageState) })
    const page = await ctx.newPage()

    try {
      await page.goto('/perfil?tab=favoritos')
      await expect(page).toHaveURL(/\/configuracion#favoritos$/)
      await expect(page.getByRole('heading', { name: 'Favoritos', exact: true })).toBeVisible()

      await page.goto('/perfil?tab=datos')
      await expect(page).toHaveURL(/\/configuracion#tus-datos$/)

      await page.goto('/perfil')
      await expect(page).toHaveURL(/\/configuracion$/)
      await expect(page.getByRole('heading', { name: 'Mi cuenta', exact: true })).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
