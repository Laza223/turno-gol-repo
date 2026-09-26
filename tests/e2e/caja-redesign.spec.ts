/**
 * E2E — Caja: Vender (Hoy, /dashboard) y Cuentas (/caja/cuentas)
 *
 * Desde 2026-09-24 Vender se fue de `/caja` a Hoy (`/dashboard`), y desde el
 * 2026-09-25 es un modal que abre el botón "Vender" (`VenderDialog`). `/caja`
 * es ahora un redirect a `/caja/cuentas`, que desde el 2026-09-25 es el libro
 * de la noche: el resumen de lo que entró, una línea por tipo de lo sin cobrar
 * (cada una abre su modal) y los movimientos agrupados por hora, con el alta
 * manual de un movimiento. Por eso cada test vende en `/dashboard` y verifica
 * en `/caja/cuentas`.
 *
 * 1. Ticket de Cantina/Bar (multi-ítem): cargar un producto en el catálogo
 *    (/caja/productos), venderlo con dos taps (tap producto x2 + Cobrar — sin
 *    diálogo intermedio) y verlo en el libro con el ícono de cantina.
 * 2. Ticket con 2 productos distintos: un solo "Cobrar" genera UN solo
 *    movimiento con la descripción de ambos y el monto sumado.
 * 3. "Registrar movimiento" con tipo "Gasto" (migr. 050: categorías específicas,
 *    auto-selecciona "Mercadería") registra el egreso y aparece en el libro
 *    con su rubro y el monto en negativo.
 * 4. Fiado: anotarlo en Vender (en vez de cobrarlo), abrir en Cuentas el modal
 *    "Fiados sin cobrar", cobrarlo en efectivo desde ahí y verlo desaparecer +
 *    aparecer como "Fiado cobrado — …" en el libro.
 */

import { test, expect } from './fixtures'
import { findProduct, openVender } from './_helpers/vender'

/**
 * Crea un producto de cantina vía /caja/productos (ProductsTable + ProductFormDialog).
 * Desde 2026-09-17 el alta arranca con "Sí, controlar stock" y el stock inicial
 * es obligatorio: sin él el producto nacería "Agotado" y no se podría vender.
 */
