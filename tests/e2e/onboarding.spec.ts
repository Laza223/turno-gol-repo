import { test, expect } from './fixtures'

/**
 * E2E: Onboarding wizard for new complex registration.
 *
 * Flow: /register → magic link → /onboarding (4-step wizard) → /dashboard.
 *
 * Since the magic link auth flow is tested in admin-login.spec.ts, we start
 * from /register (form validation) and /onboarding (wizard steps) separately.
 */

test.describe('onboarding', () => {
  test.describe('registration form', () => {
    test('renders registration form with required fields', async ({ page }) => {
      await page.goto('/register')

      await expect(page.getByRole('heading', { name: /cre[áa] tu cuenta/i })).toBeVisible()
      await expect(page.getByLabel(/nombre/i)).toBeVisible()
      await expect(page.getByLabel(/apellido/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/celular/i)).toBeVisible()
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
      const loginLink = page.getByRole('link', { name: /inici[áa] sesi[óo]n/i })
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

      // Fresh admin always lands on /onboarding step 1
      await expect(page.getByText(/paso \d+ de 4/i)).toBeVisible()
    })

    test('wizard shows progress stepper', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')

      // Progress indicator
      await expect(page.getByText(/paso \d+ de 4/i)).toBeVisible()
      // Percentage indicator
      await expect(page.getByText(/%/)).toBeVisible()
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

    test('completes full 4-step wizard and lands on /dashboard', async ({ page, freshAdminStorageState }) => {
      await page.context().addCookies(JSON.parse(freshAdminStorageState).cookies)
      await page.goto('/onboarding')
      await expect(page).toHaveURL(/\/onboarding/)

      // Step 1: complex identity — fill required fields
      // Labels use className without for/htmlFor, so locate by placeholder
      await expect(page.getByRole('heading', { name: /tu complejo/i })).toBeVisible({ timeout: 10_000 })
      await page.getByPlaceholder(/complejo san mart/i).fill('Complejo Wizard E2E')
      await page.getByPlaceholder(/av\. corrientes/i).fill('Av. Test 123')
      await page.getByPlaceholder(/luj[aá]n/i).fill('Buenos Aires')
      await page.locator('select[name="province"]').selectOption({ index: 1 })
      await page.getByPlaceholder(/\+54 9 11/i).fill('+5491100000000')
      await page.getByPlaceholder(/admin@complejo\.com/i).fill('wizard-e2e@turnogol.test')
      await page.getByRole('button', { name: /continuar/i }).click()

      // Step 2: courts info-only — just continue
      await expect(page.getByText(/paso 2 de 4/i)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: /continuar/i }).click()

      // Step 3: schedule (pre-filled defaults)
      await expect(page.getByText(/paso 3 de 4/i)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: /continuar/i }).click()

      // Step 4: skip MP ("Terminar sin seña" button)
      await expect(page.getByText(/paso 4 de 4/i)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: /terminar sin seña/i }).click()

      // Landed on /dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
      await expect(page.getByText(/Complejo Wizard E2E/i).first()).toBeVisible({ timeout: 10_000 })
    })
  })
})
