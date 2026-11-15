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

  test('checkout: el ingreso está en la pantalla; "Continuar con Google" habilitado, sin casilla y con el +18 en una frase @critical', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto(reservarUrl())

      // Sin sesión el ingreso va dentro de la pantalla de confirmar (F5 del vidrio), no en un modal.
      const panel = page.getByRole('region', { name: /Entrá para reservar/ })
      await expect(panel).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)

      const googleButton = panel.getByRole('button', { name: /continuar con google/i })
      await expect(googleButton).toBeVisible()
      await expect(googleButton).toBeEnabled()

      // Clickwrap (decisión 2026-10-21): tocar Google es aceptar; no hay casilla que se pueda
      // olvidar. El servidor exige `terms` igual (tests/unit/reservar-gate-actions.test.ts).
      await expect(panel.getByRole('checkbox')).toHaveCount(0)
      await expect(panel.getByText(/declarás que sos mayor de 18 años/)).toBeVisible()
      await expect(panel.getByRole('link', { name: /términos y condiciones/i })).toHaveAttribute(
        'href',
        '/terminos',
      )

      await expect(page).toHaveURL(/\/reservar\?/)
    } finally {
      await ctx.close()
    }
  })
})
