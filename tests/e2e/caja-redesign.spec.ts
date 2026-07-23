/**
 * E2E — Rediseño de Caja
 *
 * 1. Ticket de Cantina/Bar (Fase 3, multi-ítem): cargar un producto en el
 *    catálogo (/caja/productos), venderlo con dos taps (tap producto x2 +
 *    Cobrar — sin diálogo intermedio, TicketPanel reemplazó a
 *    CanteenQuickSale) y verlo en la lista con la categoría "Cantina/Bar".
 * 2. Ticket con 2 productos distintos: un solo "Cobrar" genera UN solo
 *    movimiento en /caja con la descripción de ambos y el monto sumado.
 * 3. "Agregar movimiento" con tipo "Gasto" (migr. 050: categorías específicas,
 *    auto-selecciona "Mercadería") registra el egreso y aparece en la lista
 *    con su badge y el monto en negativo.
 * 4. Fiado (Fase 4): anotar un ticket como fiado (en vez de cobrarlo), verlo
 *    en "Fiados pendientes", cobrarlo en efectivo y verlo desaparecer de la
 *    lista + aparecer como movimiento "Fiado cobrado — …" en /caja.
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
    // en /caja/productos — ProductsTable + ProductFormDialog). Nombre único
    // por corrida (mismo patrón que el test vecino): canteen_products no tiene
    // UNIQUE(tenant_id, name) y un retry de CI repetiría el alta, dejando dos
    // filas "Agua" y rompiendo los asserts exact/strict de abajo.
    const productName = `Agua e2e ${Date.now()}`
    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    await createCanteenProduct(page, productName, '500')

    // Vender x2 en efectivo desde la tab Cantina: tap producto, tap producto
    // de nuevo (suma la línea a qty 2), tap Cobrar — sin diálogo intermedio
    // (Fase 3: TicketPanel, regla de oro 1 ítem = 2 taps).
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    const aguaButton = page.getByRole('button', { name: new RegExp(`^${productName}`) }).first()
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
    const saleRow = page.getByRole('row').filter({ hasText: `${productName} x2` }).first()
    await expect(saleRow).toBeVisible({ timeout: 10_000 })
    await expect(saleRow.getByText('Cantina/Bar', { exact: true })).toBeVisible()

    // Reporte de cantina (Fase 7): la venta recién hecha aparece en el ranking
    // de /caja/productos. El `<section>` con aria-labelledby expone role
    // "region" con el h2 como nombre accesible — lo usamos de ancla porque
    // ProductsTable, más arriba en la misma página, también lista "Agua" y un
    // getByText sin scope resolvería ambigüedad.
    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    const reportCard = page.getByRole('region', { name: /Ventas de cantina/ })
    await expect(
      reportCard.getByRole('heading', { name: /Ventas de cantina — últimos 7 días/ }),
    ).toBeVisible()
    await expect(reportCard.getByRole('cell', { name: productName, exact: true })).toBeVisible()
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

  test('agregar movimiento con tipo "Gasto" auto-selecciona "Mercadería" y registra el egreso', async ({
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
    // migr. 050: 'operating_expense' ya no es la única categoría de gasto —
    // la UI ofrece 5 categorías específicas y auto-selecciona la primera
    // (Mercadería). 'Gasto operativo' queda legacy, display-only en el
    // historial, y esta UI no lo ofrece más.
    await expect(dialog.getByRole('button', { name: 'Mercadería' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(dialog.getByRole('button', { name: 'Gasto operativo' })).toHaveCount(0)
    await dialog.getByLabel('Monto (pesos)').fill('1234')
    await dialog.getByLabel('Descripción').fill(description)
    await dialog.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Movimiento registrado').first()).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: description })
    await expect(row).toBeVisible()
    await expect(row.getByText('Mercadería')).toBeVisible()
    // El monto del egreso se muestra en negativo (signo − U+2212).
    await expect(row.getByText(/−\s*\$/)).toBeVisible()
  })

  test('fiado: anotar, cobrar y verlo como movimiento en /caja (Fase 4)', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)

    // Nombres únicos por corrida: el tenant demo se comparte con otros specs.
    const suffix = Date.now()
    const productName = `Gaseosa fiado e2e ${suffix}`
    const debtorName = `Equipo Jueves ${suffix}`

    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    await createCanteenProduct(page, productName, '400')

    // Cargar el ticket y anotarlo como fiado en vez de cobrarlo.
    await page.goto('/caja/cantina', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(productName) }).click()
    await page.getByRole('button', { name: 'Anotar como fiado' }).click()

    const tabDialog = page.getByRole('dialog')
    await expect(tabDialog).toBeVisible()
    await tabDialog.getByLabel('Nombre').fill(debtorName)
    await tabDialog.getByRole('button', { name: /^Anotar fiado/ }).click()

    await expect(page.getByText(`Fiado anotado — ${debtorName}`).first()).toBeVisible()

    // Aparece en "Fiados pendientes" (mismo tab, tras el refresh del server component).
    const fiadoRow = page.locator('li').filter({ hasText: debtorName })
    await expect(fiadoRow).toBeVisible()

    // Cobrarlo en efectivo (método default del diálogo).
    await fiadoRow.getByRole('button', { name: 'Cobrar' }).click()
    const settleDialog = page.getByRole('dialog')
    await expect(settleDialog).toBeVisible()
    await settleDialog.getByRole('button', { name: /^Cobrar/ }).click()

    await expect(page.getByText(`Fiado cobrado — ${debtorName}`).first()).toBeVisible()
    // Desaparece de "Fiados pendientes": ya está 'paid', listOpenTabs no lo trae más.
    await expect(fiadoRow).toHaveCount(0)

    // El cobro generó el movimiento en /caja (misma cash_flow de siempre).
    await page.goto('/caja', { waitUntil: 'networkidle' })
    const movementRow = page.getByRole('row').filter({ hasText: `Fiado cobrado — ${debtorName}` })
    await expect(movementRow).toBeVisible({ timeout: 10_000 })
  })
})
