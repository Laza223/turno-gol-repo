import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('renders hero + primary CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Primary CTA: start free trial → /register
    const cta = page.getByRole('link', { name: /comenz[áa] gratis/i }).first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', /\/register/)
  })

  test('clicking primary CTA navigates to /register', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /comenz[áa] gratis/i }).first().click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Allow Next.js dev warnings; only fail on real errors that are not from Next overlay.
    // 'unsafe-eval'/EvalError is dev-only noise: Next's webpack HMR uses eval(), which the
    // app CSP (script-src 'self' 'unsafe-inline') blocks in dev; production builds don't eval.
    const filtered = errors.filter((e) =>
      !e.includes('Hydration') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('[next-auth]') &&
      !e.includes('unsafe-eval') &&
      !e.includes('EvalError') &&
      !e.includes('Content Security Policy'),
    )
    expect(filtered, `Console errors: ${JSON.stringify(filtered)}`).toEqual([])
  })
})
