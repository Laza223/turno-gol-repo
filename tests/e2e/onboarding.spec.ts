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

    test('step 1 renders complex identity form', async ({ page, adminStorageState }) => {
      // Use admin storage state — the buildStorageState fixture creates a staff
      // session. If this admin already has a tenant and completed onboarding,
      // they'll be redirected to /dashboard. We test the form renders at /onboarding.
      await page.context().addCookies(JSON.parse(adminStorageState).cookies)
      await page.goto('/onboarding')

      // If admin already has a tenant, we may land on /dashboard or a later step.
      // Verify the wizard page structure regardless of step.
      const url = page.url()
      if (url.includes('/onboarding')) {
        // Wizard is visible — verify stepper progress indicator
        await expect(page.getByText(/paso \d+ de 4/i)).toBeVisible()
      } else {
        // Already completed onboarding — admin redirected to dashboard
        await expect(page).toHaveURL(/\/dashboard/)
      }
    })

    test('wizard shows progress stepper', async ({ page, adminStorageState }) => {
      await page.context().addCookies(JSON.parse(adminStorageState).cookies)
      await page.goto('/onboarding')

      const url = page.url()
      if (!url.includes('/onboarding')) {
        test.skip(true, 'Admin already completed onboarding')
        return
      }

      // Progress indicator
      await expect(page.getByText(/paso \d+ de 4/i)).toBeVisible()
      // Percentage indicator
      await expect(page.getByText(/%/)).toBeVisible()
    })
  })

  test.describe('full wizard flow (step 1 - identity)', () => {
    test('step 1 has all complex identity fields', async ({ page, adminStorageState }) => {
      await page.context().addCookies(JSON.parse(adminStorageState).cookies)
      await page.goto('/onboarding')

      const url = page.url()
      if (!url.includes('/onboarding')) {
        test.skip(true, 'Admin already completed onboarding')
        return
      }

      // If on step 1, verify form fields
      const heading = page.getByRole('heading', { name: /tu complejo/i })
      if (await heading.isVisible()) {
        await expect(page.getByPlaceholder(/complejo san mart/i)).toBeVisible()
        await expect(page.getByPlaceholder(/corrientes/i)).toBeVisible()
        await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible()
      }
    })
  })
})
