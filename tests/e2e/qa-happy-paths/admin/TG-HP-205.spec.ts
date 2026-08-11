import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-205 — Subir PORTADA/cover del tenant a R2 (upload real).
 * Rol: Admin (dueño) — mismo guard/handler que TG-HP-204 (setTenantImageAction,
 * kind='cover').
 * Prereq: sesión admin, tenant Demo (con o sin coverUrl previo).
 * Flujo: /settings/perfil → placeholder "Subí una portada" → resize (aspect-video)
 *   + upload automático → <img> aparece.
 * Evidence anchors: src/app/(admin)/settings/perfil/actions.ts:32-81,
 *   PerfilImagesForm.tsx:76-88.
 */

// Mismo PNG sólido 120x120 que TG-HP-204 (sobrevive el crop 16:9 de cover).
const COVER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMCOYy5oWtYXCHTzA2Zh76ULj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzq9sJp65YlBngAAAABJRU5ErkJggg=='

test.describe('TG-HP-205 — Subir portada/cover del tenant a R2', () => {
  test('admin uploads a real cover image → R2 URL persisted in tenants.cover_url + <img> updates without reload', async ({
    browser,
    adminStorageState,
  }) => {
    const before = await runSql<{ cover_url: string | null }>(
      'SELECT cover_url FROM tenants WHERE id = $1',
      [E2E_TENANT_ID],
    )
    const originalCoverUrl = before[0]?.cover_url ?? null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // networkidle: el uploader es un componente cliente ('use client') — un
      // setInputFiles antes de que React hidrate el onChange es un no-op
      // silencioso (mismo gotcha que admin-create-booking-ui.spec.ts documenta
      // para /grilla).
      await page.goto('/settings/perfil', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Perfil público' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('heading', { name: 'Portada', exact: true })).toBeVisible()

      await page.getByLabel('Subí una portada').setInputFiles({
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: Buffer.from(COVER_PNG_BASE64, 'base64'),
      })

      // DB: setTenantImageAction('cover', ...) escribe cover_url ANTES de responder.
      await expect
        .poll(
          async () => {
            const rows = await runSql<{ cover_url: string | null }>(
              'SELECT cover_url FROM tenants WHERE id = $1',
              [E2E_TENANT_ID],
            )
            return rows[0]?.cover_url ?? null
          },
          { timeout: 15_000, message: 'cover_url no se actualizó en DB' },
        )
        .not.toBe(originalCoverUrl)

      const after = await runSql<{ cover_url: string | null }>(
        'SELECT cover_url FROM tenants WHERE id = $1',
        [E2E_TENANT_ID],
      )
      const newCoverUrl = after[0]?.cover_url
      if (!newCoverUrl) throw new Error('cover_url sigue null después del poll exitoso')

      expect(newCoverUrl).toMatch(/^https?:\/\/.+/)
      expect(newCoverUrl).toContain(`${E2E_TENANT_ID}/cover-`)

      // UI-sin-reload: setCoverUrl(result.url) — state local del cliente.
      await expect(page.locator(`img[src="${newCoverUrl}"]`)).toBeVisible({ timeout: 5_000 })

      await writeEvidence('TG-HP-205', {
        status: 'pass',
        tenantId: E2E_TENANT_ID,
        originalCoverUrl,
        newCoverUrl,
        dbWrites: 'tenants.cover_url (setTenantImageAction, actions.ts:73)',
        notes:
          'Upload real a R2; key = {tenantId}/cover-{uuid}.webp; aspect-video (16:9) en el uploader.',
      })
    } finally {
      await context.close()
      await runSql('UPDATE tenants SET cover_url = $1 WHERE id = $2', [
        originalCoverUrl,
        E2E_TENANT_ID,
      ])
    }
  })
})
