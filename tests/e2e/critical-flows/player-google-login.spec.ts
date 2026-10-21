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

  test('checkout: el botón abre el ingreso; "Continuar con Google" habilitado, sin casilla y con el +18 en una frase @critical', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await page.goto(reservarUrl())

      // Sin sesión el botón de acción (no hay casilla de +18) abre el ingreso en un modal.
      await page.getByRole('button', { name: /^(Reservar|Pagar seña)/ }).click()
      const dialog = page.getByRole('dialog', { name: /Entrá para reservar/ })
      await expect(dialog).toBeVisible()

      const googleButton = dialog.getByRole('button', { name: /continuar con google/i })
      await expect(googleButton).toBeVisible()
      await expect(googleButton).toBeEnabled()

      // Clickwrap (decisión 2026-10-21): tocar Google es aceptar; no hay casilla que se pueda
      // olvidar. El servidor exige `terms` igual (tests/unit/reservar-gate-actions.test.ts).
      await expect(dialog.getByRole('checkbox')).toHaveCount(0)
      await expect(dialog.getByText(/declarás que sos mayor de 18 años/)).toBeVisible()
      await expect(dialog.getByRole('link', { name: /términos y condiciones/i })).toHaveAttribute(
        'href',
        '/terminos',
      )

      // Esc cierra el modal y deja la pantalla de confirmar.
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(/\/reservar\?/)
    } finally {
      await ctx.close()
    }
  })
})
