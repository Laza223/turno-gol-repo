import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-225 — Settings perfil `/settings/perfil`: flujo completo Logo +
 * Portada en la MISMA visita (R2 real, upload real).
 * Rol: solo Admin — `requireAdminStaffAction` (`actions.ts:36,87`).
 * Prereq: sesión admin, R2 configurado (`isR2Configured()===true` en este run).
 * Complementa TG-HP-204/205 (ya escritos por otra banda, cada uno prueba UN
 * uploader aislado con poll a DB) — este caso recorre la página COMO LA VERÍA
 * un admin completando su perfil de punta a punta: sube Logo y Portada en la
 * misma sesión, sin recarga entre medio.
 * GAP confirmado (manual, no aplica acá): `/settings/perfil` NO tiene form de
 * "datos públicos" (nombre/dirección/teléfono) — solo estas 2 secciones de
 * imagen (`PerfilImagesForm.tsx`, grep de address|description|publicPhone
 * sobre settings/perfil/** no matchea nada).
 * NO-PLATA: tenant Demo es fixture compartida — se restaura logo_url/cover_url
 * original en `finally` (no se borran los objetos nuevos de R2, bucket de dev).
 * Evidence anchors: src/app/(admin)/settings/perfil/actions.ts:32-81,
 *   src/app/(admin)/settings/perfil/PerfilImagesForm.tsx:24-97.
 */

// PNG sólido 120x120 (mismo que TG-HP-204/205 — zlib puro, sobrevive el
// center-crop cuadrado del logo Y el 16:9 de la portada).
const IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMCOYy5oWtYXCHTzA2Zh76ULj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzq9sJp65YlBngAAAABJRU5ErkJggg=='

test.describe('TG-HP-225 — Settings perfil: logo + portada en un solo flujo', () => {
  test('admin sube logo y portada en la misma visita → ambas URLs persisten en tenants', async ({
    browser,
    adminStorageState,
  }) => {
    const [before] = await runSql<{ logo_url: string | null; cover_url: string | null }>(
      'SELECT logo_url, cover_url FROM tenants WHERE id = $1',
      [E2E_TENANT_ID],
    )
    const originalLogoUrl = before?.logo_url ?? null
    const originalCoverUrl = before?.cover_url ?? null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      await page.goto('/settings/perfil')
      await expect(page.getByRole('heading', { name: 'Perfil público' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('heading', { name: 'Logo', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Portada', exact: true })).toBeVisible()

      // ── Logo ────────────────────────────────────────────────────────────
      await page.getByLabel('Subí el logo de tu complejo').setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(IMAGE_PNG_BASE64, 'base64'),
      })
      // setTenantImageAction escribe logo_url en DB ANTES de devolver la url —
      // pollear la fila es la señal autoritativa de éxito (mismo patrón TG-HP-204).
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

      // ── Portada — MISMA página, sin recarga entre logo y portada ──────────
      await page.getByLabel('Subí una portada').setInputFiles({
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: Buffer.from(IMAGE_PNG_BASE64, 'base64'),
      })
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

      const [after] = await runSql<{ logo_url: string | null; cover_url: string | null }>(
        'SELECT logo_url, cover_url FROM tenants WHERE id = $1',
        [E2E_TENANT_ID],
      )
      const newLogoUrl = after?.logo_url
      const newCoverUrl = after?.cover_url
      if (!newLogoUrl || !newCoverUrl) {
        throw new Error('logo_url/cover_url siguen null después del poll exitoso')
      }
      expect(newLogoUrl).toMatch(/^https?:\/\/.+/)
      expect(newCoverUrl).toMatch(/^https?:\/\/.+/)
      expect(newLogoUrl).toContain(`${E2E_TENANT_ID}/logo-`)
      expect(newCoverUrl).toContain(`${E2E_TENANT_ID}/cover-`)

      // UI-sin-reload: ambos <img> conviven en la página sin haber navegado.
      await expect(page.locator(`img[src="${newLogoUrl}"]`)).toBeVisible({ timeout: 5_000 })
      await expect(page.locator(`img[src="${newCoverUrl}"]`)).toBeVisible({ timeout: 5_000 })
      // Next monta '__next-route-announcer__' con role="alert" SIEMPRE (App Router,
      // ajeno a este flujo) — excluirlo para no contar un falso positivo.
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0)

      await writeEvidence('TG-HP-225', {
        status: 'pass',
        tenantId: E2E_TENANT_ID,
        originalLogoUrl,
        originalCoverUrl,
        newLogoUrl,
        newCoverUrl,
        dbWrites: 'tenants.logo_url + tenants.cover_url (setTenantImageAction x2, actions.ts:73)',
        notes:
          'Complementa TG-HP-204/205 (uploaders aislados): acá se suben ambas imágenes en la misma visita, ' +
          'sin recarga entre medio. GAP confirmado: /settings/perfil no tiene form de "datos públicos", solo Logo+Portada.',
      })
    } finally {
      await context.close()
      await runSql(
        'UPDATE tenants SET logo_url = $1, cover_url = $2, updated_at = now() WHERE id = $3',
        [originalLogoUrl, originalCoverUrl, E2E_TENANT_ID],
      )
    }
  })
})
