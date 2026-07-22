/**
 * E2E — Rediseño de Caja
 *
 * 1. Venta rápida de Cantina/Bar: configurar productos (sugeridos), vender con
 *    un toque y verla en la lista con la categoría "Cantina/Bar".
 * 2. "Agregar movimiento" registra un Gasto operativo y aparece en la lista
 *    con su badge y el monto en negativo.
 *
 * Ningún test cierra la caja del día: el cierre es inmutable (REVOKE DELETE)
 * y dejaría el tenant demo bloqueado para los demás specs; ese cálculo se
 * cubre en tests/integration/cashflow.test.ts.
 */

import { test, expect } from './fixtures'

test.describe('Caja redesign', () => {
  test('venta rápida de cantina aparece en la lista como Cantina/Bar', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    // Configurar productos (rediseño: la Cantina vive en /caja/cantina, el
    // catálogo en /caja/productos) si el tenant demo todavía no los tiene.
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Configurar', exact: true }).click()
    await page.waitForURL(/\/caja\/productos/)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const suggested = dialog.getByRole('button', { name: /Cargar sugeridos/ })
    if (await suggested.isVisible()) {
      await suggested.click()
    }
    await dialog.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Productos guardados').first()).toBeVisible()

    // Vender Agua x2 en efectivo desde la tab Cantina.
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Agua/ }).first().click()
    const sale = page.getByRole('dialog')
    await expect(sale).toBeVisible()
    await sale.getByRole('button', { name: 'Sumar uno' }).click()
    await sale.getByRole('button', { name: /Registrar venta/ }).click()

    await expect(page.getByText('Venta registrada').first()).toBeVisible()

    // La venta aparece en "Movimientos del día", que sigue viviendo en /caja
    // (Caja del día) — la cash_flow es la misma fuente de plata de siempre.
    await page.goto('/caja', { waitUntil: 'networkidle' })
    // Anclar a la fila de la tabla desktop: getByText pelado puede resolver la
    // card mobile (oculta en viewport desktop) o el toast efímero.
    const saleRow = page.getByRole('row').filter({ hasText: 'Agua x2' }).first()
    await expect(saleRow).toBeVisible({ timeout: 10_000 })
    await expect(saleRow.getByText('Cantina/Bar', { exact: true })).toBeVisible()
  })

  test('agregar movimiento registra un gasto operativo con monto en negativo', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    await page.goto('/caja', { waitUntil: 'networkidle' })

    const description = `Gasto e2e ${Date.now()}`
    await page.getByRole('button', { name: /Agregar movimiento/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Chips (pages/caja.md §7): elegir tipo "Gasto" con un tap.
    await dialog.getByRole('button', { name: 'Gasto', exact: true }).click()
    // La categoría se auto-selecciona en "Gasto operativo" (única válida).
    await expect(dialog.getByRole('button', { name: 'Gasto operativo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await dialog.getByLabel('Monto (pesos)').fill('1234')
    await dialog.getByLabel('Descripción').fill(description)
    await dialog.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Movimiento registrado').first()).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: description })
    await expect(row).toBeVisible()
    await expect(row.getByText('Gasto operativo')).toBeVisible()
    // El monto del egreso se muestra en negativo (signo − U+2212).
    await expect(row.getByText(/−\s*\$/)).toBeVisible()
  })
})
