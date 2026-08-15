import { test, expect } from './fixtures'
import { E2E_TEST_PASSWORD } from './_helpers/test-credentials'

test.describe('admin login flow (email + password)', () => {
  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows email + password inputs and forgot link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/^contraseña$/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /olvidaste tu contraseña/i })).toBeVisible()
  })

  test('valid credentials log in and land on /dashboard @critical', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('e2e-admin@turnogol.test')
    await page.getByLabel(/^contraseña$/i).fill(E2E_TEST_PASSWORD)
    await page.getByRole('button', { name: /^ingresar$/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    // "E2E Complejo Demo" vive en el nombre del sidebar, que en mobile queda
    // colapsado detrás del menú hamburguesa — no es contenido principal. El
    // <h1> "Hoy" de PageHeader sí está en el contenido, en cualquier viewport.
    await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible()
  })

  test('with admin storageState, /dashboard renders', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    // "E2E Complejo Demo" vive en el nombre del sidebar, que en mobile queda
    // colapsado detrás del menú hamburguesa — no es contenido principal. El
    // <h1> "Hoy" de PageHeader sí está en el contenido, en cualquier viewport.
    await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible()
    await ctx.close()
  })

  test('login inputs are accessible (type + autocomplete)', async ({ page }) => {
    await page.goto('/login')
    const email = page.getByLabel(/email/i)
    await expect(email).toHaveAttribute('type', 'email')
    await expect(email).toHaveAttribute('autocomplete', 'email')
    const password = page.getByLabel(/^contraseña$/i)
    await expect(password).toHaveAttribute('type', 'password')
    await expect(password).toHaveAttribute('autocomplete', 'current-password')
  })

  test('wrong password shows a generic error and stays on /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('e2e-admin@turnogol.test')
    await page.getByLabel(/^contraseña$/i).fill('contraseña-incorrecta')
    await page.getByRole('button', { name: /^ingresar$/i }).click()
    await expect(page.getByText(/email o contraseña incorrectos/i)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})
