import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-003 — Perfil público del complejo /e2e-complejo-sena.
 * Rol: Visitante (no auth). Prereq: tenant `e2e-complejo-sena` seedeado (status 'active',
 * requires_deposit:true 50%, cancha Seña 1, opening_hours 08:00-23:00 todos los días).
 * No DB write. AvailabilityGrid es 100% client-side (fetch a /api/public/availability).
 * Evidence anchors: TenantHeader.tsx:59-109, page.tsx:97-99, AvailabilityGrid.tsx:190,258,297-305,150.
 *
 * NOTA: "Cómo llegar" (target=_blank a Google Maps) y el chip de teléfono (tel:) se
 * verifican por `href`, sin click — clickearlos dispara navegación externa real / el
 * protocol-handler del OS para tel:, lo que cuelga o es no determinístico en headless CI.
 */
test.describe('TG-HP-003 — Perfil público del complejo', () => {
  test('renderiza header + canchas + disponibilidad y navega a reservar', async ({ page }) => {
    // Step 1: perfil del tenant
    await page.goto('/e2e-complejo-sena')

    // Step 2: h1 con el nombre del tenant
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Complejo Seña' })).toBeVisible()

    // Step 3: sección "Canchas (N)"
    await expect(page.getByRole('heading', { name: /Canchas \(\d+\)/ })).toBeVisible()

    // Step 4-5: chips "Cómo llegar" (Maps) + teléfono (tel:) — solo href, sin click
    const mapsChip = page.getByRole('link', { name: /Cómo llegar/i })
    await expect(mapsChip).toHaveAttribute('target', '_blank')
    await expect(mapsChip).toHaveAttribute('href', /google\.com\/maps/)
    const telChip = page.getByRole('link', { name: /^\+?\d[\d\s-]*$/ })
    await expect(telChip).toHaveAttribute('href', /^tel:/)

    // Step 6: "Ver semana completa" → /e2e-complejo-sena/disponibilidad
    await page.getByRole('link', { name: 'Ver semana completa' }).click()
    await page.waitForURL(/\/e2e-complejo-sena\/disponibilidad$/)
    await expect(page.getByRole('heading', { name: 'Disponibilidad semanal' })).toBeVisible()

    // Step 7 (volver al perfil): back-link "{tenant.name}" de la vista semanal
    await page.getByRole('link', { name: /E2E Complejo Seña/ }).click()
    await page.waitForURL(/\/e2e-complejo-sena$/)

    // Sección "Disponibilidad" (h2) — auto-wait cubre el fetch client-side inicial a
    // /api/public/availability (AvailabilityGrid.tsx:190). No se afirma un slot "Reservar"
    // en el día de HOY acá: si el test corre tarde a la noche (cierre 23:00 del fixture),
    // todos los slots restantes de hoy pueden estar en status 'past' y no habría ninguno —
    // se verifica el slot recién en "Día siguiente" (mañana nunca tiene slots pasados).
    await expect(page.getByRole('heading', { name: 'Disponibilidad' })).toBeVisible()
    const reservarLinks = page.getByRole('link', { name: /^Reservar/ })

    // Step 8: "Día siguiente" — refetch de disponibilidad
    const nextDayFetch = page.waitForResponse(
      (r) =>
        r.url().includes('/api/public/availability') && r.url().includes('slug=e2e-complejo-sena'),
    )
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    await nextDayFetch
    await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeEnabled()

    // Step 9: click en un slot libre → navega a /reservar con court/date/time/dur
    await expect(reservarLinks.first()).toBeVisible()
    await reservarLinks.first().click()
    await page.waitForURL(/\/e2e-complejo-sena\/reservar\?/)
    const reservarUrl = new URL(page.url())
    expect(reservarUrl.pathname).toBe('/e2e-complejo-sena/reservar')
    expect(reservarUrl.searchParams.get('court')).toBeTruthy()
    expect(reservarUrl.searchParams.get('date')).toBeTruthy()
    expect(reservarUrl.searchParams.get('time')).toBeTruthy()
    expect(reservarUrl.searchParams.get('dur')).toBeTruthy()

    await writeEvidence('TG-HP-003', {
      status: 'pass',
      finalUrl: page.url(),
      reservarParams: Object.fromEntries(reservarUrl.searchParams.entries()),
      dbWrites:
        'none (getPublicTenant/getPublicCourtCards + fetch client-side a /api/public/availability, ambos lectura)',
      notes:
        'Cómo llegar / tel: verificados por atributo href, sin click (evita abrir Google Maps real / protocol-handler tel: en CI). ' +
        'Round-trip perfil → disponibilidad → perfil confirmado antes de ejercer la grilla.',
    })
  })
})
