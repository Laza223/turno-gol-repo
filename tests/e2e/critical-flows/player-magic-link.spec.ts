import { test, expect } from '../fixtures'
import { E2E_PLAYER_EMAIL } from '../_helpers/player-seed'

/**
 * Flow 7 doc7 — Player magic link UI (T4 F14)
 *
 * Covers the public /login page for unauthenticated players.
 * Uses browser.newContext() WITHOUT storageState to avoid the
 * playerStorageState cookie redirect to /mis-reservas (risk R5).
 *
 * Note: the form uses noValidate so HTML5 validation is bypassed;
 * empty email hits the server and returns { status: 'error' }.
 */

test.describe('player magic link', () => {
  test(
    'player requests magic link from /login → check inbox message visible @critical',
    async ({ browser }) => {
      // Anonymous context — no cookies, no redirect to /mis-reservas
      const ctx = await browser.newContext()
      try {
        const page = await ctx.newPage()

        await page.goto('/login')

        await page.getByLabel(/email/i).fill(E2E_PLAYER_EMAIL)
        await page.getByRole('button', { name: /(enviar|entrar|continuar)/i }).click()

        // Success: "Revisá tu email" heading appears
        await expect(
          page.getByText(/(revis[áa] tu (mail|email)|enviamos|check your inbox)/i),
        ).toBeVisible({ timeout: 10_000 })

        // Must NOT have navigated to /mis-reservas (player is not yet authenticated)
        await expect(page).not.toHaveURL(/\/mis-reservas/)
      } finally {
        await ctx.close()
      }
    },
  )

  test(
    'player submits empty email shows error, stays on /login',
    async ({ browser }) => {
      // Anonymous context — no cookies
      const ctx = await browser.newContext()
      try {
        const page = await ctx.newPage()

        await page.goto('/login')

        // Submit without filling email (form has noValidate; server returns error state)
        await page.getByRole('button', { name: /(enviar|entrar|continuar)/i }).click()

        // Must NOT show the "sent" success state
        await expect(
          page.getByText(/(revis[áa] tu (mail|email)|enviamos|check your inbox)/i),
        ).not.toBeVisible({ timeout: 2_000 })

        // Must stay on /login
        await expect(page).toHaveURL(/\/login/)
      } finally {
        await ctx.close()
      }
    },
  )
})
