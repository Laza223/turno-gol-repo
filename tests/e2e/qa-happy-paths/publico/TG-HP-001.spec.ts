import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-001 — Home/landing: render + buscador de canchas.
 * Rol: Visitante (no auth). Prereq: ninguno (página pública ISR).
 * Reference spec for the QA run — copy this shape (anon page, 3-layer asserts,
 * writeEvidence at the end). No DB write; UI-sin-reload = router.push a /explorar.
 * Evidence anchors: src/app/home/Hero.tsx:64-67, src/components/site/HeroSearch.tsx:120-233.
 */
test.describe('TG-HP-001 — Home + buscador', () => {
  test('home renders hero + search navigates to /explorar with query params', async ({
    page,
  }) => {
    // Step 1-2: home + h1
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /Reservá tu cancha al instante/i }),
    ).toBeVisible()

    // Step 3: floating nav — Explorar link + Ingresar CTA (deslogueado)
    await expect(page.getByRole('link', { name: 'Explorar' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ingresar' }).first()).toBeVisible()

    // Step 4: hero search (vertical layout) — Complejo input #hero-q-v
    const q = page.locator('#hero-q-v')
    await expect(q).toBeVisible()
    await q.fill('demo')

    // Step 6-7: Buscar canchas → router.push a /explorar?q=demo
    await page.getByRole('button', { name: /Buscar canchas/i }).click()
    await page.waitForURL(/\/explorar(\?|$)/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/explorar')
    expect(url.searchParams.get('q')).toBe('demo')

    await writeEvidence('TG-HP-001', {
      status: 'pass',
      finalUrl: page.url(),
      qParam: url.searchParams.get('q'),
      dbWrites: 'none (public ISR page, server-side reads only)',
      notes: 'router.push client-side a /explorar; sin toast, sin fetch a /api.',
    })
  })
})
