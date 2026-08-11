import { test, expect } from '@playwright/test'

test.describe('Public smoke (cross-browser)', () => {
  test('landing / loads without horizontal scroll', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    const { scrollW, innerW } = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
    }))
    expect(scrollW).toBeLessThanOrEqual(innerW + 1)

    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource') && !e.includes('favicon'),
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('/explorar loads and renders search heading', async ({ page }) => {
    await page.goto('/explorar')
    // Heading should be visible regardless of DB state (empty state renders too)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })

    const { scrollW, innerW } = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      innerW: window.innerWidth,
    }))
    expect(scrollW).toBeLessThanOrEqual(innerW + 1)
  })

  test('skip-to-content link present in DOM (F11 regression)', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toHaveCount(1)
    // Link is sr-only by default; only visible on focus. We check it exists.
    const text = await skipLink.textContent()
    expect(text?.toLowerCase()).toContain('saltar')
  })
})
