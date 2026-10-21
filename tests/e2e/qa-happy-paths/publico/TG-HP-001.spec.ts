import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-001 — Home/landing: render + buscador de canchas.
 * Rol: Visitante (no auth). Prereq: ninguno (página pública ISR).
 * Reference spec for the QA run — copy this shape (anon page, 3-layer asserts,
 * writeEvidence at the end). No DB write; UI-sin-reload = router.push a /explorar.
 * Evidence anchors: src/app/home/HeroDesktop.tsx, src/components/site/HeroSearch.tsx, src/components/site/PortalHeader.tsx.
 */
test.describe('TG-HP-001 — Home + buscador', () => {
  test('home renders hero + search navigates to /explorar with query params', async ({ page }) => {
    // Step 1-2: home + h1 ("Tu partido empieza en TurnoGol")
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /Tu partido empieza en TurnoGol/i }),
    ).toBeVisible()

    // Step 3: barra overlay — Explorar link + Ingresar CTA (deslogueado)
    await expect(page.getByRole('link', { name: 'Explorar' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ingresar' }).first()).toBeVisible()

    // Step 4: buscador del hero (localidad / fecha / hora) — elegir la hora
    await page.getByRole('button', { name: 'Hora' }).click()
    await page.getByRole('menuitem', { name: '20:00' }).click()

    // Step 6-7: Buscar canchas → router.push a /explorar?time=20:00
    await page.getByRole('button', { name: /Buscar canchas/i }).click()
    await page.waitForURL(/\/explorar(\?|$)/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/explorar')
    expect(url.searchParams.get('time')).toBe('20:00')

    await writeEvidence('TG-HP-001', {
      status: 'pass',
      finalUrl: page.url(),
      timeParam: url.searchParams.get('time'),
      dbWrites: 'none (public ISR page, server-side reads only)',
      notes: 'router.push client-side a /explorar; sin toast, sin fetch a /api.',
    })
  })
})
