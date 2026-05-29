import { test, expect } from '@playwright/test'

test.describe('Login smoke (cross-browser)', () => {
  test('/login renders email input with type=email and autocomplete=email', async ({ page }) => {
    await page.goto('/login')

    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible({ timeout: 10_000 })

    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(emailInput).toHaveAttribute('autocomplete', 'email')
  })

  test('/login submit without email does not navigate to sent state', async ({ page }) => {
    await page.goto('/login')

    const submit = page.locator('button[type="submit"]').first()
    await expect(submit).toBeVisible({ timeout: 10_000 })

    await submit.click()

    // HTML5 validation should block empty submit, page stays on /login.
    await expect(page).toHaveURL(/\/login/)

    // Sent state copy ("revisá tu mail") must NOT be visible.
    await expect(page.locator('text=/revisá tu mail/i')).not.toBeVisible()
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
