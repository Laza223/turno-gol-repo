import { test, expect } from '@playwright/test'

test.describe('public availability', () => {
  test('tenant page shows name + city + daily grid', async ({ page }) => {
    await page.goto('/e2e-complejo-demo')
    // getByText matchea tambien el <title>: desde Next 16 la metadata streamea
    // dentro del <body> (React la hoistea al <head> en el cliente), asi que el
    // <title> es un nodo de texto mas del documento. Apuntamos al h1, que es lo
    // que el test quiere verificar: el nombre visible para el usuario.
    await expect(page.getByRole('heading', { name: 'E2E Complejo Demo' })).toBeVisible()
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

  // FIXME: the disponibilidad page defaults to today and renders Links only
  // for free future slots. In the full CI=1 chromium run, today's slot row
  // is occasionally empty (orphan from another spec OR rendering race),
  // and the assertion fails before any /reservar Link exists. Passes
  // reliably in isolation. Tracked alongside player-bookings:93 phantom.
  test.fixme('free future slot links to /reservar', async ({ page }) => {
    await page.goto('/e2e-complejo-demo/disponibilidad')
    // Any anchor whose href contains /reservar
    const reservarLink = page.locator('a[href*="/reservar"]').first()
    await expect(reservarLink).toBeVisible()
  })
})
