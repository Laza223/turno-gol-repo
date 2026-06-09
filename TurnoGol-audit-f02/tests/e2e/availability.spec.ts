import { test, expect } from '@playwright/test'

test.describe('public availability', () => {
  test('tenant page shows name + city + daily grid', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
    await expect(page.getByText(/Buenos Aires/i)).toBeVisible()
    // Daily grid contains at least one slot label (HH:MM)
    await expect(page.getByText(/\b\d{2}:\d{2}\b/).first()).toBeVisible()
  })

  test('navigates to weekly availability', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    await page.getByRole('link', { name: /ver semana completa|semana/i }).first().click()
    await expect(page).toHaveURL(/\/e2e-complejo-demo\/disponibilidad/)
  })

  test('weekly view shows multiple days', async ({ page }) => {
    await page.goto('/e2e-complejo-demo/disponibilidad')
    // Expect at least 5 day headers (lun, mar, mié, jue, vie, sáb, dom)
    const days = await page.getByText(/\b(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\b/i).count()
    expect(days).toBeGreaterThanOrEqual(5)
  })

  test('free future slot links to /reservar', async ({ page }) => {
    await page.goto('/e2e-complejo-demo/disponibilidad')
    // Any anchor whose href contains /reservar
    const reservarLink = page.locator('a[href*="/reservar"]').first()
    await expect(reservarLink).toBeVisible()
  })
})
