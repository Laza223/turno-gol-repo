import { test, expect } from './fixtures'

/**
 * E2E: Onboarding wizard for new complex registration.
 *
 * Flow: /register (email+password+confirm) → email de confirmación →
 * /onboarding (4-step wizard) → /dashboard.
 *
 * El alta requiere confirmar el email (enable_confirmations), así que arrancamos
 * desde /register (validación de form) y /onboarding (pasos del wizard) por
 * separado, usando el storage state del fresh admin.
 */

test.describe('onboarding', () => {
  test.describe('registration form', () => {
    test('renders registration form with required fields', async ({ page }) => {
      await page.goto('/register')

      await expect(page.getByRole('heading', { name: /cre[áa] tu cuenta/i })).toBeVisible()
      await expect(page.getByLabel(/^nombre$/i)).toBeVisible()
      await expect(page.getByLabel(/apellido/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/celular/i)).toBeVisible()
      await expect(page.getByLabel(/^contraseña$/i)).toBeVisible()
      await expect(page.getByLabel(/repetir contraseña/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /crear cuenta/i })).toBeVisible()
    })

    test('shows validation errors on empty submit', async ({ page }) => {
      await page.goto('/register')
      await page.getByRole('button', { name: /crear cuenta/i }).click()
      // HTML5 required validation prevents submission, or server-side errors show
      // Either way the page stays on /register
      await expect(page).toHaveURL(/\/register/)
    })

    test('has link to login for existing users', async ({ page }) => {
      await page.goto('/register')
      const loginLink = page.getByRole('link', { name: /^ingresar$/i })
      await expect(loginLink).toBeVisible()
      await expect(loginLink).toHaveAttribute('href', '/login')
    })
  })

  test.describe('onboarding wizard', () => {
    test('redirects unauthenticated user to /login', async ({ page }) => {
      await page.goto('/onboarding')
      await expect(page).toHaveURL(/\/login/)
    })

    test('step 1 renders complex identity form', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // Fresh admin always lands on /onboarding step 1. El label de progreso
      // existe en el rail desktop y en el header mobile (uno visible por
      // viewport) → .first().
      await expect(page.getByText(/paso \d+ de 4/i).first()).toBeVisible()
    })

    test('wizard shows single progress indicator with goal gradient', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // "Paso 1 de 4 · 25%": la cuenta arranca regalada (MASTER §9).
      await expect(page.getByText(/paso 1 de 4 · 25\s?%/i).first()).toBeVisible()
    })
  })

  test.describe.serial('full wizard flow (step 1 - identity)', () => {
    test('step 1 has all complex identity fields', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // Step 1 must render — if the full-wizard test below ran first and
      // persisted a tenant, the seed-e2e cleanup (T1) reverts that on next
      // run, but the serial() above guarantees order within this describe.
      const heading = page.getByRole('heading', { name: /tu complejo/i })
      await expect(heading).toBeVisible({ timeout: 10_000 })
      await expect(page.getByPlaceholder(/complejo san mart/i)).toBeVisible()
      await expect(page.getByPlaceholder(/corrientes/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible()
    })

    test('completes full 4-step wizard and lands on /onboarding/listo', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')
      await expect(page).toHaveURL(/\/onboarding/)

      // Step 1: identidad del complejo
      await expect(page.getByRole('heading', { name: /tu complejo/i })).toBeVisible({ timeout: 10_000 })
      await page.getByPlaceholder(/complejo san mart/i).fill('Complejo Wizard E2E')
      await page.getByPlaceholder(/av\. corrientes/i).fill('Av. Test 123')
      await page.getByPlaceholder(/luj[aá]n/i).fill('Buenos Aires')
      await page.locator('select[name="province"]').selectOption({ index: 1 })
      await page.getByPlaceholder(/\+54 9 11/i).fill('+5491100000000')
      await page.getByPlaceholder(/hola@complejo\.com/i).fill('wizard-e2e@turnogol.test')
      await page.getByRole('button', { name: /continuar/i }).click()

      // Step 2: horarios (general + excepciones). Los defaults llegan saneados
      // (cierres de madrugada → 00:00), así que Continuar sin tocar nada es
      // válido — antes fallaba con "cierre posterior a apertura".
      await expect(page.getByText(/paso 2 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      // exact: los rows de días también dicen "· horario general" (strict mode)
      await expect(page.getByText('Horario general', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /continuar/i }).click()

      // Step 3: canchas inline — nombre precargado, solo falta el precio
      await expect(page.getByText(/paso 3 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('heading', { name: /tus canchas/i })).toBeVisible()
      await page.getByPlaceholder(/20\.000/).fill('20.000')
      await page.getByRole('button', { name: /^continuar$/i }).click()

      // Step 4: señas — elegir "Sin seña por ahora" cambia el CTA primario
      await expect(page.getByText(/paso 4 de 4/i).first()).toBeVisible({ timeout: 10_000 })
      await page.getByText(/sin seña por ahora/i).click()
      await page.getByRole('button', { name: /terminar y ver mi complejo/i }).click()

      // Cierre peak-end: link público + compartir (el Aha Moment empieza acá)
      await expect(page).toHaveURL(/\/onboarding\/listo/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: /tu complejo está online/i })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: /copiar link/i })).toBeVisible()

      // "Ir a mi panel" aterriza en el dashboard con el tenant creado y sus
      // canchas listas (la checklist ya arranca con canchas + horarios hechos)
      await page.getByRole('link', { name: /ir a mi panel/i }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
      await expect(page.getByText(/Complejo Wizard E2E/i).first()).toBeVisible({ timeout: 10_000 })
    })
  })
})
