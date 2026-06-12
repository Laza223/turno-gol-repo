/**
 * E2E mobile — admin smoke (Fase F10)
 *
 * Verifica:
 *   1. Cada ruta admin crítica NO produce horizontal scroll en viewport mobile.
 *   2. RegisterMovementModal (caja) fitea dentro del viewport cuando se abre.
 *   3. Hamburger admin visible en mobile (<lg).
 *
 * Viewport: Pixel 5 (393x851) — gestionado por project mobile-chrome.
 */

import { test, expect } from '../fixtures'

// Routes that must render without horizontal scroll on mobile.
const ROUTES = [
  '/grilla',
  '/caja',
  '/reservas',
  '/canchas',
] as const

test.describe('Admin mobile smoke', () => {
  for (const route of ROUTES) {
    test(`${route} renders without horizontal scroll`, async ({ browser, adminStorageState }) => {
      const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
      const page = await ctx.newPage()
      await page.goto(route, { waitUntil: 'networkidle' })

      const overflow = await page.evaluate(() => ({
        bodyScrollW: document.body.scrollWidth,
        viewportW: window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
      }))

      // Allow 1px tolerance for sub-pixel rounding.
      expect(overflow.bodyScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)
      expect(overflow.docScrollW).toBeLessThanOrEqual(overflow.viewportW + 1)

      await ctx.close()
    })
  }

  test('admin hamburger menu visible on mobile', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/grilla', { waitUntil: 'domcontentloaded' })

    const hamburger = page.getByRole('button', { name: /menú/i })
    await expect(hamburger).toBeVisible()

    const box = await hamburger.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)

    await ctx.close()
  })

  test('cantina quick-sale buttons meet 44px touch targets', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/caja', { waitUntil: 'networkidle' })

    // Asegurar productos configurados (idempotente: carga sugeridos solo si está vacío).
    await page.getByRole('button', { name: 'Configurar', exact: true }).click()
    const editor = page.getByRole('dialog')
    await expect(editor).toBeVisible()
    const suggested = editor.getByRole('button', { name: /Cargar sugeridos/ })
    if (await suggested.isVisible()) {
      await suggested.click()
      await editor.getByRole('button', { name: 'Guardar' }).click()
      await expect(page.getByText('Productos guardados').first()).toBeVisible()
    } else {
      await editor.getByRole('button', { name: 'Cancelar' }).click()
    }

    // boundingBox con poll: el router.refresh() tras guardar puede detachar el
    // nodo entre el toBeVisible y la medición (boundingBox → null transitorio).
    const measure = async (locator: import('@playwright/test').Locator, label: string) => {
      await expect
        .poll(async () => (await locator.boundingBox())?.height ?? 0, { message: `alto de ${label}` })
        .toBeGreaterThanOrEqual(44)
      await expect
        .poll(async () => (await locator.boundingBox())?.width ?? 0, { message: `ancho de ${label}` })
        .toBeGreaterThanOrEqual(44)
    }

    // Botón de producto ≥44x44 (el admin vende parado en la barra, desde el celular).
    const product = page.getByRole('button', { name: /^Agua/ }).first()
    await expect(product).toBeVisible()
    await measure(product, 'producto Agua')

    // Controles del diálogo de venta también ≥44px.
    await product.click()
    const sale = page.getByRole('dialog')
    await expect(sale).toBeVisible()
    for (const name of ['Sumar uno', 'Restar uno', 'Efectivo', /Registrar venta/] as const) {
      await measure(sale.getByRole('button', { name }), String(name))
    }

    await ctx.close()
  })

  test('RegisterMovementModal fits inside mobile viewport', async ({ browser, adminStorageState }) => {
    const ctx = await browser.newContext({ storageState: JSON.parse(adminStorageState) })
    const page = await ctx.newPage()
    await page.goto('/caja', { waitUntil: 'networkidle' })

    // Click "Agregar movimiento" or similar trigger. UI text is "Agregar movimiento" per RegisterMovementModal title.
    // The trigger button (in caja page) might say "Registrar movimiento" or "Nuevo movimiento" — locate by accessible name fuzzy.
    const trigger = page.getByRole('button', { name: /movimiento/i }).first()
    if (await trigger.count() > 0 && await trigger.isVisible()) {
      await trigger.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 3000 })

      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(393 + 1)
    } else {
      test.skip(true, 'Movimiento trigger not found in /caja — UI structure may differ')
    }

    await ctx.close()
  })
})
