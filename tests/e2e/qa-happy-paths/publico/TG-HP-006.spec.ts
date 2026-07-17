import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-006 — Precios /precios.
 * Rol: Visitante (no auth). Prereq: ninguno — página estática, PlanSelector/CalculadoraClavo
 * son islands 'use client' con datos locales (plans-data.ts), sin fetch/DB.
 * Evidence anchors: precios/page.tsx:141, PlanSelector.tsx:34-106,133-219, plans-data.ts:26-53.
 *
 * NOTA: "Empezar 30 días gratis" se repite en las 3 plan cards + el CTA final (misma
 * página) — se escopea al card activo (el que renderiza el badge "Para tus canchas",
 * visible solo en `isActive`, PlanSelector.tsx:161-165) para no ambigüar.
 */
test.describe('TG-HP-006 — Precios', () => {
  test('selector de canchas + ciclo anual + FAQ', async ({ page }) => {
    // Step 1-2: h1 "Lo que te deja un turno,"
    await page.goto('/precios')
    await expect(
      page.getByRole('heading', { level: 1, name: /Lo que te deja un turno,/ }),
    ).toBeVisible()

    // Step 3: radiogroup "¿Cuántas canchas tenés?" → opción "3" → anuncio aria-live
    const courtsGroup = page.getByRole('radiogroup', { name: '¿Cuántas canchas tenés?' })
    await courtsGroup.getByRole('radio', { name: '3', exact: true }).click()
    await expect(page.getByText('Para 3 canchas, tu plan es')).toBeVisible()
    await expect(page.getByText('Para 3 canchas, tu plan es')).toContainText('Complejo')

    // Step 4: ciclo "Anual" → card activa (badge "Para tus canchas") con precio tachado + ahorro
    const cycleGroup = page.getByRole('radiogroup', { name: 'Ciclo de facturación' })
    await cycleGroup.getByRole('radio', { name: /Anual/i }).click()
    const activeCard = page.locator('div').filter({ hasText: 'Para tus canchas' }).last()
    await expect(activeCard.getByText('Para tus canchas')).toBeVisible()
    await expect(activeCard.locator('s')).toBeVisible() // precio mensual tachado
    await expect(activeCard.getByText(/Ahorrás .* al año/)).toBeVisible()

    // Step 5: "Empezar 30 días gratis" de la card activa → /register
    await activeCard.getByRole('link', { name: 'Empezar 30 días gratis' }).click()
    await page.waitForURL('/register')
    expect(new URL(page.url()).pathname).toBe('/register')
    await page.goBack()
    await page.waitForURL(/\/precios$/)

    // Step 6: "Cuenta del clavo" (calculadora)
    await expect(
      page.getByRole('heading', { name: '¿Cuánto te cuesta el que no viene?' }),
    ).toBeVisible()

    // Step 7: FAQ — expandir "¿Mis clientes tienen que bajarse una app?"
    const faqQuestion = '¿Mis clientes tienen que bajarse una app?'
    const faqDetails = page.locator('details').filter({ hasText: faqQuestion })
    await expect(faqDetails).toHaveJSProperty('open', false)
    await faqDetails.locator('summary').click()
    await expect(faqDetails).toHaveJSProperty('open', true)

    await writeEvidence('TG-HP-006', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (constantes locales de plans-data.ts, sin fetch/DB)',
      notes:
        'Plan activo por defecto (courts=3) = Complejo, confirmado por el anuncio aria-live. ' +
        'CalculadoraClavo (Cuenta del clavo) solo se verificó por presencia del heading, sin ' +
        'ejercer sus inputs — fuera del alcance citado por el manual para este caso.',
    })
  })
})
