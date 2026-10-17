import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-004 — El link viejo /e2e-complejo-sena/disponibilidad redirige a la ficha del complejo.
 * Rol: Visitante (no auth). Prereq: tenant `e2e-complejo-sena` seedeado, status público.
 * La vista semanal se sacó (PR 2.3a): `next.config.ts` manda `/:slug/disponibilidad` a `/:slug`
 * con un 308, así que los links viejos (WhatsApp, buscadores) siguen andando. Sin DB write.
 */
test.describe('TG-HP-004 — /disponibilidad redirige a la ficha', () => {
  test('el link viejo termina en la ficha del complejo', async ({ page }) => {
    await page.goto('/e2e-complejo-sena/disponibilidad')
    await page.waitForURL(/\/e2e-complejo-sena$/)
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Complejo Seña' })).toBeVisible()

    await writeEvidence('TG-HP-004', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (redirect 308 de next.config.ts)',
      notes: 'La vista semanal ya no existe: /disponibilidad termina en la ficha del complejo.',
    })
  })
})
