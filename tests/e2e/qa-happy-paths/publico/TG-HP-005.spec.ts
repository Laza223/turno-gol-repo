import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-005 — Landing B2B /para-complejos → CTA a /register.
 * Rol: Visitante (no auth). Prereq: ninguno — página 100% estática, sin fetch/DB.
 * Todos los CTAs son <Link> de navegación (sin forms, sin toast).
 * Evidence anchors: para-complejos/page.tsx:145,170,174,178,181,339-344,552-564.
 *
 * NOTA: el layout (business) comparte BusinessHeader + BusinessFooter en TODAS las
 * páginas de este route group (layout.tsx:14-16), y ambos repiten "Empezar gratis" /
 * "Ingresar" fuera de `<main id="main-content">`. Se escopea todo a `#main-content`
 * para matchear los CTAs del hero/body citados por el manual, no los del nav global.
 */
test.describe('TG-HP-005 — Landing B2B /para-complejos', () => {
  test('hero + CTAs navegan a /register, /login y /precios', async ({ page }) => {
    const main = page.locator('#main-content')

    // Step 1-2: h1 "Tu complejo, siempre lleno."
    await page.goto('/para-complejos')
    await expect(
      page.getByRole('heading', { level: 1, name: /Tu complejo, siempre lleno\./ }),
    ).toBeVisible()

    // Step 4: CTA hero "Empezar gratis" → /register (dentro de #main-content: hero + CTA final)
    await main.getByRole('link', { name: 'Empezar gratis' }).first().click()
    await page.waitForURL('/register')
    expect(new URL(page.url()).pathname).toBe('/register')
    await page.goBack()
    await page.waitForURL(/\/para-complejos$/)

    // Step 5: "Ingresar" del hero → /login (único dentro de #main-content)
    await main.getByRole('link', { name: 'Ingresar' }).click()
    await page.waitForURL('/login')
    expect(new URL(page.url()).pathname).toBe('/login')
    await page.goBack()
    await page.waitForURL(/\/para-complejos$/)

    // Step 6: h2 "Cada función está diseñada para aumentar tu ocupación."
    await expect(
      page.getByRole('heading', { name: 'Cada función está diseñada para aumentar tu ocupación.' }),
    ).toBeVisible()

    // Step 7 (alternativa "Ver planes y precios"): CTA final → /precios
    await page.getByRole('link', { name: 'Ver planes y precios' }).click()
    await page.waitForURL('/precios')
    expect(new URL(page.url()).pathname).toBe('/precios')

    await writeEvidence('TG-HP-005', {
      status: 'pass',
      finalUrl: page.url(),
      dbWrites: 'none (página 100% estática)',
      notes:
        'Cubiertos: CTA hero "Empezar gratis"→/register, "Ingresar"→/login, CTA final ' +
        '"Ver planes y precios"→/precios (variante del step 7; el "Empezar gratis" final ' +
        'apunta al mismo /register ya probado en el hero, no se re-testea por redundante). ' +
        'GAP anotado: BusinessHeader/BusinessFooter (fuera de #main-content) repiten los mismos ' +
        'CTAs sitewide y no se ejercitaron acá — cobertura de nav global no es parte de este caso.',
    })
  })
})
