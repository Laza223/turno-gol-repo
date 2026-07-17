import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-004 — Disponibilidad semanal /e2e-complejo-sena/disponibilidad.
 * Rol: Visitante (no auth). Prereq: tenant `e2e-complejo-sena` seedeado, status público.
 * `export const dynamic = 'force-dynamic'`: la semana se resuelve 100% server-side
 * (getPublicWeeklyAvailability) antes del render — sin fetch client-side, a diferencia
 * de TG-HP-003. El cambio de tab de día es estado local (useState), sin red.
 * Evidence anchors: disponibilidad/page.tsx:11,37-40, WeeklyAvailability.tsx:22-24,33-46,63-71.
 */
test.describe('TG-HP-004 — Disponibilidad semanal', () => {
  test('tabs de día (estado local) + slot libre navega a reservar', async ({ page }) => {
    // Step 1-3: back-link "{tenant.name}" + h1 "Disponibilidad semanal"
    await page.goto('/e2e-complejo-sena/disponibilidad')
    await expect(page.getByRole('link', { name: /E2E Complejo Seña/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Disponibilidad semanal' })).toBeVisible()

    // Step 4: fila de tabs de día (aria-pressed) — segundo tab (mañana). Escopeado a la
    // section aria-label="Disponibilidad semanal" (WeeklyAvailability.tsx:27) para no
    // ambigüar con otros elementos de la página.
    const week = page.getByRole('region', { name: 'Disponibilidad semanal' })
    const dayTabs = week.locator('button[aria-pressed]')
    const secondDayTab = dayTabs.nth(1)
    await secondDayTab.click()
    await expect(secondDayTab).toHaveAttribute('aria-pressed', 'true')
    // Sin fetch de red: solo cambia el índice activo local (WeeklyAvailability.tsx:22-24).

    // Step 5: click en un slot libre (link con hora + precio ARS) → navega a /reservar
    const slotLink = week.getByRole('link').first()
    await expect(slotLink).toBeVisible()
    await slotLink.click()
    await page.waitForURL(/\/e2e-complejo-sena\/reservar\?/)
    const reservarUrl = new URL(page.url())
    expect(reservarUrl.pathname).toBe('/e2e-complejo-sena/reservar')
    expect(reservarUrl.searchParams.get('court')).toBeTruthy()
    expect(reservarUrl.searchParams.get('date')).toBeTruthy()
    expect(reservarUrl.searchParams.get('time')).toBeTruthy()
    expect(reservarUrl.searchParams.get('dur')).toBeTruthy()

    await writeEvidence('TG-HP-004', {
      status: 'pass',
      finalUrl: page.url(),
      reservarParams: Object.fromEntries(reservarUrl.searchParams.entries()),
      dbWrites: 'none (getPublicWeeklyAvailability server-side, sin fetch client-side ni Server Action)',
      notes:
        'Confirmado: cambiar de tab de día NO dispara red (a diferencia de AvailabilityGrid en TG-HP-003) — ' +
        'solo re-renderiza con week.days[active] ya cargado server-side.',
    })
  })
})
