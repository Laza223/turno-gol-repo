import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-009 — Suspended /suspended.
 * Rol: Visitante (no auth). Prereq: ninguno — página estática de destino (noIndex),
 * accesible por URL directa sin necesitar un tenant realmente suspendido.
 * Evidence anchors: suspended/page.tsx:5-8,13-19,26-42.
 *
 * NOTA: "Contactar a soporte" (mailto:) se verifica por href, sin click — igual
 * criterio que TG-HP-003 con tel:, para no depender del protocol-handler del OS.
 */
test.describe('TG-HP-009 — Suspended', () => {
  test('renderiza el estado de cuenta suspendida y navega a reactivar / inicio', async ({
    page,
  }) => {
    // Step 1-2: h1 "Tu cuenta está temporalmente suspendida"
    await page.goto('/suspended')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tu cuenta está temporalmente suspendida' }),
    ).toBeVisible()

    // Step 5 (alternativa, verificado antes de navegar): "Contactar a soporte" (mailto:)
    await expect(page.getByRole('link', { name: 'Contactar a soporte' })).toHaveAttribute(
      'href',
      'mailto:soporte@turnogol.app',
    )

    // Step 4: "Soy el dueño — regularizar el pago" → /reactivar
    await page.getByRole('link', { name: 'Soy el dueño — regularizar el pago' }).click()
    await page.waitForURL('/reactivar')
    expect(new URL(page.url()).pathname).toBe('/reactivar')
    await page.goBack()
    await page.waitForURL(/\/suspended$/)

    // Step 6: "Volver al inicio" → /
    await page.getByRole('link', { name: 'Volver al inicio' }).click()
    await page.waitForURL('/')
    expect(new URL(page.url()).pathname).toBe('/')

    await writeEvidence('TG-HP-009', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (página 100% estática)',
      notes:
        'mailto: verificado por href, sin click (evita el protocol-handler del OS en headless CI).',
    })
  })
})
