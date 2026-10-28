import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Vender es un modal que se abre con el botón "Vender" del riel (desde `lg`, en
 * todas las vistas) o, en el teléfono, con el de la barra superior de Hoy (solo
 * ícono, mismo nombre accesible). Nunca hay dos a la vez.
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
