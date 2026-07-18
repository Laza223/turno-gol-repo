import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import { makeServiceClient, E2E_PLAYER_ID } from '../../_helpers/player-seed'

/**
 * TG-HP-110 — Preferencias de notificación (/perfil?tab=notificaciones).
 * Rol: Jugador logueado.
 *
 * Evidence anchors: ProfileHeaderNav.tsx:9, NotificationPrefs.tsx:15-34,47-74,
 * 96-113,117-122, perfil/actions.ts:71-119, perfil/page.tsx:139-145.
 */

test.describe('TG-HP-110 — Preferencias de notificación', () => {
  test('togglea "Novedades por email" optimista → persiste notify_email en DB', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/perfil?tab=notificaciones')

      const emailSwitch = page.getByRole('switch', { name: 'Novedades por email' })
      const pushSwitch = page.getByRole('switch', { name: 'Notificaciones push' })
      await expect(emailSwitch).toBeVisible()
      await expect(pushSwitch).toBeVisible()
      await expect(page.getByText(/emails de confirmación y cancelación se envían siempre/i)).toBeVisible()

      // Estado inicial (resetPlayer no toca notify_*, pero el seed original = true).
      await expect(emailSwitch).toHaveAttribute('aria-checked', 'true')

      // Toggle optimista: cambia de estado al toque (antes de que resuelva la Server Action).
      await emailSwitch.click()
      await expect(emailSwitch).toHaveAttribute('aria-checked', 'false')

      // UI-sin-reload: sin toast, sin revalidatePath visible al cliente — el
      // switch en sí es estado local optimista; verificamos que NO aparezca
      // el mensaje de error (que revertiría el switch).
      await page.waitForTimeout(500)
      // OJO: getByRole('alert') matchea el <div id="__next-route-announcer__">
      // de Next (siempre presente, vacío) → falso positivo. Scopear a un alert
      // REAL con contenido: si la Server Action fallara, revertiría el switch.
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0)
      await expect(emailSwitch).toHaveAttribute('aria-checked', 'false')

      const { data: row, error } = await sb
        .from('players')
        .select('notify_email, notify_push')
        .eq('id', E2E_PLAYER_ID)
        .single()

      expect(error).toBeNull()
      expect(row?.notify_email).toBe(false)
      expect(row?.notify_push).toBe(true) // no lo tocamos

      // Reload confirma persistencia server-side (no es solo estado local del switch).
      await page.reload()
      await expect(page.getByRole('switch', { name: 'Novedades por email' })).toHaveAttribute(
        'aria-checked',
        'false',
      )

      await writeEvidence('TG-HP-110', {
        status: 'pass',
        db: row,
        notes:
          'Toggle optimista confirmado consistente con DB tras el round-trip; NotificationPrefs ' +
          'no deshabilita el switch mientras pending (GAP conocido del manual, no se afirma disabled).',
      })
    } finally {
      await ctx.close()
      // notify_email/notify_push NO los toca resetPlayer() — restaurar a mano (default true).
      await sb.from('players').update({ notify_email: true, notify_push: true }).eq('id', E2E_PLAYER_ID)
    }
  })
})
