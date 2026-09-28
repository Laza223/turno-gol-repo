import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-005 — Landing B2B /para-complejos → CTA a /register.
 * Rol: Visitante (no auth). Prereq: ninguno — página 100% estática, sin fetch/DB.
 * Los CTAs son <Link> de navegación y un link externo a WhatsApp (sin forms, sin toast).
 * Evidence anchors: para-complejos/page.tsx:36-45,71-72,141,221,252,262-265.
 *
 * NOTA: el layout (business) comparte BusinessHeader + BusinessFooter en TODAS las
 * páginas de este route group, y ambos repiten "Empezar gratis" / "Ingresar" fuera
 * de `<main id="main-content">`. Se escopea todo a `#main-content` para matchear los
 * CTAs del hero/body citados por el manual, no los del nav global.
 */
test.describe('TG-HP-005 — Landing B2B /para-complejos', () => {
  test('hero + CTAs navegan a /register y /precios, y WhatsApp abre el chat', async ({ page }) => {
    const main = page.locator('#main-content')

    // Step 1-2: h1 "Chau, reserva de palabra."
    await page.goto('/para-complejos')
    await expect(
      page.getByRole('heading', { level: 1, name: /Chau, reserva de palabra\./ }),
    ).toBeVisible()

    // Step 3: "Escribinos por WhatsApp" es externo (wa.me, pestaña nueva) — no se navega.
    const whatsapp = main.getByRole('link', { name: 'Escribinos por WhatsApp' }).first()
    await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
    await expect(whatsapp).toHaveAttribute('target', '_blank')

    // Step 4: CTA hero "Probalo 30 días" → /register (hero + cierre; se prueba el primero)
    await main
      .getByRole('link', { name: /Probalo 30 días/ })
      .first()
      .click()
    await page.waitForURL('/register')
    expect(new URL(page.url()).pathname).toBe('/register')
    await page.goBack()
    await page.waitForURL(/\/para-complejos$/)

    // Step 5: h2 "Así viaja una seña." (el recorrido de 4 pasos)
    await expect(page.getByRole('heading', { name: 'Así viaja una seña.' })).toBeVisible()

    // Step 6: el ancla "Funciones" del header (#features) existe en la página
    await expect(page.locator('#features')).toHaveCount(1)

    // Step 7: link del cierre "Ver precios" → /precios
    await main.getByRole('link', { name: 'Ver precios' }).click()
    await page.waitForURL('/precios')
    expect(new URL(page.url()).pathname).toBe('/precios')

    await writeEvidence('TG-HP-005', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (página 100% estática)',
      notes:
        'Cubiertos: CTA hero "Probalo 30 días"→/register, "Escribinos por WhatsApp" con ' +
        'href wa.me y target _blank (no se abre: es externo), ancla #features y "Ver precios"' +
        '→/precios. El "Probalo 30 días" del cierre apunta al mismo /register ya probado ' +
        'en el hero, no se re-testea por redundante. GAP anotado: BusinessHeader/BusinessFooter ' +
        '(fuera de #main-content) repiten CTAs sitewide y no se ejercitaron acá.',
    })
  })
})
