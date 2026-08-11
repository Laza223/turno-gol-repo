import { test, expect } from '../fixtures'
import { E2E_PLAYER_EMAIL } from '../_helpers/player-seed'

/**
 * Flow 7 doc7 — Player magic link UI (T4 F14)
 *
 * /ingresar es el acceso exclusivo del jugador (magic link sin contraseña).
 * /login es solo para staff (email+password). El jugador ya no necesita ningún
 * toggle: el form de email aparece directamente en /ingresar.
 *
 * Usa browser.newContext() SIN storageState para evitar el redirect a
 * /mis-reservas del playerStorageState (riesgo R5). El form usa noValidate.
 */

test.describe('player magic link (acceso directo en /ingresar)', () => {
  test('player pide magic link desde /ingresar → mensaje de enlace enviado @critical', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto('/ingresar')

      await page.getByLabel(/email/i).fill(E2E_PLAYER_EMAIL)
      await page.getByRole('button', { name: /enviarme el enlace/i }).click()

      await expect(page.getByText(/te enviamos un enlace de acceso/i)).toBeVisible({
        timeout: 10_000,
      })
      await expect(page).not.toHaveURL(/\/mis-reservas/)
    } finally {
      await ctx.close()
    }
  })

  test('player envía email vacío → error, sigue en /ingresar', async ({ browser }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto('/ingresar')

      await page.getByRole('button', { name: /enviarme el enlace/i }).click()

      await expect(page.getByText(/te enviamos un enlace de acceso/i)).not.toBeVisible({
        timeout: 2_000,
      })
      await expect(page).toHaveURL(/\/ingresar/)
    } finally {
      await ctx.close()
    }
  })
})
