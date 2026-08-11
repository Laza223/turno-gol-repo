import { randomUUID } from 'node:crypto'
import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { makeServiceClient, E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { suppressPushPrompt } from '../_qa/session'

/**
 * TG-HP-206 — Crear cancha + subir FOTOS a R2 (≤6, upload real).
 * Rol: Admin (dueño) — requireAdminStaffAction en create/update/upload.
 * GAP importante (documentado, no es bug): el uploader de fotos SOLO aparece en
 * modo EDICIÓN (CourtForm.tsx:250-268) — hay que crear la cancha primero y
 * reabrirla en "Editar" para subir fotos.
 * Evidence anchors: src/app/(admin)/settings/canchas/actions.ts:34-91,226-277,
 *   CourtForm.tsx:162-283, CourtList.tsx:128-149.
 */

// Mismo PNG sólido 120x120 que TG-HP-204/205 (sobrevive el crop 4:3 de "court").
const PHOTO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMCOYy5oWtYXCHTzA2Zh76ULj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzq9sJp65YlBngAAAABJRU5ErkJggg=='

const PHOTO_COUNT = 3

test.describe('TG-HP-206 — Crear cancha + subir fotos a R2', () => {
  test('admin creates a court then uploads up to 6 real photos in edit mode → R2 URLs persisted in courts.photos', async ({
    browser,
    adminStorageState,
  }) => {
    const supabase = makeServiceClient()
    const courtName = `E2E Cancha QA-206 ${randomUUID().slice(0, 8)}`
    let createdCourtId: string | null = null

    const context = await browser.newContext()
    await suppressPushPrompt(context)
    try {
      await context.addCookies(JSON.parse(adminStorageState).cookies)
      const page = await context.newPage()

      // Step 1-2: /settings/canchas → "+ Nueva cancha". networkidle: el uploader de
      // fotos es un componente cliente — setInputFiles antes de hidratar es
      // un no-op silencioso (mismo gotcha de admin-create-booking-ui.spec.ts).
      await page.goto('/settings/canchas', { waitUntil: 'networkidle' })
      await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: '+ Nueva cancha' }).click()
      await expect(page.getByRole('heading', { name: 'Nueva cancha' })).toBeVisible()

      // Step 3-4: nombre + precio (plantilla rápida, cubre toda la semana).
      await page.getByPlaceholder('Ej: Cancha 1').fill(courtName)
      await page.getByLabel('Precio por turno').fill('10000')
      await page.getByRole('button', { name: 'Aplicar a toda la semana' }).click()

      // Step 5: crear.
      await page.getByRole('button', { name: 'Crear cancha' }).click()
      await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(courtName)).toBeVisible({ timeout: 10_000 })

      const { data: rows } = await supabase
        .from('courts')
        .select('id')
        .eq('tenant_id', E2E_TENANT_ID)
        .eq('name', courtName)
        .limit(1)
      createdCourtId = rows?.[0]?.id ?? null
      expect(createdCourtId).not.toBeNull()

      // Step 7: reabrir en modo edición — ahí aparece la sección Fotos.
      const courtCard = page.locator('div.rounded-lg').filter({ hasText: courtName })
      await courtCard.getByRole('button', { name: /editar/i }).click()
      await expect(page.getByText('Fotos', { exact: true })).toBeVisible({ timeout: 10_000 })

      // Step 8: subir 3 de las 6 posibles (upload real a R2, uno por vez).
      for (let i = 0; i < PHOTO_COUNT; i++) {
        await page.getByLabel('Agregar foto').setInputFiles({
          name: `court-photo-${i}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from(PHOTO_PNG_BASE64, 'base64'),
        })
        await expect(page.getByText(`${i + 1}/6`, { exact: true })).toBeVisible({ timeout: 10_000 })
      }

      // Step 9: guardar el resto del form (nombre/precios) — las fotos ya
      // persistieron individualmente vía uploadCourtPhotoAction.
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(page.getByRole('heading', { name: 'Canchas' })).toBeVisible({ timeout: 10_000 })

      // DB: courts.photos debe tener las 3 URLs de R2, con el key format
      // {tenantId}/courts/{courtId}/{uuid}.webp.
      const photoRows = await runSql<{ photos: string[] }>(
        'SELECT photos FROM courts WHERE id = $1',
        [createdCourtId],
      )
      const photos = photoRows[0]?.photos ?? []
      expect(photos).toHaveLength(PHOTO_COUNT)
      for (const url of photos) {
        expect(url).toMatch(/^https?:\/\/.+/)
        expect(url).toContain(`${E2E_TENANT_ID}/courts/${createdCourtId}/`)
      }

      await writeEvidence('TG-HP-206', {
        status: 'pass',
        courtId: createdCourtId,
        courtName,
        photos,
        dbWrites:
          'courts (INSERT) + courts.photos (appendCourtPhoto ×3, canchas/actions.ts:266-269)',
        notes:
          'Upload real a R2; el uploader de fotos solo existe en modo edición (CourtForm.tsx:250-268).',
      })
    } finally {
      await context.close()
      if (createdCourtId) {
        const { error } = await supabase.from('courts').delete().eq('id', createdCourtId)
        if (error) console.warn(`[TG-HP-206] cleanup court DELETE failed: ${error.message}`)
      }
    }
  })
})
