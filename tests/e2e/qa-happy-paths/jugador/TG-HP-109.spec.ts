import { test, expect } from '../../fixtures'
import { writeEvidence } from '../_qa/evidence'
import {
  makeServiceClient,
  resetPlayer,
  E2E_PLAYER_ID,
  E2E_PLAYER_EMAIL,
} from '../../_helpers/player-seed'

/**
 * TG-HP-109 — Editar tus datos en /configuracion (nombre/apellido/teléfono/zona).
 * Rol: Jugador logueado. Desde el 2.4b la Cuenta es una sola página; /perfil redirige.
 *
 * Evidence anchors: configuracion/ConfiguracionView.tsx, configuracion/ProfileForm.tsx,
 * configuracion/actions.ts.
 */

test.describe('TG-HP-109 — Editar tus datos', () => {
  test('guarda nombre/apellido/teléfono/zona → feedback inline + persiste en DB', async ({
    browser,
    playerStorageState,
  }) => {
    const sb = makeServiceClient()
    const ctx = await browser.newContext()
    await ctx.addCookies(JSON.parse(playerStorageState).cookies)
    const page = await ctx.newPage()

    try {
      await page.goto('/configuracion')
      await expect(page.getByRole('heading', { name: 'Mi cuenta', level: 1 })).toBeVisible()

      // Email es read-only: nota "El email no se puede cambiar.", sin <input>.
      await expect(page.getByText('El email no se puede cambiar.')).toBeVisible()
      await expect(page.locator(`input[value="${E2E_PLAYER_EMAIL}"]`)).not.toBeVisible()

      await page.locator('#first_name').fill('QA109')
      await page.locator('#last_name').fill('Jugador')
      await page.locator('#phone').fill('1122223333')
      await page.locator('#preferred_area').fill('Palermo')

      const saveBtn = page.getByRole('button', { name: 'Guardar cambios' })
      await expect(saveBtn).toBeEnabled()
      await saveBtn.click()
      // Anti-doble-submit: disabled={pending} (useActionState).

      // Feedback inline role="status" "Guardado" (no toast).
      await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible({
        timeout: 10_000,
      })
      // "Quién sos" (server-rendered) también refleja el nuevo nombre — prueba
      // que revalidatePath('/configuracion') re-fetcheó la página, no solo el estado local.
      await expect(page.getByText('QA109 Jugador')).toBeVisible({ timeout: 10_000 })

      const { data: row, error } = await sb
        .from('players')
        .select('first_name, last_name, phone, preferred_area, email')
        .eq('id', E2E_PLAYER_ID)
        .single()

      expect(error).toBeNull()
      expect(row?.first_name).toBe('QA109')
      expect(row?.last_name).toBe('Jugador')
      expect(row?.phone).toBe('+54 1122223333')
      expect(row?.preferred_area).toBe('Palermo')
      expect(row?.email).toBe(E2E_PLAYER_EMAIL) // el email NUNCA cambia

      // Reload: confirma que el UPDATE persistió server-side, no solo estado local.
      await page.reload()
      await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('QA109')

      await writeEvidence('TG-HP-109', {
        status: 'pass',
        db: row,
        notes:
          'UPDATE persistido bajo withPlayerContext; revalidatePath confirmado por el bloque "Quién sos" server-rendered.',
      })
    } finally {
      await ctx.close()
      await resetPlayer(sb) // PII tocada — restaura first_name/last_name/phone/preferred_area.
    }
  })
})
