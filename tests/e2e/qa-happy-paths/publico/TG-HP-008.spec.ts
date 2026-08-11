import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-008 — Términos /terminos.
 * Rol: Visitante (no auth). Prereq: ninguno — página 100% estática, sin fetch/DB.
 * Evidence anchors: terminos/page.tsx:13-16,20,24.
 */
test.describe('TG-HP-008 — Términos', () => {
  test('renderiza términos y condiciones completos', async ({ page }) => {
    // Step 1-2: h1 "Términos y Condiciones"
    await page.goto('/terminos')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Términos y Condiciones' }),
    ).toBeVisible()

    // Step 3: timestamp
    await expect(page.getByText('Última actualización: 25 de mayo de 2026.')).toBeVisible()

    // Step 4: sección "1. Objeto del servicio" + "TurnoGol no es la cancha"
    await expect(page.getByRole('heading', { name: '1. Objeto del servicio' })).toBeVisible()
    await expect(page.getByText('TurnoGol no es la cancha')).toBeVisible()

    await writeEvidence('TG-HP-008', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (página 100% estática)',
      notes: 'Sin forms/toast/fetch — solo render de contenido legal estático.',
    })
  })
})
