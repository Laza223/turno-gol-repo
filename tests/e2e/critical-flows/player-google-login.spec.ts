import { test, expect } from '../fixtures'
import { dateIsoArtIn } from '../_helpers/booking-seed'

/**
 * Google OAuth (jugador, ADR-002/2026-08-14). El click real hacia Google
 * NO se automatiza acá: `[auth.external.google]` en supabase/config.toml
 * arranca `enabled=false` (sin credenciales reales de Google Cloud Console
 * todavía — ver plan) y CI/local no tienen forma confiable de completar un
 * login real de Google sin romper por anti-automatización. Este smoke cubre
 * lo que SÍ es estable sin esas credenciales: el botón existe, y en el
 * checkout la casilla de términos se exige (el cliente la ataja al instante y el
 * servidor la vuelve a exigir; el botón no se deshabilita).
 */

const DEMO_TENANT_SLUG = 'e2e-complejo-demo'
const DEMO_COURT_ID = '00000000-0000-4000-8000-000000000010'

function reservarUrl(): string {
  return `/${DEMO_TENANT_SLUG}/reservar?court=${DEMO_COURT_ID}&date=${dateIsoArtIn(2)}&time=10:00&dur=60`
}

test.describe('Google login (botón, sin completar el flujo externo)', () => {
  test('/ingresar muestra "Continuar con Google" habilitado', async ({ browser }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto('/ingresar')

      const googleButton = page.getByRole('button', { name: /continuar con google/i })
      await expect(googleButton).toBeVisible()
      await expect(googleButton).toBeEnabled()
    } finally {
      await ctx.close()
    }
  })

  test('checkout: "Continuar con Google" no se deshabilita; sin la casilla el error sale EN la casilla @critical', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto(reservarUrl())

      const googleButton = page.getByRole('button', { name: /continuar con google/i })
      await expect(googleButton).toBeVisible()
      await expect(googleButton).toBeEnabled()

      // Sin la casilla el cliente ataja el envío: el error sale al instante y no se va a Google
      // (el servidor lo exige igual, ver tests/unit/reservar-gate-actions.test.ts).
      // OJO: getByRole('alert') a secas también matchea el anunciador de rutas de Next
      // (`#__next-route-announcer__`, siempre presente): se filtra por el texto del error.
      const checkbox = page.getByRole('checkbox')
      const termsAlert = page
        .getByRole('alert')
        .filter({ hasText: 'Tenés que aceptar los términos.' })
      await googleButton.click()
      await expect(termsAlert).toBeVisible()
      await expect(checkbox).toHaveAttribute('aria-invalid', 'true')
      await expect(checkbox).toBeFocused()
      await expect(page).toHaveURL(/\/reservar\?/)

      // Tildarla saca el error y el botón sigue habilitado.
      await checkbox.check()
      await expect(termsAlert).toHaveCount(0)
      await expect(googleButton).toBeEnabled()
    } finally {
      await ctx.close()
    }
  })
})
