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

  test('buscar por nombre desde la hoja de Localidad filtra al complejo demo', async ({ page }) => {
    await page.goto('/explorar')
    await page.getByRole('button', { name: /^Localidad:/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('searchbox', { name: 'Localidad' }).fill('demo')
    await sheet.getByRole('button', { name: /Buscar complejos que se llamen/ }).click()
    await page.waitForURL((url) => url.searchParams.get('q') === 'demo')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()
  })

  test('click on tenant card navigates to /<slug>', async ({ page }) => {
    await page.goto('/explorar')
    await page
      .getByRole('link', { name: /E2E Complejo Demo/i })
      .first()
      .click()
    await expect(page).toHaveURL(/\/e2e-complejo-demo/)
  })
})
