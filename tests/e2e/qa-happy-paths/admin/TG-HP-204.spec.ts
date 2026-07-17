import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-204 — Subir LOGO del tenant a R2 (upload real, R2 configurado en este run).
 * Rol: Admin (dueño) — requireAdminStaffAction.
 * Prereq: sesión admin, tenant Demo (con o sin logoUrl previo).
 * Flujo: /settings/perfil → elegir archivo en el placeholder "Subí el logo de tu
 *   complejo" → resize+upload automático (sin submit adicional) → <img> aparece.
 * Evidence anchors: src/app/(admin)/settings/perfil/actions.ts:20,32-81,
 *   PerfilImagesForm.tsx:60-74, image-uploader.tsx:19-23,138-165.
 */

// PNG sólido 120x120 (verde), generado con zlib puro — bytes mínimos válidos
// que sobreviven el center-crop de resizeToPreset (evita canvas 0x0 de una
// imagen 1x1). Ver docs/testing/HAPPY_PATHS_MASTER.md líneas 988-1029.
const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMCOYy5oWtYXCHTzA2Zh76ULj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzq9sJp65YlBngAAAABJRU5ErkJggg=='

test.describe('TG-HP-204 — Subir logo del tenant a R2', () => {
  test('admin uploads a real logo image → R2 URL persisted in tenants.logo_url + <img> updates without reload', async ({
    browser,
    adminStorageState,
  }) => {
    const before = await runSql<{ logo_url: string | null }>(
      'SELECT logo_url FROM tenants WHERE id = $1',
      [E2E_TENANT_ID],
    )
    const originalLogoUrl = before[0]?.logo_url ?? null

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
      await expect(page.getByRole('heading', { name: 'Logo', exact: true })).toBeVisible()

      // Step 2-3: elegir archivo en el placeholder oculto (aria-label = emptyLabel).
      await page
        .getByLabel('Subí el logo de tu complejo')
        .setInputFiles({
          name: 'logo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(LOGO_PNG_BASE64, 'base64'),
        })

      // DB: setTenantImageAction sube a R2 y ESCRIBE logo_url ANTES de devolver
      // la url al cliente — pollear la fila es la señal autoritativa de éxito.
      await expect
        .poll(
          async () => {
            const rows = await runSql<{ logo_url: string | null }>(
              'SELECT logo_url FROM tenants WHERE id = $1',
              [E2E_TENANT_ID],
            )
            return rows[0]?.logo_url ?? null
          },
          { timeout: 15_000, message: 'logo_url no se actualizó en DB' },
        )
        .not.toBe(originalLogoUrl)

      const after = await runSql<{ logo_url: string | null }>(
        'SELECT logo_url FROM tenants WHERE id = $1',
        [E2E_TENANT_ID],
      )
      const newLogoUrl = after[0]?.logo_url
      if (!newLogoUrl) throw new Error('logo_url sigue null después del poll exitoso')

      expect(newLogoUrl).toMatch(/^https?:\/\/.+/)
      expect(newLogoUrl).toContain(`${E2E_TENANT_ID}/logo-`)

      // UI-sin-reload: el <img> se actualiza por setLogoUrl(result.url) — state
      // local del cliente, no revalidatePath.
      await expect(page.locator(`img[src="${newLogoUrl}"]`)).toBeVisible({ timeout: 5_000 })

      await writeEvidence('TG-HP-204', {
        status: 'pass',
        tenantId: E2E_TENANT_ID,
        originalLogoUrl,
        newLogoUrl,
        dbWrites: 'tenants.logo_url (setTenantImageAction, actions.ts:73)',
        notes: 'Upload real a R2 (isR2Configured()=true en este run); key = {tenantId}/logo-{uuid}.webp.',
      })
    } finally {
      await context.close()
      // Restaura el valor original — tenant Demo es fixture compartida por el
      // resto de la corrida QA. No se borra el objeto R2 (bucket de dev).
      await runSql('UPDATE tenants SET logo_url = $1 WHERE id = $2', [
        originalLogoUrl,
        E2E_TENANT_ID,
      ])
    }
  })
})
