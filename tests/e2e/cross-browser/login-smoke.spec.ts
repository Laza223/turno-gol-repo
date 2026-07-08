import { test, expect } from '@playwright/test'

test.describe('Login smoke (cross-browser)', () => {
  test('/login renders email + password inputs with correct attrs', async ({ page }) => {
    await page.goto('/login')

    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible({ timeout: 10_000 })
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(emailInput).toHaveAttribute('autocomplete', 'email')

    const passwordInput = page.locator('input[autocomplete="current-password"]').first()
    await expect(passwordInput).toBeVisible()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('/login submit without credentials stays on /login', async ({ page }) => {
    await page.goto('/login')

    const submit = page.getByRole('button', { name: /^ingresar$/i })
    await expect(submit).toBeVisible({ timeout: 10_000 })

    await submit.click()

    // HTML5 validation should block empty submit, page stays on /login.
    await expect(page).toHaveURL(/\/login/)
  })

  test('no horizontal scroll on /login', async ({ page }) => {
    await page.goto('/login')
    const { scrollW, innerW } = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
    }))
    expect(scrollW).toBeLessThanOrEqual(innerW + 1)
  })
})
