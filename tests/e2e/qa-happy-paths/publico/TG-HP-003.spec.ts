import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-003 — Perfil público del complejo /e2e-complejo-sena.
 * Rol: Visitante (no auth). Prereq: tenant `e2e-complejo-sena` seedeado (status 'active',
 * requires_deposit:true 50%, cancha Seña 1, opening_hours 08:00-23:00 todos los días).
 * No DB write. La reserva (ReserveSection) es 100% client-side (fetch a /api/public/availability).
 * Evidence anchors: ComplexHero.tsx, ReserveSection.tsx, HourGrid.tsx, ReserveBar.tsx.
 *
 * NOTA: "Cómo llegar" (target=_blank a Google Maps) y el link de contacto (wa.me o tel:) se
 * verifican por `href`, sin click — clickearlos dispara navegación externa real / el
 * protocol-handler del OS para tel:, lo que cuelga o es no determinístico en headless CI.
 */
test.describe('TG-HP-003 — Perfil público del complejo', () => {
  test('renderiza la cabecera y navega a reservar eligiendo día, hora y cancha', async ({
    page,
  }) => {
    // Step 1: perfil del tenant
    await page.goto('/e2e-complejo-sena')

    // Step 2: h1 con el nombre del tenant
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Complejo Seña' })).toBeVisible()

    // Step 3: línea de datos con la cantidad de canchas ("1 cancha · Fútbol 5") + "Cómo llegar" (Maps), solo href
    await expect(page.getByText(/^\d+ canchas? · /)).toBeVisible()
    const mapsLink = page.getByRole('link', { name: /Cómo llegar/i })
    await expect(mapsLink).toHaveAttribute('target', '_blank')
    await expect(mapsLink).toHaveAttribute('href', /google\.com\/maps/)

    // Step 4: contacto — WhatsApp si el número sirve, si no "Llamar"; solo href
    const contactLink = page.getByRole('link', { name: /^(WhatsApp|Llamar)$/ })
    await expect(contactLink).toHaveAttribute('href', /^(https:\/\/wa\.me\/|tel:)/)

    // Step 5: la reserva es una pantalla: fila de días con hoy elegido de entrada.
    // No se reserva hoy acá: si el test corre tarde a la noche (cierre 23:00 del fixture) todas las
    // horas pueden haber pasado; mañana nunca tiene horas pasadas.
    const reserva = page.getByRole('region', { name: 'Reservá tu turno' })
    const dias = reserva.getByRole('group', { name: 'Día' })
    await expect(dias.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')

    // Step 6: elegir mañana — pide la disponibilidad del día
    const nextDayFetch = page.waitForResponse(
      (r) =>
        r.url().includes('/api/public/availability') && r.url().includes('slug=e2e-complejo-sena'),
    )
    await dias.getByRole('button').nth(1).click()
    await nextDayFetch

    // Step 7: elegir la primera hora con lugar → sube la barra "Tu turno" con las canchas libres
    // (radio, la primera elegida) y el botón "Reservar"
    const horas = reserva.getByRole('group', { name: 'Hora' })
    await horas.getByRole('button', { disabled: false }).first().click()
    const barra = page.getByRole('complementary', { name: 'Tu turno' })
    await expect(barra.getByRole('radiogroup', { name: 'Cancha' })).toBeVisible()
    await expect(barra.getByRole('radio').first()).toBeChecked()

    // Step 8: "Reservar" → navega a /reservar con court/date/time/dur
    await barra.getByRole('link', { name: /^Reservar/ }).click()
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
        'Cómo llegar / contacto verificados por atributo href, sin click (evita abrir Google Maps real / wa.me / protocol-handler tel: en CI). ' +
        'Día siguiente → primera hora con lugar → barra con la primera cancha → Reservar → /reservar.',
    })
  })
})
