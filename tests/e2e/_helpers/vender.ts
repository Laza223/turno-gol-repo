import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Vender en Hoy es un modal (2026-09-25): se abre con el botón "Vender" de la barra
 * superior, que existe a todos los anchos (en el teléfono muestra solo el ícono, con
 * el mismo nombre accesible).
 */
export async function openVender(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Vender', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Vender' })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * El renglón de un producto. El modal arranca en "Más vendidos", donde un producto
 * recién creado no está: se lo busca (el buscador mira todo el catálogo). Anclado a
 * ^: con el producto en la venta, "Restar/Sumar uno a {nombre}" también matchea.
 */
export async function findProduct(dialog: Locator, name: string): Promise<Locator> {
  await dialog.getByRole('searchbox').fill(name)
  const row = dialog
    .getByTestId('canteen-catalog')
    .getByRole('button', { name: new RegExp(`^${name}`) })
  await expect(row).toBeVisible()
  return row
}
