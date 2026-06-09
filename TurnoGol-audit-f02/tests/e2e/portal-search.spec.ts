import { test, expect } from '@playwright/test'

test.describe('portal search (/explorar)', () => {
  test('shows the E2E seeded tenant card', async ({ page }) => {
    await page.goto('/explorar')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('filter by city "Buenos Aires" includes the demo tenant', async ({ page }) => {
    await page.goto('/explorar?city=Buenos+Aires')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('search input filters to the demo tenant', async ({ page }) => {
    await page.goto('/explorar')
    const input = page.getByPlaceholder(/buscar|ciudad|complejo/i).first()
    await input.fill('demo')
    // Trigger search (URL update may be debounced; press Enter to commit)
    await input.press('Enter')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('click on tenant card navigates to /<slug>', async ({ page }) => {
    await page.goto('/explorar')
    await page.getByRole('link', { name: /E2E Complejo Demo/i }).first().click()
    await expect(page).toHaveURL(/\/e2e-complejo-demo/)
  })
})
