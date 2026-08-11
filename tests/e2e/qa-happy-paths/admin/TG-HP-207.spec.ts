import { test, expect } from '../../fixtures'
import { writeEvidence, runSql, jsonParam } from '../_qa/evidence'
import { E2E_COURT_ID, E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-207 — Editar cancha / desactivar-activar (court_status online/offline).
 * Rol: Editar (nombre/precio) = solo admin; activar/desactivar = admin+manager.
 * Prereq: Cancha E2E 1 (...010) existente y online — la fixture SEEDED, no una
 * cancha nueva: se opera sobre ella y se restaura su estado original en
 * `finally` porque otras bandas/casos de la corrida QA dependen de que siga
 * llamándose "Cancha E2E 1" y esté online.
 * Evidence anchors: src/app/(admin)/settings/canchas/actions.ts:93-217,
 *   CourtList.tsx:216-349, status-visual.tsx:16-29.
 */
test.describe('TG-HP-207 — Editar cancha / desactivar-activar', () => {
  test('admin edits the court name and toggles online↔offline, both persisted in DB', async ({
    browser,
    adminStorageState,
  }) => {
    const originalRows = await runSql<{ name: string; status: string; pricing: unknown }>(
      'SELECT name, status, pricing FROM courts WHERE id = $1',
      [E2E_COURT_ID],
    )
    const original = originalRows[0]
    expect(original).toBeDefined()
    expect(original!.status).toBe('online')
    const originalName = original!.name
    const editedName = `${originalName} Editado QA-207`

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // ── Editar ──────────────────────────────────────────────────────
      await page.goto('/settings/canchas')
      await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({ timeout: 15_000 })

      let courtCard = page.locator('div.rounded-lg').filter({ hasText: originalName })
      await expect(courtCard).toBeVisible({ timeout: 10_000 })
      await courtCard.getByRole('button', { name: /editar/i }).click()

      await expect(page.getByRole('heading', { name: 'Editar cancha' })).toBeVisible()
      const nameInput = page.locator('#court-name')
      await nameInput.fill(editedName)
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(editedName)).toBeVisible({ timeout: 10_000 })

      const afterEditRows = await runSql<{ name: string }>(
        'SELECT name FROM courts WHERE id = $1',
        [E2E_COURT_ID],
      )
      expect(afterEditRows[0]?.name).toBe(editedName)

      // ── Desactivar ──────────────────────────────────────────────────
      courtCard = page.locator('div.rounded-lg').filter({ hasText: editedName })
      await courtCard.getByRole('button', { name: 'Desactivar' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(`Desactivar ${editedName}`)).toBeVisible()
      await page.getByRole('button', { name: 'Desactivar' }).last().click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 })
      await expect(courtCard.getByText('Offline')).toBeVisible({ timeout: 10_000 })

      const afterOfflineRows = await runSql<{ status: string }>(
        'SELECT status FROM courts WHERE id = $1',
        [E2E_COURT_ID],
      )
      expect(afterOfflineRows[0]?.status).toBe('offline')

      // ── Activar ─────────────────────────────────────────────────────
      // "Activar" (a diferencia de "Desactivar") no pasa por ConfirmDialog: el
      // click dispara un optimistic update SÍNCRONO (setCurrentStatus('online')
      // antes del await a toggleStatusAction, CourtList.tsx:237-247) — el texto
      // "Online" puede quedar visible ANTES de que el UPDATE server-side termine.
      // expect.poll evita la carrera leyendo la DB hasta que el write real
      // aterrice (mismo patrón que TG-HP-225 con logo_url/cover_url).
      await courtCard.getByRole('button', { name: 'Activar' }).click()
      await expect(courtCard.getByText('Online')).toBeVisible({ timeout: 10_000 })

      let afterOnlineRows: Array<{ status: string }> = []
      await expect
        .poll(
          async () => {
            afterOnlineRows = await runSql<{ status: string }>(
              'SELECT status FROM courts WHERE id = $1',
              [E2E_COURT_ID],
            )
            return afterOnlineRows[0]?.status
          },
          { timeout: 10_000, message: 'courts.status no volvió a online' },
        )
        .toBe('online')
      expect(afterOnlineRows[0]?.status).toBe('online')

      await writeEvidence('TG-HP-207', {
        status: 'pass',
        courtId: E2E_COURT_ID,
        tenantId: E2E_TENANT_ID,
        editedName,
        afterEdit: afterEditRows[0],
        afterOffline: afterOfflineRows[0],
        afterOnline: afterOnlineRows[0],
        dbWrites:
          'courts.name (updateCourtAction) + courts.status ×2 (toggleCourtStatusAction offline→online)',
        notes:
          'Estado restaurado a "Cancha E2E 1"/online en finally — fixture compartida por la corrida QA.',
      })
    } finally {
      await context.close()
      // jsonParam(), NO JSON.stringify()+::jsonb — doble-codifica el objeto
      // (ver TG-HP-215, mismo bug de postgres.js confirmado con jsonb_typeof()).
      await runSql(
        'UPDATE courts SET name = $1, status = $2::court_status, pricing = $3 WHERE id = $4',
        [original!.name, original!.status, jsonParam(original!.pricing), E2E_COURT_ID],
      )
    }
  })
})