async function createCanteenProduct(
  page: import('@playwright/test').Page,
  name: string,
  pesos: string,
) {
  await page.getByRole('button', { name: 'Agregar producto' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre').fill(name)
  await dialog.getByLabel('Precio (pesos)').fill(pesos)
  await dialog.getByLabel('Stock inicial').fill('50')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Producto creado').first()).toBeVisible()
}

test.describe('Caja redesign', () => {
  test('venta rápida de cantina (tap x2 + Cobrar) aparece en el libro como cantina', async ({
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

    // Vender x2 en efectivo desde Hoy (modal "Vender", `VenderDialog`): tocar el
    // producto dos veces (suma la línea a qty 2) y Cobrar — sin diálogo intermedio.
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const vender = await openVender(page)
    const aguaButton = await findProduct(vender, productName)
    await aguaButton.click()
    await aguaButton.click()
    await expect(aguaButton.getByText('2 en la venta')).toBeVisible()
    await vender.getByRole('button', { name: /^Cobrar/ }).click()

    await expect(page.getByText('Venta registrada').first()).toBeVisible()
    // Después de cobrar el modal se cierra solo: se vuelve al tablero.
    await expect(vender).toBeHidden()

    // La venta aparece en el libro de la noche, que vive en Cuentas — recarga
    // completa para confirmar que persistió en DB, no solo en el estado local.
    await page.goto('/caja/cuentas', { waitUntil: 'networkidle' })
    // Anclar a la fila de la tabla desktop: getByText pelado puede resolver la
    // lista del teléfono (oculta en viewport desktop) o el toast efímero. La
    // fila perdió el "Cantina: " del ticket: el tipo lo dice el ícono.
    const saleRow = page
      .getByRole('row')
      .filter({ hasText: `${productName} x2` })
      .first()
    await expect(saleRow).toBeVisible({ timeout: 10_000 })
    await expect(saleRow.getByRole('img', { name: 'Cantina' })).toBeVisible()

    // "Lo que más salió": la venta recién hecha aparece en el ranking de
    // /caja/productos (la tarjeta al lado del catálogo). El `<section>` con
    // aria-labelledby expone role "region" con su h2 como nombre accesible: lo
    // usamos de ancla porque el catálogo, en la misma página, también lista el
    // producto y un getByText sin scope resolvería ambigüedad.
    await page.goto('/caja/productos', { waitUntil: 'networkidle' })
    const topCard = page.getByRole('region', { name: /Lo que más salió/ })
    await expect(
      topCard.getByRole('heading', { name: 'Lo que más salió en los últimos 7 días' }),
    ).toBeVisible()
    // Se ven los 8 que más plata hicieron: con el tenant demo compartido entre
    // specs, el producto recién vendido puede quedar detrás de "Ver los otros N".
    const more = topCard.getByText(/^Ver (los otros \d+|el que sigue)$/)
    if (await more.isVisible()) await more.click()
    await expect(topCard.getByText(productName, { exact: true })).toBeVisible()
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
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const vender = await openVender(page)
    await (await findProduct(vender, nameA)).click()
    await (await findProduct(vender, nameB)).click()
    await vender.getByRole('button', { name: /^Cobrar/ }).click()

    await expect(page.getByText('Venta registrada').first()).toBeVisible()

    // ticketDescription() antepone "Cantina: " y junta las líneas con ", "
    // (canteen-sale.service.ts) — qty 1 no lleva sufijo "xN". El libro muestra
    // el ticket sin el "Cantina: " (ledger.ts).
    await page.goto('/caja/cuentas', { waitUntil: 'networkidle' })
    const description = `${nameA}, ${nameB}`
    const rows = page.getByRole('row').filter({ hasText: description })
    await expect(rows).toHaveCount(1)
    // $300 + $200 = $500, formato unificado sin decimales (4.5).
    await expect(rows.getByText(/500/)).toBeVisible()
  })

  test('agregar movimiento con tipo "Gasto" auto-selecciona "Mercadería" y registra el egreso', async ({
    page,
    adminStorageState,
  }) => {
    await page.context().addCookies(JSON.parse(adminStorageState).cookies)
    // "Agregar movimiento" cuelga del encabezado de Cuentas: lo usan los dos
    // roles pero pocas veces por semana, así que no compite con la venta.
    await page.goto('/caja/cuentas', { waitUntil: 'networkidle' })

    const description = `Gasto e2e ${Date.now()}`
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()
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
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const vender = await openVender(page)
    await (await findProduct(vender, productName)).click()
    await vender.getByRole('button', { name: 'Anotar como fiado' }).click()

    // El fiado abre su diálogo encima del de Vender: se lo ubica por su título.
    const tabDialog = page.getByRole('dialog', { name: 'Anotar fiado' })
    await expect(tabDialog).toBeVisible()
    // Una sola pregunta: el campo de nota libre se retiró (Ley 25.326).
    await tabDialog.getByLabel('¿A nombre de quién?').fill(debtorName)
    await tabDialog.getByRole('button', { name: /^Anotar fiado/ }).click()

    await expect(page.getByText(`Fiado anotado — ${debtorName}`).first()).toBeVisible()

    // Los fiados se cobran en Cuentas. La línea "N fiados abiertos · Cobrar en
    // Cuentas" vivía en la pantalla Vender de Caja y se fue con ella
    // (2026-09-24): se entra por el menú.
    await page.goto('/caja/cuentas', { waitUntil: 'networkidle' })

    // En Cuentas lo sin cobrar es una línea por tipo que abre su modal
    // (PendingLines). El tenant demo lo comparten otros specs, así que la
    // cantidad de fiados no es fija: se busca la fila por nombre adentro.
    await page.getByRole('button', { name: /fiados? sin cobrar/ }).click()
    const listDialog = page.getByRole('dialog', { name: 'Fiados sin cobrar' })
    await expect(listDialog).toBeVisible()
    const fiadoRow = listDialog.getByRole('listitem').filter({ hasText: debtorName })
    await expect(fiadoRow).toBeVisible()

    // Cobrarlo en efectivo (método default del diálogo). El diálogo de cobro se
    // abre ENCIMA del de la lista, que sigue abierto: se lo ubica por título.
    await fiadoRow.getByRole('button', { name: /^Cobrar/ }).click()
    const settleDialog = page.getByRole('dialog', { name: `Cobrar — ${debtorName}` })
    await expect(settleDialog).toBeVisible()
    // `/^Cobrar/` matchearia tambien el atajo "Cobrar todo en efectivo" que
    // SplitPaymentFields muestra desde 2026-09-09: dos matches = strict mode
    // violation. El atajo nombra el metodo; el submit, no.
    await settleDialog.getByRole('button', { name: /^Cobrar(?! todo en efectivo)/ }).click()

    // Ya está 'paid': getStreetMoney no lo trae más y la fila desaparece del
    // modal de la lista, que queda abierto para cobrar el siguiente.
    await expect(settleDialog).toBeHidden({ timeout: 10_000 })
    await expect(fiadoRow).toHaveCount(0, { timeout: 10_000 })
    // Con la X y no con Escape: el primer Escape lo toma el toast "Fiado cobrado"
    // (Radix Toast también es una capa que se cierra con Escape).
    await listDialog.getByRole('button', { name: 'Cerrar' }).click()
    await expect(listDialog).toBeHidden()

    // El cobro generó el movimiento, en el libro de la misma pantalla.
    const movementRow = page.getByRole('row').filter({ hasText: `Fiado cobrado — ${debtorName}` })
    await expect(movementRow).toBeVisible({ timeout: 10_000 })
  })
})
