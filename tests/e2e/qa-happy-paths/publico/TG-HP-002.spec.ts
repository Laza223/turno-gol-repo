import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'

/**
 * TG-HP-002 — Explorar /explorar: buscar cancha cross-tenant (portal de vidrio, F3).
 * Rol: Visitante (no auth). Prereq: al menos un tenant público (getDefaultSearchCached, 5 min cache).
 * No DB write; los filtros viajan como query params (router.push, sin fetch a /api).
 * Evidence anchors: explorar/components/ExplorarSearch.tsx, src/components/site/SearchSheets.tsx,
 * explorar/page.tsx (encabezado y botón Mapa).
 *
 * Desde el 2026-11-14 el buscador pide solo Localidad y Cancha (más el nombre, adentro de la hoja
 * de Localidad). Los checkbox de las hojas son `sr-only`: se toca la etiqueta.
 */
test.describe('TG-HP-002 — Explorar + filtros', () => {
  test('localidad, cancha, nombre y mapa actualizan la URL', async ({ page }) => {
    // Step 1-2: /explorar con el encabezado de cuántos complejos hay
    await page.goto('/explorar')
    await expect(page.getByRole('heading', { level: 1, name: /\d+ complejos?/ })).toBeVisible()
    await expect(page.getByRole('search', { name: 'Filtrar canchas' })).toBeVisible()

    // Step 3-4: hoja de Cancha → "Fútbol 5" → "Ver N complejos"
    await page.getByRole('button', { name: /^Cancha:/ }).click()
    const cancha = page.getByRole('dialog')
    await expect(cancha.getByRole('heading', { name: 'Tamaño de cancha' })).toBeVisible()
    await cancha.getByText('Fútbol 5', { exact: true }).click()
    await cancha.getByRole('button', { name: /^Ver \d+ complejos?$/ }).click()
    await page.waitForURL((url) => url.searchParams.get('formats') === '5')
    await expect(page.getByRole('button', { name: 'Cancha: Fútbol 5. Cambiar' })).toBeVisible()

    // Step 5: hoja de Localidad → buscar un complejo por nombre (en todas las localidades)
    await page.getByRole('button', { name: /^Localidad:/ }).click()
    const localidad = page.getByRole('dialog')
    await localidad.getByRole('searchbox', { name: 'Localidad' }).fill('demo')
    await localidad.getByRole('button', { name: /Buscar complejos que se llamen/ }).click()
    await page.waitForURL((url) => url.searchParams.get('q') === 'demo')
    await expect(page.getByText('E2E Complejo Demo')).toBeVisible()

    const afterSearch = new URL(page.url())
    expect(afterSearch.searchParams.get('formats')).toBe('5')

    // Step 6: botón "Mapa" → view=map, conserva los filtros; "Lista" vuelve
    await page.getByRole('link', { name: 'Mapa' }).click()
    await page.waitForURL((url) => url.searchParams.get('view') === 'map')
    expect(new URL(page.url()).searchParams.get('q')).toBe('demo')
    await expect(page.getByRole('link', { name: 'Lista' })).toBeVisible()

    await writeEvidence('TG-HP-002', {
      status: 'pass',
      finalUrl: page.url(),
      appliedFilters: {
        q: afterSearch.searchParams.get('q'),
        formats: afterSearch.searchParams.get('formats'),
      },
      dbWrites: 'none (searchPublicTenants es lectura pura, filtros viajan por query string)',
      notes:
        'Portal de vidrio F3: el buscador pide Localidad y Cancha; el nombre se busca desde la hoja de ' +
        'Localidad. Superficie, techado, online, precio, orden, fecha y hora salieron (decisión del 2026-11-14).',
    })
  })
})
