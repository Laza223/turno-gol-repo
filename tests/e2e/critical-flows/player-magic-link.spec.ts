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

        // Success: SentState h1 "Revisá tu email" appears.
        // Use heading role specifically — the FormCard subtitle on /login also
        // contains "Te enviamos un enlace mágico a tu email" (visible by default),
        // so a plain getByText would match that too and lead to false positives.
        await expect(
          page.getByRole('heading', { name: /revis[áa] tu (mail|email)/i }),
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

        // Must NOT show the SentState h1.
        // The FormCard subtitle ("Te enviamos un enlace mágico a tu email") is
        // always visible on /login and would match a plain "enviamos" regex,
        // making the assertion always fail. Anchor on the heading role instead.
        await expect(
          page.getByRole('heading', { name: /revis[áa] tu (mail|email)/i }),
        ).not.toBeVisible({ timeout: 2_000 })

        // Must stay on /login
        await expect(page).toHaveURL(/\/login/)
      } finally {
        await ctx.close()
      }
    },
  )
})
