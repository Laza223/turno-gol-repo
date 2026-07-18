import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-007 — Privacidad /privacidad.
 * Rol: Visitante (no auth). Prereq: ninguno — página 100% estática (server component,
 * sin fetch/DB). Sin forms, sin toast.
 * Evidence anchors: privacidad/page.tsx:13-16,20,32-34.
 */
test.describe('TG-HP-007 — Privacidad', () => {
  test('renderiza política de privacidad completa', async ({ page }) => {
    // Step 1-2: h1 "Política de Privacidad"
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidad' })).toBeVisible()

    // Step 3: timestamp
    await expect(page.getByText('Última actualización: 25 de mayo de 2026.')).toBeVisible()

    // Step 4: sección "1. Quiénes somos" + mailto
    await expect(page.getByRole('heading', { name: '1. Quiénes somos' })).toBeVisible()
    await expect(page.locator('a[href="mailto:privacidad@turnogol.app"]')).toBeVisible()

    await writeEvidence('TG-HP-007', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (página 100% estática)',
      notes: 'Sin forms/toast/fetch — solo render de contenido legal estático.',
    })
  })
})
