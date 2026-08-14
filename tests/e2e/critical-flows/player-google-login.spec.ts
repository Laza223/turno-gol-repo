import { test, expect } from '../fixtures'
import { dateIsoArtIn } from '../_helpers/booking-seed'

/**
 * Google OAuth (jugador, ADR-002/2026-08-14). El click real hacia Google
 * NO se automatiza acá: `[auth.external.google]` en supabase/config.toml
 * arranca `enabled=false` (sin credenciales reales de Google Cloud Console
 * todavía — ver plan) y CI/local no tienen forma confiable de completar un
 * login real de Google sin romper por anti-automatización. Este smoke cubre
 * lo que SÍ es estable sin esas credenciales: el botón existe, y en el
 * checkout queda atado al mismo checkbox de términos que el submit de email.
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

  test('checkout: "Continuar con Google" queda deshabilitado hasta tildar los términos @critical', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto(reservarUrl())

      const googleButton = page.getByRole('button', { name: /continuar con google/i })
      await expect(googleButton).toBeVisible()
      await expect(googleButton).toBeDisabled()

      await page.getByRole('checkbox').check()
      await expect(googleButton).toBeEnabled()

      await page.getByRole('checkbox').uncheck()
      await expect(googleButton).toBeDisabled()
    } finally {
      await ctx.close()
    }
  })
})
