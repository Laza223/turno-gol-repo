import { test, expect } from '../fixtures'
import { E2E_PLAYER_EMAIL } from '../_helpers/player-seed'

/**
 * Flow 7 doc7 — Player magic link UI (T4 F14)
 *
 * Tras la migración de auth, /login es el form de contraseña del STAFF. El
 * jugador sigue passwordless: usa el acceso secundario "¿Sos jugador? Ingresá
 * con tu email", que despliega un form que dispara un magic link.
 *
 * Usa browser.newContext() SIN storageState para evitar el redirect a
 * /mis-reservas del playerStorageState (riesgo R5). El form usa noValidate.
 */

test.describe('player magic link (acceso secundario en /login)', () => {
  test(
    'player pide magic link desde /login → mensaje de enlace enviado @critical',
    async ({ browser }) => {
      const ctx = await browser.newContext()
      try {
        const page = await ctx.newPage()
        await page.goto('/login')

        await page.getByRole('button', { name: /sos jugador/i }).click()
        await page.getByLabel(/email de jugador/i).fill(E2E_PLAYER_EMAIL)
        await page.getByRole('button', { name: /enviarme un enlace de acceso/i }).click()

        await expect(page.getByText(/te enviamos un enlace de acceso/i)).toBeVisible({ timeout: 10_000 })
        await expect(page).not.toHaveURL(/\/mis-reservas/)
      } finally {
        await ctx.close()
      }
    },
  )

  test(
    'player envía email vacío → error, sigue en /login',
    async ({ browser }) => {
      const ctx = await browser.newContext()
      try {
        const page = await ctx.newPage()
        await page.goto('/login')

        await page.getByRole('button', { name: /sos jugador/i }).click()
        await page.getByRole('button', { name: /enviarme un enlace de acceso/i }).click()

        await expect(page.getByText(/te enviamos un enlace de acceso/i)).not.toBeVisible({ timeout: 2_000 })
        await expect(page).toHaveURL(/\/login/)
      } finally {
        await ctx.close()
      }
    },
  )
})
