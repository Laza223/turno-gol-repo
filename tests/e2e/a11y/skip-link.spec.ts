import { test, expect } from '@playwright/test'

test.describe('Skip-to-content link', () => {
  test('first Tab focuses skip link, Enter jumps to main', async ({ page }) => {
    await page.goto('/login')
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
    expect(focused).toBe('Saltar al contenido')

    await page.keyboard.press('Enter')
    // assert hash navigation OR focus moves to #main-content
    const hash = await page.evaluate(() => window.location.hash)
    expect(hash).toBe('#main-content')
  })
})
