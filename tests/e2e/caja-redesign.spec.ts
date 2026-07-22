/**
 * E2E — Rediseño de Caja
 *
 * 1. Ticket de Cantina/Bar (Fase 3, multi-ítem): cargar un producto en el
 *    catálogo (/caja/productos), venderlo con dos taps (tap producto x2 +
 *    Cobrar — sin diálogo intermedio, TicketPanel reemplazó a
 *    CanteenQuickSale) y verlo en la lista con la categoría "Cantina/Bar".
 * 2. Ticket con 2 productos distintos: un solo "Cobrar" genera UN solo
 *    movimiento en /caja con la descripción de ambos y el monto sumado.
 * 3. "Agregar movimiento" registra un Gasto operativo y aparece en la lista
 *    con su badge y el monto en negativo.
 *
 * Ningún test cierra la caja del día: el cierre es inmutable (REVOKE DELETE)
 * y dejaría el tenant demo bloqueado para los demás specs; ese cálculo se
 * cubre en tests/integration/cashflow.test.ts.
 */

import { test, expect } from './fixtures'

/** Crea un producto de cantina vía /caja/productos (ProductsTable + ProductFormDialog). */
async function createCanteenProduct(page: import('@playwright/test').Page, name: string, pesos: string) {
  await page.getByRole('button', { name: 'Agregar producto' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre').fill(name)
  await dialog.getByLabel('Precio (pesos)').fill(pesos)
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Producto creado').first()).toBeVisible()
}

test.describe('Caja redesign', () => {
  test('venta rápida de cantina (tap x2 + Cobrar) aparece en la lista como Cantina/Bar', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    // Configurar productos (Fase 2: catálogo real en canteen_products, editor
    // en /caja/productos — ProductsTable + ProductFormDialog). Crear un
    // producto "Agua" vía la UI nueva; requiere admin (canEditCatalog).
    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    await createCanteenProduct(page, 'Agua', '500')

    // Vender Agua x2 en efectivo desde la tab Cantina: tap producto, tap
    // producto de nuevo (suma la línea a qty 2), tap Cobrar — sin diálogo
    // intermedio (Fase 3: TicketPanel, regla de oro 1 ítem = 2 taps).
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    const aguaButton = page.getByRole('button', { name: /Agua/ }).first()
    await aguaButton.click()
    await aguaButton.click()
    await expect(page.getByText('×2')).toBeVisible()
    await page.getByRole('button', { name: /^Cobrar/ }).click()

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

  test('ticket con 2 productos distintos genera UN solo movimiento con el monto sumado', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    // Nombres únicos por corrida: evita choques con otros specs/tests que
    // comparten el catálogo del tenant demo.
    const suffix = Date.now()
    const nameA = `Gaseosa e2e ${suffix}`
    const nameB = `Alfajor e2e ${suffix}`

    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    await createCanteenProduct(page, nameA, '300')
    await createCanteenProduct(page, nameB, '200')

    // Un ticket con las dos líneas (1 tap cada una) y un solo Cobrar.
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(nameA) }).click()
    await page.getByRole('button', { name: new RegExp(nameB) }).click()
    await page.getByRole('button', { name: /^Cobrar/ }).click()

    await expect(page.getByText('Venta registrada').first()).toBeVisible()

    // ticketDescription() antepone "Cantina: " y junta las líneas con ", "
    // (canteen-sale.service.ts) — qty 1 no lleva sufijo "xN".
    await page.goto('/caja', { waitUntil: 'networkidle' })
    const description = `Cantina: ${nameA}, ${nameB}`
    const rows = page.getByRole('row').filter({ hasText: description })
    await expect(rows).toHaveCount(1)
    // $300 + $200 = $500, formato contable de la tabla ("500,00").
    await expect(rows.getByText(/500,00/)).toBeVisible()
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
