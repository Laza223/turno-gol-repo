import { test, expect } from './fixtures'

test.describe('admin login flow', () => {
  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows email input', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })

  test('submitting email triggers "check your inbox" message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('e2e-admin@turnogol.test')
    await page.getByRole('button', { name: /(enviar|entrar|continuar)/i }).click()
    await expect(page.getByText(/(revis[áa] tu mail|enviamos|check your inbox)/i)).toBeVisible({ timeout: 10_000 })
  })

  test('with admin storageState, /dashboard renders', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText(/E2E Complejo Demo/i).first()).toBeVisible()
    await ctx.close()
  })

  test('login page email input is accessible (type + autocomplete)', async ({ page }) => {
    await page.goto('/login')
    const email = page.getByLabel(/email/i)
    await expect(email).toHaveAttribute('type', 'email')
    await expect(email).toHaveAttribute('autocomplete', 'email')
  })

  test('invalid email does not navigate to sent state', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('not-an-email')
    await page.getByRole('button', { name: /(enviar|entrar|continuar)/i }).click()
    // Native HTML5 validation prevents submit; if server-side, returns 'Email inválido'.
    // Either way, we should NOT see the "sent" success state.
    await expect(page.getByText(/(revis[áa] tu mail|enviamos)/i)).not.toBeVisible({ timeout: 2_000 })
    // And we should still be on /login (not advanced past).
    await expect(page).toHaveURL(/\/login/)
  })
})
