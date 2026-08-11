import { test, expect } from '../../fixtures'
import { writeEvidence, runSql, jsonParam } from '../_qa/evidence'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-222 — Settings reservas `/settings/reservas`: activar/desactivar seña
 * + `deposit_percentage` (+ reservas online + anticipación de cancelación).
 * Rol: solo Admin — `requireAdminStaffAction` (`actions.ts:26`). El gate de
 * acceso a TODO `/settings/*` para manager se verifica en TG-HP-226.
 * Prereq: ninguno especial. Mock data (manual): Requerir seña ON, 50%,
 * Reservas online Habilitadas, Anticipación 24hs (distinto del default 12hs
 * del seed, para probar una persistencia real, no un no-op).
 * NO-PLATA: el tenant Demo es fixture compartida por el resto de la corrida —
 * se captura `settings` original y se restaura en `finally`.
 * Evidence anchors: src/app/(admin)/settings/reservas/actions.ts:1-79,
 *   src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx:28-284.
 */
test.describe('TG-HP-222 — Settings reservas: seña + reservas online + anticipación', () => {
  test('admin guarda políticas de reserva → persisten en tenants.settings', async ({
    browser,
    adminStorageState,
  }) => {
    const [before] = await runSql<{ settings: Record<string, unknown> }>(
      'SELECT settings FROM tenants WHERE id = $1',
      [E2E_TENANT_ID],
    )
    const originalSettings = before?.settings
    if (!originalSettings) throw new Error('No se pudo leer tenants.settings antes del test')

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/settings/reservas')
      await expect(page.getByRole('heading', { name: 'Políticas de Reserva' })).toBeVisible({
        timeout: 15_000,
      })

      // Retry de la secuencia completa (chips + submit + verificación en DB):
      // en dev local el PRIMER hit a esta ruta puede recompilar a mitad de la
      // interacción (Turbopack + Fast Refresh — confirmado con [Fast Refresh]
      // en la consola de la página, justo antes del click en "Guardar
      // cambios"), lo que remonta el form y resetea el useState local a su
      // valor inicial (false) justo antes del submit. Los 4 setters de chips
      // son absolutos (setRequiresDeposit(true), no un toggle), así que
      // reclickearlos es idempotente — sin relajar la aserción final de DB.
      let row:
        | {
            requires_deposit: boolean
            deposit_percentage: number
            allow_online_booking: boolean
            hours_before: number
          }
        | undefined
      await expect(async () => {
        // Seña: ON + 50%.
        await page.getByRole('button', { name: 'Requerir seña' }).click()
        await page.getByRole('button', { name: '50%' }).click()

        // Reservas online: Habilitadas.
        // exact:true — 'Habilitadas' es substring case-insensitive de 'Deshabilitadas'
        // (el chip opuesto), strict mode matchea los 2 sin match exacto.
        await page.getByRole('button', { name: 'Habilitadas', exact: true }).click()

        // Anticipación mínima para cancelar: 24 hs (default seed = 12hs).
        await page.getByRole('button', { name: '24 hs' }).click()

        await page.getByRole('button', { name: 'Guardar cambios' }).click()
        await expect(page.getByText('Políticas guardadas.')).toBeVisible({ timeout: 10_000 })

        // DB layer.
        ;[row] = await runSql<{
          requires_deposit: boolean
          deposit_percentage: number
          allow_online_booking: boolean
          hours_before: number
        }>(
          `SELECT (settings->>'requires_deposit')::boolean AS requires_deposit,
                  (settings->>'deposit_percentage')::int AS deposit_percentage,
                  (settings->>'allow_online_booking')::boolean AS allow_online_booking,
                  (settings->'cancellation_policy'->>'hours_before')::int AS hours_before
           FROM tenants WHERE id = $1`,
          [E2E_TENANT_ID],
        )
        expect(row?.requires_deposit).toBe(true)
        expect(row?.deposit_percentage).toBe(50)
        expect(row?.allow_online_booking).toBe(true)
        expect(row?.hours_before).toBe(24)
      }).toPass({ timeout: 30_000 })

      // UI-sin-reload: el chip "Requerir seña" sigue marcado activo sin navegación.
      await expect(page.getByRole('button', { name: 'Requerir seña' })).toHaveClass(
        /border-emerald-500/,
      )

      await writeEvidence('TG-HP-222', {
        status: 'pass',
        dbRow: row,
        dbWrites:
          'tenants.settings (requires_deposit, deposit_percentage, allow_online_booking, cancellation_policy.hours_before)',
        notes:
          'no_show_penalty NO se persiste — softban por reincidencia sin config por complejo (actions.ts:50-51).',
      })
    } finally {
      await context.close()
      // jsonParam(), NO JSON.stringify()+::jsonb — doble-codifica el objeto
      // (ver TG-HP-215, mismo bug de postgres.js confirmado con jsonb_typeof()).
      await runSql('UPDATE tenants SET settings = $1, updated_at = now() WHERE id = $2', [
        jsonParam(originalSettings),
        E2E_TENANT_ID,
      ])
    }
  })
})
