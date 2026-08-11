import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('renders hero + heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('header logged-out muestra Ingresar → /ingresar y Para complejos → /para-complejos', async ({
    page,
  }) => {
    await page.goto('/')
    // La home usa PortalHeader overlay: el CTA logged-out es "Ingresar" → /ingresar.
    // No hay CTA "Comenzá gratis" en la home; ese CTA vive en /para-complejos (BusinessHeader).
    const ingresarLink = page.getByRole('link', { name: 'Ingresar' }).first()
    await expect(ingresarLink).toBeVisible()
    await expect(ingresarLink).toHaveAttribute('href', '/ingresar')

    const paraComplejosLink = page.getByRole('link', { name: /para complejos/i }).first()
    await expect(paraComplejosLink).toBeVisible()
    await expect(paraComplejosLink).toHaveAttribute('href', '/para-complejos')
  })

  test('clicking Ingresar en header navega a /ingresar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Ingresar' }).first().click()
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test('/para-complejos tiene CTA "Empezar gratis" → /register', async ({ page }) => {
    // El CTA de alta de complejo fue movido de la home a la landing B2B.
    await page.goto('/para-complejos')
    const cta = page.getByRole('link', { name: /empezar gratis/i }).first()
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', /\/register/)
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
    const filtered = errors.filter(
      (e) =>
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
