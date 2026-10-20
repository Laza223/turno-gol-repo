import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-110 — Sin interruptores de avisos (antes: preferencias de notificación).
 * Rol: Jugador logueado.
 *
 * Cambia de propósito en el 2.4b: los interruptores `notify_email`/`notify_push` no gobernaban
 * ningún envío y se sacaron. `/perfil?tab=notificaciones` redirige a `/configuracion`, que no
 * tiene interruptores y dice qué mails llegan siempre. Las columnas quedan en la base sin tocar.
 *
 * Evidence anchors: perfil/page.tsx (redirect), configuracion/ConfiguracionView.tsx.
 */

test.describe('TG-HP-110 — Sin interruptores de avisos', () => {
  test('/perfil?tab=notificaciones redirige a /configuracion, sin interruptores', async ({
    browser,
    playerStorageState,
  }) => {
    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/perfil?tab=notificaciones')
      await expect(page).toHaveURL(/\/configuracion$/)
      await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()

      // Ni interruptores ni los textos de los viejos avisos.
      await expect(page.getByRole('switch')).toHaveCount(0)
      await expect(page.getByText('Novedades por email')).toHaveCount(0)
      await expect(page.getByText('Notificaciones push')).toHaveCount(0)

      // En su lugar, una línea con los mails que llegan siempre.
      await expect(
        page.getByText(/Te mandamos siempre un mail cuando se confirma o se cancela una reserva/),
      ).toBeVisible()

      await writeEvidence('TG-HP-110', {
        status: 'pass',
        notes:
          'Redirect de servidor desde ?tab=notificaciones; la página no tiene role=switch y trae la línea de los mails que llegan siempre.',
      })
    } finally {
      await ctx.close()
    }
  })
})
